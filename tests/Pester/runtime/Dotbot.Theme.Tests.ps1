#!/usr/bin/env pwsh
#requires -Version 7.0

<#
.SYNOPSIS
Pester unit tests for Dotbot.Theme pure helpers.

Covers: Get-VisualWidth, Get-PaddedText.

The rest of the Dotbot.Theme surface writes to the host or depends on
$PSStyle / theme config files; those are not unit-testable as pure logic
and are excluded from this suite.
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '_common/Import-RuntimeModule.psm1') -Force
    Import-RuntimeModule -Name 'Dotbot.Theme'

    # Pre-computed ANSI sequences used in multiple tests.
    $script:Esc   = [char]0x1B
    $script:Red   = "$($script:Esc)[31m"
    $script:Reset = "$($script:Esc)[0m"
}

Describe 'Dotbot.Theme.Get-VisualWidth' {
    It 'returns 0 for an empty string' {
        Get-VisualWidth -Text '' | Should -Be 0
    }

    It 'returns the character count for plain ASCII' {
        Get-VisualWidth -Text 'hello' | Should -Be 5
    }

    It 'ignores ANSI CSI colour sequences' {
        $coloured = "$($script:Red)hello$($script:Reset)"
        Get-VisualWidth -Text $coloured | Should -Be 5
    }

    It 'ignores ANSI bold/reset combos' {
        $bold = "$($script:Esc)[1mHi$($script:Esc)[0m"
        Get-VisualWidth -Text $bold | Should -Be 2
    }

    It 'counts each visible whitespace character' {
        Get-VisualWidth -Text 'a b c' | Should -Be 5
    }
}

Describe 'Dotbot.Theme.Get-PaddedText' {
    It 'pads a short string on the right when -Align Left (default)' {
        Get-PaddedText -Text 'hi' -Width 5 | Should -Be 'hi   '
    }

    It 'pads on the left when -Align Right' {
        Get-PaddedText -Text 'hi' -Width 5 -Align Right | Should -Be '   hi'
    }

    It 'centers text with the extra space favouring the right side' {
        $padded = Get-PaddedText -Text 'hi' -Width 6 -Align Center
        Get-VisualWidth -Text $padded | Should -Be 6
        # Floor(extra/2) on the left, remainder on the right: 'hi' has 2 chars,
        # 4 extras → 2 left, 2 right → '  hi  '.
        $padded | Should -Be '  hi  '
    }

    It 'returns the input unchanged when its visual width equals Width' {
        Get-PaddedText -Text 'hello' -Width 5 | Should -Be 'hello'
    }

    It 'preserves ANSI sequences in width calculation when padding' {
        $coloured = "$($script:Red)hi$($script:Reset)"
        $padded = Get-PaddedText -Text $coloured -Width 6
        # 4 padding spaces are appended after the ANSI-coloured 'hi'.
        Get-VisualWidth -Text $padded | Should -Be 6
        $padded.EndsWith('    ') | Should -BeTrue
    }

    It 'truncates with an ellipsis when input exceeds Width' {
        $padded = Get-PaddedText -Text 'this-is-too-long' -Width 6
        Get-VisualWidth -Text $padded | Should -BeLessOrEqual 6
        # The ellipsis char (…, U+2026) is appended after truncation.
        $padded | Should -Match ([char]0x2026)
    }

    It 'supports a custom pad character' {
        Get-PaddedText -Text 'hi' -Width 5 -PadChar '.' | Should -Be 'hi...'
    }
}
