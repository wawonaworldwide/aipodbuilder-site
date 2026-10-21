$ErrorActionPreference = 'Stop'
$launchRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $launchRoot
. ./scripts/use-local-node.ps1
$env:WRANGLER_WRITE_LOGS = 'false'
$env:WRANGLER_SEND_METRICS = 'false'
$env:WRANGLER_LOG_SANITIZE = 'true'
$env:CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
$env:CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false'
$launchSetup = Join-Path $launchRoot '.local-tools/production-setup'
New-Item -ItemType Directory -Path $launchSetup -Force | Out-Null
foreach ($privateName in @('.dev.vars','.dev.vars.production','.env','.env.production')) {
  if (Test-Path -LiteralPath (Join-Path $launchSetup $privateName)) { throw 'Private settings must not be present in the isolated setup folder.' }
}
$launchConfig = Join-Path $launchSetup 'wrangler.json'
$launchPublicConfig = '{"name":"aipodbuilder-local","account_id":"db14ec584392e643e275e9492e445a43","workers_dev":false,"env":{"production":{"name":"aipodbuilder-production","workers_dev":false}}}'
[IO.File]::WriteAllText($launchConfig + '.tmp', $launchPublicConfig, [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath ($launchConfig + '.tmp') -Destination $launchConfig -Force
$launchWrangler = Join-Path $launchRoot 'node_modules/wrangler/bin/wrangler.js'
Write-Host 'Target: aipodbuilder-production only. No website-domain deployment is performed here.'
$launchSiteKey = Read-Host 'Paste the PUBLIC Turnstile Site Key (not the Secret Key)'
if ($launchSiteKey -notmatch '^0x4[A-Za-z0-9_-]+$') { throw 'Expected a public Turnstile Site Key. Nothing saved.' }
[IO.File]::WriteAllText((Join-Path $launchSetup 'public-site-key.txt.tmp'),$launchSiteKey,[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath (Join-Path $launchSetup 'public-site-key.txt.tmp') -Destination (Join-Path $launchSetup 'public-site-key.txt') -Force
Set-Location -LiteralPath $launchSetup
Write-Host 'Paste the Turnstile SECRET Key only in the masked prompt below.'
Write-Host 'If Wrangler asks to create aipodbuilder-production, answer yes. This creates the approved Worker shell.'
& node $launchWrangler secret put TURNSTILE_SECRET_KEY --env production --config $launchConfig
if ($LASTEXITCODE -ne 0) { throw 'Turnstile upload failed. Report status only.' }
Write-Host 'Now paste your Kit V4 API key only in the next masked prompt.'
& node $launchWrangler secret put KIT_API_KEY --env production --config $launchConfig
if ($LASTEXITCODE -ne 0) { throw 'Kit upload failed. Report status only.' }
Write-Host 'Production credentials stored. Dismiss any key displays and tell Codex Done.'
