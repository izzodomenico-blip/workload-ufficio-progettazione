# Coefficiente tubolari + report per-commessa — Implementation Plan (sotto-progetto H)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prezzare i tubolari con 3 coefficienti €/kg per forma (quadro/rettangolare/piccolo), evidenziarli "da verificare" (giallo) nel report, e generare il report/PDF per una singola commessa scelta dopo la password.

**Architecture:** Nuovo campo config `tubeCoefficientPerKg` (per forma). Classificazione forma pura dal `profileLabel`. `tubeRowCost` usa il coefficiente per forma invece del prezzo-materiale. Il report chiede la commessa dopo lo sblocco e filtra i consuntivi; le righe tubi sono evidenziate in giallo con badge "da verificare" (mantenuto in stampa).

**Tech Stack:** React 19 + TS + Vite + Tailwind, Node ESM, vitest.

## Global Constraints

- Nessuna nuova dipendenza runtime app. Node ≥ 22. ESM. Test vitest.
- Coefficienti default (già col +5%): `quadro: 0.91, rettangolo: 1.18, piccolo: 1.30` €/kg.
- Regola forma dal `profileLabel` (primi due numeri = lati sezione): `a+b ≤ 60` → piccolo; else `a===b` → quadro; else rettangolo; label non interpretabile → rettangolo.
- Retrocompatibile: config senza `tubeCoefficientPerKg` → default (via `normalizeConsuntiviConfig`).
- Config prezzi resta protetta dalla password Consuntivi (invariata). Il report/PDF, dopo la password, riguarda una sola commessa. Tubolari sempre marcati "da verificare".

---

### Task 1: Config — `tubeCoefficientPerKg` (tipi + default + normalize)

**Files:**
- Modify: `src/types/index.ts` (`TubeShape` + campo in `ConsuntiviPricingConfig`)
- Modify: `src/utils/consuntiviCalc.ts` (`DEFAULT_CONSUNTIVI_PRICING`)
- Modify: `server/services/consuntiviConfig.js` (`DEFAULT_CONSUNTIVI_CONFIG` + `normalizeConsuntiviConfig`)
- Test: `server/services/consuntiviConfig.test.mjs`

**Interfaces:**
- Produces: `TubeShape = 'quadro'|'rettangolo'|'piccolo'`; `ConsuntiviPricingConfig.tubeCoefficientPerKg: Record<TubeShape, number>`; default `{ quadro: 0.91, rettangolo: 1.18, piccolo: 1.30 }`.

- [ ] **Step 1: Scrivi il test che fallisce**

`server/services/consuntiviConfig.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { DEFAULT_CONSUNTIVI_CONFIG, normalizeConsuntiviConfig } from './consuntiviConfig.js'

describe('normalizeConsuntiviConfig — tubeCoefficientPerKg', () => {
  it('default con quadro/rettangolo/piccolo', () => {
    expect(DEFAULT_CONSUNTIVI_CONFIG.tubeCoefficientPerKg).toEqual({ quadro: 0.91, rettangolo: 1.18, piccolo: 1.30 })
  })
  it('config senza il campo -> default (retrocompat)', () => {
    expect(normalizeConsuntiviConfig({}).tubeCoefficientPerKg).toEqual({ quadro: 0.91, rettangolo: 1.18, piccolo: 1.30 })
  })
  it('tiene i validi, scarta i negativi', () => {
    const out = normalizeConsuntiviConfig({ tubeCoefficientPerKg: { quadro: 1.0, rettangolo: -5, piccolo: 2 } })
    expect(out.tubeCoefficientPerKg).toEqual({ quadro: 1.0, rettangolo: 1.18, piccolo: 2 })
  })
})
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run server/services/consuntiviConfig.test.mjs`
Expected: FAIL (`tubeCoefficientPerKg` undefined).

- [ ] **Step 3: `server/services/consuntiviConfig.js`**

In `DEFAULT_CONSUNTIVI_CONFIG` (dopo `densityFactorPerMaterial`) aggiungi:
```js
  tubeCoefficientPerKg: { quadro: 0.91, rettangolo: 1.18, piccolo: 1.30 },
```
In `normalizeConsuntiviConfig`, nell'oggetto ritornato aggiungi (in fondo, prima della `}` di chiusura):
```js
    tubeCoefficientPerKg: numberMap(o.tubeCoefficientPerKg, ['quadro', 'rettangolo', 'piccolo'], d.tubeCoefficientPerKg),
```

- [ ] **Step 4: `src/types/index.ts`**

Prima di `export interface ConsuntiviPricingConfig` aggiungi:
```ts
export type TubeShape = 'quadro' | 'rettangolo' | 'piccolo'
```
Dentro `ConsuntiviPricingConfig`, dopo `densityFactorPerMaterial: Record<ConsuntivoMaterial, number>` aggiungi:
```ts
  tubeCoefficientPerKg: Record<TubeShape, number>
```

- [ ] **Step 5: `src/utils/consuntiviCalc.ts`**

In `DEFAULT_CONSUNTIVI_PRICING` (dopo `densityFactorPerMaterial`) aggiungi:
```ts
  tubeCoefficientPerKg: { quadro: 0.91, rettangolo: 1.18, piccolo: 1.30 },
```

- [ ] **Step 6: Esegui test + typecheck**

Run: `npx vitest run server/services/consuntiviConfig.test.mjs && npm run typecheck`
Expected: test PASS (3); typecheck PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/utils/consuntiviCalc.ts server/services/consuntiviConfig.js server/services/consuntiviConfig.test.mjs
git commit -m "feat(consuntivi): config tubeCoefficientPerKg per forma (quadro/rettangolo/piccolo)"
```

---

### Task 2: Classificazione forma + costo tubo (puro)

**Files:**
- Modify: `src/utils/consuntiviCalc.ts` (`parseTubeSides`, `tubeShape`, `tubeRowCost`)
- Test: `src/utils/consuntiviCalc.test.ts`

**Interfaces:**
- Consumes: `TubeShape`, `tubeCoefficientPerKg` (Task 1).
- Produces: `parseTubeSides(label): {a,b}|null`; `tubeShape(label): TubeShape`; `tubeRowCost` ritorna `{ kg, shape, materialCost, timeCost, total }` con `materialCost = kg × tubeCoefficientPerKg[shape]`.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi a `src/utils/consuntiviCalc.test.ts` (aggiungi `parseTubeSides`, `tubeShape` all'import da `./consuntiviCalc`; `tubeRowCost` e `DEFAULT_CONSUNTIVI_PRICING` sono già disponibili o aggiungili):
```ts
describe('tubeShape', () => {
  const cases: Array<[string, string]> = [
    ['30x30x2', 'piccolo'], ['40x15x1.5', 'piccolo'],
    ['40x40x3', 'quadro'], ['50x50x3', 'quadro'], ['70x70x3', 'quadro'], ['80x80x3', 'quadro'],
    ['80x40x3', 'rettangolo'], ['60x20x2', 'rettangolo'],
  ]
  it.each(cases)('%s -> %s', (label, shape) => { expect(tubeShape(label)).toBe(shape) })
  it('non interpretabile -> rettangolo', () => { expect(tubeShape('boh')).toBe('rettangolo') })
  it('gestisce × e virgola', () => { expect(tubeShape('40×15×1,5')).toBe('piccolo') })
})

describe('parseTubeSides', () => {
  it('primi due numeri', () => { expect(parseTubeSides('80 x 40 x 3')).toEqual({ a: 80, b: 40 }) })
  it('un solo numero -> null', () => { expect(parseTubeSides('3')).toBeNull() })
})

describe('tubeRowCost per forma', () => {
  it('quadro: kg × coeff quadro', () => {
    // oggetto inline: validato direttamente contro TubeLaserRow (nessun cast)
    const r = tubeRowCost(
      { id: 't', categoria: 'tubolari', profileId: '', profileLabel: '40x40x3', kgPerMeter: 3.79, materiale: 'zincato', lunghezzaMm: 1000, nPezzi: 1, tempoMin: 0 },
      DEFAULT_CONSUNTIVI_PRICING,
    )
    expect(r.shape).toBe('quadro')
    expect(r.kg).toBeCloseTo(3.79, 2)
    expect(r.materialCost).toBeCloseTo(3.79 * 0.91, 3)
  })
})
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run src/utils/consuntiviCalc.test.ts`
Expected: FAIL (`tubeShape is not a function`).

- [ ] **Step 3: Implementa in `src/utils/consuntiviCalc.ts`**

Aggiungi `TubeShape` all'import dei tipi in cima (`import type { ..., TubeShape } from '../types'`).
Aggiungi le funzioni pure (es. prima di `tubeRowCost`):
```ts
export function parseTubeSides(label: string): { a: number; b: number } | null {
  const nums = String(label ?? '').replace(/,/g, '.').match(/\d+(?:\.\d+)?/g)
  if (!nums || nums.length < 2) return null
  return { a: Number(nums[0]), b: Number(nums[1]) }
}

export function tubeShape(label: string): TubeShape {
  const s = parseTubeSides(label)
  if (!s) return 'rettangolo'
  if (s.a + s.b <= 60) return 'piccolo'
  if (s.a === s.b) return 'quadro'
  return 'rettangolo'
}
```
Sostituisci `tubeRowCost` con:
```ts
export function tubeRowCost(row: TubeLaserRow, pricing: ConsuntiviPricingConfig) {
  const kg = tubeWeightKg(row)
  const shape = tubeShape(row.profileLabel)
  const materialCost = kg * (pricing.tubeCoefficientPerKg?.[shape] ?? 0)
  const timeCost = num(row.tempoMin) * num(pricing.tubeLaserRatePerMin)
  return { kg, shape, materialCost, timeCost, total: materialCost + timeCost }
}
```

- [ ] **Step 4: Esegui il test — deve passare**

Run: `npx vitest run src/utils/consuntiviCalc.test.ts && npm run typecheck`
Expected: test PASS; typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/consuntiviCalc.ts src/utils/consuntiviCalc.test.ts
git commit -m "feat(consuntivi): tubeShape + costo tubo per coefficiente di forma"
```

---

### Task 3: Modale Prezzi — 3 coefficienti tubolari

**Files:**
- Modify: `src/components/ConsuntiviPricingModal.tsx`

**Interfaces:**
- Consumes: `config.tubeCoefficientPerKg` (Task 1).

- [ ] **Step 1: Aggiungi il fieldset coefficienti tubi**

In `ConsuntiviPricingModal.tsx`, dopo la `<div className="grid ... md:grid-cols-3">` che contiene "€/min tempo laser tubi / €/h saldatura / €/h piega" (chiude alla riga ~98), aggiungi:
```tsx
          <fieldset>
            <legend className="text-sm font-semibold text-slate-200">Coefficienti tubolari (€/kg per forma)</legend>
            <p className="mt-1 text-[11px] text-slate-500">Stima per forma; nel report i tubolari sono marcati «da verificare».</p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {([['quadro', 'Quadro'], ['rettangolo', 'Rettangolare'], ['piccolo', 'Piccolo']] as const).map(([k, label]) => (
                <FormField key={k} label={label}>
                  <input type="number" step="0.01" className="input-base" value={config.tubeCoefficientPerKg[k]}
                    onChange={(e) => setConfig((c) => ({ ...c, tubeCoefficientPerKg: { ...c.tubeCoefficientPerKg, [k]: num(e.target.value) } }))} />
                </FormField>
              ))}
            </div>
          </fieldset>
```

- [ ] **Step 2: Verifica typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. (I valori si salvano con la stessa PUT protetta esistente `saveConsuntiviPricing`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ConsuntiviPricingModal.tsx
git commit -m "feat(consuntivi): input coefficienti tubolari nella modale prezzi"
```

---

### Task 4: Report — scelta commessa + evidenza "da verificare" + CSS

**Files:**
- Modify: `src/components/ConsuntiviReportModal.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `tubeRowCost` (Task 2); `consuntivi` da `useData`.

- [ ] **Step 1: Stato commessa + elenco commesse**

In `ConsuntiviReportModal.tsx`, accanto agli altri `useState`, aggiungi:
```tsx
  const [selectedCommessa, setSelectedCommessa] = useState<string | null>(null)
```
Dopo `const { consuntivi } = useData()` aggiungi l'elenco commesse:
```tsx
  const commesse = useMemo(() => {
    const set = new Set(consuntivi.map((c) => c.commessaNumber.trim() || '(senza commessa)'))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [consuntivi])
```

- [ ] **Step 2: Filtra il report per la commessa scelta**

Nel `report` useMemo, cambia la guardia iniziale e la sorgente dati:
```tsx
  const report = useMemo(() => {
    if (!pricing || !selectedCommessa) return null
```
e sostituisci `const ordered = [...consuntivi].sort(...)` con:
```tsx
    const filtered = consuntivi.filter((c) => (c.commessaNumber.trim() || '(senza commessa)') === selectedCommessa)
    const ordered = [...filtered].sort((a, b) => a.date.localeCompare(b.date))
```

- [ ] **Step 3: Toolbar + schermata scelta commessa**

Nella toolbar (`cons-report-bar`), sostituisci il blocco che mostra "Stampa / PDF" con:
```tsx
            {pricing && selectedCommessa && (
              <button className="btn-ghost" onClick={() => setSelectedCommessa(null)}>Cambia commessa</button>
            )}
            {pricing && selectedCommessa && (
              <button className="btn-primary" onClick={() => window.print()}>Stampa / PDF</button>
            )}
```
Dopo il blocco `!pricing ? (...password lock...)` e prima di `report && (...sheet...)`, inserisci lo step intermedio "scegli commessa". Struttura il render come catena:
```tsx
        {!pricing ? (
          /* ...blocco password esistente invariato... */
        ) : !selectedCommessa ? (
          <div className="cons-report-lock no-print">
            <div className="w-full max-w-md space-y-3 rounded-2xl border border-slate-800/80 bg-[color:var(--color-panel)] p-6">
              <h3 className="text-base font-semibold text-slate-100">Scegli la commessa</h3>
              <p className="text-sm text-slate-400">Il report e il PDF riguarderanno solo la commessa selezionata.</p>
              <div className="max-h-72 space-y-1 overflow-auto">
                {commesse.length === 0 && <p className="text-sm text-slate-500">Nessun consuntivo presente.</p>}
                {commesse.map((k) => (
                  <button key={k} className="btn-ghost w-full justify-start" onClick={() => setSelectedCommessa(k)}>{k}</button>
                ))}
              </div>
            </div>
          </div>
        ) : report && (
          /* ...blocco cons-report-sheet esistente invariato, salvo lo step 4... */
        )}
```

- [ ] **Step 4: Evidenzia i tubolari "da verificare"**

Nel blocco tabella tubi (`c.tubeRows.length > 0 && (<table className="cons-table">...`), aggiungi la classe gialla e il badge nell'intestazione:
```tsx
                    {c.tubeRows.length > 0 && (
                      <table className="cons-table cons-tube-warn">
                        <thead><tr><th>Laser tubi <span className="cons-verify-badge">da verificare</span></th><th>Materiale</th><th className="r">kg</th><th className="r">€ materiale</th><th className="r">€ tempo</th></tr></thead>
```
(il resto della tabella tubi invariato.)

- [ ] **Step 5: CSS (`src/styles.css`)**

Aggiungi (vicino alle altre regole `.cons-*`):
```css
.cons-tube-warn { background: #fef9c3; }
.cons-tube-warn th, .cons-tube-warn td { background: #fef9c3; }
.cons-verify-badge {
  display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 4px;
  background: #facc15; color: #422006; font-size: 10px; font-weight: 700; text-transform: uppercase;
}
@media print {
  .cons-tube-warn, .cons-tube-warn th, .cons-tube-warn td, .cons-verify-badge {
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
}
```

- [ ] **Step 6: Verifica typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ConsuntiviReportModal.tsx src/styles.css
git commit -m "feat(consuntivi): report per singola commessa + tubolari evidenziati «da verificare»"
```

---

## Ordine e verifica finale

Task 1 → 2 → 3 → 4. Alla fine:
```bash
npm run test && npm run typecheck && npm run build
```
Expected: suite verde (config + consuntiviCalc + preesistenti), typecheck PASS, build PASS.

Verifica manuale (server acceso, sezione Consuntivi):
1. Prezzi (password): compaiono i 3 coefficienti tubolari (0,91/1,18/1,30), salvabili.
2. Report (password) → chiede la commessa → scegline una → il documento e il PDF contengono solo quella; le righe "Laser tubi" sono gialle con "da verificare" (anche nel PDF); i costi tubi riflettono il coefficiente per forma.
