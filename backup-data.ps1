# ============================================================================
#  Flowrlink — COPIA BACKUP SUL NAS (mirror della cartella backups\verified)
#  L'app crea e verifica gli snapshot in backups\verified\ (db + manifest .json)
#  e li pota con ritenzione GFS. Questo script fa il MIRROR sul NAS e scrive una
#  ricevuta locale che l'app legge per il semaforo di stato.
#  Uso:   .\backup-data.ps1 -Dest "\\NAS\backup\flowrlink"
# ============================================================================
param(
  [Parameter(Mandatory = $true)][string]$Dest
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$stateRoot = if ($env:WORKLOAD_STATE_DIR) { $env:WORKLOAD_STATE_DIR } else { $PSScriptRoot }
$src = Join-Path $stateRoot 'backups\verified'
$receipt = Join-Path $stateRoot 'backups\offsite-status.json'
$now = (Get-Date).ToString('o')

function Write-Receipt($ok, $copied, $err) {
  $obj = [ordered]@{ lastOffsiteAt = $now; lastOffsiteOk = $ok; dest = $Dest; copiedCount = $copied; error = $err }
  ($obj | ConvertTo-Json) | Set-Content -Path $receipt -Encoding utf8
}

try {
  if (-not (Test-Path $src)) { Write-Receipt $false 0 'Cartella backups\verified assente (nessuno snapshot ancora).'; Write-Host 'Nessuno snapshot da copiare.'; exit 0 }
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null

  # Mirror: robocopy /MIR rende $Dest identica a $src (copia i nuovi, elimina dal NAS ciò che localmente è stato potato).
  # /R:2 /W:5 = 2 tentativi, 5s attesa; robocopy esce con codici <8 in caso di successo.
  $log = robocopy $src $Dest /MIR /R:2 /W:5 /NP /NFL /NDL
  if ($LASTEXITCODE -ge 8) { throw "robocopy fallito (codice $LASTEXITCODE)." }

  $copied = (Get-ChildItem $Dest -Filter 'verified_*.db' -ErrorAction SilentlyContinue).Count
  Write-Receipt $true $copied $null
  Write-Host "Mirror completato su $Dest ($copied snapshot)."
} catch {
  Write-Receipt $false 0 $_.Exception.Message
  Write-Host "Copia sul NAS FALLITA: $($_.Exception.Message)"
  exit 1
}
