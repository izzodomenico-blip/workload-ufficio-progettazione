# ============================================================================
#  Workload — INSTALLER AUTOMATICO (server Windows)
#  Esegui COME AMMINISTRATORE dentro la cartella del progetto:
#    tasto destro sul file  ->  "Esegui con PowerShell"  (accetta l'elevazione)
#  Fa: (Node se manca) -> npm ci -> build -> PM2 sempre-online -> firewall -> avvio.
# ============================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Have($c) { return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

Write-Host "== Installazione Workload sul server ==" -ForegroundColor Cyan

# 1) Node.js -----------------------------------------------------------------
if (-not (Have node)) {
  Write-Host "Node.js non trovato." -ForegroundColor Yellow
  if (Have winget) {
    Write-Host "Installo Node.js LTS con winget..."
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Write-Host "`nNode installato. CHIUDI questa finestra, riaprine una nuova come Amministratore e riesegui lo script." -ForegroundColor Green
    exit 0
  }
  Write-Host "winget non disponibile: installa Node 22+ da https://nodejs.org e riesegui." -ForegroundColor Red
  exit 1
}
Write-Host ("Node: " + (node -v))

# 2) Dipendenze + build ------------------------------------------------------
Write-Host "Installo le dipendenze (npm ci)..."
cmd /c "npm ci"
Write-Host "Costruisco l'app (npm run build)..."
cmd /c "npm run build"

# 3) PM2 (sempre online + all'accensione) ------------------------------------
Write-Host "Configuro l'avvio automatico con PM2..."
cmd /c "npm i -g pm2 pm2-windows-startup"
cmd /c "pm2-startup install"
cmd /c "pm2 delete workload-ufficio-progettazione 2>NUL"
cmd /c "pm2 start ecosystem.config.cjs"
cmd /c "pm2 save"

# 4) Firewall porta 3000 -----------------------------------------------------
Write-Host "Apro la porta 3000 nel firewall..."
cmd /c 'netsh advfirewall firewall delete rule name="Workload 3000" >NUL 2>&1'
cmd /c 'netsh advfirewall firewall add rule name="Workload 3000" dir=in action=allow protocol=TCP localport=3000 >NUL'

# 5) Riepilogo accesso -------------------------------------------------------
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host " ONLINE!" -ForegroundColor Green
Write-Host ("   Su questo PC:  http://localhost:3000")
if ($ip) { Write-Host ("   In ufficio:    http://{0}:3000" -f $ip) }
Write-Host "   Stato:  pm2 status     Log:  pm2 logs"
Write-Host "===================================================" -ForegroundColor Green
Write-Host "Ricorda: imposta le password (vedi DEPLOY-LAN.md, passo 8) e programma il backup (backup-data.ps1)."
