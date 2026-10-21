# Download the fixed Windows x64 runtime only into this project's ignored tools folder.
$ErrorActionPreference = 'Stop'
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This runtime setup is for Windows x64.' }
$runtimeFolder = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.local-tools/runtime'))
$archiveName = 'node-v24.22.0-win-x64.zip'
$nodeFolder = Join-Path $runtimeFolder 'node-v24.22.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $nodeFolder 'node.exe')) {
  Write-Host 'Project runtime already installed.'
  return
}
New-Item -ItemType Directory -Force -Path $runtimeFolder | Out-Null
$archivePath = Join-Path $runtimeFolder $archiveName
$downloadPath = $archivePath + '.tmp'
Invoke-WebRequest ('https://nodejs.org/dist/v24.22.0/' + $archiveName) -OutFile $downloadPath
# Published by nodejs.org in v24.22.0/SHASUMS256.txt; verified on 2026-10-20.
$expectedHash = 'f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3'
if ((Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash -ne $expectedHash) {
  throw 'Node download checksum mismatch. The archive was not extracted.'
}
Move-Item -LiteralPath $downloadPath -Destination $archivePath -Force
Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeFolder
Write-Host 'Verified Node 24.22.0 installed inside the project.'
