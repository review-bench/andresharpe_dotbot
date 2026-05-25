<#
.SYNOPSIS
Import a runtime module (or its manifest) from src/runtime/Modules into the caller's session.

.DESCRIPTION
Centralises the relative-path math used by every Pester test file under
tests/Pester/runtime/. Prefers the .psd1 manifest when one exists so nested
modules and ScriptsToProcess are honoured; falls back to the .psm1 root.

This helper deliberately uses -Force on Import-Module so reruns inside the
same Pester session pick up edits — Pester re-evaluates BeforeAll for every
discovery pass, and a stale module would mask new behaviour.

.PARAMETER Name
The module folder name under src/runtime/Modules (e.g. 'Dotbot.Core',
'Dotbot.Task'). Must match the directory and manifest base name.

.EXAMPLE
BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '_common/Import-RuntimeModule.psm1') -Force
    Import-RuntimeModule -Name 'Dotbot.Core'
}
#>

function Import-RuntimeModule {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )

    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..' '..' '..' '..')
    $moduleDir = Join-Path $repoRoot 'src' 'runtime' 'Modules' $Name

    if (-not (Test-Path $moduleDir)) {
        throw "Import-RuntimeModule: '$Name' not found at $moduleDir"
    }

    $manifest = Join-Path $moduleDir "$Name.psd1"
    $script   = Join-Path $moduleDir "$Name.psm1"

    if (Test-Path $manifest) {
        Import-Module $manifest -Force -DisableNameChecking -Global
    } elseif (Test-Path $script) {
        Import-Module $script -Force -DisableNameChecking -Global
    } else {
        throw "Import-RuntimeModule: neither '$Name.psd1' nor '$Name.psm1' found in $moduleDir"
    }
}

Export-ModuleMember -Function 'Import-RuntimeModule'
