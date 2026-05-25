#!/usr/bin/env pwsh
#requires -Version 7.0

<#
.SYNOPSIS
Pester unit tests for Dotbot.Workflow schema validators and manifest helpers.

Covers:
  - TaskDefinition  — Test-TaskDefinition, Assert-TaskDefinition
  - WorkflowRun     — Test-WorkflowRunRecord, Assert-WorkflowRunRecord,
                      Test-WorkflowRunStatus, Assert-WorkflowRunStatus
  - Manifest helpers — Get-ManifestEntryField, Format-ManifestEntryForError,
                      Test-WorkflowManifestSchema,
                      Convert-ManifestRequiresToPreflightChecks
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '..' '_common/Import-RuntimeModule.psm1') -Force
    Import-RuntimeModule -Name 'Dotbot.Workflow'
}

# ─────────────────────────────────────────────────────────────────────────
# TaskDefinition
# ─────────────────────────────────────────────────────────────────────────

Describe 'Dotbot.Workflow.Test-TaskDefinition' {
    It 'returns no errors for a minimal valid TaskDefinition' {
        $def = @{ name = 'task1'; type = 'prompt' }
        Test-TaskDefinition -TaskDef $def | Should -BeNullOrEmpty
    }

    It 'reports missing required name' {
        $def = @{ type = 'prompt' }
        $errs = Test-TaskDefinition -TaskDef $def
        ($errs -join "`n") | Should -Match 'name'
    }

    It 'reports missing required type' {
        $def = @{ name = 'task1' }
        $errs = Test-TaskDefinition -TaskDef $def
        ($errs -join "`n") | Should -Match 'type'
    }

    It 'rejects removed/legacy fields with a clear error' {
        $def = @{ name = 'x'; type = 'prompt'; skip_worktree = $true }
        $errs = Test-TaskDefinition -TaskDef $def
        ($errs -join "`n") | Should -Match 'skip_worktree'
    }

    It 'rejects unknown top-level fields' {
        $def = @{ name = 'x'; type = 'prompt'; mystery = 1 }
        $errs = Test-TaskDefinition -TaskDef $def
        ($errs -join "`n") | Should -Match 'mystery'
    }

    It 'rejects a single-string depends_on (must be an array)' {
        $def = @{ name = 'x'; type = 'prompt'; depends_on = 'other' }
        $errs = Test-TaskDefinition -TaskDef $def
        ($errs -join "`n") | Should -Match 'depends_on'
    }

    It 'accepts an array of depends_on names' {
        $def = @{ name = 'x'; type = 'prompt'; depends_on = @('a', 'b') }
        Test-TaskDefinition -TaskDef $def | Should -BeNullOrEmpty
    }

    It 'rejects a non-boolean optional value' {
        $def = @{ name = 'x'; type = 'prompt'; optional = 'yes' }
        $errs = Test-TaskDefinition -TaskDef $def
        ($errs -join "`n") | Should -Match 'optional'
    }

    It 'accepts an integer priority' {
        $def = @{ name = 'x'; type = 'prompt'; priority = 50 }
        Test-TaskDefinition -TaskDef $def | Should -BeNullOrEmpty
    }

    It 'accepts a named priority' {
        $def = @{ name = 'x'; type = 'prompt'; priority = 'high' }
        Test-TaskDefinition -TaskDef $def | Should -BeNullOrEmpty
    }

    It 'rejects an unknown named priority' {
        $def = @{ name = 'x'; type = 'prompt'; priority = 'urgent' }
        $errs = Test-TaskDefinition -TaskDef $def
        ($errs -join "`n") | Should -Match 'priority'
    }

    It 'accepts a parsed PSCustomObject (YAML/JSON round-trip)' {
        $def = [pscustomobject]@{ name = 'x'; type = 'prompt' }
        Test-TaskDefinition -TaskDef $def | Should -BeNullOrEmpty
    }
}

Describe 'Dotbot.Workflow.Assert-TaskDefinition' {
    It 'returns nothing for a valid TaskDefinition' {
        { Assert-TaskDefinition -TaskDef @{ name = 'x'; type = 'prompt' } } | Should -Not -Throw
    }

    It 'throws when the TaskDefinition is malformed' {
        { Assert-TaskDefinition -TaskDef @{ type = 'prompt' } } | Should -Throw -ExpectedMessage '*name*'
    }
}

# ─────────────────────────────────────────────────────────────────────────
# WorkflowRun record (committed run.json shape)
# ─────────────────────────────────────────────────────────────────────────

Describe 'Dotbot.Workflow.Test-WorkflowRunRecord' {
    BeforeAll {
        function script:New-RunRecord {
            param([hashtable]$Overrides = @{})
            $base = @{
                schema_version = Get-WorkflowRunSchemaVersion
                run_id         = 'wr_AbCd1234'
                workflow_name  = 'my-flow'
                started_at     = '2026-05-19T12:00:00Z'
                isolated       = $true
                task_ids       = @('t_AbCd1234')
                started_by     = 'unit-test'
            }
            foreach ($k in $Overrides.Keys) { $base[$k] = $Overrides[$k] }
            return $base
        }
    }

    It 'returns no errors for a minimal valid record' {
        Test-WorkflowRunRecord -Record (New-RunRecord) | Should -BeNullOrEmpty
    }

    It 'reports missing required fields' {
        $errs = Test-WorkflowRunRecord -Record @{}
        foreach ($f in @('schema_version','run_id','workflow_name','started_at','isolated','task_ids','started_by')) {
            ($errs -join "`n") | Should -Match $f
        }
    }

    It 'rejects an unknown top-level field' {
        $errs = Test-WorkflowRunRecord -Record (New-RunRecord -Overrides @{ secret = 'oops' })
        ($errs -join "`n") | Should -Match 'secret'
    }

    It 'rejects a non-canonical run_id' {
        $errs = Test-WorkflowRunRecord -Record (New-RunRecord -Overrides @{ run_id = 'not-a-run' })
        ($errs -join "`n") | Should -Match 'run_id'
    }

    It 'rejects task_ids that contain non-canonical IDs' {
        $errs = Test-WorkflowRunRecord -Record (New-RunRecord -Overrides @{ task_ids = @('t_AbCd1234','bogus') })
        ($errs -join "`n") | Should -Match 'task_ids'
    }

    It 'rejects a non-bool isolated value' {
        $errs = Test-WorkflowRunRecord -Record (New-RunRecord -Overrides @{ isolated = 'yes' })
        ($errs -join "`n") | Should -Match 'isolated'
    }

    It 'rejects an unknown workflow_source tier' {
        $errs = Test-WorkflowRunRecord -Record (New-RunRecord -Overrides @{ workflow_source = 'snapshots' })
        ($errs -join "`n") | Should -Match 'workflow_source'
    }

    It 'accepts the "project (overrides framework)" workflow_source value' {
        $rec = New-RunRecord -Overrides @{ workflow_source = 'project (overrides framework)' }
        Test-WorkflowRunRecord -Record $rec | Should -BeNullOrEmpty
    }

    It 'rejects a malformed started_at timestamp' {
        $errs = Test-WorkflowRunRecord -Record (New-RunRecord -Overrides @{ started_at = 'today' })
        ($errs -join "`n") | Should -Match 'started_at'
    }
}

Describe 'Dotbot.Workflow.Assert-WorkflowRunRecord' {
    It 'returns nothing for a valid record' {
        $rec = @{
            schema_version = Get-WorkflowRunSchemaVersion
            run_id         = 'wr_AbCd1234'
            workflow_name  = 'wf'
            started_at     = '2026-05-19T12:00:00Z'
            isolated       = $false
            task_ids       = @()
            started_by     = 'unit-test'
        }
        { Assert-WorkflowRunRecord -Record $rec } | Should -Not -Throw
    }

    It 'throws on a malformed record' {
        { Assert-WorkflowRunRecord -Record @{} } | Should -Throw
    }
}

# ─────────────────────────────────────────────────────────────────────────
# WorkflowRun status (live .control/.../wr_<id>.json shape)
# ─────────────────────────────────────────────────────────────────────────

Describe 'Dotbot.Workflow.Test-WorkflowRunStatus' {
    BeforeAll {
        function script:New-RunStatus {
            param([hashtable]$Overrides = @{})
            $base = @{
                schema_version = Get-WorkflowRunSchemaVersion
                run_id         = 'wr_AbCd1234'
                status         = 'running'
            }
            foreach ($k in $Overrides.Keys) { $base[$k] = $Overrides[$k] }
            return $base
        }
    }

    It 'returns no errors for a minimal valid status' {
        Test-WorkflowRunStatus -Status (New-RunStatus) | Should -BeNullOrEmpty
    }

    It 'rejects an unknown status value' {
        $errs = Test-WorkflowRunStatus -Status (New-RunStatus -Overrides @{ status = 'bogus' })
        ($errs -join "`n") | Should -Match 'status'
    }

    It 'rejects a non-canonical current_task_id' {
        $errs = Test-WorkflowRunStatus -Status (New-RunStatus -Overrides @{ current_task_id = 'oops' })
        ($errs -join "`n") | Should -Match 'current_task_id'
    }

    It 'requires completed_at when status is terminal' {
        $errs = Test-WorkflowRunStatus -Status (New-RunStatus -Overrides @{ status = 'completed'; completed_at = $null })
        ($errs -join "`n") | Should -Match 'completed_at'
    }

    It 'accepts a terminal status with completed_at populated' {
        $rec = New-RunStatus -Overrides @{ status = 'failed'; completed_at = '2026-05-19T12:00:00Z' }
        Test-WorkflowRunStatus -Status $rec | Should -BeNullOrEmpty
    }
}

# ─────────────────────────────────────────────────────────────────────────
# Manifest helpers
# ─────────────────────────────────────────────────────────────────────────

Describe 'Dotbot.Workflow.Get-ManifestEntryField' {
    It 'reads a field from a hashtable' {
        Get-ManifestEntryField -Entry @{ name = 'x' } -Field 'name' | Should -Be 'x'
    }

    It 'reads a field from a PSCustomObject' {
        Get-ManifestEntryField -Entry ([pscustomobject]@{ name = 'y' }) -Field 'name' | Should -Be 'y'
    }

    It 'returns $null when the field is absent' {
        Get-ManifestEntryField -Entry @{ name = 'x' } -Field 'missing' | Should -BeNullOrEmpty
    }

    It 'returns $null when the entry itself is $null' {
        Get-ManifestEntryField -Entry $null -Field 'name' | Should -BeNullOrEmpty
    }
}

Describe 'Dotbot.Workflow.Format-ManifestEntryForError' {
    It 'renders a hashtable as "{ k: v, ... }"' {
        $rendered = Format-ManifestEntryForError -Entry @{ name = 'x'; count = 3 }
        $rendered | Should -Match '\{ '
        $rendered | Should -Match 'name: "x"'
        $rendered | Should -Match 'count: 3'
    }

    It 'renders a PSCustomObject the same way' {
        $rendered = Format-ManifestEntryForError -Entry ([pscustomobject]@{ name = 'y' })
        $rendered | Should -Match 'name: "y"'
    }

    It 'renders a $null entry as "<null>"' {
        Format-ManifestEntryForError -Entry $null | Should -Be '<null>'
    }

    It 'renders null property values as the literal "null"' {
        $rendered = Format-ManifestEntryForError -Entry @{ name = $null }
        $rendered | Should -Match 'name: null'
    }
}

Describe 'Dotbot.Workflow.Test-WorkflowManifestSchema' {
    It 'returns no errors for an empty manifest (no requires block)' {
        $manifest = @{ name = 'wf' }
        Test-WorkflowManifestSchema -Manifest $manifest -WorkflowName 'wf' | Should -BeNullOrEmpty
    }

    It 'reports env_vars entry missing var field' {
        $manifest = @{
            name = 'wf'
            requires = @{ env_vars = @( @{ name = 'GitHub token' } ) }
        }
        $errs = Test-WorkflowManifestSchema -Manifest $manifest -WorkflowName 'wf'
        ($errs -join "`n") | Should -Match "missing the required 'var' field"
    }

    It 'reports mcp_servers entry missing name field' {
        $manifest = @{
            name = 'wf'
            requires = @{ mcp_servers = @( @{ message = 'oops' } ) }
        }
        $errs = Test-WorkflowManifestSchema -Manifest $manifest -WorkflowName 'wf'
        ($errs -join "`n") | Should -Match "missing the required 'name' field"
    }

    It 'reports task with removed skip_worktree field alongside a requires block' {
        $manifest = @{
            name = 'wf'
            requires = @{ cli_tools = @( @{ name = 'git' } ) }
            tasks = @( @{ name = 't1'; type = 'prompt'; skip_worktree = $true } )
        }
        $errs = Test-WorkflowManifestSchema -Manifest $manifest -WorkflowName 'wf'
        ($errs -join "`n") | Should -Match 'skip_worktree'
    }

    It 'reports task with removed skip_worktree field when no requires block is present' {
        # Regression: the validator previously short-circuited on a missing
        # 'requires' block and never reached the task lint, so a manifest
        # with tasks-only could carry the legacy skip_worktree field past
        # install-time validation.
        $manifest = @{
            name = 'wf'
            tasks = @( @{ name = 't1'; type = 'prompt'; skip_worktree = $true } )
        }
        $errs = Test-WorkflowManifestSchema -Manifest $manifest -WorkflowName 'wf'
        ($errs -join "`n") | Should -Match 'skip_worktree'
    }

    It 'accepts a fully-formed requires block' {
        $manifest = @{
            name = 'wf'
            requires = @{
                env_vars   = @( @{ var = 'TOKEN'; name = 'Token'; message = 'Set TOKEN'; hint = 'auth' } )
                mcp_servers = @( @{ name = 'github'; message = 'Login'; hint = 'gh auth' } )
                cli_tools  = @( @{ name = 'git'; message = 'Install git' } )
            }
        }
        Test-WorkflowManifestSchema -Manifest $manifest -WorkflowName 'wf' | Should -BeNullOrEmpty
    }
}

Describe 'Dotbot.Workflow.Convert-ManifestRequiresToPreflightChecks' {
    It 'returns an empty array when requires has no entries' {
        $checks = Convert-ManifestRequiresToPreflightChecks -Requires @{}
        @($checks).Count | Should -Be 0
    }

    It 'maps env_vars into env_var preflight checks' {
        $checks = Convert-ManifestRequiresToPreflightChecks -Requires @{
            env_vars = @( @{ var = 'TOKEN'; name = 'API Token'; message = 'set it'; hint = 'see docs' } )
        }
        $checks = @($checks)
        $checks.Count   | Should -Be 1
        $checks[0].type | Should -Be 'env_var'
        $checks[0].var  | Should -Be 'TOKEN'
        $checks[0].name | Should -Be 'API Token'
    }

    It 'maps mcp_servers into mcp_server preflight checks' {
        $checks = @(Convert-ManifestRequiresToPreflightChecks -Requires @{
            mcp_servers = @( @{ name = 'github'; message = 'Authorize'; hint = 'gh auth' } )
        })
        $checks[0].type | Should -Be 'mcp_server'
        $checks[0].name | Should -Be 'github'
    }

    It 'maps cli_tools into cli_tool preflight checks' {
        $checks = @(Convert-ManifestRequiresToPreflightChecks -Requires @{
            cli_tools = @( @{ name = 'git'; message = 'Install git' } )
        })
        $checks[0].type | Should -Be 'cli_tool'
        $checks[0].name | Should -Be 'git'
    }

    It 'falls back to var as name when name is omitted' {
        $checks = @(Convert-ManifestRequiresToPreflightChecks -Requires @{
            env_vars = @( @{ var = 'TOKEN'; message = 'set it' } )
        })
        $checks[0].name | Should -Be 'TOKEN'
    }

    It 'throws on env_vars entry missing var, mentioning the workflow name' {
        {
            Convert-ManifestRequiresToPreflightChecks -Requires @{
                env_vars = @( @{ message = 'no var' } )
            } -WorkflowName 'my-flow'
        } | Should -Throw -ExpectedMessage "*my-flow*"
    }

    It 'throws on mcp_servers entry missing name' {
        {
            Convert-ManifestRequiresToPreflightChecks -Requires @{
                mcp_servers = @( @{ message = 'oops' } )
            }
        } | Should -Throw
    }
}
