# Pester unit tests — `src/runtime`

Pester 5.x unit tests for pure-logic functions in `src/runtime/Modules/`.

## Scope

These tests cover deterministic, side-effect-free helpers — string/path
transforms, schema validators, transition tables, settings deep-merge, ID
generators, on-disk layout derivation, and ANSI-aware text utilities.

Out of scope: anything that touches the filesystem, network, subprocesses,
HTTP listeners, or shared mutex state. Those live in the homegrown Layer 2+
suites (`tests/Test-Components.ps1`, `tests/Test-Runtime.ps1`,
`tests/Test-Worktree.ps1`, etc.).

## Install Pester locally (one-time)

```powershell
Install-Module -Name Pester -MinimumVersion 5.5.0 -Scope CurrentUser
```

CI installs Pester automatically; only manual install is needed for local
development. The harness (`tests/Run-Tests.ps1`) skips this sub-layer with a
notice when Pester is missing, unless `DOTBOT_REQUIRE_PESTER=1` is set.

## Running the tests

| Goal | Command |
|---|---|
| Full Pester runtime suite | `Invoke-Pester tests/Pester/runtime -Output Detailed` |
| One module's tests | `Invoke-Pester tests/Pester/runtime/Dotbot.Core.Tests.ps1` |
| All Dotbot.Task tests | `Invoke-Pester tests/Pester/runtime/Dotbot.Task` |
| Run via the harness (Layer 1 + Pester) | `pwsh tests/Run-Tests.ps1 -Layer 1` |
| Run only Pester via the harness | `pwsh tests/Run-Tests.ps1 -Layer pester` |

## Layout

```
tests/Pester/runtime/
├── _common/
│   └── Import-RuntimeModule.psm1     — shared module-import helper
├── Dotbot.Core.Tests.ps1
├── Dotbot.Settings.Tests.ps1
├── Dotbot.Task/
│   ├── IdGen.Tests.ps1
│   ├── Transitions.Tests.ps1
│   ├── Schema.Tests.ps1
│   └── Layout.Tests.ps1
├── Dotbot.Workflow/
│   └── Schema.Tests.ps1
└── Dotbot.Theme.Tests.ps1
```

Each `*.Tests.ps1` file is independent — there is no shared state between
files. A `BeforeAll` block in each file imports the module under test via
`Import-RuntimeModule`.

## Conventions

- **One `Describe` per public function** (`Describe 'Dotbot.Core.ConvertTo-SanitizedConsoleText'`).
- **`It` names describe behaviour**, not inputs (`'strips ANSI CSI sequences'`,
  not `'test 1'`).
- **No `Mock` usage.** If a function needs mocking, it isn't a unit test —
  it belongs in the homegrown integration layers.
- **Public surface only.** Tests call exported functions; private helpers
  inside `Private/*.psm1` are exercised through their public consumers.

## Relationship to the homegrown test harness

`tests/Test-DataModel.ps1` already covers Task IdGen/Transitions/Schema/Layout
and Workflow schema using the homegrown `Assert-True` / `Write-TestResult`
helpers. The Pester suite here is **additive, not a migration** — the
overlap is intentional and accepted.
