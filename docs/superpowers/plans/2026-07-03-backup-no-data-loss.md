# Backup senza perdita dati — Implementation Plan (sotto-progetto D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backup verificati, copiati fuori dal PC (NAS) con ritenzione a lungo termine, e uno stato "sano/non sano" visibile all'admin nell'app.

**Architecture:** L'app (24/7) crea snapshot coerenti (VACUUM INTO), li verifica (`PRAGMA integrity_check` + conteggi + SHA-256), scrive un manifest, e applica ritenzione GFS in `backups/verified/`. Un task pianificato a nome utente fa il **mirror** di `backups/verified/` sul NAS e scrive una ricevuta locale. L'app calcola la salute backup da ultimo-manifest + ricevuta e la mostra col semaforo (admin). Logica non banale in funzioni pure testate con vitest.

**Tech Stack:** Node ≥22 ESM, node:sqlite (VACUUM INTO, integrity_check), node:crypto (sha256), Express, vitest. Script NAS in PowerShell (task pianificato). Nessuna dipendenza runtime app nuova.

## Global Constraints

- Nessuna nuova dipendenza runtime app: solo `express` + nativi Node (`node:sqlite`, `node:crypto`, `node:fs`). Script NAS in PowerShell.
- Node ≥ 22. ESM. Test `.test.mjs` accanto al sorgente, API vitest. Run singolo: `npx vitest run <file>`.
- Credenziali NAS mai nel repo: le chiede `install-backup-task.ps1` a runtime, le affida al task Windows.
- Cartelle: snapshot verificati in `backups/verified/` (già git-ignorata da `backups/*`); ricevuta `backups/offsite-status.json`; log `logs/backup.log`.
- Default: ritenzione `daily:14, weekly:8, monthly:12`; snapshot ogni `24h`; freschezza salute `26h`. Sovrascrivibili (env app / parametri script).
- Rotte backup già protette da `manageBackups` (RBAC): la nuova `/api/backup/health` segue lo stesso gate. Pannello admin-only per costruzione.
- Retrocompatibile: si estende `backupService`/UI, non si rompe l'esistente; nessuna modifica schema DB o logica dati.

---

### Task 1: Ritenzione GFS pura (`server/retention.js`)

**Files:**
- Create: `server/retention.js`
- Test: `server/retention.test.mjs`

**Interfaces:**
- Produces: `selectForRetention(timestamps: string[], opts?: { daily?: number, weekly?: number, monthly?: number }): { keep: string[], drop: string[] }` — pura. Tiene lo snapshot più recente per ciascuno degli ultimi `daily` giorni, `weekly` settimane ISO, `monthly` mesi; unione = keep, resto = drop. Timestamp non validi ignorati.

- [ ] **Step 1: Scrivi il test che fallisce**

`server/retention.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { selectForRetention } from './retention.js'

describe('selectForRetention', () => {
  it('tiene un solo snapshot per giorno tra gli ultimi `daily` giorni', () => {
    const ts = [
      '2026-07-03T20:00:00.000Z', '2026-07-03T08:00:00.000Z', // stesso giorno → tiene il più recente
      '2026-07-02T20:00:00.000Z',
      '2026-07-01T20:00:00.000Z',
    ]
    const { keep, drop } = selectForRetention(ts, { daily: 2, weekly: 0, monthly: 0 })
    expect(keep).toContain('2026-07-03T20:00:00.000Z')
    expect(keep).toContain('2026-07-02T20:00:00.000Z')
    expect(keep).not.toContain('2026-07-03T08:00:00.000Z') // stesso giorno, non il più recente
    expect(drop).toContain('2026-07-01T20:00:00.000Z')     // oltre i 2 giorni
  })
  it('aggiunge settimanali e mensili oltre i giornalieri', () => {
    const ts = [
      '2026-07-20T00:00:00.000Z', // settimana corrente
      '2026-07-06T00:00:00.000Z', // ~2 settimane prima
      '2026-05-10T00:00:00.000Z', // mese precedente
      '2026-03-10T00:00:00.000Z', // 4 mesi prima
    ]
    const { keep } = selectForRetention(ts, { daily: 1, weekly: 2, monthly: 2 })
    // daily(1) tiene il più recente; weekly(2) tiene 2 settimane distinte; monthly(2) tiene 2 mesi distinti
    expect(keep).toContain('2026-07-20T00:00:00.000Z')
    expect(keep.length).toBeGreaterThanOrEqual(3)
  })
  it('ignora timestamp non validi e deduplica', () => {
    const { keep, drop } = selectForRetention(['non-una-data', '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z'], { daily: 5 })
    expect(keep).toEqual(['2026-07-03T00:00:00.000Z'])
    expect(drop).toEqual([])
  })
})
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run server/retention.test.mjs`
Expected: FAIL (`Cannot find module './retention.js'`).

- [ ] **Step 3: Implementa `server/retention.js`**

```js
function isoDay(d) { return d.toISOString().slice(0, 10) }
function isoMonth(d) { return d.toISOString().slice(0, 7) }
function isoWeek(d) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7)
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function selectForRetention(timestamps, opts = {}) {
  const { daily = 14, weekly = 8, monthly = 12 } = opts
  const items = [...new Set(timestamps)]
    .map((t) => ({ t, d: new Date(t) }))
    .filter((x) => Number.isFinite(x.d.getTime()))
    .sort((a, b) => b.d - a.d) // più recente prima

  const keep = new Set()
  const keepNewestPerGroup = (keyFn, limit) => {
    if (limit <= 0) return
    const seen = new Map() // chiave gruppo -> timestamp più recente (primo visto = più recente)
    for (const it of items) {
      const k = keyFn(it.d)
      if (!seen.has(k)) seen.set(k, it.t)
    }
    for (const [, t] of [...seen.entries()].slice(0, limit)) keep.add(t)
  }
  keepNewestPerGroup(isoDay, daily)
  keepNewestPerGroup(isoWeek, weekly)
  keepNewestPerGroup(isoMonth, monthly)

  return {
    keep: items.filter((it) => keep.has(it.t)).map((it) => it.t),
    drop: items.filter((it) => !keep.has(it.t)).map((it) => it.t),
  }
}
```

- [ ] **Step 4: Esegui il test — deve passare**

Run: `npx vitest run server/retention.test.mjs`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add server/retention.js server/retention.test.mjs
git commit -m "feat(backup): ritenzione GFS pura (giornalieri/settimanali/mensili)"
```

---

### Task 2: Modello salute backup (`server/backupHealth.js`)

**Files:**
- Create: `server/backupHealth.js`
- Test: `server/backupHealth.test.mjs`

**Interfaces:**
- Produces: `computeBackupHealth({ latestVerified, offsiteReceipt, now?, maxAgeMs? }): { status: 'ok'|'warn'|'error', reasons: string[], details: object }` — pura. `error` se manca lo snapshot o integrità KO; `warn` se snapshot vecchio o ricevuta offsite assente/vecchia/KO; `ok` altrimenti.

- [ ] **Step 1: Scrivi il test che fallisce**

`server/backupHealth.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { computeBackupHealth } from './backupHealth.js'

const NOW = Date.parse('2026-07-03T12:00:00.000Z')
const fresh = (h) => new Date(NOW - h * 3600000).toISOString()

describe('computeBackupHealth', () => {
  it('ok: snapshot fresco+integro e ricevuta offsite fresca', () => {
    const r = computeBackupHealth({
      latestVerified: { createdAt: fresh(2), integrityOk: true },
      offsiteReceipt: { lastOffsiteAt: fresh(1), lastOffsiteOk: true },
      now: NOW,
    })
    expect(r.status).toBe('ok')
    expect(r.reasons).toEqual([])
  })
  it('error: nessuno snapshot verificato', () => {
    const r = computeBackupHealth({ latestVerified: null, offsiteReceipt: null, now: NOW })
    expect(r.status).toBe('error')
  })
  it('error: integrità fallita batte tutto', () => {
    const r = computeBackupHealth({
      latestVerified: { createdAt: fresh(1), integrityOk: false },
      offsiteReceipt: { lastOffsiteAt: fresh(1), lastOffsiteOk: true },
      now: NOW,
    })
    expect(r.status).toBe('error')
  })
  it('warn: snapshot troppo vecchio', () => {
    const r = computeBackupHealth({
      latestVerified: { createdAt: fresh(40), integrityOk: true },
      offsiteReceipt: { lastOffsiteAt: fresh(1), lastOffsiteOk: true },
      now: NOW,
    })
    expect(r.status).toBe('warn')
  })
  it('warn: ricevuta offsite assente', () => {
    const r = computeBackupHealth({
      latestVerified: { createdAt: fresh(1), integrityOk: true },
      offsiteReceipt: null,
      now: NOW,
    })
    expect(r.status).toBe('warn')
  })
})
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run server/backupHealth.test.mjs`
Expected: FAIL (`Cannot find module './backupHealth.js'`).

- [ ] **Step 3: Implementa `server/backupHealth.js`**

```js
const RANK = { ok: 0, warn: 1, error: 2 }

export function computeBackupHealth({ latestVerified, offsiteReceipt, now = Date.now(), maxAgeMs = 26 * 3600000 }) {
  const reasons = []
  let status = 'ok'
  const escalate = (s, reason) => {
    if (RANK[s] > RANK[status]) status = s
    reasons.push(reason)
  }

  if (!latestVerified) {
    escalate('error', 'Nessuno snapshot verificato presente.')
  } else {
    if (latestVerified.integrityOk === false) escalate('error', 'Ultimo snapshot: verifica integrità FALLITA.')
    const age = now - new Date(latestVerified.createdAt).getTime()
    if (!(age < maxAgeMs)) escalate('warn', 'Ultimo snapshot verificato troppo vecchio.')
  }

  if (!offsiteReceipt) {
    escalate('warn', 'Nessuna copia sul NAS ancora registrata.')
  } else {
    if (offsiteReceipt.lastOffsiteOk === false) escalate('warn', 'Ultima copia sul NAS FALLITA.')
    const oage = now - new Date(offsiteReceipt.lastOffsiteAt).getTime()
    if (!(oage < maxAgeMs)) escalate('warn', 'Copia sul NAS troppo vecchia.')
  }

  return { status, reasons, details: { latestVerified: latestVerified ?? null, offsiteReceipt: offsiteReceipt ?? null } }
}
```

- [ ] **Step 4: Esegui il test — deve passare**

Run: `npx vitest run server/backupHealth.test.mjs`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add server/backupHealth.js server/backupHealth.test.mjs
git commit -m "feat(backup): modello salute backup puro (semaforo ok/warn/error)"
```

---

### Task 3: Snapshot verificato + manifest (`server/verifiedBackup.js`)

**Files:**
- Create: `server/verifiedBackup.js`
- Test: `server/verifiedBackup.test.mjs`

**Interfaces:**
- Consumes: `selectForRetention` (Task 1); `getDb`, `ROOT_DIR` da `./db.js`; `timestampForFilename` da `./services/appData.js`.
- Produces:
  - `buildManifest({ stamp, sizeBytes, integrityResult, counts, sha256, now, reason }): object` — pura. `integrityOk = integrityResult === 'ok'`, `total = somma dei counts`, `version: 1`.
  - `isSnapshotDue(lastAtIso: string|null, now: number, intervalMs?: number): boolean` — pura. `true` se manca l'ultimo o è più vecchio di `intervalMs` (default 24h).
  - `createVerifiedSnapshot({ now?, reason?, db?, dir? }): { file, manifest }` — VACUUM INTO in `dir` (default `VERIFIED_DIR`), verifica sullo snapshot, scrive `.json`, pota (GFS). `db` (default `getDb()`) e `dir` sono iniettabili **per isolare i test** (temp DB + temp dir), senza toccare né il DB reale né `backups/verified/`.
  - `readLatestVerified(dir?): object|null` — ultimo manifest (default `VERIFIED_DIR`).
  - `readOffsiteReceipt(): object|null` — legge `backups/offsite-status.json`.
  - `VERIFIED_DIR`, `OFFSITE_RECEIPT_PATH` (costanti path esportate).

- [ ] **Step 1: Scrivi il test che fallisce**

`server/verifiedBackup.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { buildManifest, isSnapshotDue } from './verifiedBackup.js'

describe('buildManifest', () => {
  it('deriva integrityOk e total', () => {
    const now = new Date('2026-07-03T10:00:00.000Z')
    const m = buildManifest({ stamp: '2026-07-03_10-00', sizeBytes: 123, integrityResult: 'ok', counts: { a: 2, b: 3 }, sha256: 'abc', now, reason: 'daily' })
    expect(m.integrityOk).toBe(true)
    expect(m.total).toBe(5)
    expect(m.createdAt).toBe('2026-07-03T10:00:00.000Z')
    expect(m.sha256).toBe('abc')
    expect(m.version).toBe(1)
  })
  it('integrityOk false se integrity_check non ok', () => {
    const m = buildManifest({ stamp: 's', sizeBytes: 1, integrityResult: 'malformato', counts: {}, sha256: 'x', now: new Date(), reason: 'daily' })
    expect(m.integrityOk).toBe(false)
    expect(m.total).toBe(0)
  })
})

describe('isSnapshotDue', () => {
  const now = Date.parse('2026-07-03T12:00:00.000Z')
  it('true se nessun ultimo', () => { expect(isSnapshotDue(null, now)).toBe(true) })
  it('true se più vecchio dell intervallo', () => {
    expect(isSnapshotDue('2026-07-02T00:00:00.000Z', now, 24 * 3600000)).toBe(true)
  })
  it('false se entro l intervallo', () => {
    expect(isSnapshotDue('2026-07-03T06:00:00.000Z', now, 24 * 3600000)).toBe(false)
  })
  it('true se data non valida', () => { expect(isSnapshotDue('boh', now)).toBe(true) })
})
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run server/verifiedBackup.test.mjs`
Expected: FAIL (`Cannot find module './verifiedBackup.js'`).

- [ ] **Step 3: Implementa `server/verifiedBackup.js`**

```js
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { ROOT_DIR, getDb } from './db.js'
import { timestampForFilename } from './services/appData.js'
import { selectForRetention } from './retention.js'

export const VERIFIED_DIR = path.join(ROOT_DIR, 'backups', 'verified')
export const OFFSITE_RECEIPT_PATH = path.join(ROOT_DIR, 'backups', 'offsite-status.json')

export function buildManifest({ stamp, sizeBytes, integrityResult, counts, sha256, now, reason }) {
  return {
    version: 1,
    stamp,
    createdAt: now.toISOString(),
    reason,
    sizeBytes,
    integrityResult,
    integrityOk: integrityResult === 'ok',
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    sha256,
  }
}

export function isSnapshotDue(lastAtIso, now, intervalMs = 24 * 3600000) {
  if (!lastAtIso) return true
  const last = new Date(lastAtIso).getTime()
  if (!Number.isFinite(last)) return true
  return now - last >= intervalMs
}

function uniquePath(p) {
  if (!fs.existsSync(p)) return p
  const ext = path.extname(p)
  const base = p.slice(0, -ext.length)
  let i = 1
  while (fs.existsSync(`${base}_${i}${ext}`)) i += 1
  return `${base}_${i}${ext}`
}

export function createVerifiedSnapshot({ now = new Date(), reason = 'daily', db = getDb(), dir = VERIFIED_DIR } = {}) {
  fs.mkdirSync(dir, { recursive: true })
  const stamp = `${timestampForFilename(now)}-${String(now.getSeconds()).padStart(2, '0')}`
  const dbFile = uniquePath(path.join(dir, `verified_${stamp}.db`))

  // 1. snapshot coerente dal DB vivo (include il WAL)
  db.exec(`VACUUM INTO '${dbFile.replaceAll("'", "''")}';`)

  // 2. verifica sullo snapshot: integrità + conteggi per tabella
  const snap = new DatabaseSync(dbFile)
  let integrityResult = 'unknown'
  const counts = {}
  try {
    integrityResult = snap.prepare('PRAGMA integrity_check').get()?.integrity_check ?? 'unknown'
    const tables = snap.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
    for (const { name } of tables) counts[name] = snap.prepare(`SELECT COUNT(*) AS c FROM "${name}"`).get().c
  } finally {
    snap.close()
  }

  // 3. checksum + manifest
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(dbFile)).digest('hex')
  const sizeBytes = fs.statSync(dbFile).size
  const manifest = buildManifest({ stamp, sizeBytes, integrityResult, counts, sha256, now, reason })
  fs.writeFileSync(dbFile.replace(/\.db$/, '.json'), JSON.stringify(manifest, null, 2), 'utf8')

  // 4. ritenzione GFS locale
  pruneVerified(dir)
  return { file: dbFile, manifest }
}

function listVerifiedManifests(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((n) => n.startsWith('verified_') && n.endsWith('.json'))
    .map((n) => {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))
        return { name: n, createdAt: m.createdAt, manifest: m }
      } catch { return null }
    })
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) // più recente prima
}

export function readLatestVerified(dir = VERIFIED_DIR) {
  const all = listVerifiedManifests(dir)
  return all.length ? all[0].manifest : null
}

export function readOffsiteReceipt() {
  try {
    if (!fs.existsSync(OFFSITE_RECEIPT_PATH)) return null
    return JSON.parse(fs.readFileSync(OFFSITE_RECEIPT_PATH, 'utf8'))
  } catch { return null }
}

function pruneVerified(dir) {
  const all = listVerifiedManifests(dir)
  if (all.length === 0) return
  const { drop } = selectForRetention(all.map((x) => x.manifest.createdAt))
  const dropSet = new Set(drop)
  for (const x of all) {
    if (!dropSet.has(x.manifest.createdAt)) continue
    const base = x.name.replace(/\.json$/, '')
    for (const f of [`${base}.json`, `${base}.db`]) {
      try { fs.unlinkSync(path.join(dir, f)) } catch { /* ignora */ }
    }
  }
}
```

- [ ] **Step 4: Esegui i test puri — devono passare**

Run: `npx vitest run server/verifiedBackup.test.mjs`
Expected: PASS (6 test — `buildManifest` + `isSnapshotDue`).

- [ ] **Step 5: Aggiungi un test di integrazione isolato (DB e dir iniettati)**

Aggiungi in fondo a `server/verifiedBackup.test.mjs` (import in cima al file):
```js
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createVerifiedSnapshot } from './verifiedBackup.js'
import { runMigrations } from './db.js'
```
```js
describe('createVerifiedSnapshot (DB e dir iniettati, isolato)', () => {
  it('produce db+manifest con integrità ok e conteggi', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-'))
    // DB sorgente temporaneo con lo schema reale (runMigrations è esportato e non usa env)
    const srcDb = new DatabaseSync(path.join(dir, 'src.db'))
    runMigrations(srcDb)
    srcDb.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('probe', '1')")

    const outDir = path.join(dir, 'verified')
    const { file, manifest } = createVerifiedSnapshot({ now: new Date(), reason: 'test', db: srcDb, dir: outDir })

    expect(fs.existsSync(file)).toBe(true)
    expect(fs.existsSync(file.replace(/\.db$/, '.json'))).toBe(true)
    expect(manifest.integrityOk).toBe(true)
    expect(manifest.total).toBeGreaterThan(0)
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/)

    // lo snapshot è un DB valido e integro
    const snap = new DatabaseSync(file)
    expect(snap.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok')
    snap.close()

    srcDb.close()
    fs.rmSync(dir, { recursive: true, force: true }) // pulizia completa, niente residui nel repo
  })
})
```
Isolamento: sia il DB sorgente sia la cartella di output sono sotto una temp dir e vengono
rimossi a fine test. Non si tocca né il DB reale né `backups/verified/`. `runMigrations(db)`
crea lo schema sul DB temporaneo senza dipendere da env né dalla memoizzazione di `getDb()`.

Run: `npx vitest run server/verifiedBackup.test.mjs`
Expected: PASS (7 test).

- [ ] **Step 6: Commit**

```bash
git add server/verifiedBackup.js server/verifiedBackup.test.mjs
git commit -m "feat(backup): snapshot verificato (integrity_check + conteggi + sha256) + manifest + GFS locale"
```

---

### Task 4: Scheduler giornaliero + rotta salute (`server/index.js`, `server/routes/index.js`)

**Files:**
- Modify: `server/index.js` (avvia lo scheduler giornaliero)
- Modify: `server/routes/index.js` (rotta `GET /api/backup/health`)

**Interfaces:**
- Consumes: `createVerifiedSnapshot`, `isSnapshotDue`, `readLatestVerified`, `readOffsiteReceipt` (Task 3); `computeBackupHealth` (Task 2); `appendLine` (da `./logging.js`, sotto-progetto C); `requirePermission` (già importato in routes).
- Produces: `GET /api/backup/health` (gated `manageBackups`) → `computeBackupHealth(...)`.

- [ ] **Step 1: Scheduler in `server/index.js`**

Aggiungi agli import in cima:
```js
import { createVerifiedSnapshot, isSnapshotDue, readLatestVerified } from './verifiedBackup.js'
```
`appendLine` è già importato (sotto-progetto C). Dopo il blocco che popola `servers` e installa le guardie (dopo `installProcessGuards(...)`), aggiungi lo scheduler:
```js
// Scheduler backup verificato: all'avvio e ogni ora, se è passato ≥ ~24h, crea uno snapshot verificato.
const BACKUP_LOG = path.join(ROOT_DIR, 'logs', 'backup.log')
function runVerifiedSnapshotIfDue() {
  try {
    const latest = readLatestVerified()
    if (!isSnapshotDue(latest?.createdAt ?? null, Date.now())) return
    const { manifest } = createVerifiedSnapshot({ reason: 'scheduler' })
    appendLine(BACKUP_LOG, `${new Date().toISOString()} snapshot verificato creato integrità=${manifest.integrityResult} totale=${manifest.total}`)
  } catch (error) {
    try { appendLine(BACKUP_LOG, `${new Date().toISOString()} snapshot verificato FALLITO: ${error instanceof Error ? error.message : String(error)}`) } catch { /* ignora */ }
  }
}
runVerifiedSnapshotIfDue()
const backupTimer = setInterval(runVerifiedSnapshotIfDue, 60 * 60 * 1000)
backupTimer.unref()
```

- [ ] **Step 2: Rotta salute in `server/routes/index.js`**

Aggiungi l'import (in cima, accanto agli altri import da moduli server):
```js
import { computeBackupHealth } from '../backupHealth.js'
import { readLatestVerified, readOffsiteReceipt } from '../verifiedBackup.js'
```
Subito DOPO la rotta `GET /backup/status` (che termina intorno alla riga 288), aggiungi:
```js
  router.get('/backup/health', (req, res, next) => {
    try {
      requirePermission(req.user.permissions, 'manageBackups')
      const health = computeBackupHealth({
        latestVerified: readLatestVerified(),
        offsiteReceipt: readOffsiteReceipt(),
        now: Date.now(),
      })
      res.set('cache-control', 'no-store')
      res.json(health)
    } catch (e) {
      next(e.statusCode ? e : badRequest(e))
    }
  })
```

- [ ] **Step 3: Verifica sintassi + typecheck + suite + smoke isolato**

Run: `node --check server/index.js && node --check server/routes/index.js && npm run typecheck && npm run test`
Expected: nessun output dai `--check`; typecheck PASS; suite verde (i nuovi test di Task 1-3 inclusi).

Smoke isolato della rotta (DB temp, NON tocca i dati reali):
```bash
TMPD=$(mktemp -d); WORKLOAD_DATA_DIR="$TMPD" WORKLOAD_DB_PATH="$TMPD/w.db" PORT=3973 HOST=127.0.0.1 WORKLOAD_DISABLE_IPV6_LOCALHOST=1 node server/index.js & echo started; sleep 2
# senza sessione → 401 (gate globale). Con setup admin:
curl -s -c "$TMPD/c.txt" -X POST http://127.0.0.1:3973/api/auth/setup-admin -H "content-type: application/json" -d '{"username":"admin","password":"Password1"}' -o /dev/null -w "setup=%{http_code}\n"
curl -s -b "$TMPD/c.txt" http://127.0.0.1:3973/api/backup/health -w "\nhealth-status-code\n"
# ferma il server: usa un harness Node se kill -TERM non funziona su Git Bash/Windows
```
Expected: `setup=201`; `/api/backup/health` → 200 con JSON `{ "status": "error"|"warn", ... }` (error/warn perché su un DB nuovo lo scheduler potrebbe non aver ancora fatto uno snapshot; l'importante è 200 + forma corretta, non 403).
NB: su Git Bash/Windows `kill -TERM $!` è inaffidabile — se serve fermare il server, usa un piccolo harness Node (`child.kill('SIGTERM')`) come nel sotto-progetto C, oppure lascia che il processo temporaneo termini a fine sessione.

- [ ] **Step 4: Commit**

```bash
git add server/index.js server/routes/index.js
git commit -m "feat(backup): scheduler snapshot giornaliero + GET /api/backup/health (gated manageBackups)"
```

---

### Task 5: Pannello salute backup nel frontend (`apiClient`, componente, `ImportExportPanel`)

**Files:**
- Modify: `src/services/apiClient.ts` (tipo `BackupHealth` + `fetchBackupHealth`)
- Create: `src/components/BackupHealthBadge.tsx`
- Modify: `src/components/ImportExportPanel.tsx` (mostra il badge, admin)

**Interfaces:**
- Consumes: `GET /api/backup/health` (Task 4); `useAuth` per il permesso `manageBackups`.
- Produces: badge semaforo nella sezione backup.

- [ ] **Step 1: apiClient — tipo + fetch**

In `src/services/apiClient.ts`, dopo l'interfaccia `BackupStatus` (riga ~17-25), aggiungi:
```ts
export interface BackupHealth {
  status: 'ok' | 'warn' | 'error'
  reasons: string[]
  details: {
    latestVerified: { createdAt: string; integrityOk: boolean; total: number } | null
    offsiteReceipt: { lastOffsiteAt: string; lastOffsiteOk: boolean; dest?: string } | null
  }
}
```
Dopo `fetchBackupStatus` (riga ~136-138), aggiungi:
```ts
export function fetchBackupHealth(): Promise<BackupHealth> {
  return request<BackupHealth>('/api/backup/health')
}
```

- [ ] **Step 2: Componente `src/components/BackupHealthBadge.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useAuth } from '../state/AuthProvider'
import { fetchBackupHealth, type BackupHealth } from '../services/apiClient'

const STYLE: Record<BackupHealth['status'], { dot: string; label: string }> = {
  ok: { dot: 'bg-emerald-400', label: 'Backup al sicuro' },
  warn: { dot: 'bg-amber-400', label: 'Backup: attenzione' },
  error: { dot: 'bg-red-500', label: 'Backup: problema' },
}

export function BackupHealthBadge() {
  const { user } = useAuth()
  const [health, setHealth] = useState<BackupHealth | null>(null)
  const canView = !!user?.permissions.manageBackups

  useEffect(() => {
    if (!canView) return
    let alive = true
    fetchBackupHealth().then((h) => { if (alive) setHealth(h) }).catch(() => { if (alive) setHealth(null) })
    return () => { alive = false }
  }, [canView])

  if (!canView || !health) return null
  const s = STYLE[health.status]
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800/80 bg-[color:var(--color-surface-1)]/80 px-2.5 py-1.5 text-sm" title={health.reasons.join(' · ') || 'Tutto ok'}>
      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden />
      <span className="text-slate-300">{s.label}</span>
    </div>
  )
}
```

- [ ] **Step 3: Mostra il badge in `ImportExportPanel.tsx`**

Importa in cima: `import { BackupHealthBadge } from './BackupHealthBadge'`. Rendi `<BackupHealthBadge />` in un punto visibile del pannello (es. accanto al titolo/azioni backup). Il componente si nasconde da solo se l'utente non ha `manageBackups` o se la fetch fallisce.

- [ ] **Step 4: Verifica typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/apiClient.ts src/components/BackupHealthBadge.tsx src/components/ImportExportPanel.tsx
git commit -m "feat(backup): badge salute backup nel pannello admin"
```

---

### Task 6: Task NAS (mirror) + registrazione + docs

**Files:**
- Rewrite: `backup-data.ps1` (mirror di `backups/verified/` sul NAS + ricevuta)
- Create: `install-backup-task.ps1` (registra il task pianificato a nome utente)
- Modify: `DEPLOY-LAN.md` (sezione backup: NAS + ripristino)

**Interfaces:**
- Consumes: `backups/verified/` (prodotta e potata da Task 3); scrive `backups/offsite-status.json` (letta da Task 4).

Nota: ops Windows non eseguibili in CI. Verifica = PowerShell parse + accettazione manuale sul server.

- [ ] **Step 1: Riscrivi `backup-data.ps1` come mirror + ricevuta**

```powershell
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
$src = Join-Path $PSScriptRoot 'backups\verified'
$receipt = Join-Path $PSScriptRoot 'backups\offsite-status.json'
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
```
Verifica parse:
```
powershell -NoProfile -Command "$e=$null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'backup-data.ps1').Path,[ref]$null,[ref]$e); if($e){$e}else{'PARSE-OK'}"
```
Expected: `PARSE-OK`.

- [ ] **Step 2: `install-backup-task.ps1` — registra il task giornaliero a nome utente**

```powershell
#Requires -RunAsAdministrator
# Registra (idempotente) un task pianificato giornaliero che copia i backup sul NAS.
# Gira a nome di un UTENTE con accesso al NAS (LocalSystem di norma non vede le share).
# Le credenziali sono chieste a runtime e affidate a Windows: NON finiscono nel repo.
param(
  [Parameter(Mandatory = $true)][string]$Dest,          # es. \\NAS\backup\flowrlink
  [string]$Time = '20:00',
  [string]$TaskName = 'Flowrlink Backup NAS'
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$script = Join-Path $PSScriptRoot 'backup-data.ps1'
if (-not (Test-Path $script)) { throw "backup-data.ps1 non trovato in $PSScriptRoot" }

$cred = Get-Credential -Message "Utente con accesso al NAS $Dest (es. DOMINIO\utente)"
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Dest `"$Dest`""
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited -Force | Out-Null

Write-Host "Task '$TaskName' registrato: ogni giorno alle $Time copia i backup su $Dest."
Write-Host "Esecuzione di prova adesso:"
Start-ScheduledTask -TaskName $TaskName
```
Verifica parse:
```
powershell -NoProfile -Command "$e=$null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'install-backup-task.ps1').Path,[ref]$null,[ref]$e); if($e){$e}else{'PARSE-OK'}"
```
Expected: `PARSE-OK`.

- [ ] **Step 3: Aggiorna `DEPLOY-LAN.md`**

Sostituisci il **Passo 9 — Backup dei dati** e la sezione "Sicurezza dei dati" con una versione che rimanda al nuovo flusso:
```markdown
## Passo 9 — Backup automatici verificati + copia sul NAS
L'app crea da sola, ogni giorno, uno **snapshot verificato** del database in
`backups\verified\` (controlla l'integrità e calcola un checksum) e tiene una storia
GFS (14 giornalieri, 8 settimanali, 12 mensili). Per portarli **fuori dal PC** (NAS):

1. Tasto destro su `install-backup-task.ps1` → **Esegui con PowerShell (Amministratore)**:
   ```
   .\install-backup-task.ps1 -Dest "\\NAS\backup\flowrlink"
   ```
   Chiede un utente con accesso al NAS (le credenziali le tiene Windows, non il repo) e
   registra un task giornaliero che copia i backup verificati sul NAS.
2. Controllo salute: nell'app (admin) compare un **semaforo backup**. Verde = al sicuro.
   Giallo/Rosso = qualcosa non va (snapshot vecchio, integrità fallita, o copia NAS mancante):
   apri `http://localhost:3000/api/backup/health` o guarda `logs\backup.log`.

**Ripristino:** nell'app (admin) sezione backup → scegli un backup → Ripristina (crea prima
un backup di sicurezza). Da un backup sul NAS: copia il `verified_*.db` desiderato in
`data\workload.db` a server fermo, oppure importane il `.json` dall'app.
```

- [ ] **Step 4: Commit**

```bash
git add backup-data.ps1 install-backup-task.ps1 DEPLOY-LAN.md
git commit -m "feat(backup): task NAS (mirror verified/) + registrazione a nome utente + docs"
```

---

## Ordine e verifica finale

Task 1 → 2 → 3 → 4 → 5 → 6. Alla fine:
```bash
npm run test && npm run typecheck && npm run build
```
Expected: suite verde (retention, backupHealth, verifiedBackup + preesistenti), typecheck PASS, build PASS.

Accettazione manuale (sul server, non in CI):
1. Avvia l'app; entro poco `backups\verified\` contiene `verified_*.db` + `.json`; `/api/backup/health` (admin) → `status` coerente.
2. `install-backup-task.ps1 -Dest \\NAS\...` come Amministratore → il NAS riceve i `verified_*`; `backups\offsite-status.json` scritto; il semaforo in app diventa **verde**.
3. Stacca/riattacca la rete NAS o rendi il dest irraggiungibile → la ricevuta segna errore e il semaforo diventa giallo/rosso.
