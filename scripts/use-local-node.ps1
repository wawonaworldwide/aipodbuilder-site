# Dot-source this file to select the project runtime for this PowerShell session.
$projectNodePath = Join-Path $PSScriptRoot '../.local-tools/runtime/node-v24.22.0-win-x64'
if (!(Test-Path -LiteralPath (Join-Path $projectNodePath 'node.exe'))) {
  throw 'Project Node runtime missing. Run ./scripts/setup-node.ps1 first.'
}
$projectNodePath = (Resolve-Path -LiteralPath $projectNodePath).Path
$env:PATH = $projectNodePath + [IO.Path]::PathSeparator + $env:PATH
Write-Host 'Using the project Node 24.22.0 runtime for this session.'
