#Requires -RunAsAdministrator
# ============================================================================
#  Flowrlink — INSTALLER UNICO (server Windows). Esegui COME AMMINISTRATORE
#  dentro la cartella estratta del pacchetto.
#  Fa: Node -> build -> cartella stato (C:\ProgramData\Flowrlink) -> migrazione
#  una-tantum -> seed (solo install nuova) -> servizio 24/7 (C) -> firewall ->
#  backup NAS opzionale (D) -> riepilogo. Idempotente.
#  Parametro opzionale: -MigrateFrom "C:\vecchio\install" per migrare dati da
#  una vecchia cartella d'installazione.
# ============================================================================
param(
  [string]$MigrateFrom = ''
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Have($c) { return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

$StateDir = 'C:\ProgramData\Flowrlink'
$StateData = Join-Path $StateDir 'data'
$StateDb   = Join-Path $StateData 'workload.db'

Write-Host '== Installazione Flowrlink sul server ==' -ForegroundColor Cyan

# 1) Node >= 22 -------------------------------------------------------------
if (-not (Have node)) {
  if (Have winget) {
    Write-Host 'Node.js non trovato: installo Node LTS con winget...'
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Write-Host "`nNode installato. CHIUDI questa finestra, riaprine una nuova come Amministratore e riesegui lo script." -ForegroundColor Green
    exit 0
  }
  throw 'Node.js non trovato e winget non disponibile. Installa Node 22+ da https://nodejs.org e riesegui.'
}
$nodeVer = (node -v)
if ([int]($nodeVer.TrimStart('v').Split('.')[0]) -lt 22) { throw "Serve Node 22+. Trovato $nodeVer." }
Write-Host "Node $nodeVer OK"

# 2) Dipendenze + build -----------------------------------------------------
Write-Host 'Installo le dipendenze (npm ci) e costruisco (npm run build)...'
cmd /c 'npm ci'
if ($LASTEXITCODE -ne 0) { throw 'npm ci fallito.' }
cmd /c 'npm run build'
if ($LASTEXITCODE -ne 0) { throw 'npm run build fallito.' }

# 3) Cartella stato ---------------------------------------------------------
New-Item -ItemType Directory -Force -Path $StateData | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $StateDir 'backups') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $StateDir 'logs') | Out-Null

# 4) Migrazione una-tantum (solo se lo stato e vuoto) -----------------------
if (-not (Test-Path $StateDb)) {
  $migrateSrc = ''
  if ($MigrateFrom -and (Test-Path (Join-Path $MigrateFrom 'data\workload.db'))) {
    $migrateSrc = Join-Path $MigrateFrom 'data\workload.db'
  } elseif (Test-Path (Join-Path $PSScriptRoot 'data\workload.db')) {
    $migrateSrc = Join-Path $PSScriptRoot 'data\workload.db'
  }
  if ($migrateSrc) {
    Write-Host "Migro i dati esistenti da: $migrateSrc"
    # copia di sicurezza coerente dell'origine prima di toccare qualsiasi cosa (cattura anche il WAL)
    $bkStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    node snapshot-db.mjs "$migrateSrc" (Join-Path $StateDir "backups\pre-migrazione-$bkStamp.db")
    # snapshot COERENTE dell'origine nello stato (usa snapshot-db.mjs se il DB e in uso)
    node snapshot-db.mjs "$migrateSrc" "$StateDb"
    Write-Host 'Dati migrati in ProgramData (origine lasciata come backup).'
  }
  # Migra anche i file password di sezione (se presenti nella vecchia cartella codice)
  $cfgFrom = if ($MigrateFrom) { $MigrateFrom } else { $PSScriptRoot }
  foreach ($cfg in @('admin.config.json', 'consuntivi.config.json')) {
    $oldCfg = Join-Path $cfgFrom "server\$cfg"
    $newCfg = Join-Path $StateDir $cfg
    if ((Test-Path $oldCfg) -and (-not (Test-Path $newCfg))) {
      Copy-Item $oldCfg $newCfg -Force
      Write-Host "Migrato config password: $cfg"
    }
  }
}

# 5) Seed prima installazione (solo se lo stato e ancora vuoto) -------------
if ((-not (Test-Path $StateDb)) -and (Test-Path (Join-Path $PSScriptRoot 'seed\workload.db'))) {
  Copy-Item (Join-Path $PSScriptRoot 'seed\workload.db') $StateDb -Force
  Write-Host 'Stato iniziale applicato dal pacchetto (seed).'
} elseif (-not (Test-Path $StateDb)) {
  Write-Host 'Nessuno stato e nessun seed: il server partira vuoto (setup admin al primo avvio).'
} else {
  Write-Host 'Stato dati gia presente: NON viene toccato (aggiornamento).'
}

# 6) WORKLOAD_STATE_DIR (Machine + per il servizio) -------------------------
[Environment]::SetEnvironmentVariable('WORKLOAD_STATE_DIR', $StateDir, 'Machine')
$env:WORKLOAD_STATE_DIR = $StateDir

# 7) Servizio 24/7 (C) ------------------------------------------------------
Write-Host 'Configuro il servizio Windows 24/7...'
& (Join-Path $PSScriptRoot 'install-service.ps1')

# 8) Firewall ---------------------------------------------------------------
cmd /c 'netsh advfirewall firewall delete rule name="Flowrlink 3000" >NUL 2>&1'
cmd /c 'netsh advfirewall firewall add rule name="Flowrlink 3000" dir=in action=allow protocol=TCP localport=3000 >NUL'

# 9) Backup NAS opzionale (D) ----------------------------------------------
$doBackup = Read-Host 'Configurare ora il backup automatico sul NAS? (s/n)'
if ($doBackup -match '^[sS]') {
  $dest = Read-Host 'Percorso NAS (es. \\NAS\backup\flowrlink)'
  if ($dest) { & (Join-Path $PSScriptRoot 'install-backup-task.ps1') -Dest $dest }
}

# 10) Riepilogo -------------------------------------------------------------
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress)
Write-Host ''
Write-Host '=================================================' -ForegroundColor Green
Write-Host ' FLOWRLINK ONLINE!' -ForegroundColor Green
Write-Host '   Su questo PC:  http://localhost:3000'
if ($ip) { Write-Host ("   In ufficio:    http://{0}:3000" -f $ip) }
Write-Host "   Dati e backup: $StateDir"
Write-Host '   Stato: pm2 status   Log: pm2 logs   Salute backup: http://localhost:3000/api/backup/health'
Write-Host '=================================================' -ForegroundColor Green
Write-Host 'Al primo avvio, apri l app e crea l account amministratore (schermata setup).'
