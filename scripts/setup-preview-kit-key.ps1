$ErrorActionPreference = 'Stop'
$kitSiteRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $kitSiteRoot
. ./scripts/use-local-node.ps1
$env:WRANGLER_WRITE_LOGS = 'false'
$env:WRANGLER_SEND_METRICS = 'false'
$env:WRANGLER_LOG = 'log'
$env:WRANGLER_LOG_SANITIZE = 'true'
$env:CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
$env:CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false'
$kitIsolatedRoot = Join-Path $kitSiteRoot '.local-tools/kit-setup'
New-Item -ItemType Directory -Path $kitIsolatedRoot -Force | Out-Null
if ((Test-Path -LiteralPath (Join-Path $kitIsolatedRoot '.dev.vars')) -or (Test-Path -LiteralPath (Join-Path $kitIsolatedRoot '.dev.vars.preview')) -or (Test-Path -LiteralPath (Join-Path $kitIsolatedRoot '.env'))) {
  throw 'The isolated setup folder must not contain private settings.'
}
$kitPublicConfig = '{"name":"aipodbuilder-local","account_id":"db14ec584392e643e275e9492e445a43","env":{"preview":{"name":"aipodbuilder-preview"}}}'
$kitConfigPath = Join-Path $kitIsolatedRoot 'wrangler.json'
[IO.File]::WriteAllText($kitConfigPath + '.tmp', $kitPublicConfig, [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath ($kitConfigPath + '.tmp') -Destination $kitConfigPath -Force
$kitWranglerPath = Join-Path $kitSiteRoot 'node_modules/wrangler/bin/wrangler.js'
Set-Location -LiteralPath $kitIsolatedRoot
# A names-only request confirms the existing Worker before any secret write.
$kitExistingNames = & node $kitWranglerPath secret list --env preview --config $kitConfigPath 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Existing preview Worker could not be verified. No secret written.' }
$kitExistingNames = $null
Write-Host 'Target: existing aipodbuilder-preview Worker only.'
Write-Host 'Paste your Kit V4 API key into the masked Wrangler prompt below and press Enter.'
Write-Host 'Do not paste the key into chat. The key is never written to a local file.'
& node $kitWranglerPath secret put KIT_API_KEY --env preview --config $kitConfigPath
if ($LASTEXITCODE -ne 0) { throw 'Secret upload did not complete. Report failure only; do not copy the key or logs.' }
Write-Host 'KIT_API_KEY stored on preview. Return to Codex and say Done.'
