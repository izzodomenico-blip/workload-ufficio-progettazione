# Chiusura certificata commesse + Archivio — Implementation Plan (sotto-progetto I)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere una commessa dei Consuntivi in modo certificato (snapshot € /kg congelato dal server, password), spostarla in un Archivio a tab con card curate e Certificato stampabile, bloccando ogni modifica ai consuntivi chiusi.

**Architecture:** Nuova tabella `consuntivi_closures` server-autoritativa. Lo snapshot è calcolato SOLO dal server (`consuntiviTotals.js`, gemello JS del calc client) tramite `POST /api/consuntivi-closures` protetto dalla password consuntivi; riapertura via `DELETE`. Il PUT albero-intero ignora le chiusure del client; l'authz blocca creazione/modifica di consuntivi su commesse chiuse e filtra i € per chi non ha `viewConsuntiviPrices`. UI: tab «In lavorazione | Archivio», modale di chiusura, card archivio, certificato stampabile col pattern portal collaudato.

**Tech Stack:** React 19 + TS + Vite + Tailwind (client), Node ESM + node:sqlite (server), vitest.

## Global Constraints

- Chiave commessa IDENTICA ovunque: `String(c.commessaNumber ?? '').trim() || '(senza commessa)'`.
- Migrazione idempotente: `CREATE TABLE IF NOT EXISTS`, NO `ALTER TABLE` (il runner riesegue tutti i .sql a ogni avvio).
- Nessuna nuova dipendenza runtime. Node ≥ 22, ESM, vitest.
- Password consuntivi SOLO nell'header `x-workload-admin-password` (mai in URL, mai salvata).
- `consuntiviClosures` è SERVER-AUTORITATIVA: il PUT `/app-data` ignora la versione del client.
- € delle chiusure (`snapshot.total`, `snapshot.cats`) mai inviati a utenti senza `viewConsuntiviPrices`.
- Test: DB reale MAI toccato — temp dir via env `WORKLOAD_DATA_DIR`/`WORKLOAD_DB_PATH`/`WORKLOAD_STATE_DIR`, server di test su porta 3975.
- Task 4 e 5 (UI): usare la skill **frontend-design** per la qualità visiva; riusare le utility esistenti (`panel`, `btn-*`, `chip`, `tabs-track`/`tab-item`, `input-base`).

---

### Task 1: Migrazione 012 + gemello server del calcolo totali

**Files:**
- Create: `server/migrations/012_add_consuntivi_closures.sql`
- Create: `server/services/consuntiviTotals.js`
- Test: `server/services/consuntiviTotals.test.mjs`

**Interfaces:**
- Produces: `consuntivoTotals(consuntivo, config) -> { totalKg, materialCost, gasCost, timeCost, weldingCost, bendingCost, total, kgByMaterial }` (ESM export, usato dal Task 2). Migrazione: tabella `consuntivi_closures(id, commessa_key UNIQUE, data, updated_at)`.

- [ ] **Step 1: Migrazione**

`server/migrations/012_add_consuntivi_closures.sql`:
```sql
CREATE TABLE IF NOT EXISTS consuntivi_closures (
  id TEXT PRIMARY KEY,
  commessa_key TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consuntivi_closures_key ON consuntivi_closures(commessa_key);
```

- [ ] **Step 2: Test che fallisce (valori calcolati a mano, identici alla semantica client)**

`server/services/consuntiviTotals.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { consuntivoTotals, tubeShape, parseTubeSides } from './consuntiviTotals.js'
import { DEFAULT_CONSUNTIVI_CONFIG } from './consuntiviConfig.js'

// Fixture identica alla semantica del client (src/utils/consuntiviCalc.ts).
// Valori attesi calcolati a mano:
// laser: 1000x500x3 ferro, 2 pz, 10 min ossigeno, densita' 7.85
//   kg = (1000/1000)*(500/1000)*(3*7.85)*2 = 23.55 ; mat = 23.55*1.3 = 30.615 ; gas = 10*2.5 = 25
// tubo: 40x40x3 (quadro, coeff 0.91), kgPerMeter 3.79, 1500 mm, 2 pz, 1.5 min
//   kg = 3.79*1.5*2 = 11.37 ; mat = 11.37*0.91 = 10.3467 ; time = 1.5*2.5 = 3.75
// saldatura: 2 persone x 1.5 h x 35 = 105 ; piega: 0.5 h x 60 = 30
// totale = 30.615+25+10.3467+3.75+105+30 = 204.7117 ; kg tot = 34.92
const FIXTURE = {
  id: 'c1', commessaNumber: 'COM9', supplierName: 'Forn', date: '2026-07-01', operatorName: 'Op',
  laserRows: [{ id: 'l1', lunghezzaMm: 1000, larghezzaMm: 500, spessoreMm: 3, materiale: 'ferro', nPezzi: 2, tempoMin: 10, gas: 'ossigeno' }],
  tubeRows: [{ id: 't1', categoria: 'tubolari', profileId: '', profileLabel: '40x40x3', kgPerMeter: 3.79, materiale: 'zincato', lunghezzaMm: 1500, nPezzi: 2, tempoMin: 1.5 }],
  weldingRows: [{ id: 'w1', people: 2, hours: 1.5 }],
  bendingRows: [{ id: 'b1', hours: 0.5 }],
  notes: '',
}

describe('consuntiviTotals (gemello server, parita col client)', () => {
  it('fixture completa -> stessi numeri del calc client', () => {
    const t = consuntivoTotals(FIXTURE, DEFAULT_CONSUNTIVI_CONFIG)
    expect(t.totalKg).toBeCloseTo(34.92, 3)
    expect(t.materialCost).toBeCloseTo(40.9617, 3)
    expect(t.gasCost).toBeCloseTo(25, 3)
    expect(t.timeCost).toBeCloseTo(3.75, 3)
    expect(t.weldingCost).toBeCloseTo(105, 3)
    expect(t.bendingCost).toBeCloseTo(30, 3)
    expect(t.total).toBeCloseTo(204.7117, 3)
    expect(t.kgByMaterial.ferro).toBeCloseTo(23.55, 3)
    expect(t.kgByMaterial.zincato).toBeCloseTo(11.37, 3)
  })
  it('tubeShape/parseTubeSides come il client', () => {
    expect(tubeShape('40x40x3')).toBe('quadro')
    expect(tubeShape('80x40x3')).toBe('rettangolo')
    expect(tubeShape('30x30x2')).toBe('piccolo')
    expect(tubeShape('boh')).toBe('rettangolo')
    expect(parseTubeSides('80 x 40 x 3')).toEqual({ a: 80, b: 40 })
    expect(parseTubeSides('3')).toBeNull()
  })
  it('consuntivo vuoto -> zero ovunque', () => {
    const t = consuntivoTotals({ laserRows: [], tubeRows: [], weldingRows: [], bendingRows: [] }, DEFAULT_CONSUNTIVI_CONFIG)
    expect(t.total).toBe(0)
    expect(t.totalKg).toBe(0)
  })
})
```

- [ ] **Step 3: Esegui — deve fallire**

Run: `npx vitest run server/services/consuntiviTotals.test.mjs`
Expected: FAIL (modulo inesistente).

- [ ] **Step 4: Implementa `server/services/consuntiviTotals.js`**

Porta ESATTAMENTE la semantica di `src/utils/consuntiviCalc.ts` (leggilo prima):
```js
// Gemello server di src/utils/consuntiviCalc.ts (stesso pattern del gemello
// DEFAULT_CONSUNTIVI_CONFIG). Se cambi la semantica qui, cambiala anche nel
// client e aggiorna i test di parita' (stessi numeri attesi in entrambi).
const MATERIALS = ['ferro', 'inox', 'zincato', 'corten']

function num(value) { return Number.isFinite(value) ? value : 0 }
function pieces(n) { return Number.isFinite(n) && n > 0 ? n : 1 }

export function emptyKgByMaterial() { return { ferro: 0, inox: 0, zincato: 0, corten: 0 } }

export function sheetWeightKg(row, densityFactor) {
  return (num(row.lunghezzaMm) / 1000) * (num(row.larghezzaMm) / 1000) * (num(row.spessoreMm) * num(densityFactor))
}
export function laserRowKg(row, densityFactor) {
  return sheetWeightKg(row, densityFactor) * pieces(row.nPezzi)
}
export function tubeWeightKg(row) {
  return num(row.kgPerMeter) * (num(row.lunghezzaMm) / 1000) * num(row.nPezzi)
}
export function laserRowCost(row, pricing) {
  const kg = laserRowKg(row, pricing.densityFactorPerMaterial[row.materiale] ?? 7.85)
  const materialCost = kg * (pricing.materialPricePerKg[row.materiale] ?? 0)
  const gasCost = num(row.tempoMin) * (pricing.gasCostPerMin[row.gas] ?? 0)
  return { kg, materialCost, gasCost, total: materialCost + gasCost }
}
export function parseTubeSides(label) {
  const nums = String(label ?? '').replace(/,/g, '.').match(/\d+(?:\.\d+)?/g)
  if (!nums || nums.length < 2) return null
  return { a: Number(nums[0]), b: Number(nums[1]) }
}
export function tubeShape(label) {
  const s = parseTubeSides(label)
  if (!s) return 'rettangolo'
  if (s.a + s.b <= 60) return 'piccolo'
  if (s.a === s.b) return 'quadro'
  return 'rettangolo'
}
export function tubeRowCost(row, pricing) {
  const kg = tubeWeightKg(row)
  const shape = tubeShape(row.profileLabel)
  const materialCost = kg * (pricing.tubeCoefficientPerKg?.[shape] ?? 0)
  const timeCost = num(row.tempoMin) * num(pricing.tubeLaserRatePerMin)
  return { kg, shape, materialCost, timeCost, total: materialCost + timeCost }
}
export function weldingRowCost(row, pricing) {
  return num(row.people) * num(row.hours) * num(pricing.weldingRatePerHour)
}
export function bendingRowCost(row, pricing) {
  return num(row.hours) * num(pricing.bendingRatePerHour)
}
export function consuntivoTotals(c, pricing) {
  const kgByMaterial = emptyKgByMaterial()
  let totalKg = 0
  let materialCost = 0
  let gasCost = 0
  let timeCost = 0
  for (const row of c.laserRows ?? []) {
    const r = laserRowCost(row, pricing)
    totalKg += r.kg
    kgByMaterial[row.materiale] = (kgByMaterial[row.materiale] ?? 0) + r.kg
    materialCost += r.materialCost
    gasCost += r.gasCost
  }
  for (const row of c.tubeRows ?? []) {
    const r = tubeRowCost(row, pricing)
    totalKg += r.kg
    kgByMaterial[row.materiale] = (kgByMaterial[row.materiale] ?? 0) + r.kg
    materialCost += r.materialCost
    timeCost += r.timeCost
  }
  const weldingCost = (c.weldingRows ?? []).reduce((sum, row) => sum + weldingRowCost(row, pricing), 0)
  const bendingCost = (c.bendingRows ?? []).reduce((sum, row) => sum + bendingRowCost(row, pricing), 0)
  for (const m of MATERIALS) if (!(m in kgByMaterial)) kgByMaterial[m] = 0
  return {
    totalKg, materialCost, gasCost, timeCost, weldingCost, bendingCost,
    total: materialCost + gasCost + timeCost + weldingCost + bendingCost,
    kgByMaterial,
  }
}
```

- [ ] **Step 5: Esegui — deve passare**

Run: `npx vitest run server/services/consuntiviTotals.test.mjs && node --check server/services/consuntiviTotals.js`
Expected: 3 test PASS; check ok.

- [ ] **Step 6: Commit**

```bash
git add server/migrations/012_add_consuntivi_closures.sql server/services/consuntiviTotals.js server/services/consuntiviTotals.test.mjs
git commit -m "feat(consuntivi): migrazione chiusure + calcolo totali server (gemello del client)"
```

---

### Task 2: Persistenza chiusure + endpoint POST/DELETE

**Files:**
- Modify: `server/db.js` (TABLES, `getAppData`, `saveAppData` return, 3 helper)
- Modify: `server/routes/index.js` (import + 2 rotte dopo il blocco `/consuntivi-pricing`)
- Test: `server/routes/consuntiviClosures.test.mjs` (integrazione, server spawn su porta 3975, temp DB)

**Interfaces:**
- Consumes: `consuntivoTotals` (Task 1); `requireConsuntiviPassword(req)`, `getConsuntiviConfig`, `DEFAULT_CONSUNTIVI_CONFIG`, `scheduleAutoBackup`, `sendDataRevisionHeaders`, `badRequest` (già in routes/index.js); `req.user` (middleware auth esistente).
- Produces: `getConsuntiviClosures(db?)`, `insertConsuntiviClosure(closure, db?)`, `deleteConsuntiviClosure(id, db?)` (db.js); `POST /api/consuntivi-closures` → 201 `ConsuntiviClosure`; `DELETE /api/consuntivi-closures/:id` → `{ ok: true }`; `getAppData().consuntiviClosures`.

- [ ] **Step 1: db.js — tabella + lettura in getAppData + helper**

In `TABLES` aggiungi:
```js
  consuntiviClosures: 'consuntivi_closures',
```
In `getAppData` la collezione va AGGIUNTA DOPO `normalizeAppData` (le chiusure non passano dal normalizzatore né dal salvataggio albero-intero):
```js
export function getAppData(db = getDb()) {
  ensureMachineTypesPresent(db)
  const base = normalizeAppData({
    /* ...tutte le collezioni esistenti INVARIATE... */
  })
  return { ...base, consuntiviClosures: readJsonRows(db, TABLES.consuntiviClosures, 'rowid ASC') }
}
```
(nel dettaglio: NON modificare l'oggetto passato a `normalizeAppData`; solo avvolgere il ritorno.)

In `saveAppData`, dopo `db.exec('COMMIT;')`, il valore di ritorno deve reintegrare le chiusure (il PUT risponde al client con l'albero salvato e le chiusure non devono sparire dalla risposta):
```js
  return { ...safeData, consuntiviClosures: readJsonRows(db, TABLES.consuntiviClosures, 'rowid ASC') }
```
(sostituisce l'attuale `return safeData`.)

In fondo al file i 3 helper:
```js
export function getConsuntiviClosures(db = getDb()) {
  return readJsonRows(db, TABLES.consuntiviClosures, 'rowid ASC')
}

export function insertConsuntiviClosure(closure, db = getDb()) {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO consuntivi_closures (id, commessa_key, data, updated_at) VALUES (?, ?, ?, ?)')
    .run(closure.id, closure.commessaKey, JSON.stringify(closure), now)
  bumpDataRevision(db, now)
  return closure
}

export function deleteConsuntiviClosure(id, db = getDb()) {
  const res = db.prepare('DELETE FROM consuntivi_closures WHERE id = ?').run(id)
  const removed = Number(res.changes) > 0
  if (removed) bumpDataRevision(db, new Date().toISOString())
  return removed
}
```
(`bumpDataRevision` esiste già in db.js; verifica il nome esatto leggendo il file.)

- [ ] **Step 2: rotte — POST/DELETE chiusure**

In `server/routes/index.js`: aggiungi all'import da `../db.js`: `getConsuntiviClosures, insertConsuntiviClosure, deleteConsuntiviClosure`; nuovo import `import { consuntivoTotals } from '../services/consuntiviTotals.js'`.

Dopo il blocco `router.put('/consuntivi-pricing', ...)` inserisci:
```js
  // Chiusura certificata commesse: snapshot calcolato SOLO server-side,
  // protetta dalla password consuntivi. Collezione server-autoritativa.
  const commessaKeyOf = (c) => (String(c.commessaNumber ?? '').trim() || '(senza commessa)')

  router.post('/consuntivi-closures', (req, res, next) => {
    try {
      requireConsuntiviPassword(req)
      const commessaKey = String((req.body ?? {}).commessaKey ?? '').trim()
      if (!commessaKey) {
        const err = new Error('commessaKey mancante.'); err.statusCode = 400; throw err
      }
      if (getConsuntiviClosures().some((cl) => cl.commessaKey === commessaKey)) {
        const err = new Error(`La commessa ${commessaKey} è già chiusa.`); err.statusCode = 409; throw err
      }
      const group = (getAppData().consuntivi ?? []).filter((c) => commessaKeyOf(c) === commessaKey)
      if (group.length === 0) {
        const err = new Error(`Nessun consuntivo per la commessa ${commessaKey}.`); err.statusCode = 404; throw err
      }
      const cfg = getConsuntiviConfig() ?? DEFAULT_CONSUNTIVI_CONFIG
      const snapshot = {
        total: 0, totalKg: 0,
        kgByMaterial: { ferro: 0, inox: 0, zincato: 0, corten: 0 },
        cats: { material: 0, gas: 0, time: 0, welding: 0, bending: 0 },
      }
      let firstDate = ''
      let lastDate = ''
      for (const c of group) {
        const t = consuntivoTotals(c, cfg)
        snapshot.total += t.total
        snapshot.totalKg += t.totalKg
        for (const m of Object.keys(snapshot.kgByMaterial)) snapshot.kgByMaterial[m] += t.kgByMaterial[m] ?? 0
        snapshot.cats.material += t.materialCost
        snapshot.cats.gas += t.gasCost
        snapshot.cats.time += t.timeCost
        snapshot.cats.welding += t.weldingCost
        snapshot.cats.bending += t.bendingCost
        if (!firstDate || c.date < firstDate) firstDate = c.date
        if (!lastDate || c.date > lastDate) lastDate = c.date
      }
      const closure = {
        id: `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        commessaKey,
        supplierName: group.map((c) => c.supplierName).find((s) => s && s.trim()) ?? '',
        firstDate,
        lastDate,
        consuntiviCount: group.length,
        closedAt: new Date().toISOString(),
        closedByUserId: req.user.id,
        closedByUsername: req.user.username,
        snapshot,
      }
      insertConsuntiviClosure(closure)
      scheduleAutoBackup('consuntivi-closure-created')
      sendDataRevisionHeaders(res)
      res.status(201).json(closure)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })

  router.delete('/consuntivi-closures/:id', (req, res, next) => {
    try {
      requireConsuntiviPassword(req)
      if (!deleteConsuntiviClosure(String(req.params.id))) {
        const err = new Error('Chiusura non trovata.'); err.statusCode = 404; throw err
      }
      scheduleAutoBackup('consuntivi-closure-reopened')
      sendDataRevisionHeaders(res)
      res.json({ ok: true })
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })
```

- [ ] **Step 3: Test d'integrazione che fallisce**

`server/routes/consuntiviClosures.test.mjs` (pattern spawn: temp dir, porta 3975, DB reale mai toccato):
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const PORT = 3975
const BASE = `http://127.0.0.1:${PORT}/api`
const CONS_PW = 'TestCons1'
let child
let dir
let adminCookie

function cookieOf(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const m = /flowrlink_session=([^;]+)/.exec(c)
    if (m) return `flowrlink_session=${m[1]}`
  }
  return null
}
async function req(method, url, { cookie, body, pw } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(pw ? { 'x-workload-admin-password': pw } : {}),
      'x-workload-mutation-kind': 'normal',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* vuoto */ }
  return { status: res.status, json }
}

const CONS = (id, commessa, extra = {}) => ({
  id, commessaNumber: commessa, supplierName: 'Forn', date: '2026-07-01', operatorName: 'Op',
  laserRows: [{ id: `${id}l`, lunghezzaMm: 1000, larghezzaMm: 500, spessoreMm: 3, materiale: 'ferro', nPezzi: 2, tempoMin: 10, gas: 'ossigeno' }],
  tubeRows: [], weldingRows: [], bendingRows: [], notes: '', ...extra,
})

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'closures-'))
  child = spawn('node', ['server/index.js'], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env, PORT: String(PORT), HOST: '127.0.0.1',
      WORKLOAD_DATA_DIR: dir, WORKLOAD_DB_PATH: path.join(dir, 'w.db'), WORKLOAD_STATE_DIR: dir,
      WORKLOAD_DISABLE_IPV6_LOCALHOST: '1', WORKLOAD_SKIP_AUTO_SEED: '1',
    },
  })
  // attesa server pronto
  let ready = false
  for (let i = 0; i < 100 && !ready; i++) {
    try { const r = await fetch(BASE + '/auth/setup-status'); if (r.ok) ready = true } catch { /* retry */ }
    if (!ready) await new Promise((r) => setTimeout(r, 200))
  }
  expect(ready).toBe(true)
  // admin + password consuntivi + dati
  const setup = await fetch(BASE + '/auth/setup-admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Password1' }) })
  adminCookie = cookieOf(setup)
  expect(adminCookie).toBeTruthy()
  const setPw = await req('POST', '/consuntivi-auth/set-password', { cookie: adminCookie, body: { newPassword: CONS_PW } })
  expect(setPw.status).toBe(200)
  const tree = (await req('GET', '/app-data', { cookie: adminCookie })).json
  const put = await req('PUT', '/app-data', { cookie: adminCookie, body: { ...tree, consuntivi: [CONS('c1', 'COM9'), CONS('c2', 'COM9', { date: '2026-07-05' }), CONS('c3', 'ALTRA')] } })
  expect(put.status).toBe(200)
}, 60_000)

afterAll(() => {
  try { child?.kill() } catch { /* gia' morto */ }
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
})

describe('POST/DELETE /consuntivi-closures', () => {
  let closureId
  it('password errata -> 403', async () => {
    const r = await req('POST', '/consuntivi-closures', { cookie: adminCookie, pw: 'sbagliata', body: { commessaKey: 'COM9' } })
    expect(r.status).toBe(403)
  })
  it('chiusura ok -> 201 con snapshot corretto (2 consuntivi COM9)', async () => {
    const r = await req('POST', '/consuntivi-closures', { cookie: adminCookie, pw: CONS_PW, body: { commessaKey: 'COM9' } })
    expect(r.status).toBe(201)
    expect(r.json.commessaKey).toBe('COM9')
    expect(r.json.consuntiviCount).toBe(2)
    expect(r.json.firstDate).toBe('2026-07-01')
    expect(r.json.lastDate).toBe('2026-07-05')
    expect(r.json.closedByUsername).toBe('admin')
    // per consuntivo: kg 23.55, mat 30.615, gas 25 -> tot 55.615 ; x2 = 111.23
    expect(r.json.snapshot.total).toBeCloseTo(111.23, 2)
    expect(r.json.snapshot.totalKg).toBeCloseTo(47.1, 2)
    expect(r.json.snapshot.kgByMaterial.ferro).toBeCloseTo(47.1, 2)
    closureId = r.json.id
  })
  it('doppia chiusura -> 409', async () => {
    const r = await req('POST', '/consuntivi-closures', { cookie: adminCookie, pw: CONS_PW, body: { commessaKey: 'COM9' } })
    expect(r.status).toBe(409)
  })
  it('commessa inesistente -> 404', async () => {
    const r = await req('POST', '/consuntivi-closures', { cookie: adminCookie, pw: CONS_PW, body: { commessaKey: 'NOPE' } })
    expect(r.status).toBe(404)
  })
  it('GET /app-data include la chiusura', async () => {
    const r = await req('GET', '/app-data', { cookie: adminCookie })
    expect(r.json.consuntiviClosures).toHaveLength(1)
    expect(r.json.consuntiviClosures[0].snapshot.total).toBeCloseTo(111.23, 2)
  })
  it('riapertura id inesistente -> 404', async () => {
    const r = await req('DELETE', '/consuntivi-closures/nope', { cookie: adminCookie, pw: CONS_PW })
    expect(r.status).toBe(404)
  })
  it('riapertura ok -> chiusura rimossa', async () => {
    const r = await req('DELETE', `/consuntivi-closures/${closureId}`, { cookie: adminCookie, pw: CONS_PW })
    expect(r.status).toBe(200)
    const g = await req('GET', '/app-data', { cookie: adminCookie })
    expect(g.json.consuntiviClosures).toHaveLength(0)
  })
})
```

- [ ] **Step 4: Esegui — prima FAIL, dopo l'implementazione PASS**

Run: `npx vitest run server/routes/consuntiviClosures.test.mjs`
Expected: FAIL prima degli step 1-2; PASS dopo. Poi suite completa: `npx vitest run` → tutta verde.

- [ ] **Step 5: Commit**

```bash
git add server/db.js server/routes/index.js server/routes/consuntiviClosures.test.mjs
git commit -m "feat(consuntivi): endpoint chiusura/riapertura commessa con snapshot server-side"
```

---

### Task 3: Authz — filtro €, collezione server-autoritativa, lock commesse chiuse

**Files:**
- Modify: `server/services/appDataAuthz.js`
- Test: `server/services/appDataAuthz.test.mjs` (aggiungi describe in coda; leggi il file per riusare gli helper esistenti di costruzione utenti/alberi, i test sotto sono autosufficienti con oggetti inline)

**Interfaces:**
- Consumes: shape `ConsuntiviClosure` (Task 2): `{ id, commessaKey, snapshot: { total, totalKg, kgByMaterial, cats } }`.
- Produces: `filterAppDataForUser` rimuove `snapshot.total`+`snapshot.cats` senza `viewConsuntiviPrices`; `authorizeAppDataChange` ignora `consuntiviClosures` del client e blocca create/update (403) e delete (conserva) dei consuntivi su commesse chiuse.

- [ ] **Step 1: Test che falliscono (in coda a appDataAuthz.test.mjs)**

```js
describe('chiusure commesse (consuntiviClosures)', () => {
  const CLOSURE = { id: 'cl1', commessaKey: 'COM9', supplierName: 'F', firstDate: '2026-07-01', lastDate: '2026-07-05', consuntiviCount: 1, closedAt: '2026-07-10T10:00:00Z', closedByUserId: 'u1', closedByUsername: 'admin', snapshot: { total: 111.23, totalKg: 47.1, kgByMaterial: { ferro: 47.1, inox: 0, zincato: 0, corten: 0 }, cats: { material: 61.23, gas: 50, time: 0, welding: 0, bending: 0 } } }
  const consClosed = { id: 'k1', commessaNumber: 'COM9', supplierName: 'F', date: '2026-07-01', laserRows: [], tubeRows: [], weldingRows: [], bendingRows: [], createdByUserId: 'u1' }
  const baseTree = (over = {}) => ({ people: [], workItems: [], tasks: [], absences: [], activityLog: [], notifications: [], businessPartners: [], machineTypes: [], workshopOutputs: [], workshopWorkers: [], workshopAssignments: [], tubeProfiles: [], calculatedStandardComponents: [], consuntivi: [consClosed], consuntiviClosures: [CLOSURE], ...over })
  const fullPerms = { deleteAny: true, canCreateWork: true, canEditWork: true, canDeleteOwnWork: true, managePeople: true, manageAbsences: true, viewLog: true, viewConsuntiviPrices: true }
  const admin = { id: 'u1', permissions: fullPerms }

  it('filtro: senza viewConsuntiviPrices lo snapshot perde total e cats ma tiene i kg', () => {
    const out = filterAppDataForUser(baseTree(), { ...fullPerms, viewConsuntiviPrices: false, managePeople: false })
    expect(out.consuntiviClosures[0].snapshot.total).toBeUndefined()
    expect(out.consuntiviClosures[0].snapshot.cats).toBeUndefined()
    expect(out.consuntiviClosures[0].snapshot.totalKg).toBeCloseTo(47.1, 2)
  })
  it('filtro: con viewConsuntiviPrices lo snapshot resta integro', () => {
    const out = filterAppDataForUser(baseTree(), fullPerms)
    expect(out.consuntiviClosures[0].snapshot.total).toBeCloseTo(111.23, 2)
  })
  it('PUT: consuntiviClosures del client IGNORATE (server-autoritative)', () => {
    const incoming = baseTree({ consuntiviClosures: [{ ...CLOSURE, snapshot: { ...CLOSURE.snapshot, total: 999999 } }] })
    const out = authorizeAppDataChange(baseTree(), incoming, admin)
    expect(out.consuntiviClosures[0].snapshot.total).toBeCloseTo(111.23, 2)
  })
  it('PUT: nuovo consuntivo su commessa chiusa -> 403 anche per admin', () => {
    const nuovo = { ...consClosed, id: 'k2' }
    const incoming = baseTree({ consuntivi: [consClosed, nuovo] })
    expect(() => authorizeAppDataChange(baseTree(), incoming, admin)).toThrow(/chiusa/)
  })
  it('PUT: modifica consuntivo di commessa chiusa -> 403', () => {
    const incoming = baseTree({ consuntivi: [{ ...consClosed, supplierName: 'MODIFICATO' }] })
    expect(() => authorizeAppDataChange(baseTree(), incoming, admin)).toThrow(/chiusa/)
  })
  it('PUT: consuntivo di commessa chiusa assente dal payload -> CONSERVATO', () => {
    const incoming = baseTree({ consuntivi: [] })
    const out = authorizeAppDataChange(baseTree(), incoming, admin)
    expect(out.consuntivi.map((c) => c.id)).toContain('k1')
  })
})
```
(aggiungi gli import mancanti in testa al describe se il file non li ha già: `filterAppDataForUser` è già importato nel file esistente.)

- [ ] **Step 2: Esegui — deve fallire**

Run: `npx vitest run server/services/appDataAuthz.test.mjs`
Expected: i nuovi test FAIL, i preesistenti PASS.

- [ ] **Step 3: Implementa in `appDataAuthz.js`**

In `filterAppDataForUser`, dopo il blocco `if (!perms.managePeople) {...}` aggiungi:
```js
  // Chiusure: i valori economici congelati escono solo a chi ha il permesso prezzi.
  if (!perms.viewConsuntiviPrices) {
    out.consuntiviClosures = (tree.consuntiviClosures || []).map((cl) => {
      const snap = { ...(cl.snapshot || {}) }
      delete snap.total
      delete snap.cats
      return { ...cl, snapshot: snap }
    })
  }
```

In `authorizeAppDataChange`, subito dopo `const out = { ...incoming }` aggiungi:
```js
  // Chiusure commesse: collezione SERVER-AUTORITATIVA — qualunque versione
  // mandata dal client viene ignorata, vale quella del server.
  out.consuntiviClosures = current.consuntiviClosures || []
  const closedKeys = new Set((current.consuntiviClosures || []).map((cl) => cl.commessaKey))
  const commessaKeyOf = (c) => (String(c.commessaNumber ?? '').trim() || '(senza commessa)')
```

Nel loop OWNED, dentro le eliminazioni (`if (!incIds.has(id))`), PRIMA del calcolo `canDelete` aggiungi:
```js
        if (key === 'consuntivi' && closedKeys.has(commessaKeyOf(item))) { preserved.push(item); continue }
```
Nel map create/update:
- ramo create (`if (!before)`), prima del `return`, aggiungi:
```js
        if (key === 'consuntivi' && closedKeys.has(commessaKeyOf(item))) {
          forbid(`La commessa ${commessaKeyOf(item)} è chiusa: non si possono aggiungere consuntivi.`)
        }
```
- ramo update, prima del check `canEditWork`, aggiungi:
```js
      if (key === 'consuntivi' && JSON.stringify(before) !== JSON.stringify(item)
        && (closedKeys.has(commessaKeyOf(before)) || closedKeys.has(commessaKeyOf(item)))) {
        forbid(`La commessa ${commessaKeyOf(before)} è chiusa: consuntivo non modificabile.`)
      }
```

- [ ] **Step 4: Esegui — tutti PASS**

Run: `npx vitest run server/services/appDataAuthz.test.mjs && npx vitest run`
Expected: file PASS (preesistenti + nuovi); suite completa verde.

- [ ] **Step 5: Commit**

```bash
git add server/services/appDataAuthz.js server/services/appDataAuthz.test.mjs
git commit -m "feat(consuntivi): authz chiusure — filtro prezzi, server-autoritativa, lock commesse chiuse"
```

---

### Task 4: Client base — tipi, apiClient, modale chiusura, filtro report

**Files:**
- Modify: `src/types/index.ts` (tipi + `consuntiviClosures` in `AppData`)
- Modify: `src/services/apiClient.ts` (2 funzioni)
- Modify: `src/state/DataProvider.tsx` (esporre `consuntiviClosures` come è esposto `consuntivi` — leggi il file e segui il pattern identico)
- Create: `src/components/CloseCommessaModal.tsx`
- Modify: `src/components/ConsuntiviReportModal.tsx` (selettore solo commesse aperte)

**Interfaces:**
- Consumes: endpoint Task 2.
- Produces: tipo `ConsuntiviClosure` (client, `snapshot.total`/`cats` OPZIONALI); `closeCommessa(commessaKey, password)`, `reopenCommessa(id, password)`; componente `<CloseCommessaModal open onClose />`; `useData()` espone `consuntiviClosures: ConsuntiviClosure[]`.

- [ ] **Step 1: Tipi** — in `src/types/index.ts`, vicino a `Consuntivo`:

```ts
export interface ConsuntiviClosureSnapshot {
  /** € congelati: assenti se l'utente non ha il permesso viewConsuntiviPrices. */
  total?: number
  totalKg: number
  kgByMaterial: Record<ConsuntivoMaterial, number>
  cats?: { material: number; gas: number; time: number; welding: number; bending: number }
}

export interface ConsuntiviClosure {
  id: string
  commessaKey: string
  supplierName: string
  firstDate: string
  lastDate: string
  consuntiviCount: number
  closedAt: string
  closedByUserId: string
  closedByUsername: string
  snapshot: ConsuntiviClosureSnapshot
}
```
In `AppData` aggiungi `consuntiviClosures: ConsuntiviClosure[]` e nel default/empty client (cerca dove è definito l'albero vuoto, es. `EMPTY_APP_DATA` o equivalente) aggiungi `consuntiviClosures: []`.

- [ ] **Step 2: apiClient** — accanto a `fetchConsuntiviPricing`:

```ts
export function closeCommessa(commessaKey: string, password: string): Promise<ConsuntiviClosure> {
  return request<ConsuntiviClosure>('/api/consuntivi-closures', {
    method: 'POST',
    headers: { 'x-workload-admin-password': password },
    body: JSON.stringify({ commessaKey }),
  })
}

export function reopenCommessa(id: string, password: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/consuntivi-closures/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-workload-admin-password': password },
  })
}
```
(import type `ConsuntiviClosure` da `../types`.)

- [ ] **Step 3: DataProvider** — esponi `consuntiviClosures` esattamente come è esposto `consuntivi` (stesso punto del context value). Dopo `closeCommessa`/`reopenCommessa` il client deve rileggere i dati: verifica come il provider fa refresh dopo mutazioni (es. `reload()`/refetch su data-revision) e riusa quel meccanismo; se non esiste un refetch pubblico, esponi dal provider una funzione `refreshAppData()` che ricarica il GET /app-data.

- [ ] **Step 4: CloseCommessaModal** — `src/components/CloseCommessaModal.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { closeCommessa } from '../services/apiClient'

interface Props { open: boolean; onClose: () => void }

const keyOf = (n: string) => n.trim() || '(senza commessa)'

export function CloseCommessaModal({ open, onClose }: Props) {
  const { consuntivi, consuntiviClosures, refreshAppData } = useData()
  const toast = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const aperte = useMemo(() => {
    const closed = new Set(consuntiviClosures.map((cl) => cl.commessaKey))
    const map = new Map<string, { count: number; first: string; last: string }>()
    for (const c of consuntivi) {
      const k = keyOf(c.commessaNumber)
      if (closed.has(k)) continue
      const cur = map.get(k) ?? { count: 0, first: c.date, last: c.date }
      cur.count += 1
      if (c.date < cur.first) cur.first = c.date
      if (c.date > cur.last) cur.last = c.date
      map.set(k, cur)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [consuntivi, consuntiviClosures])

  async function submit() {
    if (!selected) return
    setBusy(true)
    try {
      await closeCommessa(selected, password)
      await refreshAppData()
      toast.success(`Commessa ${selected} chiusa e archiviata.`)
      onClose()
    } catch {
      toast.error('Chiusura non riuscita: password errata o commessa non valida.')
    } finally {
      setBusy(false)
    }
  }

  const info = selected ? aperte.find(([k]) => k === selected)?.[1] : undefined

  return (
    <Modal open={open} onClose={onClose} title="Chiudi commessa (certificata)" size="md"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn-primary" disabled={busy || !selected || !password} onClick={submit}>Sigilla e archivia 🔒</button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          La chiusura congela i totali coi prezzi correnti (calcolo certificato dal server),
          blocca i consuntivi della commessa e la sposta nell'Archivio.
        </p>
        <FormField label="Commessa da chiudere">
          <select className="input-base" value={selected ?? ''} onChange={(e) => setSelected(e.target.value || null)}>
            <option value="">— scegli —</option>
            {aperte.map(([k, v]) => (
              <option key={k} value={k}>{k} · {v.count} consuntivi</option>
            ))}
          </select>
        </FormField>
        {info && (
          <div className="panel-soft px-3 py-2 text-sm text-slate-300">
            {info.count} consuntivi · periodo {info.first} → {info.last}
          </div>
        )}
        <FormField label="Password Consuntivi">
          <input type="password" className="input-base" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
        </FormField>
      </div>
    </Modal>
  )
}
```
(verifica le prop reali di `Modal`/`FormField` leggendo `ConsuntiviPricingModal.tsx` e adegua solo se differiscono.)

- [ ] **Step 5: filtro selettore report** — in `ConsuntiviReportModal.tsx`, il `commesse` useMemo esclude le chiuse:

```tsx
  const { consuntivi, consuntiviClosures } = useData()
  const commesse = useMemo(() => {
    const closed = new Set(consuntiviClosures.map((cl) => cl.commessaKey))
    const set = new Set(consuntivi.map((c) => c.commessaNumber.trim() || '(senza commessa)'))
    return Array.from(set).filter((k) => !closed.has(k)).sort((a, b) => a.localeCompare(b))
  }, [consuntivi, consuntiviClosures])
```

- [ ] **Step 6: Verifica**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: tutti PASS (la modale non è ancora raggiungibile dalla UI: arriva col Task 5).

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/services/apiClient.ts src/state/DataProvider.tsx src/components/CloseCommessaModal.tsx src/components/ConsuntiviReportModal.tsx
git commit -m "feat(consuntivi): client chiusure — tipi, api, modale chiusura, report solo aperte"
```

---

### Task 5: UI — tab In lavorazione | Archivio, card archivio, certificato stampabile

> Usa la skill **frontend-design** per questo task: tab, card e certificato devono avere qualità visiva alta, coerente col design system dell'app (token/utility esistenti).

**Files:**
- Modify: `src/components/ConsuntiviView.tsx` (tab + esclusione chiuse + bottone Chiudi commessa + wiring)
- Create: `src/components/ConsuntiviArchivePanel.tsx`
- Create: `src/components/ClosureCertificateModal.tsx`
- Modify: `src/styles.css` (stili archivio + blocco print certificato)

**Interfaces:**
- Consumes: `CloseCommessaModal` (Task 4), `useData().consuntiviClosures` + `refreshAppData`, `reopenCommessa(id, password)`, `useAuth().user?.permissions.viewConsuntiviPrices`.
- Produces: pagina Consuntivi con tab; `<ConsuntiviArchivePanel />`; `<ClosureCertificateModal closure onClose />` con classi print `closure-cert-portal`/`closure-cert-sheet`.

- [ ] **Step 1: ConsuntiviView — tab + esclusione + wiring**

Modifiche a `ConsuntiviView.tsx`:
```tsx
  const { consuntivi, consuntiviClosures, deleteConsuntivo } = useData()
  const [tab, setTab] = useState<'lavorazione' | 'archivio'>('lavorazione')
  const [closeOpen, setCloseOpen] = useState(false)

  const closedKeys = useMemo(() => new Set(consuntiviClosures.map((cl) => cl.commessaKey)), [consuntiviClosures])
  const aperti = useMemo(() => consuntivi.filter((c) => !closedKeys.has(c.commessaNumber.trim() || '(senza commessa)')), [consuntivi, closedKeys])
```
`filtered` ora parte da `aperti` (non da `consuntivi`). Sotto l'header della pagina aggiungi la barra tab:
```tsx
      <div className="tabs-track">
        <button className={`tab-item ${tab === 'lavorazione' ? 'tab-item-active' : ''}`} onClick={() => setTab('lavorazione')}>
          In lavorazione <span className="ml-1 text-xs text-slate-500">{aperti.length}</span>
        </button>
        <button className={`tab-item ${tab === 'archivio' ? 'tab-item-active' : ''}`} onClick={() => setTab('archivio')}>
          Archivio <span className="ml-1 text-xs text-slate-500">{consuntiviClosures.length}</span>
        </button>
      </div>
```
Toolbar: aggiungi (accanto a «+ Nuovo consuntivo», visibile solo nel tab lavorazione) `<button className="btn-ghost" onClick={() => setCloseOpen(true)}>Chiudi commessa 🔒</button>`.
Corpo: `{tab === 'lavorazione' ? (tabella esistente su aperti/filtered) : <ConsuntiviArchivePanel />}`.
In fondo: `{closeOpen && <CloseCommessaModal open={closeOpen} onClose={() => setCloseOpen(false)} />}`.

- [ ] **Step 2: ConsuntiviArchivePanel**

`src/components/ConsuntiviArchivePanel.tsx`:
```tsx
import { useMemo, useState } from 'react'
import { useData } from '../state/DataProvider'
import { useAuth } from '../state/AuthProvider'
import { useToast } from '../state/ToastProvider'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { reopenCommessa } from '../services/apiClient'
import { ClosureCertificateModal } from './ClosureCertificateModal'
import type { ConsuntiviClosure } from '../types'

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const KG = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })
const dateIT = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { dateStyle: 'medium' })

export function ConsuntiviArchivePanel() {
  const { consuntiviClosures, refreshAppData } = useData()
  const { user } = useAuth()
  const toast = useToast()
  const canSeePrices = !!user?.permissions.viewConsuntiviPrices
  const [query, setQuery] = useState('')
  const [certFor, setCertFor] = useState<ConsuntiviClosure | null>(null)
  const [reopenFor, setReopenFor] = useState<ConsuntiviClosure | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...consuntiviClosures].sort((a, b) => b.closedAt.localeCompare(a.closedAt))
    if (!q) return sorted
    return sorted.filter((cl) => cl.commessaKey.toLowerCase().includes(q) || cl.supplierName.toLowerCase().includes(q))
  }, [consuntiviClosures, query])

  async function doReopen() {
    if (!reopenFor) return
    setBusy(true)
    try {
      await reopenCommessa(reopenFor.id, password)
      await refreshAppData()
      toast.success(`Commessa ${reopenFor.commessaKey} riaperta: torna in lavorazione.`)
      setReopenFor(null)
      setPassword('')
    } catch {
      toast.error('Riapertura non riuscita: password errata.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">Commesse chiuse e certificate. I valori sono congelati alla chiusura.</p>
        <input className="input-base w-64" placeholder="Cerca commessa o fornitore…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗄️</div>
          <div className="font-medium text-slate-300">Nessuna commessa chiusa</div>
          <div>Chiudi una commessa da «In lavorazione» per archiviarla qui, certificata.</div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((cl) => (
            <article key={cl.id} className="cons-archive-card panel">
              <header className="cons-archive-head">
                <div>
                  <div className="cons-archive-label">Commessa</div>
                  <h3 className="cons-archive-number">{cl.commessaKey}</h3>
                  <div className="cons-archive-supplier">{cl.supplierName || 'Fornitore —'}</div>
                </div>
                <span className="chip-pill cons-archive-seal">✓ CERTIFICATA</span>
              </header>
              <dl className="cons-archive-stats">
                <div><dt>Periodo</dt><dd>{dateIT(cl.firstDate)} → {dateIT(cl.lastDate)}</dd></div>
                <div><dt>Consuntivi</dt><dd>{cl.consuntiviCount}</dd></div>
                <div><dt>Peso totale</dt><dd>{KG.format(cl.snapshot.totalKg)} kg</dd></div>
                {canSeePrices && cl.snapshot.total !== undefined && (
                  <div className="cons-archive-total"><dt>Totale congelato</dt><dd>{EUR.format(cl.snapshot.total)}</dd></div>
                )}
              </dl>
              <footer className="cons-archive-foot">
                <span className="text-[11px] text-slate-500">Chiusa da {cl.closedByUsername} il {dateIT(cl.closedAt)}</span>
                <div className="flex gap-1.5">
                  <button className="btn-ghost text-xs" onClick={() => setCertFor(cl)}>Certificato</button>
                  <button className="btn-ghost text-xs" onClick={() => { setReopenFor(cl); setPassword('') }}>Riapri 🔒</button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}

      {certFor && <ClosureCertificateModal closure={certFor} onClose={() => setCertFor(null)} />}

      {reopenFor && (
        <Modal open onClose={() => setReopenFor(null)} title={`Riapri commessa ${reopenFor.commessaKey}`} size="sm"
          footer={<>
            <button className="btn-ghost" onClick={() => setReopenFor(null)}>Annulla</button>
            <button className="btn-danger" disabled={busy || !password} onClick={doReopen}>Riapri (elimina il sigillo)</button>
          </>}>
          <div className="space-y-3">
            <p className="text-sm text-slate-400">La commessa torna in lavorazione e lo snapshot certificato viene eliminato.</p>
            <FormField label="Password Consuntivi">
              <input type="password" className="input-base" autoFocus value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doReopen() }} />
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  )
}
```

- [ ] **Step 3: ClosureCertificateModal (portal, stampabile)**

`src/components/ClosureCertificateModal.tsx`:
```tsx
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import type { ConsuntiviClosure, ConsuntivoMaterial } from '../types'
import { CONSUNTIVO_MATERIAL_LABELS, ALL_CONSUNTIVO_MATERIALS } from '../types'

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const KG = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })
const dateIT = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { dateStyle: 'long' })
const CAT_LABELS: Record<string, string> = { material: 'Materiale', gas: 'Gas taglio', time: 'Tempo laser tubi', welding: 'Saldatura', bending: 'Piega' }

interface Props { closure: ConsuntiviClosure; onClose: () => void }

export function ClosureCertificateModal({ closure, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  const s = closure.snapshot
  const content = (
    <div className="closure-cert-portal">
      <div className="closure-cert-overlay">
        <div className="closure-cert-bar no-print">
          <span className="text-sm font-medium text-slate-300">Certificato di chiusura</span>
          <div className="flex items-center gap-2">
            <button className="btn-primary" onClick={() => window.print()}>Stampa / PDF</button>
            <button className="btn-ghost" onClick={onClose}>Chiudi</button>
          </div>
        </div>
        <div className="closure-cert-sheet">
          <img src="/flowrlink-logo-light.png" alt="Flowrlink" className="closure-cert-logo" />
          <div className="closure-cert-kicker">Officina · Consuntivi di produzione</div>
          <h1 className="closure-cert-title">Certificato di chiusura commessa</h1>

          <div className="closure-cert-grid">
            <div><span>Commessa</span><strong>{closure.commessaKey}</strong></div>
            <div><span>Fornitore</span><strong>{closure.supplierName || '—'}</strong></div>
            <div><span>Periodo</span><strong>{dateIT(closure.firstDate)} → {dateIT(closure.lastDate)}</strong></div>
            <div><span>Consuntivi</span><strong>{closure.consuntiviCount}</strong></div>
          </div>

          <div className="closure-cert-kg">
            {ALL_CONSUNTIVO_MATERIALS.map((m: ConsuntivoMaterial) => (
              <div key={m}><span>{CONSUNTIVO_MATERIAL_LABELS[m]}</span><strong>{KG.format(s.kgByMaterial[m] ?? 0)} kg</strong></div>
            ))}
            <div className="closure-cert-kg-tot"><span>Totale</span><strong>{KG.format(s.totalKg)} kg</strong></div>
          </div>

          {s.total !== undefined && s.cats && (
            <div className="closure-cert-money">
              <ul>
                {Object.entries(CAT_LABELS).map(([k, label]) => (
                  <li key={k}><span>{label}</span><b>{EUR.format((s.cats as Record<string, number>)[k] ?? 0)}</b></li>
                ))}
              </ul>
              <div className="closure-cert-total"><span>Totale certificato</span><strong>{EUR.format(s.total)}</strong></div>
            </div>
          )}

          <div className="closure-cert-seal">
            ✓ CERTIFICATA — chiusa da <strong>{closure.closedByUsername}</strong> il {dateIT(closure.closedAt)}.
            Valori congelati alla chiusura: le variazioni successive dei prezzi non alterano questo documento.
          </div>
          <footer className="closure-cert-foot">Documento riservato — sezione Consuntivi, Flowrlink.</footer>
        </div>
      </div>
    </div>
  )
  return createPortal(content, document.body)
}
```

- [ ] **Step 4: CSS (`src/styles.css`)** — in coda al file:

```css
/* ===========================================================================
   Archivio consuntivi: card commesse chiuse
   =========================================================================== */
.cons-archive-card { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.cons-archive-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.cons-archive-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-ink-faint); }
.cons-archive-number { font-size: 20px; font-weight: 700; color: var(--color-ink); line-height: 1.2; }
.cons-archive-supplier { font-size: 12px; color: var(--color-ink-dim); }
.cons-archive-seal { background: rgba(16, 185, 129, 0.12); color: #6ee7b7; --tw-ring-color: rgba(16, 185, 129, 0.35); }
.cons-archive-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; font-size: 13px; }
.cons-archive-stats dt { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-ink-faint); }
.cons-archive-stats dd { color: var(--color-ink); font-weight: 500; }
.cons-archive-total { grid-column: 1 / -1; border-top: 1px solid var(--color-edge-soft); padding-top: 8px; }
.cons-archive-total dd { font-size: 18px; font-weight: 700; color: #7dd3fc; font-variant-numeric: tabular-nums; }
.cons-archive-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid var(--color-edge-soft); padding-top: 10px; }

/* ===========================================================================
   Certificato di chiusura: overlay + foglio stampabile
   =========================================================================== */
.closure-cert-overlay { position: fixed; inset: 0; z-index: 60; overflow: auto; background: rgba(3, 6, 18, 0.86); backdrop-filter: blur(4px); }
.closure-cert-bar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; background: rgba(9, 14, 32, 0.95); border-bottom: 1px solid var(--color-edge-soft); }
.closure-cert-sheet { width: 100%; max-width: 720px; margin: 28px auto 60px; background: #f7f7f4; color: #14181f; border: 1px solid #d9d7cf; border-radius: 10px; box-shadow: 0 40px 90px -40px rgba(0, 0, 0, 0.9); padding: 40px 44px 28px; font-variant-numeric: tabular-nums; }
.closure-cert-logo { display: block; height: 40px; width: auto; margin: 0 0 10px; }
.closure-cert-kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #8a8578; }
.closure-cert-title { font-size: 24px; font-weight: 700; color: #0d1017; margin: 2px 0 18px; }
.closure-cert-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; margin-bottom: 18px; }
.closure-cert-grid span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #8a8578; }
.closure-cert-grid strong { font-size: 14px; color: #0d1017; }
.closure-cert-kg { display: flex; flex-wrap: wrap; gap: 8px 18px; border-block: 1px solid #e2dfd5; padding: 12px 0; margin-bottom: 16px; }
.closure-cert-kg span { display: block; font-size: 10px; text-transform: uppercase; color: #8a8578; }
.closure-cert-kg-tot strong { color: #0d1017; }
.closure-cert-money ul { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-bottom: 12px; }
.closure-cert-money li { display: flex; justify-content: space-between; font-size: 13px; }
.closure-cert-total { display: flex; justify-content: space-between; align-items: baseline; background: #10141f; color: #fff; border-radius: 8px; padding: 12px 16px; }
.closure-cert-total strong { font-size: 22px; }
.closure-cert-seal { margin-top: 18px; border: 1.5px solid #10b981; background: #ecfdf5; color: #065f46; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; }
.closure-cert-foot { margin-top: 16px; font-size: 10.5px; color: #8a8578; }

/* ---- Stampa certificato (portal su body, stesso schema collaudato) ---- */
@media print {
  body:has(.closure-cert-portal) > *:not(.closure-cert-portal) { display: none !important; }
  .closure-cert-portal,
  .closure-cert-portal * { visibility: visible !important; }
  .closure-cert-portal { position: static !important; }
  .closure-cert-overlay { position: static !important; overflow: visible !important; background: #fff !important; backdrop-filter: none !important; }
  .closure-cert-sheet { max-width: none !important; width: 100% !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: #fff !important; }
  .closure-cert-sheet, .closure-cert-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
```

- [ ] **Step 5: Verifica**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: tutto verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/ConsuntiviView.tsx src/components/ConsuntiviArchivePanel.tsx src/components/ClosureCertificateModal.tsx src/styles.css
git commit -m "feat(consuntivi): tab archivio con card certificate + certificato di chiusura stampabile"
```

---

## Ordine e verifica finale

Task 1 → 2 → 3 → 4 → 5. Alla fine:
```bash
npx vitest run && npm run typecheck && npm run build
```
Expected: suite completa verde (totals server, endpoint, authz, preesistenti), typecheck e build PASS.

Verifica stampa certificato (controller, harness Chrome print-to-pdf come nei fix report): repro con `#root` fittizio + portal `closure-cert-portal` + CSS di dist → il PDF contiene i dati del certificato, l'app è esclusa, il logo presente.

Verifica manuale (server acceso):
1. Consuntivi → tab «In lavorazione»: tutto come prima; «Chiudi commessa 🔒» → scegli → password → la commessa sparisce e appare in «Archivio».
2. Archivio: card con kg (e € congelato per chi ha il permesso), «Certificato» stampa il PDF con logo e sigillo, «Riapri 🔒» la riporta in lavorazione.
3. Consuntivi di commessa chiusa: non modificabili/eliminabili (403 chiaro), report solo su commesse aperte.
