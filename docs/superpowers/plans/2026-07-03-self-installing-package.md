# Pacchetto autoinstallante — Implementation Plan (sotto-progetto E)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un unico installer "un click" che mette Flowrlink online 24/7 su un server Windows pulito, con lo stato dati attuale, e con aggiornamenti a prova di perdita dati.

**Architecture:** Una sola variabile `WORKLOAD_STATE_DIR` (default = cartella progetto; produzione = `C:\ProgramData\Flowrlink`) fa vivere `data/`, `backups/`, `logs/` fuori dalla cartella del codice. `install-server.ps1` orchestra tutto (Node, build, cartella stato, migrazione una-tantum, seed, servizio di C, backup di D). Il pacchetto porta il DB come `seed/` applicato solo a installazione nuova. Il codice non banale (risoluzione dello stato) è una funzione pura testata; il resto sono script Windows verificati per parse + accettazione manuale.

**Tech Stack:** Node ≥22 ESM, node:sqlite, Express, vitest. Script Windows PowerShell + `node-windows`/PM2 (tooling operativo, già presenti da C/D).

## Global Constraints

- Nessuna nuova dipendenza runtime app: solo `express` + nativi Node. Script in PowerShell.
- Node ≥ 22. ESM. Test `.test.mjs` con API vitest. Run singolo: `npx vitest run <file>`.
- `WORKLOAD_STATE_DIR` default = `ROOT_DIR` (dev/test invariati); produzione = `C:\ProgramData\Flowrlink`. Nome servizio Windows `Flowrlink`. Porta 3000.
- L'installer NON sovrascrive MAI dati esistenti; la migrazione **copia** (non sposta/cancella l'origine) e solo dopo una copia di sicurezza.
- Credenziali NAS mai nel repo (le chiede `install-backup-task.ps1`).
- Retrocompatibile: con default `ROOT_DIR` tutti i path restano identici a oggi → nessuna regressione; i test esistenti restano verdi.

---

### Task 1: knob `WORKLOAD_STATE_DIR` nell'app (5 file)

**Files:**
- Modify: `server/db.js` (aggiungi `resolveStateDir` + `STATE_DIR`; `DATA_DIR` default da `STATE_DIR`)
- Modify: `server/backupService.js` (`BACKUPS_DIR` da `STATE_DIR`)
- Modify: `server/verifiedBackup.js` (`VERIFIED_DIR`/`OFFSITE_RECEIPT_PATH` da `STATE_DIR`)
- Modify: `server/index.js` (`CRASH_LOG`/`BACKUP_LOG` da `STATE_DIR`)
- Modify: `server/watchdog.js` (`LOG_FILE` da `STATE_DIR`)
- Test: `server/stateDir.test.mjs`

**Interfaces:**
- Produces: `resolveStateDir(env: object, rootDir: string): string` (pura); `STATE_DIR` (costante esportata da `db.js`). Tutti i path di stato (`DATA_DIR`, `BACKUPS_DIR`, `VERIFIED_DIR`, `OFFSITE_RECEIPT_PATH`, log) derivano da `STATE_DIR`.

- [ ] **Step 1: Scrivi il test che fallisce**

`server/stateDir.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { resolveStateDir, STATE_DIR, ROOT_DIR } from './db.js'
import { BACKUPS_DIR } from './backupService.js'
import { VERIFIED_DIR, OFFSITE_RECEIPT_PATH } from './verifiedBackup.js'

describe('resolveStateDir', () => {
  it('default rootDir senza env', () => {
    expect(resolveStateDir({}, '/root')).toBe('/root')
  })
  it('usa WORKLOAD_STATE_DIR risolto in assoluto', () => {
    expect(resolveStateDir({ WORKLOAD_STATE_DIR: 'some/dir' }, '/root')).toBe(path.resolve('some/dir'))
  })
})

describe('path di stato derivati da STATE_DIR (default = ROOT_DIR nei test)', () => {
  it('STATE_DIR default = ROOT_DIR', () => { expect(STATE_DIR).toBe(ROOT_DIR) })
  it('BACKUPS_DIR = STATE_DIR/backups', () => { expect(BACKUPS_DIR).toBe(path.join(STATE_DIR, 'backups')) })
  it('VERIFIED_DIR = STATE_DIR/backups/verified', () => { expect(VERIFIED_DIR).toBe(path.join(STATE_DIR, 'backups', 'verified')) })
  it('OFFSITE_RECEIPT_PATH = STATE_DIR/backups/offsite-status.json', () => {
    expect(OFFSITE_RECEIPT_PATH).toBe(path.join(STATE_DIR, 'backups', 'offsite-status.json'))
  })
})
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run server/stateDir.test.mjs`
Expected: FAIL (`resolveStateDir is not a function` / import mancante).

- [ ] **Step 3: `server/db.js` — aggiungi STATE_DIR**

Le righe 11-14 attuali sono:
```js
export const ROOT_DIR = path.resolve(__dirname, '..')
export const DATA_DIR = process.env.WORKLOAD_DATA_DIR
  ? path.resolve(process.env.WORKLOAD_DATA_DIR)
  : path.join(ROOT_DIR, 'data')
```
Sostituiscile con:
```js
export const ROOT_DIR = path.resolve(__dirname, '..')

export function resolveStateDir(env, rootDir) {
  return env.WORKLOAD_STATE_DIR ? path.resolve(env.WORKLOAD_STATE_DIR) : rootDir
}
export const STATE_DIR = resolveStateDir(process.env, ROOT_DIR)

export const DATA_DIR = process.env.WORKLOAD_DATA_DIR
  ? path.resolve(process.env.WORKLOAD_DATA_DIR)
  : path.join(STATE_DIR, 'data')
```
(`DB_PATH` sotto resta invariato: default `path.join(DATA_DIR, 'workload.db')`.)

- [ ] **Step 4: `server/backupService.js` — BACKUPS_DIR da STATE_DIR**

L'import da `./db.js` (riga 3) importa `ROOT_DIR`. Aggiungi `STATE_DIR` all'elenco. Poi, riga 6:
```js
export const BACKUPS_DIR = path.join(ROOT_DIR, 'backups')
```
diventa:
```js
export const BACKUPS_DIR = path.join(STATE_DIR, 'backups')
```
Verifica con grep che `ROOT_DIR` non sia più usato altrove in `backupService.js`; se non lo è, rimuovilo dall'import (lascialo se ancora referenziato).

- [ ] **Step 5: `server/verifiedBackup.js` — VERIFIED_DIR/OFFSITE da STATE_DIR**

L'import `import { ROOT_DIR, getDb } from './db.js'` diventa `import { STATE_DIR, getDb } from './db.js'`. Le righe 9-10:
```js
export const VERIFIED_DIR = path.join(ROOT_DIR, 'backups', 'verified')
export const OFFSITE_RECEIPT_PATH = path.join(ROOT_DIR, 'backups', 'offsite-status.json')
```
diventano:
```js
export const VERIFIED_DIR = path.join(STATE_DIR, 'backups', 'verified')
export const OFFSITE_RECEIPT_PATH = path.join(STATE_DIR, 'backups', 'offsite-status.json')
```

- [ ] **Step 6: `server/index.js` — log da STATE_DIR**

Nell'import da `./db.js` aggiungi `STATE_DIR`. Le righe che definiscono i log:
```js
const CRASH_LOG = path.join(ROOT_DIR, 'logs', 'crash.log')
```
e
```js
const BACKUP_LOG = path.join(ROOT_DIR, 'logs', 'backup.log')
```
diventano (usa `STATE_DIR` al posto del `ROOT_DIR` locale, SOLO per questi due path di log):
```js
const CRASH_LOG = path.join(STATE_DIR, 'logs', 'crash.log')
```
```js
const BACKUP_LOG = path.join(STATE_DIR, 'logs', 'backup.log')
```
(Lascia invariato il `const ROOT_DIR = path.resolve(__dirname, '..')` locale e ogni altro uso di `ROOT_DIR` come `DIST_DIR`: quelli sono path di CODICE, non di stato.)

- [ ] **Step 7: `server/watchdog.js` — LOG_FILE da STATE_DIR**

Aggiungi in cima: `import { STATE_DIR } from './db.js'`. La riga 14:
```js
const LOG_FILE = path.join(process.cwd(), 'logs', 'watchdog.log')
```
diventa:
```js
const LOG_FILE = path.join(STATE_DIR, 'logs', 'watchdog.log')
```

- [ ] **Step 8: Esegui i test + suite + sintassi**

Run: `npx vitest run server/stateDir.test.mjs`
Expected: PASS (6 test).
Run: `node --check server/index.js && node --check server/watchdog.js && npm run test`
Expected: `--check` nessun output; intera suite verde (nessuna regressione: con default `ROOT_DIR` i path non cambiano).

- [ ] **Step 9: Commit**

```bash
git add server/db.js server/backupService.js server/verifiedBackup.js server/index.js server/watchdog.js server/stateDir.test.mjs
git commit -m "feat(installer): WORKLOAD_STATE_DIR — stato (data/backups/logs) separabile dal codice"
```

---

### Task 2: C+D leggono `WORKLOAD_STATE_DIR`

**Files:**
- Modify: `scripts/install-windows-service.cjs` (passa `WORKLOAD_STATE_DIR` all'env del servizio)
- Modify: `backup-data.ps1` (legge `verified/` + ricevuta da `WORKLOAD_STATE_DIR`)

**Interfaces:**
- Consumes: `WORKLOAD_STATE_DIR` (Task 1) impostata dall'installer (Task 4).

- [ ] **Step 1: `scripts/install-windows-service.cjs` — env del servizio**

Nell'array `env` del `new Service({...})`, aggiungi `WORKLOAD_STATE_DIR` (accanto a `PM2_HOME`/`PM2_BIN` aggiunti in C):
```js
    { name: 'WORKLOAD_STATE_DIR', value: process.env.WORKLOAD_STATE_DIR || '' },
```
Verifica: `node --check scripts/install-windows-service.cjs` → nessun output.

- [ ] **Step 2: `backup-data.ps1` — sorgente da STATE_DIR**

Le righe che definiscono `$src` e `$receipt` (che oggi usano `$PSScriptRoot`) diventano: usa
`$env:WORKLOAD_STATE_DIR` se impostata, altrimenti fallback a `$PSScriptRoot` (retrocompat
dev/uso manuale). Sostituisci:
```powershell
$src = Join-Path $PSScriptRoot 'backups\verified'
$receipt = Join-Path $PSScriptRoot 'backups\offsite-status.json'
```
con:
```powershell
$stateRoot = if ($env:WORKLOAD_STATE_DIR) { $env:WORKLOAD_STATE_DIR } else { $PSScriptRoot }
$src = Join-Path $stateRoot 'backups\verified'
$receipt = Join-Path $stateRoot 'backups\offsite-status.json'
```
Verifica parse:
```
powershell -NoProfile -Command "$e=$null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'backup-data.ps1').Path,[ref]$null,[ref]$e); if($e){$e}else{'PARSE-OK'}"
```
Expected: `PARSE-OK`.

- [ ] **Step 3: Suite di non regressione**

Run: `npm run test`
Expected: intera suite verde (Task 2 non tocca codice testato; conferma nessuna regressione).

- [ ] **Step 4: Commit**

```bash
git add scripts/install-windows-service.cjs backup-data.ps1
git commit -m "feat(installer): servizio e task backup leggono WORKLOAD_STATE_DIR"
```

---

### Task 3: `make-package.ps1` — DB come `seed/`

**Files:**
- Modify: `make-package.ps1`

- [ ] **Step 1: Snapshot in `seed/` invece di `data/`**

Le righe che creano `$pkgData` e ci mettono lo snapshot cambiano da `data` a `seed`.
Sostituisci:
```powershell
$pkgData = Join-Path $stage "data"
New-Item -ItemType Directory -Force -Path $pkgData | Out-Null
```
con:
```powershell
$pkgSeed = Join-Path $stage "seed"
New-Item -ItemType Directory -Force -Path $pkgSeed | Out-Null
```
E la sezione snapshot (blocco `2/4`) usa `$pkgSeed`:
```powershell
if (Test-Path $dbSrc) {
  node snapshot-db.mjs "$dbSrc" (Join-Path $pkgSeed "workload.db")
  Write-Host "     stato attuale incluso nel pacchetto (seed/)."
} else {
  Write-Host "     nessun database esistente: il server partira vuoto."
}
```
Rimuovi la copia di `data\.gitkeep` in `$pkgData` (non più necessaria: il seed non è `data/`).

- [ ] **Step 2: Verifica parse**

```
powershell -NoProfile -Command "$e=$null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'make-package.ps1').Path,[ref]$null,[ref]$e); if($e){$e}else{'PARSE-OK'}"
```
Expected: `PARSE-OK`.

- [ ] **Step 3: Commit**

```bash
git add make-package.ps1
git commit -m "feat(installer): pacchetto porta il DB come seed/ (non data/)"
```

---

### Task 4: `install-server.ps1` — installer unico (riscrittura)

**Files:**
- Rewrite: `install-server.ps1`

Nota: ops Windows. Verifica = parse + **accettazione manuale** sul server (installazione reale, servizio, migrazione, salute). Non automatizzabile in CI.

- [ ] **Step 1: Riscrivi `install-server.ps1`**

```powershell
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
    # copia di sicurezza dell'origine prima di toccare qualsiasi cosa
    $bkStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Copy-Item $migrateSrc (Join-Path $StateDir "backups\pre-migrazione-$bkStamp.db") -Force
    # snapshot COERENTE dell'origine nello stato (usa snapshot-db.mjs se il DB e in uso)
    node snapshot-db.mjs "$migrateSrc" "$StateDb"
    Write-Host 'Dati migrati in ProgramData (origine lasciata come backup).'
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
```

- [ ] **Step 2: Verifica parse (senza eseguire)**

```
powershell -NoProfile -Command "$e=$null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'install-server.ps1').Path,[ref]$null,[ref]$e); if($e){$e}else{'PARSE-OK'}"
```
Expected: `PARSE-OK`. NON eseguire lo script (installerebbe un servizio reale e toccherebbe ProgramData).

- [ ] **Step 3: Commit**

```bash
git add install-server.ps1
git commit -m "feat(installer): install-server.ps1 unico (stato ProgramData, servizio, migrazione, backup opzionale)"
```

---

### Task 5: Documentazione `DEPLOY-LAN.md`

**Files:**
- Modify: `DEPLOY-LAN.md`

- [ ] **Step 1: Consolida la guida installazione**

Sostituisci la sezione "⚡ Percorso AUTOMATICO" (in cima) con una versione allineata a E:
```markdown
## ⚡ Installazione in un colpo (consigliata)

1. **Su questo PC** (dove ci sono i dati): tasto destro su `make-package.ps1` →
   **Esegui con PowerShell**. Ottieni `workload-server-<data>.zip` (contiene l'app + uno
   snapshot coerente del database attuale come `seed/`).
2. **Sul server**: copia lo zip, **estrailo in una cartella**, poi tasto destro su
   `install-server.ps1` → **Esegui con PowerShell (come Amministratore)**. Fa tutto:
   Node → build → cartella dati `C:\ProgramData\Flowrlink` → servizio Windows 24/7 →
   firewall → (chiede se configurare il backup sul NAS) → stampa `http://IP:3000`.
3. **Al primo avvio**: apri l'app e crea l'account amministratore (schermata setup).
   Imposta le password sezioni (Passo 8) se servono.

### Dove sono i dati
Database, backup verificati e log stanno in **`C:\ProgramData\Flowrlink`** — SEPARATI dalla
cartella del programma. Non vanno mai cancellati.

### Aggiornare in sicurezza
Per una nuova versione: rifai il pacchetto, estrai `install-server.ps1` nella **stessa
cartella** (o una nuova) e rilancialo come Amministratore. I dati in `C:\ProgramData\Flowrlink`
**non vengono toccati**: si aggiorna solo il codice e si riavvia il servizio. Se stai migrando
da una vecchia installazione con i dati dentro la cartella app, passa
`install-server.ps1 -MigrateFrom "C:\vecchia\cartella"`: copia i dati in ProgramData dopo una
copia di sicurezza, lasciando intatta l'origine.
```

- [ ] **Step 2: Verifica**

Controlla che `DEPLOY-LAN.md` citi `install-server.ps1`, `C:\ProgramData\Flowrlink`,
`seed/`, `-MigrateFrom`, e che i Passi successivi (servizio di C al Passo 5, backup di D al
Passo 9) restino coerenti (nessun riferimento residuo al vecchio PM2 classico
`pm2-windows-startup` come metodo consigliato).

- [ ] **Step 3: Commit**

```bash
git add DEPLOY-LAN.md
git commit -m "docs(installer): guida installazione in un colpo + dove sono i dati + aggiornare in sicurezza"
```

---

## Ordine e verifica finale

Task 1 → 2 → 3 → 4 → 5. Alla fine:
```bash
npm run test && npm run typecheck && npm run build
```
Expected: suite verde (stateDir + preesistenti), typecheck PASS, build PASS.

Accettazione manuale (sul server, non in CI):
1. `make-package.ps1` sul PC dati → zip con `seed/workload.db`.
2. Server pulito: estrai, `install-server.ps1` come Amministratore → app online su `http://IP:3000`, dati in `C:\ProgramData\Flowrlink\data`, servizio `Flowrlink` attivo (`pm2 status`).
3. Rilancia `install-server.ps1` (aggiornamento) → i dati in ProgramData NON cambiano.
4. Migrazione: su un server con dati in `vecchia\data`, `install-server.ps1 -MigrateFrom vecchia` → dati copiati in ProgramData, origine intatta, semaforo/`/api/backup/health` coerenti.
