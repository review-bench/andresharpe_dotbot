#!/usr/bin/env pwsh
#requires -Version 7.0

<#
.SYNOPSIS
Pester unit tests for the pure-logic surface of Dotbot.Core.

Covers:
  - Remove-AbsolutePaths           — string redaction with optional project root
  - ConvertTo-SanitizedConsoleText — ANSI escape stripping
  - Update-ProcessHeartbeatFields  — in-place sanitization of two object fields

Excluded: path discovery helpers (Get-Dotbot*Path) and
Get-OrCreateWorkspaceInstanceId touch the filesystem and belong in
integration tests.
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '_common/Import-RuntimeModule.psm1') -Force
    Import-RuntimeModule -Name 'Dotbot.Core'
}

Describe 'Dotbot.Core.ConvertTo-SanitizedConsoleText' {
    It 'returns $null for $null input' {
        ConvertTo-SanitizedConsoleText -Text $null | Should -Be $null
    }

    It 'returns $null for whitespace-only input' {
        ConvertTo-SanitizedConsoleText -Text "   `t  " | Should -Be $null
    }

    It 'returns $null when input collapses to whitespace after stripping' {
        # An orphaned CSI sequence with no surrounding text should be treated
        # the same as whitespace.
        ConvertTo-SanitizedConsoleText -Text "$([char]0x1B)[31m$([char]0x1B)[0m" | Should -Be $null
    }

    It 'leaves plain text untouched' {
        ConvertTo-SanitizedConsoleText -Text 'hello world' | Should -Be 'hello world'
    }

    It 'strips full ANSI CSI colour sequences' {
        $esc = [char]0x1B
        $input = "$esc[31mred$esc[0m text"
        ConvertTo-SanitizedConsoleText -Text $input | Should -Be 'red text'
    }

    It 'strips orphaned CSI fragments missing the ESC byte' {
        # If the leading ESC byte is lost in transit, the regex's second
        # alternative still removes the bracket-and-params remnant.
        ConvertTo-SanitizedConsoleText -Text '[31mred[0m text' | Should -Be 'red text'
    }

    It 'preserves bracketed plain words that are not CSI sequences' {
        ConvertTo-SanitizedConsoleText -Text '[INFO] hello' | Should -Be '[INFO] hello'
    }

    It 'trims surrounding whitespace from the cleaned result' {
        $esc = [char]0x1B
        ConvertTo-SanitizedConsoleText -Text "  $esc[1mbold$esc[0m  " | Should -Be 'bold'
    }

    It 'coerces non-string input to a string before stripping' {
        ConvertTo-SanitizedConsoleText -Text 42 | Should -Be '42'
    }
}

Describe 'Dotbot.Core.Remove-AbsolutePaths' {
    It 'returns the input unchanged when it is empty' {
        Remove-AbsolutePaths -Text '' | Should -Be ''
    }

    It 'redacts /home/<user>/... paths even without a ProjectRoot' {
        $result = Remove-AbsolutePaths -Text 'crashed at /home/alice/repos/foo/main.py'
        $result | Should -Match '<REDACTED>'
        $result | Should -Not -Match '/home/alice'
    }

    It 'redacts /Users/<user>/... paths even without a ProjectRoot' {
        $result = Remove-AbsolutePaths -Text 'open /Users/bob/code/proj/file.ts'
        $result | Should -Match '<REDACTED>'
        $result | Should -Not -Match '/Users/bob'
    }

    It 'redacts Windows C:\Users\<user>\... paths' {
        $result = Remove-AbsolutePaths -Text 'see C:\Users\carol\src\app for details'
        $result | Should -Match '<REDACTED>'
        $result | Should -Not -Match 'C:\\Users\\carol'
    }

    It 'replaces a known ProjectRoot with "." (forward-slash form)' {
        $result = Remove-AbsolutePaths -Text 'edit /home/alice/repos/proj/src/x.py' -ProjectRoot '/home/alice/repos/proj'
        $result | Should -Be 'edit ./src/x.py'
    }

    It 'replaces a Windows ProjectRoot in both native and JSON-escaped variants' {
        $root  = 'C:\Users\dev\repo'
        $input = "fail at C:\Users\dev\repo\src\x.cs and again at C:\\Users\\dev\\repo\\src\\y.cs"
        $result = Remove-AbsolutePaths -Text $input -ProjectRoot $root
        $result | Should -Not -Match 'C:\\Users\\dev\\repo'
        $result | Should -Match '\.\\src\\x\.cs'
        $result | Should -Match '\.\\\\src\\\\y\.cs'
    }

    It 'replaces a git-bash style lowercase-drive variant of the ProjectRoot' {
        $root = 'C:\Users\dev\repo'
        $input = 'open /c/Users/dev/repo/src/x.cs'
        $result = Remove-AbsolutePaths -Text $input -ProjectRoot $root
        $result | Should -Be 'open ./src/x.cs'
    }
}

Describe 'Dotbot.Core.Update-ProcessHeartbeatFields' {
    It 'sanitises both heartbeat fields in-place on a PSCustomObject' {
        $esc = [char]0x1B
        $proc = [pscustomobject]@{
            heartbeat_status      = "$esc[32mhealthy$esc[0m"
            heartbeat_next_action = "$esc[33mwaiting$esc[0m"
            unrelated_field       = 'kept'
        }
        Update-ProcessHeartbeatFields -Process $proc | Out-Null

        $proc.heartbeat_status      | Should -Be 'healthy'
        $proc.heartbeat_next_action | Should -Be 'waiting'
        $proc.unrelated_field       | Should -Be 'kept'
    }

    It 'returns the same object reference it was given' {
        $proc = [pscustomobject]@{ heartbeat_status = 'plain' }
        $returned = Update-ProcessHeartbeatFields -Process $proc
        [object]::ReferenceEquals($returned, $proc) | Should -BeTrue
    }

    It 'is a no-op when neither heartbeat field is present' {
        $proc = [pscustomobject]@{ other = 'value' }
        { Update-ProcessHeartbeatFields -Process $proc } | Should -Not -Throw
        $proc.other | Should -Be 'value'
    }

    It 'nulls out a heartbeat field that contains only ANSI escapes' {
        $esc = [char]0x1B
        $proc = [pscustomobject]@{ heartbeat_status = "$esc[31m$esc[0m" }
        Update-ProcessHeartbeatFields -Process $proc | Out-Null
        $proc.heartbeat_status | Should -Be $null
    }
}
