# ============================================================================
#  Workload — CREA PACCHETTO PER IL SERVER (con lo STATO ATTUALE dei dati)
#  Esegui su QUESTO PC (dove ci sono i dati):  tasto destro -> Esegui con PowerShell
#  Produce un file  workload-server-<data>.zip  da copiare sul server.
#  Sul server: estrai lo zip e lancia install-server.ps1 (come Amministratore).
# ============================================================================
$ErrorActionPreference = "Stop"
$proj = $PSScriptRoot
Set-Location $proj

$stamp   = Get-Date -Format "yyyyMMdd-HHmm"
$stage   = Join-Path $env:TEMP "workload-pkg-$stamp"
$pkgData = Join-Path $stage "data"
New-Item -ItemType Directory -Force -Path $pkgData | Out-Null

Write-Host "1/4  Copio i sorgenti (senza node_modules/dist/dati)..." -ForegroundColor Cyan
# robocopy: /E tutte le sottocartelle; /XD escludi cartelle (PERCORSI COMPLETI, così
# non escludo per errore cartelle omonime annidate come src\data); /XF file segreti/log.
robocopy $proj $stage /E `
  /XD (Join-Path $proj "node_modules") (Join-Path $proj ".git") (Join-Path $proj "dist") (Join-Path $proj "backups") (Join-Path $proj "data") (Join-Path $proj "graphify-out") (Join-Path $proj ".superpowers") (Join-Path $proj ".claude") (Join-Path $proj ".gemini") `
  /XF admin.config.json consuntivi.config.json "*.log" | Out-Null

Write-Host "2/4  Snapshot consistente del database (include il WAL)..." -ForegroundColor Cyan
$dbSrc = Join-Path $proj "data\workload.db"
if (Test-Path $dbSrc) {
  # snapshot-db.mjs crea una copia .db singola e coerente anche col WAL, a server acceso.
  node snapshot-db.mjs "$dbSrc" (Join-Path $pkgData "workload.db")
  Write-Host "     stato attuale incluso nel pacchetto."
} else {
  Write-Host "     nessun database esistente: il server partira vuoto."
}
$keep = Join-Path $proj "data\.gitkeep"
if (Test-Path $keep) { Copy-Item $keep $pkgData -Force }

Write-Host "3/4  Comprimo..." -ForegroundColor Cyan
$zip = Join-Path $proj "workload-server-$stamp.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
# Zip costruito voce-per-voce con separatori "/" (standard). Sia Compress-Archive
# sia CreateFromDirectory su Windows PowerShell 5.1 userebbero i backslash, che
# Esplora file estrae male. Così l'archivio è estraibile ovunque.
Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
$fs = [System.IO.File]::Open($zip, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
Push-Location $stage
try {
  Get-ChildItem -Recurse -File | ForEach-Object {
    # Resolve-Path -Relative è robusto ai path corti/lunghi (DOMENI~1 vs nome esteso)
    $rel = ((Resolve-Path -LiteralPath $_.FullName -Relative) -replace '^\.\\', '') -replace '\\', '/'
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $rel)
  }
} finally { Pop-Location }
$archive.Dispose(); $fs.Dispose()

Write-Host "4/4  Pulizia..." -ForegroundColor Cyan
Remove-Item -Recurse -Force $stage

Write-Host ""
Write-Host "PACCHETTO PRONTO:" -ForegroundColor Green
Write-Host "  $zip"
Write-Host "Copialo sul server, estrai, poi (come Amministratore) esegui:  install-server.ps1"
