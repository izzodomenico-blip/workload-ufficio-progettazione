# Report consuntivi: coefficiente tubolari + report per-commessa — Design (sotto-progetto H)

**Data:** 2026-07-07
**Stato:** approvato in brainstorming, in attesa di revisione spec

## Obiettivo

Tre migliorie al modulo Consuntivi/Report:

1. **Prezzo tubolari per forma.** Oggi i tubolari sono prezzati come le lamiere
   (`kg × prezzo-materiale`), che sovrastima molto il costo reale. Introdurre **3 coefficienti
   €/kg per forma** (quadro / rettangolare / piccolo) applicati al peso del tubo, con
   classificazione automatica dal profilo.
2. **Evidenza "da verificare".** Nel report, i tubolari vanno **evidenziati in giallo** con la
   scritta **"da verificare"** (il coefficiente è una stima → controllo manuale). Deve
   comparire anche nel PDF.
3. **Report per singola commessa.** Dopo la password, il sistema **chiede per quale commessa**
   generare il report; il documento e il PDF contengono **solo quella commessa**.

Additivo e retrocompatibile: le config esistenti senza i nuovi coefficienti ricevono i default.

## Dati di riferimento (dal foglio dell'operatore, tubolari zincati)

€/kg reale = €/ML ÷ kg/m. Gruppi e coefficienti (media di gruppo × 1,05, il "+5%"):
- **Quadri** (40×40, 50×50, 70×70, 80×80): €/kg 0,83/0,81/0,88/0,93 → **0,91**
- **Rettangolari** (80×40, 60×20): 1,19/1,05 → **1,18**
- **Piccoli** (30×30, 40×15): 1,00/1,48 → **1,30**

## Modello attuale (da modificare)

`src/utils/consuntiviCalc.ts` → `tubeRowCost`: `materialCost = kg × materialPricePerKg[materiale]`
(stesso €/kg delle lamiere) `+ timeCost`. `ConsuntiviPricingConfig` (type +
`DEFAULT_CONSUNTIVI_PRICING`) e il gemello server (`DEFAULT_CONSUNTIVI_CONFIG` +
`normalizeConsuntiviConfig`) NON hanno un coefficiente tubi. `ConsuntiviReportModal` sblocca
con la password, poi somma **tutti** i consuntivi raggruppati per commessa. `TubeLaserRow` ha
`profileLabel` (es. "40×40×3"), da cui ricavare i lati sezione.

## Componenti (unità piccole, isolate, testabili)

### H1 — Config: coefficienti tubi
- `src/types/index.ts`: nuovo `export type TubeShape = 'quadro' | 'rettangolo' | 'piccolo'`; in
  `ConsuntiviPricingConfig` aggiungi `tubeCoefficientPerKg: Record<TubeShape, number>`.
- `src/utils/consuntiviCalc.ts` `DEFAULT_CONSUNTIVI_PRICING` e
  `server/services/consuntiviConfig.js` `DEFAULT_CONSUNTIVI_CONFIG`: aggiungi
  `tubeCoefficientPerKg: { quadro: 0.91, rettangolo: 1.18, piccolo: 1.30 }`.
- `server/services/consuntiviConfig.js` `normalizeConsuntiviConfig`: aggiungi
  `tubeCoefficientPerKg: numberMap(o.tubeCoefficientPerKg, ['quadro','rettangolo','piccolo'], d.tubeCoefficientPerKg)`
  (riusa `numberMap`/`nonNegativeNumber` esistenti → default per campi mancanti = retrocompat).

### H2 — Classificazione forma + costo tubo (puro)
`src/utils/consuntiviCalc.ts`:
- `parseTubeSides(label: string): { a: number; b: number } | null` — estrae i **primi due**
  numeri dal `profileLabel` (gestisce separatori `x`/`×`/spazi e la virgola decimale). `null` se
  meno di due numeri.
- `tubeShape(label: string): TubeShape` — pura:
  - `null` (non interpretabile) → `'rettangolo'` (default; comunque "da verificare").
  - `a + b <= 60` → `'piccolo'`.
  - altrimenti `a === b` → `'quadro'`.
  - altrimenti → `'rettangolo'`.
- `tubeRowCost` cambia: `const shape = tubeShape(row.profileLabel); const coeff =
  pricing.tubeCoefficientPerKg?.[shape] ?? 0; materialCost = kg × coeff`. `timeCost` invariato.
  Il valore ritornato include anche `shape` (utile alla UI). `consuntivoTotals` resta invariato
  (chiama `tubeRowCost`, somma `materialCost`/`timeCost`).

### H3 — Modale Prezzi: 3 coefficienti tubi
`src/components/ConsuntiviPricingModal.tsx`: aggiungi una sezione "Coefficienti tubolari (€/kg)"
con tre input numerici (quadro / rettangolare / piccolo) legati a
`config.tubeCoefficientPerKg`, salvati come gli altri campi prezzo (stessa PUT
`/api/consuntivi-pricing` protetta da password). Nota informativa: "stima per forma, nel report
i tubolari sono marcati «da verificare»".

### H4 — Report: scelta commessa + evidenza "da verificare"
`src/components/ConsuntiviReportModal.tsx`:
- **Scelta commessa** (dopo lo sblocco con password): nuovo stato `selectedCommessa: string |
  null`. Se `pricing` è caricato ma `selectedCommessa` è null → mostra un **selettore** con
  l'elenco delle commesse distinte presenti nei consuntivi (chiave = `commessaNumber.trim() ||
  '(senza commessa)'`), ordinate. Selezionandone una si imposta `selectedCommessa`. Il `report`
  useMemo filtra `consuntivi` per quella commessa **prima** del ciclo → il documento (e il PDF
  via `window.print()`) contiene solo quella commessa; il totale generale = quella commessa.
  Un pulsante "Cambia commessa" riporta al selettore.
- **Evidenza tubolari**: la tabella "Laser tubi" (righe 246-264) riceve una classe
  `cons-tube-warn` (sfondo giallo) e un'intestazione/badge **"da verificare"** accanto al titolo
  "Laser tubi". Vale per tutte le righe tubi (il coefficiente è sempre una stima).

### H5 — CSS stampa
`src/styles.css`: `.cons-tube-warn { background: #fef9c3; }` (giallo tenue) + badge
`.cons-verify-badge` (testo "da verificare" su sfondo giallo). In `@media print` forzare
`-webkit-print-color-adjust: exact; print-color-adjust: exact;` sugli elementi evidenziati così
il giallo resta nel PDF.

## Testing

- **H1/H2** (vitest, `src/utils/consuntiviCalc.test.ts`):
  - `tubeShape`: le 8 righe del foglio finiscono nel gruppo giusto (30×30→piccolo, 40×15→piccolo,
    40×40→quadro, 50×50→quadro, 70×70→quadro, 80×80→quadro, 80×40→rettangolo, 60×20→rettangolo);
    label non interpretabile → rettangolo.
  - `parseTubeSides`: "40×40×3"→{40,40}; "80 x 40 x 3"→{80,40}; "1,5"→null (un solo numero).
  - `tubeRowCost`: costo materiale = kg × coefficiente della forma (non più prezzo-materiale);
    `timeCost` invariato.
  - Config: `DEFAULT_CONSUNTIVI_PRICING.tubeCoefficientPerKg` presente; `normalizeConsuntiviConfig`
    riempie i default se il campo manca (retrocompat), tiene i valori validi, scarta i negativi.
- **H3/H4/H5**: typecheck + build; verifica manuale (report: scelta commessa → PDF di una sola
  commessa; tubolari gialli con "da verificare" anche in stampa).
- Il DB reale non viene toccato dai test (funzioni pure + config).

## Vincoli globali

- Nessuna nuova dipendenza runtime app. Node ≥ 22, ESM, test vitest.
- Retrocompatibile: config senza `tubeCoefficientPerKg` → default (0,91/1,18/1,30);
  consuntivi esistenti ricalcolati col nuovo modello tubi (i costi tubi caleranno, coerente con i
  dati reali).
- La config prezzi resta protetta dalla password Consuntivi (invariata); il coefficiente è editabile
  solo lì.
- I coefficienti default includono già il **+5%** richiesto.

## Fuori scope

- Coefficiente tubi **per materiale** (per ora solo per forma; i dati forniti sono zincato).
  Estendibile in futuro con la stessa struttura.
- Persistenza del €/ML per singolo profilo nella libreria tubi.
- Modifica del calcolo lamiere/gas/manodopera (invariato).
