# Consuntivi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nuova pagina "Consuntivi" dove gli operai registrano lavorazioni reali (taglio laser, laser tubi, saldatura, piega) per commessa; il sistema calcola pesi e, dietro password, costi e report in kg/€.

**Architecture:** Due nuove collezioni-array in `AppData` (`consuntivi`, `tubeProfiles`) che seguono esattamente il pattern esistente (workshopOutputs): array JSON in SQLite, sincronizzati via `PUT /api/app-data`. I prezzi NON stanno in `AppData` (sarebbero leggibili da tutti): vivono in un blob `meta.consuntiviConfig` server-side, esposto da endpoint dedicati protetti dal gate admin già esistente (`verifyAdminPassword` + header `x-workload-admin-password`). La densità per materiale (serve al calcolo kg lato operaio, non sensibile) è esposta da un endpoint pubblico `GET /api/consuntivi-settings`. I calcoli sono funzioni pure in `src/utils/consuntiviCalc.ts`, testate con vitest sui numeri del file `CONSUNTIVO.xlsx`.

**Tech Stack:** React 19 + TypeScript + Vite, Express 5, `node:sqlite` (DatabaseSync), Tailwind v4. Test: vitest (nuovo devDep).

## Global Constraints

- Tutta la UI e i messaggi in **italiano**.
- Nessuna nuova dipendenza runtime. Unica aggiunta: `vitest` come **devDependency**.
- Le collezioni di `AppData` sono **array**. `consuntivi` e `tubeProfiles` sono array; nient'altro entra in `AppData`.
- **I prezzi non entrano mai in `AppData`** né in `GET /api/app-data`. Solo in `meta.consuntiviConfig`, dietro endpoint protetti.
- Riuso del gate admin esistente: header `x-workload-admin-password`, `verifyAdminPassword` (se nessuna password admin è impostata, `verifyAdminPassword` ritorna `true` → config leggibile: coerente col comportamento attuale del "carico base").
- ID via `uid('<prefix>')` da `src/utils/format.ts`. Log attività via `logEntry` da `src/utils/activityLog.ts`.
- Prezzi/densità di default (dal file Excel): `materialPricePerKg` ferro 1.3 · inox 4.5 · zincato 2 · corten 3; `gasCostPerMin` ossigeno 2.5 · azoto 3; `tubeLaserRatePerMin` 2.5; `weldingRatePerHour` 35; `bendingRatePerHour` 60; `densityFactorPerMaterial` ferro 7.85 · inox 8.0 · zincato 7.85 · corten 7.85.
- Formule (dal foglio `PRIVATE`): `kg lamiera = (L/1000)·(W/1000)·(sp·densità)`; `kg tubo = kgPerMeter·(L/1000)·nPezzi`; `costo materiale = kg·€kg[materiale]`; `costo gas = tempoMin·€min[gas]`; `costo tempo tubo = tempoMin·tubeLaserRatePerMin`; `saldatura = persone·ore·€h_sald`; `piega = ore·€h_piega`.

---

### Task 1: Tipi dominio Consuntivi + estensione AppData

**Files:**
- Modify: `src/types/index.ts` (append in fondo, prima di `EMPTY_FILTERS`/`isOpen`; e dentro `interface AppData`)

**Interfaces:**
- Produces: `ConsuntivoMaterial`, `ConsuntivoGas`, `TubeCategory`, `ALL_CONSUNTIVO_MATERIALS`, `ALL_CONSUNTIVO_GAS`, `ALL_TUBE_CATEGORIES`, `LaserCutRow`, `TubeLaserRow`, `WeldingRow`, `BendingRow`, `Consuntivo`, `TubeProfile`, `ConsuntiviPricingConfig`; `AppData.consuntivi: Consuntivo[]`, `AppData.tubeProfiles: TubeProfile[]`.

- [ ] **Step 1: Aggiungere i tipi in `src/types/index.ts`**

Append at end of file:

```typescript
// === Consuntivi officina (taglio laser / laser tubi / saldatura / piega) ===

export type ConsuntivoMaterial = 'ferro' | 'inox' | 'zincato' | 'corten'
export const ALL_CONSUNTIVO_MATERIALS: ConsuntivoMaterial[] = ['ferro', 'inox', 'zincato', 'corten']
export const CONSUNTIVO_MATERIAL_LABELS: Record<ConsuntivoMaterial, string> = {
  ferro: 'Ferro',
  inox: 'Inox',
  zincato: 'Zincato',
  corten: 'Corten',
}

export type ConsuntivoGas = 'ossigeno' | 'azoto'
export const ALL_CONSUNTIVO_GAS: ConsuntivoGas[] = ['ossigeno', 'azoto']

export type TubeCategory = 'tubolari' | 'tubi'
export const ALL_TUBE_CATEGORIES: TubeCategory[] = ['tubolari', 'tubi']
export const TUBE_CATEGORY_LABELS: Record<TubeCategory, string> = {
  tubolari: 'Tubolari',
  tubi: 'Tubi',
}

export interface LaserCutRow {
  id: string
  lunghezzaMm: number
  larghezzaMm: number
  spessoreMm: number
  materiale: ConsuntivoMaterial
  tempoMin: number
  gas: ConsuntivoGas
}

export interface TubeLaserRow {
  id: string
  categoria: TubeCategory
  profileId: string
  profileLabel: string
  kgPerMeter: number
  materiale: ConsuntivoMaterial
  lunghezzaMm: number
  nPezzi: number
  tempoMin: number
}

export interface WeldingRow {
  id: string
  people: number
  hours: number
}

export interface BendingRow {
  id: string
  hours: number
}

export interface Consuntivo {
  id: string
  workItemId: string
  workItemCode: string
  workItemTitle: string
  customer: string
  date: string
  operatorName: string
  laserRows: LaserCutRow[]
  tubeRows: TubeLaserRow[]
  weldingRows: WeldingRow[]
  bendingRows: BendingRow[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface TubeProfile {
  id: string
  categoria: TubeCategory
  label: string
  kgPerMeter: number
  active: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

/** Config prezzi protetta — NON entra mai in AppData. Vive in meta.consuntiviConfig. */
export interface ConsuntiviPricingConfig {
  materialPricePerKg: Record<ConsuntivoMaterial, number>
  gasCostPerMin: Record<ConsuntivoGas, number>
  tubeLaserRatePerMin: number
  weldingRatePerHour: number
  bendingRatePerHour: number
  densityFactorPerMaterial: Record<ConsuntivoMaterial, number>
}
```

- [ ] **Step 2: Estendere `interface AppData`**

In `src/types/index.ts`, inside `interface AppData { ... }`, add after `calculatedStandardComponents: CalculatedStandardComponent[]`:

```typescript
  consuntivi: Consuntivo[]
  tubeProfiles: TubeProfile[]
```

- [ ] **Step 3: Verificare typecheck**

Run: `npm run typecheck`
Expected: fallisce con errori "Property 'consuntivi' is missing" nei punti che costruiscono `AppData` (apiClient `withAppDataDefaults`, demoData, ecc.). È atteso: verranno risolti nei task successivi. Verificare che NON ci siano errori di sintassi nei tipi appena aggiunti (nessun errore dentro `src/types/index.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(consuntivi): add domain types and AppData collections"
```

---

### Task 2: Calcoli puri + setup vitest

**Files:**
- Create: `src/utils/consuntiviCalc.ts`
- Create: `src/utils/consuntiviCalc.test.ts`
- Modify: `package.json` (devDependency vitest + script `test`)

**Interfaces:**
- Consumes: tipi da Task 1.
- Produces: `DEFAULT_CONSUNTIVI_PRICING: ConsuntiviPricingConfig`; `sheetWeightKg(row, densityFactor): number`; `tubeWeightKg(row): number`; `laserRowCost(row, pricing): { kg; materialCost; gasCost; total }`; `tubeRowCost(row, pricing): { kg; materialCost; timeCost; total }`; `weldingRowCost(row, pricing): number`; `bendingRowCost(row, pricing): number`; `consuntivoTotals(c, pricing): ConsuntivoTotals`; `ConsuntivoTotals` interface; `emptyKgByMaterial(): Record<ConsuntivoMaterial, number>`.

- [ ] **Step 1: Installare vitest e aggiungere lo script**

Run: `npm install -D vitest`

Then edit `package.json` scripts, add after `"typecheck": "tsc -b --noEmit"` (add a comma to the previous line):

```json
    "test": "vitest run"
```

- [ ] **Step 2: Scrivere il test che fallisce** — `src/utils/consuntiviCalc.test.ts`

```typescript
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONSUNTIVI_PRICING,
  bendingRowCost,
  consuntivoTotals,
  laserRowCost,
  sheetWeightKg,
  tubeRowCost,
  tubeWeightKg,
  weldingRowCost,
} from './consuntiviCalc'
import type { Consuntivo } from '../types'

const P = DEFAULT_CONSUNTIVI_PRICING

describe('sheetWeightKg — foglio PRIVATE del file CONSUNTIVO.xlsx', () => {
  it('1500x3000x1.5 con densità 8 = 54 kg (riga A3)', () => {
    expect(sheetWeightKg({ lunghezzaMm: 1500, larghezzaMm: 3000, spessoreMm: 1.5 }, 8)).toBeCloseTo(54, 6)
  })
  it('1500x2276x2 con densità 8 = 54.624 kg (riga A4)', () => {
    expect(sheetWeightKg({ lunghezzaMm: 1500, larghezzaMm: 2276, spessoreMm: 2 }, 8)).toBeCloseTo(54.624, 6)
  })
})

describe('laserRowCost', () => {
  it('zincato 54 kg → materiale 54*2=108; azoto 3 min → 3*3=9', () => {
    const r = laserRowCost(
      { id: 'r1', lunghezzaMm: 1500, larghezzaMm: 3000, spessoreMm: 1.5, materiale: 'zincato', tempoMin: 3, gas: 'azoto' },
      { ...P, densityFactorPerMaterial: { ...P.densityFactorPerMaterial, zincato: 8 } },
    )
    expect(r.kg).toBeCloseTo(54, 6)
    expect(r.materialCost).toBeCloseTo(108, 6)
    expect(r.gasCost).toBeCloseTo(9, 6)
    expect(r.total).toBeCloseTo(117, 6)
  })
  it('ferro con ossigeno 10 min → gas 10*2.5=25', () => {
    const r = laserRowCost(
      { id: 'r2', lunghezzaMm: 1000, larghezzaMm: 1000, spessoreMm: 1, materiale: 'ferro', tempoMin: 10, gas: 'ossigeno' },
      { ...P, densityFactorPerMaterial: { ...P.densityFactorPerMaterial, ferro: 8 } },
    )
    expect(r.kg).toBeCloseTo(8, 6) // 1*1*(1*8)
    expect(r.materialCost).toBeCloseTo(8 * 1.3, 6)
    expect(r.gasCost).toBeCloseTo(25, 6)
  })
})

describe('tubeWeightKg / tubeRowCost', () => {
  it('kg/m 3.49 · 6 m · 2 pezzi = 41.88 kg', () => {
    expect(tubeWeightKg({ kgPerMeter: 3.49, lunghezzaMm: 6000, nPezzi: 2 })).toBeCloseTo(41.88, 6)
  })
  it('costo materiale ferro + tempo tubo', () => {
    const r = tubeRowCost(
      { id: 't1', categoria: 'tubolari', profileId: 'p', profileLabel: '40x40x3', kgPerMeter: 3.49, materiale: 'ferro', lunghezzaMm: 6000, nPezzi: 2, tempoMin: 4 },
      P,
    )
    expect(r.kg).toBeCloseTo(41.88, 6)
    expect(r.materialCost).toBeCloseTo(41.88 * 1.3, 6)
    expect(r.timeCost).toBeCloseTo(4 * 2.5, 6)
    expect(r.total).toBeCloseTo(41.88 * 1.3 + 10, 6)
  })
})

describe('saldatura / piega', () => {
  it('saldatura 2 persone · 8 ore · 35 = 560', () => {
    expect(weldingRowCost({ id: 'w', people: 2, hours: 8 }, P)).toBeCloseTo(560, 6)
  })
  it('piega 5 ore · 60 = 300', () => {
    expect(bendingRowCost({ id: 'b', hours: 5 }, P)).toBeCloseTo(300, 6)
  })
})

describe('consuntivoTotals', () => {
  it('somma righe e ripartisce i kg per materiale', () => {
    const pricing = { ...P, densityFactorPerMaterial: { ...P.densityFactorPerMaterial, ferro: 8, zincato: 8 } }
    const c: Consuntivo = {
      id: 'c1', workItemId: 'w1', workItemCode: 'CM-1', workItemTitle: 'x', customer: 'y', date: '2026-07-02', operatorName: '',
      laserRows: [
        { id: 'r1', lunghezzaMm: 1000, larghezzaMm: 1000, spessoreMm: 1, materiale: 'ferro', tempoMin: 10, gas: 'ossigeno' },
      ],
      tubeRows: [
        { id: 't1', categoria: 'tubolari', profileId: 'p', profileLabel: '40x40x3', kgPerMeter: 3.49, materiale: 'ferro', lunghezzaMm: 6000, nPezzi: 2, tempoMin: 4 },
      ],
      weldingRows: [{ id: 'w', people: 2, hours: 8 }],
      bendingRows: [{ id: 'b', hours: 5 }],
      notes: '', createdAt: '', updatedAt: '',
    }
    const t = consuntivoTotals(c, pricing)
    expect(t.totalKg).toBeCloseTo(8 + 41.88, 6)
    expect(t.kgByMaterial.ferro).toBeCloseTo(8 + 41.88, 6)
    expect(t.weldingCost).toBeCloseTo(560, 6)
    expect(t.bendingCost).toBeCloseTo(300, 6)
    const expectedTotal = 8 * 1.3 + 25 + (41.88 * 1.3 + 10) + 560 + 300
    expect(t.total).toBeCloseTo(expectedTotal, 6)
  })
})
```

- [ ] **Step 3: Eseguire il test per verificarne il fallimento**

Run: `npx vitest run src/utils/consuntiviCalc.test.ts`
Expected: FAIL — `Failed to resolve import "./consuntiviCalc"` (il modulo non esiste ancora).

- [ ] **Step 4: Implementare `src/utils/consuntiviCalc.ts`**

```typescript
import type {
  BendingRow,
  Consuntivo,
  ConsuntiviPricingConfig,
  ConsuntivoMaterial,
  LaserCutRow,
  TubeLaserRow,
  WeldingRow,
} from '../types'
import { ALL_CONSUNTIVO_MATERIALS } from '../types'

export const DEFAULT_CONSUNTIVI_PRICING: ConsuntiviPricingConfig = {
  materialPricePerKg: { ferro: 1.3, inox: 4.5, zincato: 2, corten: 3 },
  gasCostPerMin: { ossigeno: 2.5, azoto: 3 },
  tubeLaserRatePerMin: 2.5,
  weldingRatePerHour: 35,
  bendingRatePerHour: 60,
  densityFactorPerMaterial: { ferro: 7.85, inox: 8.0, zincato: 7.85, corten: 7.85 },
}

export interface ConsuntivoTotals {
  totalKg: number
  materialCost: number
  gasCost: number
  timeCost: number
  weldingCost: number
  bendingCost: number
  total: number
  kgByMaterial: Record<ConsuntivoMaterial, number>
}

function num(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export function emptyKgByMaterial(): Record<ConsuntivoMaterial, number> {
  return { ferro: 0, inox: 0, zincato: 0, corten: 0 }
}

export function sheetWeightKg(
  row: Pick<LaserCutRow, 'lunghezzaMm' | 'larghezzaMm' | 'spessoreMm'>,
  densityFactor: number,
): number {
  return (num(row.lunghezzaMm) / 1000) * (num(row.larghezzaMm) / 1000) * (num(row.spessoreMm) * num(densityFactor))
}

export function tubeWeightKg(row: Pick<TubeLaserRow, 'kgPerMeter' | 'lunghezzaMm' | 'nPezzi'>): number {
  return num(row.kgPerMeter) * (num(row.lunghezzaMm) / 1000) * num(row.nPezzi)
}

export function laserRowCost(row: LaserCutRow, pricing: ConsuntiviPricingConfig) {
  const kg = sheetWeightKg(row, pricing.densityFactorPerMaterial[row.materiale] ?? 7.85)
  const materialCost = kg * (pricing.materialPricePerKg[row.materiale] ?? 0)
  const gasCost = num(row.tempoMin) * (pricing.gasCostPerMin[row.gas] ?? 0)
  return { kg, materialCost, gasCost, total: materialCost + gasCost }
}

export function tubeRowCost(row: TubeLaserRow, pricing: ConsuntiviPricingConfig) {
  const kg = tubeWeightKg(row)
  const materialCost = kg * (pricing.materialPricePerKg[row.materiale] ?? 0)
  const timeCost = num(row.tempoMin) * num(pricing.tubeLaserRatePerMin)
  return { kg, materialCost, timeCost, total: materialCost + timeCost }
}

export function weldingRowCost(row: WeldingRow, pricing: ConsuntiviPricingConfig): number {
  return num(row.people) * num(row.hours) * num(pricing.weldingRatePerHour)
}

export function bendingRowCost(row: BendingRow, pricing: ConsuntiviPricingConfig): number {
  return num(row.hours) * num(pricing.bendingRatePerHour)
}

export function consuntivoTotals(c: Consuntivo, pricing: ConsuntiviPricingConfig): ConsuntivoTotals {
  const kgByMaterial = emptyKgByMaterial()
  let totalKg = 0
  let materialCost = 0
  let gasCost = 0
  let timeCost = 0

  for (const row of c.laserRows ?? []) {
    const r = laserRowCost(row, pricing)
    totalKg += r.kg
    kgByMaterial[row.materiale] += r.kg
    materialCost += r.materialCost
    gasCost += r.gasCost
  }
  for (const row of c.tubeRows ?? []) {
    const r = tubeRowCost(row, pricing)
    totalKg += r.kg
    kgByMaterial[row.materiale] += r.kg
    materialCost += r.materialCost
    timeCost += r.timeCost
  }
  const weldingCost = (c.weldingRows ?? []).reduce((sum, row) => sum + weldingRowCost(row, pricing), 0)
  const bendingCost = (c.bendingRows ?? []).reduce((sum, row) => sum + bendingRowCost(row, pricing), 0)

  // Difesa: assicura che tutti i materiali siano presenti nella mappa.
  for (const m of ALL_CONSUNTIVO_MATERIALS) if (!(m in kgByMaterial)) kgByMaterial[m] = 0

  return {
    totalKg,
    materialCost,
    gasCost,
    timeCost,
    weldingCost,
    bendingCost,
    total: materialCost + gasCost + timeCost + weldingCost + bendingCost,
    kgByMaterial,
  }
}
```

- [ ] **Step 5: Eseguire i test — devono passare**

Run: `npx vitest run src/utils/consuntiviCalc.test.ts`
Expected: PASS (tutti i test verdi).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/utils/consuntiviCalc.ts src/utils/consuntiviCalc.test.ts
git commit -m "feat(consuntivi): pure calc layer with vitest tests on Excel numbers"
```

---

### Task 3: Migration 008 + wiring SQLite (db.js)

**Files:**
- Create: `server/migrations/008_add_consuntivi.sql`
- Modify: `server/db.js`

**Interfaces:**
- Produces: tabelle `consuntivi`, `tube_profiles`; `TABLES.consuntivi`, `TABLES.tubeProfiles`; `getConsuntiviConfig(db?)`, `saveConsuntiviConfig(config, db?)`.

- [ ] **Step 1: Creare la migration** — `server/migrations/008_add_consuntivi.sql`

```sql
CREATE TABLE IF NOT EXISTS consuntivi (
  id TEXT PRIMARY KEY,
  work_item_id TEXT,
  date TEXT,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consuntivi_work_item ON consuntivi(work_item_id);
CREATE INDEX IF NOT EXISTS idx_consuntivi_date ON consuntivi(date);

CREATE TABLE IF NOT EXISTS tube_profiles (
  id TEXT PRIMARY KEY,
  categoria TEXT,
  label TEXT,
  active INTEGER DEFAULT 1,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tube_profiles_categoria ON tube_profiles(categoria);
```

- [ ] **Step 2: Registrare le tabelle in `TABLES`** — `server/db.js`

In the `const TABLES = { ... }` object, add after `calculatedStandardComponents: 'calculated_standard_components',`:

```javascript
  consuntivi: 'consuntivi',
  tubeProfiles: 'tube_profiles',
```

- [ ] **Step 3: Leggere le collezioni in `getAppData`** — `server/db.js`

In `getAppData`, inside the `normalizeAppData({ ... })` object, add after the `calculatedStandardComponents:` line:

```javascript
    consuntivi: readJsonRows(db, TABLES.consuntivi, 'date DESC, rowid ASC'),
    tubeProfiles: readJsonRows(db, TABLES.tubeProfiles, 'label COLLATE NOCASE ASC'),
```

- [ ] **Step 4: Salvare le collezioni in `saveAppData`** — `server/db.js`

In `saveAppData`, inside the transaction, add after `replaceCalculatedStandardComponents(db, safeData.calculatedStandardComponents ?? [], now)`:

```javascript
    replaceConsuntivi(db, safeData.consuntivi ?? [], now)
    replaceTubeProfiles(db, safeData.tubeProfiles ?? [], now)
```

- [ ] **Step 5: Definire le funzioni replace** — `server/db.js`

Add after `replaceCalculatedStandardComponents` function definition:

```javascript
function replaceConsuntivi(db, rows, now) {
  db.prepare('DELETE FROM consuntivi').run()
  const insert = db.prepare('INSERT INTO consuntivi (id, work_item_id, date, data, updated_at) VALUES (?, ?, ?, ?, ?)')
  for (const row of rows) {
    insert.run(row.id, row.workItemId || null, row.date || null, JSON.stringify(row), now)
  }
}

function replaceTubeProfiles(db, rows, now) {
  db.prepare('DELETE FROM tube_profiles').run()
  const insert = db.prepare('INSERT INTO tube_profiles (id, categoria, label, active, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
  for (const row of rows) {
    insert.run(row.id, row.categoria || null, row.label || null, row.active ? 1 : 0, JSON.stringify(row), now)
  }
}
```

- [ ] **Step 6: Aggiungere gli helper per la config prezzi** — `server/db.js`

Add after `getLastMutationAt` function definition:

```javascript
const CONSUNTIVI_CONFIG_KEY = 'consuntiviConfig'

export function getConsuntiviConfig(db = getDb()) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(CONSUNTIVI_CONFIG_KEY)
  if (!row || typeof row.value !== 'string') return null
  try {
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

export function saveConsuntiviConfig(config, db = getDb()) {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(CONSUNTIVI_CONFIG_KEY, JSON.stringify(config))
  return config
}
```

- [ ] **Step 7: Verificare che il server parta e le tabelle esistano**

Run (background non necessario, avvia e interrompi con Ctrl-C dopo la verifica): `npm run dev:backend`
In un altro terminale: `curl -s http://localhost:3000/api/health`
Expected: `{"ok":true,"service":"workload-ufficio-progettazione","storage":"sqlite"}` (la porta reale è quella stampata all'avvio; se diversa da 3000 usa quella).

Nota: `getAppData` chiamerà `normalizeAppData` che ancora non conosce `consuntivi`/`tubeProfiles` → verranno ignorati finché non si completa il Task 4. A questo punto verifica solo che il server parta senza crash e che il file `data/workload.db` contenga le tabelle:
Run: `node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('data/workload.db');console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('consuntivi','tube_profiles')\").all())"`
Expected: stampa due righe `{ name: 'consuntivi' }` e `{ name: 'tube_profiles' }`.

- [ ] **Step 8: Commit**

```bash
git add server/migrations/008_add_consuntivi.sql server/db.js
git commit -m "feat(consuntivi): migration 008 + sqlite wiring + pricing config helpers"
```

---

### Task 4: Normalizzazione backend + rotte API

**Files:**
- Create: `server/services/consuntiviConfig.js`
- Modify: `server/services/appData.js`
- Modify: `server/routes/index.js`
- Modify: `server/services/seedData.js`

**Interfaces:**
- Consumes: `getConsuntiviConfig`, `saveConsuntiviConfig` (Task 3).
- Produces: endpoint `GET/PUT /api/consuntivi-pricing` (admin-gated), `GET /api/consuntivi-settings` (pubblico); normalizzazione server di `consuntivi`/`tubeProfiles`; `DEFAULT_CONSUNTIVI_CONFIG` + `normalizeConsuntiviConfig` in `consuntiviConfig.js`.

- [ ] **Step 1: Creare la config di default + normalizzatore** — `server/services/consuntiviConfig.js`

```javascript
export const DEFAULT_CONSUNTIVI_CONFIG = {
  materialPricePerKg: { ferro: 1.3, inox: 4.5, zincato: 2, corten: 3 },
  gasCostPerMin: { ossigeno: 2.5, azoto: 3 },
  tubeLaserRatePerMin: 2.5,
  weldingRatePerHour: 35,
  bendingRatePerHour: 60,
  densityFactorPerMaterial: { ferro: 7.85, inox: 8.0, zincato: 7.85, corten: 7.85 },
}

const MATERIALS = ['ferro', 'inox', 'zincato', 'corten']
const GASES = ['ossigeno', 'azoto']

function nonNegativeNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function numberMap(raw, keys, defaults) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const out = {}
  for (const key of keys) out[key] = nonNegativeNumber(source[key], defaults[key])
  return out
}

export function normalizeConsuntiviConfig(input) {
  const o = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const d = DEFAULT_CONSUNTIVI_CONFIG
  return {
    materialPricePerKg: numberMap(o.materialPricePerKg, MATERIALS, d.materialPricePerKg),
    gasCostPerMin: numberMap(o.gasCostPerMin, GASES, d.gasCostPerMin),
    tubeLaserRatePerMin: nonNegativeNumber(o.tubeLaserRatePerMin, d.tubeLaserRatePerMin),
    weldingRatePerHour: nonNegativeNumber(o.weldingRatePerHour, d.weldingRatePerHour),
    bendingRatePerHour: nonNegativeNumber(o.bendingRatePerHour, d.bendingRatePerHour),
    densityFactorPerMaterial: numberMap(o.densityFactorPerMaterial, MATERIALS, d.densityFactorPerMaterial),
  }
}
```

- [ ] **Step 2: Estendere `appData.js` — valid sets, EMPTY, validazione, mapping, count, normalizer**

In `server/services/appData.js`:

(a) After `const VALID_WORKSHOP_ASSIGNMENT_STATUSES = new Set([...])` add:

```javascript
const VALID_CONSUNTIVO_MATERIALS = new Set(['ferro', 'inox', 'zincato', 'corten'])
const VALID_CONSUNTIVO_GAS = new Set(['ossigeno', 'azoto'])
const VALID_TUBE_CATEGORIES = new Set(['tubolari', 'tubi'])
```

(b) In `EMPTY_APP_DATA`, add after `calculatedStandardComponents: [],`:

```javascript
  consuntivi: [],
  tubeProfiles: [],
```

(c) In `normalizeAppData`, after the `calculatedStandardComponents` validation block, add:

```javascript
  if (root.consuntivi !== undefined && !Array.isArray(root.consuntivi)) {
    throw new Error('consuntivi deve essere un array oppure assente.')
  }
  if (root.tubeProfiles !== undefined && !Array.isArray(root.tubeProfiles)) {
    throw new Error('tubeProfiles deve essere un array oppure assente.')
  }
```

(d) In `normalizeAppData` return object, after `calculatedStandardComponents: ...`:

```javascript
    consuntivi: (root.consuntivi ?? []).map(normalizeConsuntivo).filter(Boolean),
    tubeProfiles: (root.tubeProfiles ?? []).map(normalizeTubeProfile).filter(Boolean),
```

(e) In `countAppData` return object, after `calculatedStandardComponents: ...`:

```javascript
    consuntivi: (data.consuntivi ?? []).length,
    tubeProfiles: (data.tubeProfiles ?? []).length,
```

(f) Add these normalizer functions (place them after `normalizeCalculatedStandardComponent`):

```javascript
function normalizeConsuntivoMaterial(value) {
  return VALID_CONSUNTIVO_MATERIALS.has(value) ? value : 'ferro'
}

function normalizeLaserCutRow(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id)) return null
  return {
    id: o.id,
    lunghezzaMm: numberOrZero(o.lunghezzaMm),
    larghezzaMm: numberOrZero(o.larghezzaMm),
    spessoreMm: numberOrZero(o.spessoreMm),
    materiale: normalizeConsuntivoMaterial(o.materiale),
    tempoMin: numberOrZero(o.tempoMin),
    gas: VALID_CONSUNTIVO_GAS.has(o.gas) ? o.gas : 'ossigeno',
  }
}

function normalizeTubeLaserRow(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id)) return null
  return {
    id: o.id,
    categoria: VALID_TUBE_CATEGORIES.has(o.categoria) ? o.categoria : 'tubolari',
    profileId: isString(o.profileId) ? o.profileId : '',
    profileLabel: isString(o.profileLabel) ? o.profileLabel : '',
    kgPerMeter: numberOrZero(o.kgPerMeter),
    materiale: normalizeConsuntivoMaterial(o.materiale),
    lunghezzaMm: numberOrZero(o.lunghezzaMm),
    nPezzi: nonNegativeInteger(o.nPezzi, 0),
    tempoMin: numberOrZero(o.tempoMin),
  }
}

function normalizeWeldingRow(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id)) return null
  return { id: o.id, people: nonNegativeInteger(o.people, 0), hours: numberOrZero(o.hours) }
}

function normalizeBendingRow(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id)) return null
  return { id: o.id, hours: numberOrZero(o.hours) }
}

function normalizeConsuntivo(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.workItemId)) return null
  const now = new Date().toISOString()
  return {
    id: o.id,
    workItemId: o.workItemId,
    workItemCode: isString(o.workItemCode) ? o.workItemCode : '',
    workItemTitle: isString(o.workItemTitle) ? o.workItemTitle : '',
    customer: isString(o.customer) ? o.customer : '',
    date: isNonEmptyString(o.date) ? o.date : now.slice(0, 10),
    operatorName: isString(o.operatorName) ? o.operatorName : '',
    laserRows: Array.isArray(o.laserRows) ? o.laserRows.map(normalizeLaserCutRow).filter(Boolean) : [],
    tubeRows: Array.isArray(o.tubeRows) ? o.tubeRows.map(normalizeTubeLaserRow).filter(Boolean) : [],
    weldingRows: Array.isArray(o.weldingRows) ? o.weldingRows.map(normalizeWeldingRow).filter(Boolean) : [],
    bendingRows: Array.isArray(o.bendingRows) ? o.bendingRows.map(normalizeBendingRow).filter(Boolean) : [],
    notes: isString(o.notes) ? o.notes : '',
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
}

function normalizeTubeProfile(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.label)) return null
  const now = new Date().toISOString()
  return {
    id: o.id,
    categoria: VALID_TUBE_CATEGORIES.has(o.categoria) ? o.categoria : 'tubolari',
    label: o.label.trim(),
    kgPerMeter: numberOrZero(o.kgPerMeter),
    active: typeof o.active === 'boolean' ? o.active : true,
    notes: isString(o.notes) ? o.notes : '',
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
}
```

- [ ] **Step 3: Aggiungere le collezioni a `APP_DATA_COLLECTIONS`** — `server/routes/index.js`

In the `const APP_DATA_COLLECTIONS = [ ... ]` array, add after `'calculatedStandardComponents',`:

```javascript
  'consuntivi',
  'tubeProfiles',
```

- [ ] **Step 4: Importare gli helper config nelle rotte** — `server/routes/index.js`

Update the import from `../db.js` (top of file) to also import `getConsuntiviConfig` and `saveConsuntiviConfig`:

```javascript
import {
  deleteEntity,
  getAppData,
  getCollection,
  getConsuntiviConfig,
  getDataRevision,
  getLastMutationAt,
  saveAppData,
  saveConsuntiviConfig,
  upsertEntity,
} from '../db.js'
```

Add a new import line after the `adminAuth.js` import block:

```javascript
import { DEFAULT_CONSUNTIVI_CONFIG, normalizeConsuntiviConfig } from '../services/consuntiviConfig.js'
```

- [ ] **Step 5: Registrare le rotte** — `server/routes/index.js`

IMPORTANT: le rotte custom `/consuntivi-pricing` e `/consuntivi-settings` usano path top-level distinti (NON `/consuntivi/...`) così non collidono con `PUT /consuntivi/:id` della collezione generica.

Inside `createApiRouter`, after the existing `registerCollectionRoutes(router, { apiName: 'workshop-assignments', ... })` block, add:

```javascript
  registerCollectionRoutes(router, {
    apiName: 'consuntivi',
    collection: 'consuntivi',
  })
  registerCollectionRoutes(router, {
    apiName: 'tube-profiles',
    collection: 'tubeProfiles',
  })

  // Config prezzi: densità pubblica (serve al calcolo kg lato operaio), prezzi protetti.
  router.get('/consuntivi-settings', (_req, res) => {
    const cfg = getConsuntiviConfig() ?? DEFAULT_CONSUNTIVI_CONFIG
    res.set('cache-control', 'no-store')
    res.json({ densityFactorPerMaterial: cfg.densityFactorPerMaterial })
  })

  router.get('/consuntivi-pricing', (req, res, next) => {
    try {
      requireAdminPassword(req)
      res.set('cache-control', 'no-store')
      res.json(getConsuntiviConfig() ?? DEFAULT_CONSUNTIVI_CONFIG)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })

  router.put('/consuntivi-pricing', (req, res, next) => {
    try {
      requireAdminPassword(req)
      const cfg = normalizeConsuntiviConfig(req.body)
      saveConsuntiviConfig(cfg)
      scheduleAutoBackup('consuntivi-pricing-updated')
      res.json(cfg)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })
```

- [ ] **Step 6: Aggiungere l'helper `requireAdminPassword`** — `server/routes/index.js`

Add near `peopleBaselineGuard` (module-level function):

```javascript
function requireAdminPassword(req) {
  const provided = req.get(ADMIN_PASSWORD_HEADER)
  if (!verifyAdminPassword(provided)) {
    const err = new Error('Configurazione prezzi protetta: password admin richiesta o errata.')
    err.statusCode = 403
    err.detail = 'consuntivi-pricing-protected'
    throw err
  }
}
```

- [ ] **Step 7: Seed backend** — `server/services/seedData.js`

In `freshSeedData`, in the returned object, add after `calculatedStandardComponents: [],`:

```javascript
    consuntivi: [],
    tubeProfiles: [],
```

- [ ] **Step 8: Verificare le rotte con curl**

Avvia il backend: `npm run dev:backend` (nota la porta stampata, es. 3000).

Verifica settings pubblici:
Run: `curl -s http://localhost:3000/api/consuntivi-settings`
Expected: `{"densityFactorPerMaterial":{"ferro":7.85,"inox":8,"zincato":7.85,"corten":7.85}}`

Verifica pricing SENZA password (se nessuna password admin è impostata, `verifyAdminPassword` ritorna true → 200; è il comportamento atteso finché non si imposta la password):
Run: `curl -s http://localhost:3000/api/consuntivi-pricing`
Expected: JSON completo con `materialPricePerKg`, `weldingRatePerHour:35`, ecc.

Imposta una password admin e verifica il 403:
Run: `curl -s -X POST http://localhost:3000/api/admin/set-password -H "content-type: application/json" -d '{"newPassword":"test123"}'`
Expected: `{"protected":true}`
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/consuntivi-pricing`
Expected: `403`
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/consuntivi-pricing -H "x-workload-admin-password: test123"`
Expected: `200`

Rimuovi la password di test (ripristina stato non protetto):
Run: `curl -s -X POST http://localhost:3000/api/admin/set-password -H "content-type: application/json" -d '{"currentPassword":"test123","newPassword":""}'`
Expected: `{"protected":false}`

Verifica GET app-data include le nuove collezioni:
Run: `curl -s http://localhost:3000/api/app-data | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('consuntivi',Array.isArray(j.consuntivi),'tubeProfiles',Array.isArray(j.tubeProfiles))})"`
Expected: `consuntivi true tubeProfiles true`

- [ ] **Step 9: Commit**

```bash
git add server/services/consuntiviConfig.js server/services/appData.js server/routes/index.js server/services/seedData.js
git commit -m "feat(consuntivi): backend normalization, collection routes, protected pricing endpoints"
```

---

### Task 5: Wiring frontend dati (apiClient, backup, demoData, services)

**Files:**
- Modify: `src/services/apiClient.ts`
- Modify: `src/utils/backup.ts`
- Modify: `src/data/demoData.ts`
- Create: `src/data/tubeProfiles.ts`
- Create: `src/services/consuntiviService.ts`
- Create: `src/services/tubeProfilesService.ts`

**Interfaces:**
- Consumes: tipi Task 1; endpoint Task 4.
- Produces: `fetchConsuntiviSettings()`, `fetchConsuntiviPricing(password)`, `saveConsuntiviPricing(config, password)` in apiClient; `DEFAULT_TUBE_PROFILES` in `src/data/tubeProfiles.ts`; service CRUD `createConsuntivo/updateConsuntivo/deleteConsuntivo` e `createTubeProfile/updateTubeProfile/deleteTubeProfile` (firma: `(data, input) => { data, id }` per create; `(data, id, patch) => data` per update; `(data, id) => data` per delete).

- [ ] **Step 1: apiClient — `withAppDataDefaults` + endpoint config** — `src/services/apiClient.ts`

(a) Import the config type at top:

```typescript
import type { AppData, ConsuntiviPricingConfig, ConsuntivoMaterial, MachineType } from '../types'
```

(b) In `withAppDataDefaults` return object, add after `calculatedStandardComponents: ...`:

```typescript
    consuntivi: Array.isArray(data.consuntivi) ? data.consuntivi : [],
    tubeProfiles: Array.isArray(data.tubeProfiles) ? data.tubeProfiles : [],
```

(c) Add at end of file:

```typescript
export interface ConsuntiviSettings {
  densityFactorPerMaterial: Record<ConsuntivoMaterial, number>
}

export function fetchConsuntiviSettings(): Promise<ConsuntiviSettings> {
  return request<ConsuntiviSettings>('/api/consuntivi-settings')
}

export function fetchConsuntiviPricing(password: string): Promise<ConsuntiviPricingConfig> {
  return request<ConsuntiviPricingConfig>('/api/consuntivi-pricing', {
    headers: { 'x-workload-admin-password': password },
  })
}

export function saveConsuntiviPricing(config: ConsuntiviPricingConfig, password: string): Promise<ConsuntiviPricingConfig> {
  return request<ConsuntiviPricingConfig>('/api/consuntivi-pricing', {
    method: 'PUT',
    headers: { 'x-workload-admin-password': password },
    body: JSON.stringify(config),
  })
}
```

- [ ] **Step 2: backup.ts — counts + payload + validazione** — `src/utils/backup.ts`

(a) In `interface BackupCounts`, add after `calculatedStandardComponents: number`:

```typescript
  consuntivi: number
  tubeProfiles: number
```

(b) In `createBackupPayload`, in the `backupData` object, add after `calculatedStandardComponents: data.calculatedStandardComponents ?? [],`:

```typescript
    consuntivi: data.consuntivi ?? [],
    tubeProfiles: data.tubeProfiles ?? [],
```

(c) In `countAppData`, change its parameter `Pick<...>` type to include the two keys and add to the return object. Replace the return object's last line region to include:

```typescript
    calculatedStandardComponents: (data.calculatedStandardComponents ?? []).length,
    consuntivi: (data.consuntivi ?? []).length,
    tubeProfiles: (data.tubeProfiles ?? []).length,
```

And update the `countAppData` signature `Pick<AppData, ...>` to append `| 'consuntivi' | 'tubeProfiles'`.

(d) In `validateBackupPayload`, the final `data` object is built as `{ ...root, people, ... }`. Since `...root` preserves `consuntivi`/`tubeProfiles` if present, add explicit passthrough (safe defaults) after `calculatedStandardComponents,` in that object:

```typescript
    consuntivi: Array.isArray(rawConsuntivi) ? rawConsuntivi : [],
    tubeProfiles: Array.isArray(rawTubeProfiles) ? rawTubeProfiles : [],
```

And near the other `const rawX = root.X` declarations add:

```typescript
  const rawConsuntivi = root.consuntivi
  const rawTubeProfiles = root.tubeProfiles
```

(Nota: i consuntivi/profili nel backup vengono passati così come sono; la normalizzazione avviene comunque lato server all'import via `normalizeAppData`.)

- [ ] **Step 3: Catalogo profili di default** — `src/data/tubeProfiles.ts`

```typescript
import type { TubeProfile } from '../types'

/** kg/m nominali (area sezione × 0.00785). Editabili dall'admin nella libreria. */
const RAW: Array<Pick<TubeProfile, 'id' | 'categoria' | 'label' | 'kgPerMeter'>> = [
  { id: 'tp_def_quad_20x20x2', categoria: 'tubolari', label: '20x20x2', kgPerMeter: 1.13 },
  { id: 'tp_def_quad_25x25x2', categoria: 'tubolari', label: '25x25x2', kgPerMeter: 1.44 },
  { id: 'tp_def_quad_30x30x2', categoria: 'tubolari', label: '30x30x2', kgPerMeter: 1.76 },
  { id: 'tp_def_quad_40x40x2', categoria: 'tubolari', label: '40x40x2', kgPerMeter: 2.39 },
  { id: 'tp_def_quad_40x40x3', categoria: 'tubolari', label: '40x40x3', kgPerMeter: 3.49 },
  { id: 'tp_def_quad_50x50x3', categoria: 'tubolari', label: '50x50x3', kgPerMeter: 4.43 },
  { id: 'tp_def_quad_60x60x3', categoria: 'tubolari', label: '60x60x3', kgPerMeter: 5.37 },
  { id: 'tp_def_quad_80x80x4', categoria: 'tubolari', label: '80x80x4', kgPerMeter: 9.55 },
  { id: 'tp_def_rett_40x20x2', categoria: 'tubolari', label: '40x20x2', kgPerMeter: 1.76 },
  { id: 'tp_def_rett_60x40x3', categoria: 'tubolari', label: '60x40x3', kgPerMeter: 4.43 },
  { id: 'tp_def_rett_80x40x3', categoria: 'tubolari', label: '80x40x3', kgPerMeter: 5.37 },
  { id: 'tp_def_tondo_33x2_6', categoria: 'tubi', label: 'Ø33.7x2.6', kgPerMeter: 1.99 },
  { id: 'tp_def_tondo_42x2_6', categoria: 'tubi', label: 'Ø42.4x2.6', kgPerMeter: 2.55 },
  { id: 'tp_def_tondo_48x2_9', categoria: 'tubi', label: 'Ø48.3x2.9', kgPerMeter: 3.25 },
  { id: 'tp_def_tondo_60x2_9', categoria: 'tubi', label: 'Ø60.3x2.9', kgPerMeter: 4.10 },
]

export const DEFAULT_TUBE_PROFILES: TubeProfile[] = RAW.map((p) => ({
  ...p,
  active: true,
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}))

/** Unisce i profili di default con quelli personalizzati salvati (custom vincono per id). */
export function mergeTubeProfiles(custom: TubeProfile[]): TubeProfile[] {
  const byId = new Map<string, TubeProfile>()
  for (const p of DEFAULT_TUBE_PROFILES) byId.set(p.id, p)
  for (const p of custom) byId.set(p.id, p)
  return Array.from(byId.values()).filter((p) => p.active)
}
```

- [ ] **Step 4: demoData** — `src/data/demoData.ts`

In the returned demo object (the one used by `freshDemoData`), add after `calculatedStandardComponents: [],` (or wherever the collections literal is):

```typescript
    consuntivi: [],
    tubeProfiles: [],
```

- [ ] **Step 5: Service consuntivi** — `src/services/consuntiviService.ts`

```typescript
import type { AppData, Consuntivo, WorkItem } from '../types'
import { logEntry } from '../utils/activityLog'
import { uid } from '../utils/format'

export type CreateConsuntivoInput = Omit<Consuntivo, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateConsuntivoInput = Partial<Omit<Consuntivo, 'id' | 'createdAt' | 'updatedAt'>>

function nowISO(): string {
  return new Date().toISOString()
}

function label(c: Consuntivo): string {
  return `${c.workItemCode || c.workItemId} · ${c.date}`
}

export function consuntivoFromWorkItem(workItem: WorkItem, date: string, operatorName = ''): CreateConsuntivoInput {
  return {
    workItemId: workItem.id,
    workItemCode: workItem.code,
    workItemTitle: workItem.title,
    customer: workItem.customer,
    date,
    operatorName,
    laserRows: [],
    tubeRows: [],
    weldingRows: [],
    bendingRows: [],
    notes: '',
  }
}

export function createConsuntivo(data: AppData, input: CreateConsuntivoInput): { data: AppData; id: string } {
  const at = nowISO()
  const consuntivo: Consuntivo = { ...input, id: uid('cons'), createdAt: at, updatedAt: at }
  const nextData: AppData = { ...data, consuntivi: [consuntivo, ...(data.consuntivi ?? [])] }
  return {
    id: consuntivo.id,
    data: logEntry(nextData, {
      entityType: 'system',
      entityId: consuntivo.id,
      action: 'created',
      title: `Consuntivo creato: ${label(consuntivo)}`,
      description: `${consuntivo.laserRows.length} righe laser · ${consuntivo.tubeRows.length} righe tubi`,
    }),
  }
}

export function updateConsuntivo(data: AppData, id: string, patch: UpdateConsuntivoInput): AppData {
  const before = (data.consuntivi ?? []).find((c) => c.id === id)
  if (!before) return data
  const after: Consuntivo = { ...before, ...patch, id: before.id, createdAt: before.createdAt, updatedAt: nowISO() }
  const nextData: AppData = {
    ...data,
    consuntivi: (data.consuntivi ?? []).map((c) => (c.id === id ? after : c)),
  }
  return logEntry(nextData, {
    entityType: 'system',
    entityId: id,
    action: 'updated',
    title: `Consuntivo aggiornato: ${label(after)}`,
  })
}

export function deleteConsuntivo(data: AppData, id: string): AppData {
  const before = (data.consuntivi ?? []).find((c) => c.id === id)
  if (!before) return data
  const nextData: AppData = { ...data, consuntivi: (data.consuntivi ?? []).filter((c) => c.id !== id) }
  return logEntry(nextData, {
    entityType: 'system',
    entityId: id,
    action: 'deleted',
    title: `Consuntivo eliminato: ${label(before)}`,
  })
}
```

Nota: `entityType: 'system'` è già un valore valido di `ActivityLogEntityType` (vedi `ALL_ACTIVITY_ENTITY_TYPES`), quindi non serve estendere l'enum.

- [ ] **Step 6: Service tube profiles** — `src/services/tubeProfilesService.ts`

```typescript
import type { AppData, TubeProfile } from '../types'
import { logEntry } from '../utils/activityLog'
import { uid } from '../utils/format'

export type CreateTubeProfileInput = Omit<TubeProfile, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateTubeProfileInput = Partial<Omit<TubeProfile, 'id' | 'createdAt' | 'updatedAt'>>

function nowISO(): string {
  return new Date().toISOString()
}

export function createTubeProfile(data: AppData, input: CreateTubeProfileInput): { data: AppData; id: string } {
  const at = nowISO()
  const profile: TubeProfile = { ...input, id: uid('tp'), createdAt: at, updatedAt: at }
  const nextData: AppData = { ...data, tubeProfiles: [...(data.tubeProfiles ?? []), profile] }
  return {
    id: profile.id,
    data: logEntry(nextData, {
      entityType: 'system',
      entityId: profile.id,
      action: 'created',
      title: `Profilo tubo creato: ${profile.label}`,
    }),
  }
}

export function updateTubeProfile(data: AppData, id: string, patch: UpdateTubeProfileInput): AppData {
  const before = (data.tubeProfiles ?? []).find((p) => p.id === id)
  if (!before) return data
  const after: TubeProfile = { ...before, ...patch, id: before.id, createdAt: before.createdAt, updatedAt: nowISO() }
  return logEntry({
    ...data,
    tubeProfiles: (data.tubeProfiles ?? []).map((p) => (p.id === id ? after : p)),
  }, {
    entityType: 'system',
    entityId: id,
    action: 'updated',
    title: `Profilo tubo aggiornato: ${after.label}`,
  })
}

export function deleteTubeProfile(data: AppData, id: string): AppData {
  const before = (data.tubeProfiles ?? []).find((p) => p.id === id)
  if (!before) return data
  return logEntry({
    ...data,
    tubeProfiles: (data.tubeProfiles ?? []).filter((p) => p.id !== id),
  }, {
    entityType: 'system',
    entityId: id,
    action: 'deleted',
    title: `Profilo tubo eliminato: ${before.label}`,
  })
}
```

- [ ] **Step 7: Verificare typecheck**

Run: `npm run typecheck`
Expected: PASS. (Rimane un solo tipo di errore possibile se manca il wiring in DataProvider, ma quei file non usano ancora i nuovi service — quindi typecheck deve passare pulito.)

- [ ] **Step 8: Commit**

```bash
git add src/services/apiClient.ts src/utils/backup.ts src/data/demoData.ts src/data/tubeProfiles.ts src/services/consuntiviService.ts src/services/tubeProfilesService.ts
git commit -m "feat(consuntivi): frontend data wiring (apiClient, backup, demo, services)"
```

---

### Task 6: DataProvider — esposizione azioni CRUD

**Files:**
- Modify: `src/state/DataProvider.tsx`

**Interfaces:**
- Consumes: service Task 5.
- Produces: context `useData()` con `consuntivi`, `tubeProfiles`, `createConsuntivo`, `updateConsuntivo`, `deleteConsuntivo`, `createTubeProfile`, `updateTubeProfile`, `deleteTubeProfile`.

- [ ] **Step 1: Import dei service** — dopo l'import di `workshopAssignmentsService`, aggiungere:

```typescript
import {
  createConsuntivo as svcCreateConsuntivo,
  deleteConsuntivo as svcDeleteConsuntivo,
  updateConsuntivo as svcUpdateConsuntivo,
} from '../services/consuntiviService'
import type { CreateConsuntivoInput, UpdateConsuntivoInput } from '../services/consuntiviService'
import {
  createTubeProfile as svcCreateTubeProfile,
  deleteTubeProfile as svcDeleteTubeProfile,
  updateTubeProfile as svcUpdateTubeProfile,
} from '../services/tubeProfilesService'
import type { CreateTubeProfileInput, UpdateTubeProfileInput } from '../services/tubeProfilesService'
```

- [ ] **Step 2: Estendere l'import di tipo `type { ... } from '../types'`**

Add `Consuntivo, TubeProfile` to the existing `import type { ... } from '../types'` at line 3.

- [ ] **Step 3: Estendere `interface DataContextValue`** — aggiungere dopo `workshopAssignments: WorkshopAssignment[]`:

```typescript
  consuntivi: Consuntivo[]
  tubeProfiles: TubeProfile[]
```

And after the workshop assignments action signatures, add:

```typescript
  // consuntivi
  createConsuntivo: (input: CreateConsuntivoInput) => string
  updateConsuntivo: (id: string, patch: UpdateConsuntivoInput) => void
  deleteConsuntivo: (id: string) => void
  // tube profiles
  createTubeProfile: (input: CreateTubeProfileInput) => string
  updateTubeProfile: (id: string, patch: UpdateTubeProfileInput) => void
  deleteTubeProfile: (id: string) => void
```

- [ ] **Step 4: Definire i callback** — dopo `replaceWorkshopAssignmentsForOutput` callback, aggiungere:

```typescript
  const createConsuntivo = useCallback((input: CreateConsuntivoInput): string => {
    const result = svcCreateConsuntivo(dataRef.current, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateConsuntivo = useCallback((id: string, patch: UpdateConsuntivoInput) => {
    commitData(svcUpdateConsuntivo(dataRef.current, id, patch))
  }, [commitData])

  const deleteConsuntivo = useCallback((id: string) => {
    commitData(svcDeleteConsuntivo(dataRef.current, id), { risky: true })
  }, [commitData])

  const createTubeProfile = useCallback((input: CreateTubeProfileInput): string => {
    const result = svcCreateTubeProfile(dataRef.current, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateTubeProfile = useCallback((id: string, patch: UpdateTubeProfileInput) => {
    commitData(svcUpdateTubeProfile(dataRef.current, id, patch))
  }, [commitData])

  const deleteTubeProfile = useCallback((id: string) => {
    commitData(svcDeleteTubeProfile(dataRef.current, id), { risky: true })
  }, [commitData])
```

- [ ] **Step 5: Esporre nel `value` useMemo**

In the `value` object add after `workshopAssignments: data.workshopAssignments,`:

```typescript
    consuntivi: data.consuntivi ?? [],
    tubeProfiles: data.tubeProfiles ?? [],
```

And after `replaceWorkshopAssignmentsForOutput,` add:

```typescript
    createConsuntivo,
    updateConsuntivo,
    deleteConsuntivo,
    createTubeProfile,
    updateTubeProfile,
    deleteTubeProfile,
```

And add the same six identifiers to the `useMemo` dependency array (after `replaceWorkshopAssignmentsForOutput,`):

```typescript
    createConsuntivo, updateConsuntivo, deleteConsuntivo,
    createTubeProfile, updateTubeProfile, deleteTubeProfile,
```

- [ ] **Step 6: Verificare typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Verifica manuale persistenza**

Avvia full dev: `npm run dev`. Apri l'app nel browser (URL stampato). In DevTools Console:

```js
// crea un consuntivo di test tramite il context non è possibile da console;
```
Invece verifica via API che il PUT app-data conservi le collezioni: dopo aver completato il Task 7 (UI) questa verifica sarà end-to-end. Per ora, verifica typecheck + build:
Run: `npm run build`
Expected: build completa senza errori TypeScript.

- [ ] **Step 8: Commit**

```bash
git add src/state/DataProvider.tsx
git commit -m "feat(consuntivi): expose consuntivi and tube profiles CRUD via DataProvider"
```

---

### Task 7: UI data-entry (tab, selettore commessa, form)

**Files:**
- Create: `src/components/WorkItemAutocomplete.tsx`
- Create: `src/components/ConsuntivoFormModal.tsx`
- Create: `src/components/ConsuntiviView.tsx`
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `useData()` (Task 6), tipi + calc (Task 1/2), `mergeTubeProfiles`/`DEFAULT_TUBE_PROFILES` (Task 5), `fetchConsuntiviSettings` (Task 5).
- Produces: componente `ConsuntiviView` (default named export), tab `consuntivi` in Dashboard.

- [ ] **Step 1: `WorkItemAutocomplete`** — `src/components/WorkItemAutocomplete.tsx`

```tsx
import { useMemo, useRef, useState, useEffect } from 'react'
import type { WorkItem } from '../types'
import { useData } from '../state/DataProvider'

interface Props {
  value: string
  onPick: (workItem: WorkItem) => void
  onText: (text: string) => void
  placeholder?: string
  className?: string
}

export function WorkItemAutocomplete({ value, onPick, onText, placeholder, className }: Props) {
  const { data } = useData()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const results = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (q.length < 2) return []
    return data.workItems
      .filter((w) => w.type === 'commessa')
      .filter((w) => w.code.toLowerCase().includes(q) || w.title.toLowerCase().includes(q) || w.customer.toLowerCase().includes(q))
      .slice(0, 8)
  }, [data.workItems, value])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => { setHighlight(0) }, [results.length])

  function pick(w: WorkItem) {
    onPick(w)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <input
        className="input-base"
        value={value}
        placeholder={placeholder ?? 'Cerca commessa per codice, titolo o cliente…'}
        onChange={(e) => { onText(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(results[highlight]) }
          else if (e.key === 'Escape') { setOpen(false) }
        }}
      />
      {open && results.length > 0 && (
        <div className="menu-surface absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto scroll-thin">
          {results.map((w, i) => (
            <button
              key={w.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(w) }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs transition ${i === highlight ? 'bg-slate-800' : 'hover:bg-slate-800/70'}`}
            >
              <span className="text-sm font-medium text-slate-100">{w.code || '(senza codice)'} · {w.title}</span>
              <span className="text-[11px] text-slate-400">{w.customer || '—'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `ConsuntivoFormModal`** — `src/components/ConsuntivoFormModal.tsx`

Form con le 4 sezioni a righe dinamiche. Mostra kg live per riga (da `sheetWeightKg`/`tubeWeightKg` con densità pubblica). NON mostra costi. Il selettore profilo tubo usa `mergeTubeProfiles(tubeProfiles)`. Usa `Modal` (size `xl`) e `FormField`.

```tsx
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { WorkItemAutocomplete } from './WorkItemAutocomplete'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { mergeTubeProfiles } from '../data/tubeProfiles'
import { sheetWeightKg, tubeWeightKg } from '../utils/consuntiviCalc'
import { consuntivoFromWorkItem } from '../services/consuntiviService'
import {
  ALL_CONSUNTIVO_GAS,
  ALL_CONSUNTIVO_MATERIALS,
  ALL_TUBE_CATEGORIES,
  CONSUNTIVO_MATERIAL_LABELS,
  TUBE_CATEGORY_LABELS,
} from '../types'
import type {
  BendingRow,
  Consuntivo,
  ConsuntivoMaterial,
  LaserCutRow,
  TubeCategory,
  TubeLaserRow,
  WeldingRow,
  WorkItem,
} from '../types'

interface Props {
  open: boolean
  onClose: () => void
  /** consuntivo esistente da modificare, oppure null per crearne uno nuovo */
  editing: Consuntivo | null
  densityFactorPerMaterial: Record<ConsuntivoMaterial, number>
}

function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export function ConsuntivoFormModal({ open, onClose, editing, densityFactorPerMaterial }: Props) {
  const { data, tubeProfiles, createConsuntivo, updateConsuntivo } = useData()
  const toast = useToast()
  const profiles = useMemo(() => mergeTubeProfiles(tubeProfiles), [tubeProfiles])

  const [workItemText, setWorkItemText] = useState(editing ? `${editing.workItemCode} · ${editing.workItemTitle}` : '')
  const [workItem, setWorkItem] = useState<WorkItem | null>(
    editing ? data.workItems.find((w) => w.id === editing.workItemId) ?? null : null,
  )
  const [date, setDate] = useState(editing?.date ?? todayISO())
  const [operatorName, setOperatorName] = useState(editing?.operatorName ?? '')
  const [laserRows, setLaserRows] = useState<LaserCutRow[]>(editing?.laserRows ?? [])
  const [tubeRows, setTubeRows] = useState<TubeLaserRow[]>(editing?.tubeRows ?? [])
  const [weldingRows, setWeldingRows] = useState<WeldingRow[]>(editing?.weldingRows ?? [])
  const [bendingRows, setBendingRows] = useState<BendingRow[]>(editing?.bendingRows ?? [])
  const [notes, setNotes] = useState(editing?.notes ?? '')

  function addLaser() {
    setLaserRows((r) => [...r, { id: rid('r'), lunghezzaMm: 0, larghezzaMm: 0, spessoreMm: 0, materiale: 'ferro', tempoMin: 0, gas: 'ossigeno' }])
  }
  function addTube() {
    const first = profiles[0]
    setTubeRows((r) => [...r, {
      id: rid('t'), categoria: first?.categoria ?? 'tubolari', profileId: first?.id ?? '', profileLabel: first?.label ?? '',
      kgPerMeter: first?.kgPerMeter ?? 0, materiale: 'ferro', lunghezzaMm: 0, nPezzi: 1, tempoMin: 0,
    }])
  }
  function addWelding() { setWeldingRows((r) => [...r, { id: rid('w'), people: 1, hours: 0 }]) }
  function addBending() { setBendingRows((r) => [...r, { id: rid('b'), hours: 0 }]) }

  function setLaser(id: string, patch: Partial<LaserCutRow>) {
    setLaserRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }
  function setTube(id: string, patch: Partial<TubeLaserRow>) {
    setTubeRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function pickProfile(rowId: string, profileId: string) {
    const p = profiles.find((x) => x.id === profileId)
    if (!p) return
    setTube(rowId, { profileId: p.id, profileLabel: p.label, kgPerMeter: p.kgPerMeter, categoria: p.categoria })
  }

  function handleSave() {
    if (!workItem) { toast.error('Seleziona una commessa.'); return }
    const payload = {
      ...consuntivoFromWorkItem(workItem, date, operatorName),
      laserRows, tubeRows, weldingRows, bendingRows, notes,
    }
    if (editing) {
      updateConsuntivo(editing.id, payload)
      toast.success('Consuntivo aggiornato.')
    } else {
      createConsuntivo(payload)
      toast.success('Consuntivo creato.')
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Modifica consuntivo' : 'Nuovo consuntivo'}
      subtitle="Taglio laser · Laser tubi · Saldatura · Piega"
      size="xl"
      footer={(
        <>
          <button className="btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn-primary" onClick={handleSave}>Salva</button>
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FormField label="Commessa" required className="md:col-span-2">
          <WorkItemAutocomplete
            value={workItemText}
            onText={(t) => { setWorkItemText(t); setWorkItem(null) }}
            onPick={(w) => { setWorkItem(w); setWorkItemText(`${w.code} · ${w.title}`) }}
          />
        </FormField>
        <FormField label="Data">
          <input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Operatore" className="mt-3">
        <input className="input-base" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder="Nome operaio (facoltativo)" />
      </FormField>

      {/* SEZIONE TAGLIO LASER */}
      <Section title="Taglio laser" onAdd={addLaser}>
        {laserRows.map((row) => {
          const kg = sheetWeightKg(row, densityFactorPerMaterial[row.materiale] ?? 7.85)
          return (
            <div key={row.id} className="grid grid-cols-2 items-end gap-2 md:grid-cols-8">
              <NumInput label="Lungh. (mm)" value={row.lunghezzaMm} onChange={(v) => setLaser(row.id, { lunghezzaMm: v })} />
              <NumInput label="Largh. (mm)" value={row.larghezzaMm} onChange={(v) => setLaser(row.id, { larghezzaMm: v })} />
              <NumInput label="Spess. (mm)" value={row.spessoreMm} onChange={(v) => setLaser(row.id, { spessoreMm: v })} step="0.1" />
              <SelectInput label="Materiale" value={row.materiale} options={ALL_CONSUNTIVO_MATERIALS.map((m) => [m, CONSUNTIVO_MATERIAL_LABELS[m]])} onChange={(v) => setLaser(row.id, { materiale: v as ConsuntivoMaterial })} />
              <NumInput label="Tempo (min)" value={row.tempoMin} onChange={(v) => setLaser(row.id, { tempoMin: v })} step="0.1" />
              <SelectInput label="Gas" value={row.gas} options={ALL_CONSUNTIVO_GAS.map((g) => [g, g])} onChange={(v) => setLaser(row.id, { gas: v as LaserCutRow['gas'] })} />
              <div className="text-xs text-slate-300"><span className="block text-[11px] uppercase text-slate-500">kg</span>{kg.toFixed(1)}</div>
              <button className="btn-icon" onClick={() => setLaserRows((r) => r.filter((x) => x.id !== row.id))} aria-label="Rimuovi">✕</button>
            </div>
          )
        })}
      </Section>

      {/* SEZIONE LASER TUBI */}
      <Section title="Laser tubi" onAdd={addTube}>
        {tubeRows.map((row) => {
          const kg = tubeWeightKg(row)
          const catProfiles = profiles.filter((p) => p.categoria === row.categoria)
          return (
            <div key={row.id} className="grid grid-cols-2 items-end gap-2 md:grid-cols-8">
              <SelectInput label="Categoria" value={row.categoria} options={ALL_TUBE_CATEGORIES.map((c) => [c, TUBE_CATEGORY_LABELS[c]])} onChange={(v) => setTube(row.id, { categoria: v as TubeCategory })} />
              <SelectInput label="Profilo" value={row.profileId} options={catProfiles.map((p) => [p.id, `${p.label} (${p.kgPerMeter} kg/m)`])} onChange={(v) => pickProfile(row.id, v)} />
              <SelectInput label="Materiale" value={row.materiale} options={ALL_CONSUNTIVO_MATERIALS.map((m) => [m, CONSUNTIVO_MATERIAL_LABELS[m]])} onChange={(v) => setTube(row.id, { materiale: v as ConsuntivoMaterial })} />
              <NumInput label="Lungh. (mm)" value={row.lunghezzaMm} onChange={(v) => setTube(row.id, { lunghezzaMm: v })} />
              <NumInput label="N° pezzi" value={row.nPezzi} onChange={(v) => setTube(row.id, { nPezzi: v })} />
              <NumInput label="Tempo (min)" value={row.tempoMin} onChange={(v) => setTube(row.id, { tempoMin: v })} step="0.1" />
              <div className="text-xs text-slate-300"><span className="block text-[11px] uppercase text-slate-500">kg</span>{kg.toFixed(1)}</div>
              <button className="btn-icon" onClick={() => setTubeRows((r) => r.filter((x) => x.id !== row.id))} aria-label="Rimuovi">✕</button>
            </div>
          )
        })}
      </Section>

      {/* SALDATURA */}
      <Section title="Saldatura" onAdd={addWelding}>
        {weldingRows.map((row) => (
          <div key={row.id} className="grid grid-cols-2 items-end gap-2 md:grid-cols-4">
            <NumInput label="N° persone" value={row.people} onChange={(v) => setWeldingRows((r) => r.map((x) => (x.id === row.id ? { ...x, people: v } : x)))} />
            <NumInput label="Ore" value={row.hours} onChange={(v) => setWeldingRows((r) => r.map((x) => (x.id === row.id ? { ...x, hours: v } : x)))} step="0.1" />
            <button className="btn-icon" onClick={() => setWeldingRows((r) => r.filter((x) => x.id !== row.id))} aria-label="Rimuovi">✕</button>
          </div>
        ))}
      </Section>

      {/* PIEGA */}
      <Section title="Piega" onAdd={addBending}>
        {bendingRows.map((row) => (
          <div key={row.id} className="grid grid-cols-2 items-end gap-2 md:grid-cols-4">
            <NumInput label="Ore" value={row.hours} onChange={(v) => setBendingRows((r) => r.map((x) => (x.id === row.id ? { ...x, hours: v } : x)))} step="0.1" />
            <button className="btn-icon" onClick={() => setBendingRows((r) => r.filter((x) => x.id !== row.id))} aria-label="Rimuovi">✕</button>
          </div>
        ))}
      </Section>

      <FormField label="Note" className="mt-3">
        <textarea className="input-base" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>
    </Modal>
  )
}

function Section({ title, onAdd, children }: { title: string; onAdd: () => void; children: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <button className="btn-ghost text-xs" onClick={onAdd}>+ Aggiungi riga</button>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function NumInput({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <input type="number" step={step ?? '1'} className="input-base" value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
    </label>
  )
}

function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <select className="input-base" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}
```

- [ ] **Step 3: `ConsuntiviView`** — `src/components/ConsuntiviView.tsx`

Lista consuntivi (filtro commessa/data), bottone "Nuovo consuntivo", apertura form; bottoni admin verso configuratore prezzi / catalogo profili / report (i modali arrivano nei Task 8/9 — per ora bottoni che aprono stati locali; nel Task 8/9 verranno collegati ai relativi componenti). Carica la densità pubblica via `fetchConsuntiviSettings` (fallback ai default di `DEFAULT_CONSUNTIVI_PRICING`).

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useData } from '../state/DataProvider'
import { ConsuntivoFormModal } from './ConsuntivoFormModal'
import { fetchConsuntiviSettings } from '../services/apiClient'
import { DEFAULT_CONSUNTIVI_PRICING } from '../utils/consuntiviCalc'
import type { Consuntivo, ConsuntivoMaterial } from '../types'

export function ConsuntiviView() {
  const { consuntivi, deleteConsuntivo } = useData()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Consuntivo | null>(null)
  const [filter, setFilter] = useState('')
  const [density, setDensity] = useState<Record<ConsuntivoMaterial, number>>(DEFAULT_CONSUNTIVI_PRICING.densityFactorPerMaterial)

  useEffect(() => {
    let cancelled = false
    fetchConsuntiviSettings()
      .then((s) => { if (!cancelled && s?.densityFactorPerMaterial) setDensity(s.densityFactorPerMaterial) })
      .catch(() => { /* fallback ai default */ })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return consuntivi
    return consuntivi.filter((c) =>
      c.workItemCode.toLowerCase().includes(q) ||
      c.workItemTitle.toLowerCase().includes(q) ||
      c.customer.toLowerCase().includes(q) ||
      c.date.includes(q))
  }, [consuntivi, filter])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Consuntivi</h2>
        <div className="flex items-center gap-2">
          <input className="input-base w-64" placeholder="Filtra per commessa, cliente, data…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true) }}>+ Nuovo consuntivo</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800/80">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/40 text-left text-[11px] uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Commessa</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Righe</th>
              <th className="px-3 py-2">Operatore</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                <td className="px-3 py-2">{c.date}</td>
                <td className="px-3 py-2">{c.workItemCode} · {c.workItemTitle}</td>
                <td className="px-3 py-2">{c.customer || '—'}</td>
                <td className="px-3 py-2 text-slate-400">{c.laserRows.length} laser · {c.tubeRows.length} tubi · {c.weldingRows.length} sald. · {c.bendingRows.length} piega</td>
                <td className="px-3 py-2 text-slate-400">{c.operatorName || '—'}</td>
                <td className="px-3 py-2 text-right">
                  <button className="btn-ghost text-xs" onClick={() => { setEditing(c); setFormOpen(true) }}>Modifica</button>
                  <button className="btn-ghost text-xs text-red-300" onClick={() => { if (confirm('Eliminare il consuntivo?')) deleteConsuntivo(c.id) }}>Elimina</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Nessun consuntivo. Crea il primo con "+ Nuovo consuntivo".</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <ConsuntivoFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          editing={editing}
          densityFactorPerMaterial={density}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Registrare il tab in Dashboard** — `src/components/Dashboard.tsx`

(a) Add lazy import near the other lazy imports (after the last existing one):

```typescript
const Consuntivi = lazy(() => import('./ConsuntiviView').then((m) => ({ default: m.ConsuntiviView })))
```

(b) Extend the `MainTab` union type — add `| 'consuntivi'`.

(c) In the `TABS` array, add an entry (gruppo `officina`):

```typescript
  { id: 'consuntivi', label: 'Consuntivi', icon: 'M9 17V7h6v10M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z', hint: 'Consuntivi lavorazioni officina', group: 'officina' },
```

(d) In the render chain (the `tab === 'x' ? (...) :` sequence), add before the final fallback:

```tsx
      ) : tab === 'consuntivi' ? (
        <Consuntivi />
```

(Match exactly the surrounding JSX/parenthesization style of the existing branches.)

- [ ] **Step 5: Verifica typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Verifica manuale end-to-end**

Run: `npm run dev`. Nel browser:
1. Apri il tab "Consuntivi".
2. "+ Nuovo consuntivo" → seleziona una commessa (l'autocomplete mostra le commesse demo), imposta data.
3. Aggiungi una riga taglio laser: 1500 / 3000 / 1.5 / zincato → verifica che la colonna **kg** mostri ~44.1 (densità zincato 7.85 → 1.5·3·(1.5·7.85)=52.99... ). Con densità default zincato 7.85: `1.5*3.0*(1.5*7.85)=52.99` → mostra `53.0`. Verifica che **nessun costo/€** sia visibile nel form.
4. Aggiungi una riga tubi: categoria tubolari, profilo 40x40x3, lunghezza 6000, pezzi 2 → kg ~41.9.
5. Aggiungi saldatura e piega. Salva.
6. Ricarica la pagina (F5): il consuntivo deve ricomparire nella lista (persistito sul server).

- [ ] **Step 7: Commit**

```bash
git add src/components/WorkItemAutocomplete.tsx src/components/ConsuntivoFormModal.tsx src/components/ConsuntiviView.tsx src/components/Dashboard.tsx
git commit -m "feat(consuntivi): data-entry UI (tab, commessa picker, form with live kg)"
```

---

### Task 8: Configuratore prezzi + libreria profili (protetti)

**Files:**
- Create: `src/components/ConsuntiviPricingModal.tsx`
- Create: `src/components/TubeProfilesLibraryModal.tsx`
- Modify: `src/components/ConsuntiviView.tsx`

**Interfaces:**
- Consumes: `fetchConsuntiviPricing`/`saveConsuntiviPricing` (Task 5), `useData().tubeProfiles` + CRUD (Task 6), `DEFAULT_TUBE_PROFILES` (Task 5).
- Produces: modali protetti; il report userà la pricing sbloccata (Task 9) — qui la password viene chiesta al momento dell'apertura.

- [ ] **Step 1: `ConsuntiviPricingModal`** — `src/components/ConsuntiviPricingModal.tsx`

Chiede la password all'apertura, poi `fetchConsuntiviPricing(password)`; se 403, mostra errore e resta bloccato. Salva con `saveConsuntiviPricing`. Espone anche i campi densità (che il backend salva nello stesso blob e ripubblica su `/consuntivi-settings`).

```tsx
import { useState } from 'react'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { useToast } from '../state/ToastProvider'
import { fetchConsuntiviPricing, saveConsuntiviPricing } from '../services/apiClient'
import { DEFAULT_CONSUNTIVI_PRICING } from '../utils/consuntiviCalc'
import { ALL_CONSUNTIVO_GAS, ALL_CONSUNTIVO_MATERIALS, CONSUNTIVO_MATERIAL_LABELS } from '../types'
import type { ConsuntiviPricingConfig, ConsuntivoMaterial } from '../types'

interface Props { open: boolean; onClose: () => void }

export function ConsuntiviPricingModal({ open, onClose }: Props) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [config, setConfig] = useState<ConsuntiviPricingConfig>(DEFAULT_CONSUNTIVI_PRICING)
  const [busy, setBusy] = useState(false)

  async function unlock() {
    setBusy(true)
    try {
      const cfg = await fetchConsuntiviPricing(password)
      setConfig(cfg)
      setUnlocked(true)
    } catch {
      toast.error('Password errata o configurazione non accessibile.')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    try {
      const saved = await saveConsuntiviPricing(config, password)
      setConfig(saved)
      toast.success('Configurazione prezzi salvata.')
      onClose()
    } catch {
      toast.error('Salvataggio non riuscito (password?).')
    } finally {
      setBusy(false)
    }
  }

  function num(v: string): number { return v === '' ? 0 : Number(v) }

  return (
    <Modal open={open} onClose={onClose} title="Configuratore prezzi (protetto)" size="lg"
      footer={unlocked ? (<><button className="btn-ghost" onClick={onClose}>Chiudi</button><button className="btn-primary" disabled={busy} onClick={save}>Salva</button></>) : undefined}>
      {!unlocked ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Inserisci la password admin per accedere ai prezzi.</p>
          <FormField label="Password admin">
            <input type="password" className="input-base" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') unlock() }} />
          </FormField>
          <button className="btn-primary" disabled={busy} onClick={unlock}>Sblocca</button>
        </div>
      ) : (
        <div className="space-y-5">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-200">€/kg materiale</legend>
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
              {ALL_CONSUNTIVO_MATERIALS.map((m) => (
                <FormField key={m} label={CONSUNTIVO_MATERIAL_LABELS[m]}>
                  <input type="number" step="0.01" className="input-base" value={config.materialPricePerKg[m]}
                    onChange={(e) => setConfig((c) => ({ ...c, materialPricePerKg: { ...c.materialPricePerKg, [m]: num(e.target.value) } }))} />
                </FormField>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-200">€/min gas</legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {ALL_CONSUNTIVO_GAS.map((g) => (
                <FormField key={g} label={g}>
                  <input type="number" step="0.01" className="input-base" value={config.gasCostPerMin[g]}
                    onChange={(e) => setConfig((c) => ({ ...c, gasCostPerMin: { ...c.gasCostPerMin, [g]: num(e.target.value) } }))} />
                </FormField>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField label="€/min tempo laser tubi">
              <input type="number" step="0.01" className="input-base" value={config.tubeLaserRatePerMin}
                onChange={(e) => setConfig((c) => ({ ...c, tubeLaserRatePerMin: num(e.target.value) }))} />
            </FormField>
            <FormField label="€/h saldatura">
              <input type="number" step="0.01" className="input-base" value={config.weldingRatePerHour}
                onChange={(e) => setConfig((c) => ({ ...c, weldingRatePerHour: num(e.target.value) }))} />
            </FormField>
            <FormField label="€/h piega">
              <input type="number" step="0.01" className="input-base" value={config.bendingRatePerHour}
                onChange={(e) => setConfig((c) => ({ ...c, bendingRatePerHour: num(e.target.value) }))} />
            </FormField>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-200">Densità per materiale (kg per m²·mm)</legend>
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
              {ALL_CONSUNTIVO_MATERIALS.map((m) => (
                <FormField key={m} label={CONSUNTIVO_MATERIAL_LABELS[m]}>
                  <input type="number" step="0.01" className="input-base" value={config.densityFactorPerMaterial[m]}
                    onChange={(e) => setConfig((c) => ({ ...c, densityFactorPerMaterial: { ...c.densityFactorPerMaterial, [m]: num(e.target.value) as number } as Record<ConsuntivoMaterial, number> }))} />
                </FormField>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </Modal>
  )
}
```

- [ ] **Step 2: `TubeProfilesLibraryModal`** — `src/components/TubeProfilesLibraryModal.tsx`

CRUD sui profili custom + bottone "Carica catalogo standard" che crea i `DEFAULT_TUBE_PROFILES` mancanti come profili persistiti. (Non richiede password: i profili non sono dati sensibili; è coerente col fatto che finiscono in AppData.)

```tsx
import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { DEFAULT_TUBE_PROFILES } from '../data/tubeProfiles'
import { ALL_TUBE_CATEGORIES, TUBE_CATEGORY_LABELS } from '../types'
import type { TubeCategory } from '../types'

interface Props { open: boolean; onClose: () => void }

export function TubeProfilesLibraryModal({ open, onClose }: Props) {
  const { tubeProfiles, createTubeProfile, updateTubeProfile, deleteTubeProfile } = useData()
  const toast = useToast()
  const [categoria, setCategoria] = useState<TubeCategory>('tubolari')
  const [label, setLabel] = useState('')
  const [kgPerMeter, setKgPerMeter] = useState(0)

  const sorted = useMemo(() => [...tubeProfiles].sort((a, b) => a.label.localeCompare(b.label)), [tubeProfiles])

  function add() {
    if (!label.trim()) { toast.error('Inserisci la sigla del profilo.'); return }
    createTubeProfile({ categoria, label: label.trim(), kgPerMeter, active: true, notes: '' })
    setLabel(''); setKgPerMeter(0)
    toast.success('Profilo aggiunto.')
  }

  function loadDefaults() {
    const existing = new Set(tubeProfiles.map((p) => p.label.toLowerCase()))
    let added = 0
    for (const p of DEFAULT_TUBE_PROFILES) {
      if (existing.has(p.label.toLowerCase())) continue
      createTubeProfile({ categoria: p.categoria, label: p.label, kgPerMeter: p.kgPerMeter, active: true, notes: '' })
      added += 1
    }
    toast.success(`Catalogo standard caricato (${added} profili aggiunti).`)
  }

  return (
    <Modal open={open} onClose={onClose} title="Libreria profili tubi" size="lg"
      footer={<button className="btn-ghost" onClick={onClose}>Chiudi</button>}>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Categoria</span>
          <select className="input-base" value={categoria} onChange={(e) => setCategoria(e.target.value as TubeCategory)}>
            {ALL_TUBE_CATEGORIES.map((c) => <option key={c} value={c}>{TUBE_CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Sigla</span>
          <input className="input-base" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="es. 40x40x3" />
        </label>
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">kg/m</span>
          <input type="number" step="0.01" className="input-base" value={kgPerMeter} onChange={(e) => setKgPerMeter(e.target.value === '' ? 0 : Number(e.target.value))} />
        </label>
        <button className="btn-primary" onClick={add}>Aggiungi</button>
        <button className="btn-ghost" onClick={loadDefaults}>Carica catalogo standard</button>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase text-slate-400">
          <tr><th className="px-2 py-1">Categoria</th><th className="px-2 py-1">Sigla</th><th className="px-2 py-1">kg/m</th><th /></tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="border-t border-slate-800/60">
              <td className="px-2 py-1">{TUBE_CATEGORY_LABELS[p.categoria]}</td>
              <td className="px-2 py-1">{p.label}</td>
              <td className="px-2 py-1">
                <input type="number" step="0.01" className="input-base w-24" value={p.kgPerMeter}
                  onChange={(e) => updateTubeProfile(p.id, { kgPerMeter: e.target.value === '' ? 0 : Number(e.target.value) })} />
              </td>
              <td className="px-2 py-1 text-right">
                <button className="btn-ghost text-xs text-red-300" onClick={() => deleteTubeProfile(p.id)}>Elimina</button>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && <tr><td colSpan={4} className="px-2 py-6 text-center text-slate-500">Nessun profilo personalizzato. I profili standard sono comunque disponibili nel form; usa "Carica catalogo standard" per renderli modificabili.</td></tr>}
        </tbody>
      </table>
    </Modal>
  )
}
```

- [ ] **Step 3: Collegare i bottoni nella `ConsuntiviView`**

In `src/components/ConsuntiviView.tsx`: importare i due modali e aggiungere due stati + due bottoni nella barra azioni.

Add imports:
```tsx
import { ConsuntiviPricingModal } from './ConsuntiviPricingModal'
import { TubeProfilesLibraryModal } from './TubeProfilesLibraryModal'
```
Add state:
```tsx
  const [pricingOpen, setPricingOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
```
Add buttons in the action bar (accanto a "+ Nuovo consuntivo"):
```tsx
          <button className="btn-ghost" onClick={() => setLibraryOpen(true)}>Libreria profili</button>
          <button className="btn-ghost" onClick={() => setPricingOpen(true)}>Prezzi 🔒</button>
```
Add modals before the closing `</div>`:
```tsx
      {pricingOpen && <ConsuntiviPricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />}
      {libraryOpen && <TubeProfilesLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} />}
```

- [ ] **Step 4: Verifica typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Verifica manuale**

Run: `npm run dev`.
1. "Prezzi 🔒": con nessuna password admin impostata, "Sblocca" con campo vuoto deve funzionare (backend non protetto) e mostrare i prezzi. Modifica un prezzo → Salva → riapri → il valore persiste.
2. Imposta una password admin da PeopleSettings (o via curl come nel Task 4) → riapri "Prezzi 🔒": con password sbagliata deve mostrare "Password errata"; con quella giusta deve sbloccare.
3. "Libreria profili": "Carica catalogo standard" → i profili compaiono; modifica un kg/m → riapri il form consuntivo → il profilo modificato mostra il nuovo kg/m.

- [ ] **Step 6: Commit**

```bash
git add src/components/ConsuntiviPricingModal.tsx src/components/TubeProfilesLibraryModal.tsx src/components/ConsuntiviView.tsx
git commit -m "feat(consuntivi): protected pricing configurator and tube profiles library"
```

---

### Task 9: Report costi protetto

**Files:**
- Create: `src/components/ConsuntiviReportModal.tsx`
- Modify: `src/components/ConsuntiviView.tsx`

**Interfaces:**
- Consumes: `fetchConsuntiviPricing` (Task 5), `consuntivoTotals` + `emptyKgByMaterial` (Task 2), `useData().consuntivi`.
- Produces: modale report protetto, con totali per commessa + globali + kg per materiale; stampabile via `window.print()`.

- [ ] **Step 1: `ConsuntiviReportModal`** — `src/components/ConsuntiviReportModal.tsx`

```tsx
import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { fetchConsuntiviPricing } from '../services/apiClient'
import { consuntivoTotals, emptyKgByMaterial } from '../utils/consuntiviCalc'
import { ALL_CONSUNTIVO_MATERIALS, CONSUNTIVO_MATERIAL_LABELS } from '../types'
import type { ConsuntiviPricingConfig, ConsuntivoMaterial } from '../types'

interface Props { open: boolean; onClose: () => void }

const eur = (n: number) => `€ ${n.toFixed(2)}`
const kg = (n: number) => `${n.toFixed(1)} kg`

export function ConsuntiviReportModal({ open, onClose }: Props) {
  const { consuntivi } = useData()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [pricing, setPricing] = useState<ConsuntiviPricingConfig | null>(null)
  const [busy, setBusy] = useState(false)

  async function unlock() {
    setBusy(true)
    try {
      setPricing(await fetchConsuntiviPricing(password))
    } catch {
      toast.error('Password errata o report non accessibile.')
    } finally {
      setBusy(false)
    }
  }

  const report = useMemo(() => {
    if (!pricing) return null
    const byCommessa = new Map<string, {
      code: string; title: string; customer: string; total: number; totalKg: number
      kgByMaterial: Record<ConsuntivoMaterial, number>
    }>()
    let grandTotal = 0
    const grandKg = emptyKgByMaterial()

    for (const c of consuntivi) {
      const t = consuntivoTotals(c, pricing)
      grandTotal += t.total
      for (const m of ALL_CONSUNTIVO_MATERIALS) grandKg[m] += t.kgByMaterial[m]
      const key = c.workItemId
      const agg = byCommessa.get(key) ?? { code: c.workItemCode, title: c.workItemTitle, customer: c.customer, total: 0, totalKg: 0, kgByMaterial: emptyKgByMaterial() }
      agg.total += t.total
      agg.totalKg += t.totalKg
      for (const m of ALL_CONSUNTIVO_MATERIALS) agg.kgByMaterial[m] += t.kgByMaterial[m]
      byCommessa.set(key, agg)
    }
    return { rows: Array.from(byCommessa.values()).sort((a, b) => b.total - a.total), grandTotal, grandKg }
  }, [consuntivi, pricing])

  return (
    <Modal open={open} onClose={onClose} title="Report consuntivi (protetto)" size="xl"
      footer={pricing ? (<><button className="btn-ghost" onClick={onClose}>Chiudi</button><button className="btn-primary" onClick={() => window.print()}>Stampa / PDF</button></>) : undefined}>
      {!pricing ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Inserisci la password admin per generare il report costi.</p>
          <FormField label="Password admin">
            <input type="password" className="input-base" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') unlock() }} />
          </FormField>
          <button className="btn-primary" disabled={busy} onClick={unlock}>Genera report</button>
        </div>
      ) : report && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Totale per commessa</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase text-slate-400">
                <tr><th className="px-2 py-1">Commessa</th><th className="px-2 py-1">Cliente</th><th className="px-2 py-1 text-right">kg totali</th><th className="px-2 py-1 text-right">Costo €</th></tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.code + r.title} className="border-t border-slate-800/60">
                    <td className="px-2 py-1">{r.code} · {r.title}</td>
                    <td className="px-2 py-1">{r.customer || '—'}</td>
                    <td className="px-2 py-1 text-right">{kg(r.totalKg)}</td>
                    <td className="px-2 py-1 text-right font-medium">{eur(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700 font-semibold">
                  <td className="px-2 py-1" colSpan={3}>Totale generale</td>
                  <td className="px-2 py-1 text-right">{eur(report.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">kg utilizzati per materiale (globale)</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {ALL_CONSUNTIVO_MATERIALS.map((m) => (
                <div key={m} className="rounded-lg border border-slate-800/70 p-3">
                  <div className="text-[11px] uppercase text-slate-500">{CONSUNTIVO_MATERIAL_LABELS[m]}</div>
                  <div className="text-lg font-semibold text-slate-100">{kg(report.grandKg[m])}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Modal>
  )
}
```

- [ ] **Step 2: Collegare il report nella `ConsuntiviView`**

Add import:
```tsx
import { ConsuntiviReportModal } from './ConsuntiviReportModal'
```
Add state:
```tsx
  const [reportOpen, setReportOpen] = useState(false)
```
Add button in the action bar:
```tsx
          <button className="btn-ghost" onClick={() => setReportOpen(true)}>Report 🔒</button>
```
Add modal:
```tsx
      {reportOpen && <ConsuntiviReportModal open={reportOpen} onClose={() => setReportOpen(false)} />}
```

- [ ] **Step 3: Verifica typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Verifica manuale**

Run: `npm run dev`.
1. Crea 2 consuntivi su commesse diverse con righe note.
2. "Report 🔒" → sblocca (password vuota se non protetto, altrimenti quella impostata).
3. Verifica che i **kg totali** e i **costi €** per commessa siano coerenti con i numeri attesi dalle formule (usa i valori del Task 7 step 6 per un controllo incrociato: es. una riga ferro 1000x1000x1 con ossigeno 10 min a densità 7.85 → kg 7.85, materiale 7.85·1.3=10.21, gas 25 → 35.21 €).
4. "Stampa / PDF" apre la finestra di stampa del browser.

- [ ] **Step 5: Eseguire tutti i test e la build finale**

Run: `npm run test && npm run typecheck && npm run build`
Expected: tutti PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ConsuntiviReportModal.tsx src/components/ConsuntiviView.tsx
git commit -m "feat(consuntivi): protected cost report with per-commessa totals and kg summary"
```

---

## Note di implementazione trasversali

- **Densità e kg storici:** i kg della lamiera sono ricalcolati con la densità corrente (fonte unica, pubblica). I profili tubo invece "congelano" `kgPerMeter` al momento dell'inserimento nella riga, così una modifica successiva del catalogo non altera i consuntivi già registrati.
- **Ordine rotte Express:** le rotte `/consuntivi-pricing` e `/consuntivi-settings` usano path top-level distinti apposta, per non collidere con `PUT /consuntivi/:id` della collezione generica.
- **Gate password:** finché non è impostata una password admin, `verifyAdminPassword` ritorna `true` e prezzi/report sono accessibili (identico al comportamento del "carico base"). Per proteggerli davvero, impostare la password admin.
