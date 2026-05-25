#!/usr/bin/env pwsh
#requires -Version 7.0

<#
.SYNOPSIS
Pester unit tests for Dotbot.Task on-disk layout derivation.

Covers: ConvertTo-DotbotSlug, Get-WorkflowRunLayout, Get-RunTaskFilePath,
Get-StandaloneTaskLayout, Get-TaskLayoutPath.

These helpers are pure — they compute paths from inputs and never touch
the filesystem.
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '..' '_common/Import-RuntimeModule.psm1') -Force
    Import-RuntimeModule -Name 'Dotbot.Task'
}

Describe 'Dotbot.Task.ConvertTo-DotbotSlug' {
    It 'lowercases the input' {
        ConvertTo-DotbotSlug -Text 'Hello' | Should -Be 'hello'
    }

    It 'collapses whitespace runs into single hyphens' {
        ConvertTo-DotbotSlug -Text "hello   world `tagain" | Should -Be 'hello-world-again'
    }

    It 'strips characters that are not letters, digits, hyphens, or whitespace' {
        ConvertTo-DotbotSlug -Text 'Add: NEW feature!' | Should -Be 'add-new-feature'
    }

    It 'preserves existing hyphens' {
        ConvertTo-DotbotSlug -Text 'pre-existing-tag' | Should -Be 'pre-existing-tag'
    }

    It 'trims leading and trailing hyphens' {
        ConvertTo-DotbotSlug -Text '---hello---' | Should -Be 'hello'
    }

    It 'returns "untitled" for empty input' {
        ConvertTo-DotbotSlug -Text '' | Should -Be 'untitled'
    }

    It 'returns "untitled" when nothing survives the strip' {
        ConvertTo-DotbotSlug -Text '!!!' | Should -Be 'untitled'
    }

    It 'caps long output at 40 characters' {
        $long = 'a' * 100
        $slug = ConvertTo-DotbotSlug -Text $long
        $slug.Length | Should -BeLessOrEqual 40
    }
}

Describe 'Dotbot.Task.Get-WorkflowRunLayout' {
    It 'throws when RunId is not a canonical workflow-run ID' {
        { Get-WorkflowRunLayout -BotRoot '/bot' -WorkflowName 'wf' -RunId 'not-a-run' } | Should -Throw
    }

    It 'builds a directory name of the form <date>-<slug>-<short>' {
        $layout = Get-WorkflowRunLayout -BotRoot '/bot' -WorkflowName 'My Workflow' -RunId 'wr_AbCd1234' -StartedAt '2026-05-19T12:00:00Z'
        $layout.dir_name | Should -Be '2026-05-19-my-workflow-AbCd'
    }

    It 'derives the 4-char short ID from the first chars of the body' {
        $layout = Get-WorkflowRunLayout -BotRoot '/bot' -WorkflowName 'wf' -RunId 'wr_AbCd1234' -StartedAt '2026-05-19'
        $layout.short_id | Should -Be 'AbCd'
    }

    It 'places the committed run dir under workspace/tasks/workflow-runs/' {
        $layout = Get-WorkflowRunLayout -BotRoot '/bot' -WorkflowName 'wf' -RunId 'wr_AbCd1234' -StartedAt '2026-05-19'
        $layout.run_dir.Replace('\','/') | Should -BeLike '*workspace/tasks/workflow-runs/*'
    }

    It 'places the live status path under .control/workflow-runs/<runId>.json' {
        $layout = Get-WorkflowRunLayout -BotRoot '/bot' -WorkflowName 'wf' -RunId 'wr_AbCd1234' -StartedAt '2026-05-19'
        $layout.live_status_path.Replace('\','/') | Should -BeLike '*.control/workflow-runs/wr_AbCd1234.json'
    }

    It 'accepts a [datetime] StartedAt' {
        $when = [datetime]::new(2026, 4, 1, 0, 0, 0, [System.DateTimeKind]::Utc)
        $layout = Get-WorkflowRunLayout -BotRoot '/bot' -WorkflowName 'wf' -RunId 'wr_AbCd1234' -StartedAt $when
        $layout.dir_name | Should -Be '2026-04-01-wf-AbCd'
    }

    It 'defaults StartedAt to today (UTC) when not supplied' {
        # Bracket the call with before/after UTC dates so the test does not
        # flake if it happens to run across UTC midnight (whichever side of
        # midnight the call resolves on, the dir_name must match it).
        $before = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
        $layout = Get-WorkflowRunLayout -BotRoot '/bot' -WorkflowName 'wf' -RunId 'wr_AbCd1234'
        $after  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
        $layout.dir_name | Should -Match "^($before|$after)-"
    }
}

Describe 'Dotbot.Task.Get-RunTaskFilePath' {
    It 'returns <RunDir>/<TaskId>.json' {
        $path = Get-RunTaskFilePath -RunDir '/runs/abc' -TaskId 't_AbCd1234'
        $path.Replace('\','/') | Should -Be '/runs/abc/t_AbCd1234.json'
    }

    It 'throws when TaskId is not canonical' {
        { Get-RunTaskFilePath -RunDir '/runs/abc' -TaskId 'oops' } | Should -Throw
    }
}

Describe 'Dotbot.Task.Get-StandaloneTaskLayout' {
    It 'builds a file under workspace/tasks/standalone/' {
        $layout = Get-StandaloneTaskLayout -BotRoot '/bot' -TaskId 't_AbCd1234' -TaskName 'Quick fix' -CreatedAt '2026-05-19'
        $layout.file_path.Replace('\','/') | Should -BeLike '*workspace/tasks/standalone/*'
    }

    It 'uses the date-slug-short-id-.json filename convention' {
        $layout = Get-StandaloneTaskLayout -BotRoot '/bot' -TaskId 't_AbCd1234' -TaskName 'Quick fix' -CreatedAt '2026-05-19'
        $layout.file_name | Should -Be '2026-05-19-quick-fix-AbCd.json'
    }

    It 'throws on a malformed task ID' {
        { Get-StandaloneTaskLayout -BotRoot '/bot' -TaskId 'oops' -TaskName 'x' } | Should -Throw
    }
}

Describe 'Dotbot.Task.Get-TaskLayoutPath' {
    It 'dispatches to the workflow-run layout when RunId is supplied' {
        $layout = Get-TaskLayoutPath -BotRoot '/bot' -TaskId 't_AbCd1234' `
                                    -RunId 'wr_ZzWxYy11' -WorkflowName 'wf' -StartedAt '2026-05-19'
        $layout.file_path.Replace('\','/') | Should -BeLike '*workflow-runs/2026-05-19-wf-ZzWx/t_AbCd1234.json'
        $layout.short_id | Should -Be 'AbCd'
    }

    It 'dispatches to the standalone layout when RunId is omitted' {
        $layout = Get-TaskLayoutPath -BotRoot '/bot' -TaskId 't_AbCd1234' `
                                    -TaskName 'Quick fix' -CreatedAt '2026-05-19'
        $layout.file_name | Should -Be '2026-05-19-quick-fix-AbCd.json'
    }

    It 'throws if TaskName is omitted for a standalone task' {
        { Get-TaskLayoutPath -BotRoot '/bot' -TaskId 't_AbCd1234' } | Should -Throw
    }
}
