#!/usr/bin/env pwsh
#requires -Version 7.0

<#
.SYNOPSIS
Pester unit tests for Dotbot.Settings.Merge-DeepSettings.

The merge logic is pure: two settings bags in, one merged bag out. Resolution
order, file I/O, and Write-BotLog fall through to Get-MergedSettings, which
is integration-tested elsewhere.

Merge rules being asserted (observable behaviour — divergence from docstring
noted in individual tests):
  - nested objects merge recursively when both sides are objects
  - arrays: override replaces base entirely (see note on scalar dedup below)
  - mismatched shapes / scalars: last-writer-wins
  - base keys absent from override are preserved
  - override-only keys are added
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '_common/Import-RuntimeModule.psm1') -Force
    Import-RuntimeModule -Name 'Dotbot.Settings'
}

Describe 'Dotbot.Settings.Merge-DeepSettings' {
    It 'returns base keys untouched when override is empty' {
        $base = [pscustomobject]@{ a = 1; b = 'two' }
        $over = [pscustomobject]@{}
        $merged = Merge-DeepSettings $base $over

        $merged['a'] | Should -Be 1
        $merged['b'] | Should -Be 'two'
    }

    It 'adds keys present only in override' {
        $base = [pscustomobject]@{ a = 1 }
        $over = [pscustomobject]@{ b = 2 }
        $merged = Merge-DeepSettings $base $over

        $merged['a'] | Should -Be 1
        $merged['b'] | Should -Be 2
    }

    It 'overrides scalar values with the override side' {
        $base = [pscustomobject]@{ name = 'base'; count = 1 }
        $over = [pscustomobject]@{ name = 'over' }
        $merged = Merge-DeepSettings $base $over

        $merged['name']  | Should -Be 'over'
        $merged['count'] | Should -Be 1
    }

    It 'recursively merges nested objects' {
        $base = [pscustomobject]@{
            nested = [pscustomobject]@{ x = 1; y = 2 }
        }
        $over = [pscustomobject]@{
            nested = [pscustomobject]@{ y = 20; z = 30 }
        }
        $merged = Merge-DeepSettings $base $over

        $merged['nested']['x'] | Should -Be 1
        $merged['nested']['y'] | Should -Be 20
        $merged['nested']['z'] | Should -Be 30
    }

    It 'replaces arrays of scalars with the override side' {
        # The docstring describes a "concat + dedup" path for scalar arrays,
        # but in practice the predicate inside Where-Object (`$_ -is
        # [PSCustomObject]`) is always true because the pipeline wraps each
        # element in a PSObject — so the merge always falls into the
        # "replace entirely" branch. This test pins the observable behaviour.
        $base = [pscustomobject]@{ tags = @('alpha', 'beta') }
        $over = [pscustomobject]@{ tags = @('beta', 'gamma') }
        $merged = Merge-DeepSettings $base $over

        @($merged['tags']) | Should -Be @('beta', 'gamma')
    }

    It 'replaces arrays of objects entirely (ordered pipelines)' {
        $base = [pscustomobject]@{
            pipeline = @(
                [pscustomobject]@{ name = 'a'; order = 1 },
                [pscustomobject]@{ name = 'b'; order = 2 }
            )
        }
        $over = [pscustomobject]@{
            pipeline = @(
                [pscustomobject]@{ name = 'c'; order = 1 }
            )
        }
        $merged = Merge-DeepSettings $base $over

        @($merged['pipeline']).Count   | Should -Be 1
        @($merged['pipeline'])[0].name | Should -Be 'c'
    }

    It 'replaces object with scalar when shapes mismatch (last-writer-wins)' {
        $base = [pscustomobject]@{ thing = [pscustomobject]@{ x = 1 } }
        $over = [pscustomobject]@{ thing = 'now a string' }
        $merged = Merge-DeepSettings $base $over

        $merged['thing'] | Should -Be 'now a string'
    }

    It 'replaces scalar with object when shapes mismatch (last-writer-wins)' {
        $base = [pscustomobject]@{ thing = 'plain' }
        $over = [pscustomobject]@{ thing = [pscustomobject]@{ x = 1 } }
        $merged = Merge-DeepSettings $base $over

        # The result is the override PSCustomObject as-is; use dot access (not
        # indexer) because PSCustomObject does not support string indexing.
        $merged['thing'].x | Should -Be 1
    }

    It 'accepts hashtables on both sides' {
        $base = @{ a = 1; b = @{ inner = 'old' } }
        $over = @{ b = @{ inner = 'new'; extra = 42 } }
        $merged = Merge-DeepSettings $base $over

        $merged['a']           | Should -Be 1
        $merged['b']['inner']  | Should -Be 'new'
        $merged['b']['extra']  | Should -Be 42
    }

    It 'mixes PSCustomObject and hashtable inputs cleanly' {
        $base = [pscustomobject]@{ a = 1; b = [pscustomobject]@{ inner = 'old' } }
        $over = @{ b = @{ inner = 'new' } }
        $merged = Merge-DeepSettings $base $over

        $merged['a']          | Should -Be 1
        $merged['b']['inner'] | Should -Be 'new'
    }

    It 'preserves an existing array on base when override does not touch it' {
        $base = [pscustomobject]@{ tags = @('one', 'two'); other = 'x' }
        $over = [pscustomobject]@{ other = 'y' }
        $merged = Merge-DeepSettings $base $over

        @($merged['tags']) | Should -Be @('one', 'two')
        $merged['other']   | Should -Be 'y'
    }

    It 'preserves order: result keys mirror their first occurrence' {
        $base = [pscustomobject]@{ a = 1; b = 2; c = 3 }
        $over = [pscustomobject]@{ b = 20; d = 4 }
        $merged = Merge-DeepSettings $base $over

        # Result is an [ordered] hashtable; check the key order.
        @($merged.Keys) | Should -Be @('a', 'b', 'c', 'd')
    }

    It 'merges three levels deep without collapsing intermediate keys' {
        $base = [pscustomobject]@{
            ui = [pscustomobject]@{
                theme = [pscustomobject]@{ primary = 'amber'; muted = '#888' }
            }
        }
        $over = [pscustomobject]@{
            ui = [pscustomobject]@{
                theme = [pscustomobject]@{ primary = 'green' }
            }
        }
        $merged = Merge-DeepSettings $base $over

        $merged['ui']['theme']['primary'] | Should -Be 'green'
        $merged['ui']['theme']['muted']   | Should -Be '#888'
    }
}
