#!/usr/bin/env pwsh
#requires -Version 7.0

<#
.SYNOPSIS
Pester unit tests for Dotbot.Task TaskInstance schema.

Covers: Get-TaskInstanceSchemaVersion, Get-TaskInstanceFields,
Test-TaskInstance, Assert-TaskInstance, New-TaskInstance.

Validates the closed-shape contract: required fields must be present,
unknown top-level fields are rejected, and field-level constraints
(timestamps, status, provenance) hold.
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '..' '_common/Import-RuntimeModule.psm1') -Force
    Import-RuntimeModule -Name 'Dotbot.Task'

    function script:New-MinimalTaskHash {
        param([string]$Status = 'todo', [hashtable]$Overrides = @{})
        $now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $terminal = @('done','failed','skipped','cancelled')
        $completedAt = if ($terminal -contains $Status) { $now } else { $null }

        $base = [ordered]@{
            schema_version = Get-TaskInstanceSchemaVersion
            id             = New-TaskId
            name           = 'Sample task'
            status         = $Status
            provenance     = [ordered]@{
                workflow        = $null
                run_id          = $null
                definition_name = $null
                expanded_by     = $null
            }
            created_at   = $now
            updated_at   = $now
            completed_at = $completedAt
            updated_by   = 'unit-test'
            extensions   = @{}
        }
        foreach ($k in $Overrides.Keys) { $base[$k] = $Overrides[$k] }
        return $base
    }
}

Describe 'Dotbot.Task.Get-TaskInstanceSchemaVersion' {
    It 'returns version 2' {
        Get-TaskInstanceSchemaVersion | Should -Be 2
    }
}

Describe 'Dotbot.Task.Get-TaskInstanceFields' {
    It 'includes every documented top-level field' {
        $fields = Get-TaskInstanceFields
        foreach ($f in @('schema_version','id','name','description','status',
                         'provenance','category','priority','effort','type',
                         'dependencies','acceptance_criteria','outputs',
                         'created_at','updated_at','completed_at','updated_by',
                         'extensions')) {
            $fields | Should -Contain $f -Because "'$f' is part of the closed schema"
        }
    }
}

Describe 'Dotbot.Task.Test-TaskInstance' {
    It 'returns no errors for a minimal valid task' {
        $task = New-MinimalTaskHash
        Test-TaskInstance -Task $task | Should -BeNullOrEmpty
    }

    It 'rejects $null at the parameter binder (Mandatory)' {
        # The function carries a defensive null-check internally, but the
        # Mandatory parameter binding rejects $null before the body runs.
        { Test-TaskInstance -Task $null } | Should -Throw
    }

    It 'rejects an unknown top-level field' {
        $task = New-MinimalTaskHash -Overrides @{ unexpected = 'value' }
        $errs = Test-TaskInstance -Task $task
        ($errs -join "`n") | Should -Match 'unexpected'
    }

    It 'reports every missing required field' {
        $task = [ordered]@{}
        $errs = Test-TaskInstance -Task $task
        foreach ($req in @('schema_version','id','name','status','provenance',
                           'created_at','updated_at','completed_at','updated_by',
                           'extensions')) {
            ($errs -join "`n") | Should -Match $req
        }
    }

    It 'rejects a wrong schema_version' {
        $task = New-MinimalTaskHash -Overrides @{ schema_version = 1 }
        $errs = Test-TaskInstance -Task $task
        ($errs -join "`n") | Should -Match 'schema_version'
    }

    It 'rejects a malformed id' {
        $task = New-MinimalTaskHash -Overrides @{ id = 'not-an-id' }
        $errs = Test-TaskInstance -Task $task
        ($errs -join "`n") | Should -Match '\bid\b'
    }

    It 'rejects an unknown status' {
        $task = New-MinimalTaskHash -Overrides @{ status = 'bogus' }
        $errs = Test-TaskInstance -Task $task
        ($errs -join "`n") | Should -Match 'status'
    }

    It 'rejects a malformed RFC3339-Z timestamp' {
        $task = New-MinimalTaskHash -Overrides @{ updated_at = 'not-a-time' }
        $errs = Test-TaskInstance -Task $task
        ($errs -join "`n") | Should -Match 'updated_at'
    }

    It 'requires completed_at when status is terminal' {
        $task = New-MinimalTaskHash -Status 'done' -Overrides @{ completed_at = $null }
        $errs = Test-TaskInstance -Task $task
        ($errs -join "`n") | Should -Match 'completed_at'
    }

    It 'forbids completed_at when status is non-terminal' {
        $now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $task = New-MinimalTaskHash -Status 'todo' -Overrides @{ completed_at = $now }
        $errs = Test-TaskInstance -Task $task
        ($errs -join "`n") | Should -Match 'completed_at'
    }

    It 'rejects mixed null/non-null provenance fields' {
        $task = New-MinimalTaskHash -Overrides @{
            provenance = [ordered]@{
                workflow        = 'my-flow'
                run_id          = 'wr_AbCd1234'
                definition_name = $null
                expanded_by     = $null
            }
        }
        $errs = Test-TaskInstance -Task $task
        ($errs -join "`n") | Should -Match 'provenance'
    }

    It 'rejects an invalid run_id on provenance' {
        $task = New-MinimalTaskHash -Overrides @{
            provenance = [ordered]@{
                workflow        = 'my-flow'
                run_id          = 'not-a-run-id'
                definition_name = 'task-1'
                expanded_by     = 'workflow-expansion'
            }
        }
        $errs = Test-TaskInstance -Task $task
        ($errs -join "`n") | Should -Match 'run_id'
    }

    It 'accepts the workflow-expansion expanded_by value' {
        $task = New-MinimalTaskHash -Overrides @{
            provenance = [ordered]@{
                workflow        = 'my-flow'
                run_id          = 'wr_AbCd1234'
                definition_name = 'task-1'
                expanded_by     = 'workflow-expansion'
            }
        }
        Test-TaskInstance -Task $task | Should -BeNullOrEmpty
    }

    It 'accepts a task: reference in expanded_by' {
        $task = New-MinimalTaskHash -Overrides @{
            provenance = [ordered]@{
                workflow        = 'my-flow'
                run_id          = 'wr_AbCd1234'
                definition_name = 'task-2'
                expanded_by     = 'task:t_AbCd1234'
            }
        }
        Test-TaskInstance -Task $task | Should -BeNullOrEmpty
    }

    It 'rejects a malformed dependencies array' {
        $task = New-MinimalTaskHash -Overrides @{ dependencies = @('not-an-id') }
        $errs = Test-TaskInstance -Task $task
        ($errs -join "`n") | Should -Match 'dependencies'
    }

    It 'rejects an extensions key with an invalid namespace' {
        $task = New-MinimalTaskHash -Overrides @{ extensions = @{ '..bad' = 'x' } }
        $errs = Test-TaskInstance -Task $task
        ($errs -join "`n") | Should -Match 'extensions'
    }

    It 'accepts well-formed dotted namespace keys in extensions' {
        $task = New-MinimalTaskHash -Overrides @{ extensions = @{
            'workflow.my-flow' = @{ note = 'ok' }
            'ui'               = @{}
        } }
        Test-TaskInstance -Task $task | Should -BeNullOrEmpty
    }
}

Describe 'Dotbot.Task.Assert-TaskInstance' {
    It 'returns nothing for a valid task' {
        $task = New-MinimalTaskHash
        { Assert-TaskInstance -Task $task } | Should -Not -Throw
    }

    It 'throws and includes the field name on a malformed task' {
        $task = New-MinimalTaskHash -Overrides @{ status = 'bogus' }
        { Assert-TaskInstance -Task $task } | Should -Throw -ExpectedMessage '*status*'
    }
}

Describe 'Dotbot.Task.New-TaskInstance' {
    It 'returns a valid TaskInstance with defaults' {
        $task = New-TaskInstance -Name 'Built by builder'
        Test-TaskInstance -Task $task | Should -BeNullOrEmpty
    }

    It 'auto-generates a canonical task id when none supplied' {
        $task = New-TaskInstance -Name 'x'
        Test-TaskId -Id $task.id | Should -BeTrue
    }

    It 'sets completed_at when called with a terminal status' {
        $task = New-TaskInstance -Name 'x' -Status 'done'
        $task.completed_at | Should -Not -BeNullOrEmpty
    }

    It 'leaves provenance all-null for a standalone task' {
        $task = New-TaskInstance -Name 'x'
        $task.provenance.workflow         | Should -BeNullOrEmpty
        $task.provenance.run_id           | Should -BeNullOrEmpty
        $task.provenance.definition_name  | Should -BeNullOrEmpty
        $task.provenance.expanded_by      | Should -BeNullOrEmpty
    }

    It 'accepts a fully-populated provenance hashtable' {
        $task = New-TaskInstance -Name 'x' -Provenance @{
            workflow        = 'wf'
            run_id          = 'wr_AbCd1234'
            definition_name = 'task-1'
            expanded_by     = 'workflow-expansion'
        }
        $task.provenance.workflow | Should -Be 'wf'
        $task.provenance.run_id   | Should -Be 'wr_AbCd1234'
    }

    It 'throws when the supplied Status is invalid' {
        { New-TaskInstance -Name 'x' -Status 'bogus' } | Should -Throw
    }
}
