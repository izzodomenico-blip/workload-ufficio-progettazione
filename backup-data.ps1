# ============================================================================
#  Workload — BACKUP DATI (da programmare ogni giorno)
#  Crea uno snapshot coerente del database + i backup JSON dell'app e li mette
#  in una destinazione ESTERNA (share di rete / NAS / cloud), tenendo N copie.
#
#  Uso manuale:
#    .\backup-data.ps1 -Dest "\\NAS\backup\workload"
#  Programmazione giornaliera (una volta, come Amministratore):
#    schtasks /Create /SC DAILY /ST 20:00 /RL HIGHEST /F /TN "Workload Backup" ^
#      /TR "powershell -ExecutionPolicy Bypass -File \"C:\percorso\backup-data.ps1\" -Dest \"\\NAS\backup\workload\""
# ============================================================================
param(
  [string]$Dest = "$PSScriptRoot\backups\offsite",   # METTI qui una share/NAS/cloud!
  [int]$Keep = 30
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tmp   = Join-Path $env:TEMP "wlbk-$stamp"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# 1) snapshot coerente del db (funziona anche a server acceso, include il WAL)
$dbSrc = Join-Path $PSScriptRoot "data\workload.db"
if (Test-Path $dbSrc) {
  node snapshot-db.mjs "$dbSrc" (Join-Path $tmp "workload.db")
}
# 2) includi anche i backup JSON prodotti dall'app
$appBk = Join-Path $PSScriptRoot "backups"
if (Test-Path $appBk) { Copy-Item -Recurse $appBk (Join-Path $tmp "app-backups") -ErrorAction SilentlyContinue }

# 3) comprimi nella destinazione esterna
$zip = Join-Path $Dest "workload-backup-$stamp.zip"
Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $zip
Remove-Item -Recurse -Force $tmp

# 4) tieni solo le ultime $Keep copie
Get-ChildItem $Dest -Filter "workload-backup-*.zip" |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep |
  ForEach-Object { Remove-Item $_.FullName -Force }

Write-Host "Backup creato: $zip"
