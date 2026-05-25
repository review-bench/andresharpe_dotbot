#!/usr/bin/env pwsh
#requires -Version 7.0

<#
.SYNOPSIS
Pester unit tests for Dotbot.Task IdGen helpers.

Covers: New-DotbotNanoId, New-TaskId, New-WorkflowRunId, Test-TaskId,
Test-WorkflowRunId, Get-ShortId.

The generators use a CSRNG. Tests rely on shape and probabilistic uniqueness
(N draws, expect N distinct outputs at the 8-char width) rather than
asserting any specific output.
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '..' '_common/Import-RuntimeModule.psm1') -Force
    Import-RuntimeModule -Name 'Dotbot.Task'
}

Describe 'Dotbot.Task.New-DotbotNanoId' {
    It 'returns an 8-character string by default' {
        $id = New-DotbotNanoId
        $id.Length | Should -Be 8
    }

    It 'returns characters drawn from [A-Za-z0-9] only' {
        $id = New-DotbotNanoId
        $id | Should -Match '^[A-Za-z0-9]+$'
    }

    It 'respects an explicit -Length parameter' {
        $id = New-DotbotNanoId -Length 16
        $id.Length | Should -Be 16
        $id | Should -Match '^[A-Za-z0-9]+$'
    }

    It 'rejects -Length below 1' {
        { New-DotbotNanoId -Length 0 } | Should -Throw
    }

    It 'produces distinct values across many draws' {
        $ids = 1..50 | ForEach-Object { New-DotbotNanoId }
        ($ids | Sort-Object -Unique).Count | Should -Be 50
    }
}

Describe 'Dotbot.Task.New-TaskId' {
    It 'returns an ID prefixed with t_' {
        New-TaskId | Should -Match '^t_[A-Za-z0-9]{8}$'
    }

    It 'always passes Test-TaskId on its own output' {
        $id = New-TaskId
        Test-TaskId -Id $id | Should -BeTrue
    }

    It 'produces distinct values across many draws' {
        $ids = 1..50 | ForEach-Object { New-TaskId }
        ($ids | Sort-Object -Unique).Count | Should -Be 50
    }
}

Describe 'Dotbot.Task.New-WorkflowRunId' {
    It 'returns an ID prefixed with wr_' {
        New-WorkflowRunId | Should -Match '^wr_[A-Za-z0-9]{8}$'
    }

    It 'always passes Test-WorkflowRunId on its own output' {
        $id = New-WorkflowRunId
        Test-WorkflowRunId -Id $id | Should -BeTrue
    }
}

Describe 'Dotbot.Task.Test-TaskId' {
    It 'returns $true for a canonical task ID' {
        Test-TaskId -Id 't_AbCd1234' | Should -BeTrue
    }

    It 'returns $false for an empty string' {
        Test-TaskId -Id '' | Should -BeFalse
    }

    It 'returns $false for $null' {
        Test-TaskId -Id $null | Should -BeFalse
    }

    It 'returns $false for the workflow-run prefix' {
        Test-TaskId -Id 'wr_AbCd1234' | Should -BeFalse
    }

    It 'returns $false for a body shorter than 8 chars' {
        Test-TaskId -Id 't_abc' | Should -BeFalse
    }

    It 'returns $false for a body longer than 8 chars' {
        Test-TaskId -Id 't_AbCd12345' | Should -BeFalse
    }

    It 'returns $false when the body contains non-alphanumeric characters' {
        Test-TaskId -Id 't_abc-1234' | Should -BeFalse
    }

    It 'is case-sensitive on the prefix' {
        Test-TaskId -Id 'T_AbCd1234' | Should -BeFalse
    }
}

Describe 'Dotbot.Task.Test-WorkflowRunId' {
    It 'returns $true for a canonical workflow-run ID' {
        Test-WorkflowRunId -Id 'wr_AbCd1234' | Should -BeTrue
    }

    It 'returns $false for the task prefix' {
        Test-WorkflowRunId -Id 't_AbCd1234' | Should -BeFalse
    }

    It 'returns $false for an empty string' {
        Test-WorkflowRunId -Id '' | Should -BeFalse
    }
}

Describe 'Dotbot.Task.Get-ShortId' {
    It 'returns the 4-char prefix of a task ID body' {
        Get-ShortId -Id 't_AbCd1234' | Should -Be 'AbCd'
    }

    It 'returns the 4-char prefix of a workflow-run ID body' {
        Get-ShortId -Id 'wr_AbCd1234' | Should -Be 'AbCd'
    }

    It 'throws on an arbitrary string' {
        { Get-ShortId -Id 'notanid' } | Should -Throw
    }

    It 'throws on a malformed task ID' {
        { Get-ShortId -Id 't_short' } | Should -Throw
    }
}
