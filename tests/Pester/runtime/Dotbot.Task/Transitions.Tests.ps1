#!/usr/bin/env pwsh
#requires -Version 7.0

<#
.SYNOPSIS
Pester unit tests for Dotbot.Task transition table.

Covers: Get-TaskStatuses, Test-TaskStatus, Get-AllowedTransitions,
Test-TaskTransition, Assert-TaskTransition.

The transition table is authoritative — anything not declared is rejected.
Tests assert the externally observable predicate, not the table contents.
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '..' '_common/Import-RuntimeModule.psm1') -Force
    Import-RuntimeModule -Name 'Dotbot.Task'
}

Describe 'Dotbot.Task.Get-TaskStatuses' {
    # NOTE: Get-TaskStatuses (and friends) return via `return ,@(...)`. Plain
    # assignment unwraps the outer wrapper once and produces the underlying
    # array. Avoid wrapping the call in @() inside Pester It blocks — that
    # adds another wrap layer rather than flattening.

    It 'includes every status the codebase relies on' {
        $statuses = Get-TaskStatuses
        $statuses | Should -Contain 'todo'
        $statuses | Should -Contain 'analysing'
        $statuses | Should -Contain 'analysed'
        $statuses | Should -Contain 'in-progress'
        $statuses | Should -Contain 'done'
        $statuses | Should -Contain 'failed'
        $statuses | Should -Contain 'skipped'
        $statuses | Should -Contain 'cancelled'
        $statuses | Should -Contain 'needs-input'
    }

    It 'returns exactly nine canonical statuses' {
        $statuses = Get-TaskStatuses
        $statuses.Count | Should -Be 9
    }
}

Describe 'Dotbot.Task.Test-TaskStatus' {
    It 'returns $true for every status from Get-TaskStatuses' {
        # Capture into a variable first — plain assignment unwraps the
        # `return ,@(...)` wrapper once, leaving the proper enumerable array.
        $statuses = Get-TaskStatuses
        foreach ($s in $statuses) {
            Test-TaskStatus -Status $s | Should -BeTrue -Because "'$s' is canonical"
        }
    }

    It 'returns $false for an unknown status' {
        Test-TaskStatus -Status 'wat' | Should -BeFalse
    }

    It 'returns $false for an empty string' {
        Test-TaskStatus -Status '' | Should -BeFalse
    }

    It 'is case-insensitive (delegates to -contains)' {
        # The implementation uses PowerShell's `-contains`, which is
        # case-insensitive by default. This pins that observable behaviour.
        Test-TaskStatus -Status 'TODO' | Should -BeTrue
        Test-TaskStatus -Status 'Todo' | Should -BeTrue
    }
}

Describe 'Dotbot.Task.Get-AllowedTransitions' {
    It 'returns the empty array for the terminal status cancelled' {
        $allowed = Get-AllowedTransitions -From 'cancelled'
        @($allowed).Count | Should -Be 0
    }

    It 'allows todo to move into analysing, skipped, or cancelled' {
        $allowed = Get-AllowedTransitions -From 'todo'
        $allowed | Should -Contain 'analysing'
        $allowed | Should -Contain 'skipped'
        $allowed | Should -Contain 'cancelled'
    }

    It 'allows in-progress to move into done' {
        $allowed = Get-AllowedTransitions -From 'in-progress'
        $allowed | Should -Contain 'done'
    }

    It 'throws when the source status is not canonical' {
        { Get-AllowedTransitions -From 'nope' } | Should -Throw
    }
}

Describe 'Dotbot.Task.Test-TaskTransition' {
    It 'permits documented transitions' {
        Test-TaskTransition -From 'todo'        -To 'analysing'   | Should -BeTrue
        Test-TaskTransition -From 'analysing'   -To 'analysed'    | Should -BeTrue
        Test-TaskTransition -From 'analysed'    -To 'in-progress' | Should -BeTrue
        Test-TaskTransition -From 'in-progress' -To 'done'        | Should -BeTrue
        Test-TaskTransition -From 'needs-input' -To 'analysing'   | Should -BeTrue
    }

    It 'rejects illegal transitions' {
        Test-TaskTransition -From 'todo'  -To 'done'        | Should -BeFalse
        Test-TaskTransition -From 'done'  -To 'in-progress' | Should -BeFalse
        Test-TaskTransition -From 'cancelled' -To 'todo'    | Should -BeFalse
    }

    It 'rejects self-transitions (no entry in the table)' {
        Test-TaskTransition -From 'todo' -To 'todo' | Should -BeFalse
    }

    It 'returns $false when either side is not a canonical status' {
        Test-TaskTransition -From 'wat'  -To 'done' | Should -BeFalse
        Test-TaskTransition -From 'todo' -To 'wat'  | Should -BeFalse
    }
}

Describe 'Dotbot.Task.Assert-TaskTransition' {
    It 'returns nothing for a legal transition' {
        { Assert-TaskTransition -From 'todo' -To 'analysing' } | Should -Not -Throw
    }

    It 'throws on an illegal transition' {
        { Assert-TaskTransition -From 'todo' -To 'done' } | Should -Throw
    }

    It 'mentions the allowed exits in the error message' {
        $msg = ''
        try { Assert-TaskTransition -From 'todo' -To 'done' } catch { $msg = $_.Exception.Message }
        $msg | Should -Match 'analysing'
    }

    It 'mentions terminal explicitly when leaving cancelled is attempted' {
        $msg = ''
        try { Assert-TaskTransition -From 'cancelled' -To 'todo' } catch { $msg = $_.Exception.Message }
        $msg | Should -Match 'terminal'
    }

    It 'throws on an unknown source status' {
        { Assert-TaskTransition -From 'wat' -To 'todo' } | Should -Throw
    }
}
