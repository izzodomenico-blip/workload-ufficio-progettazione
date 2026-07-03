#Requires -RunAsAdministrator
# Flowrlink — installa/aggiorna il servizio Windows 24/7 (PM2 sotto servizio).
# Idempotente: rilanciabile senza danni. Eseguire come Amministratore dalla cartella progetto.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host '== Flowrlink — installazione servizio 24/7 ==' -ForegroundColor Cyan

# 1. Node >= 22
$nodeVer = (node -v) 2>$null
if (-not $nodeVer) { throw 'Node.js non trovato. Installa Node 22+ da https://nodejs.org e riprova.' }
$major = [int]($nodeVer.TrimStart('v').Split('.')[0])
if ($major -lt 22) { throw "Serve Node 22+. Trovato $nodeVer." }
Write-Host "Node $nodeVer OK"

# 2. PM2 globale
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host 'Installo PM2 globale…'
  npm i -g pm2
}

# 3. node-windows globale (per registrare il servizio)
npm ls -g node-windows *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Installo node-windows globale…'
  npm i -g node-windows
}
$npmGlobalRoot = (npm root -g).Trim()
$env:NODE_PATH = $npmGlobalRoot  # così install-windows-service.cjs risolve node-windows

# 4. Build se manca dist/
if (-not (Test-Path (Join-Path $PSScriptRoot 'dist'))) {
  Write-Host 'Preparo l''app (npm ci + build)…'
  npm ci
  npm run build
}

# 5. Percorso pm2-runtime (passato al servizio)
$prefix = (npm prefix -g).Trim()
$pm2Runtime = Join-Path $prefix 'node_modules/pm2/bin/pm2-runtime'
if (-not (Test-Path $pm2Runtime)) { throw "pm2-runtime non trovato in $pm2Runtime" }
$env:PM2_RUNTIME_PATH = $pm2Runtime

# 6. Registra il servizio (idempotente lato node-windows)
Write-Host 'Registro il servizio Windows "Flowrlink"…'
node (Join-Path $PSScriptRoot 'scripts/install-windows-service.cjs')

# 7. Firewall porta 3000 (idempotente)
netsh advfirewall firewall delete rule name='Flowrlink 3000' *> $null
netsh advfirewall firewall add rule name='Flowrlink 3000' dir=in action=allow protocol=TCP localport=3000 | Out-Null

# 8. Stato
Start-Sleep -Seconds 3
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress
Write-Host ''
Write-Host "Fatto. App su:  http://$ip:3000" -ForegroundColor Green
Write-Host 'Stato processi PM2:'
pm2 status
