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
      { id: 'r1', lunghezzaMm: 1500, larghezzaMm: 3000, spessoreMm: 1.5, materiale: 'zincato', nPezzi: 1, tempoMin: 3, gas: 'azoto' },
      { ...P, densityFactorPerMaterial: { ...P.densityFactorPerMaterial, zincato: 8 } },
    )
    expect(r.kg).toBeCloseTo(54, 6)
    expect(r.materialCost).toBeCloseTo(108, 6)
    expect(r.gasCost).toBeCloseTo(9, 6)
    expect(r.total).toBeCloseTo(117, 6)
  })
  it('ferro con ossigeno 10 min → gas 10*2.5=25', () => {
    const r = laserRowCost(
      { id: 'r2', lunghezzaMm: 1000, larghezzaMm: 1000, spessoreMm: 1, materiale: 'ferro', nPezzi: 1, tempoMin: 10, gas: 'ossigeno' },
      { ...P, densityFactorPerMaterial: { ...P.densityFactorPerMaterial, ferro: 8 } },
    )
    expect(r.kg).toBeCloseTo(8, 6) // 1*1*(1*8)
    expect(r.materialCost).toBeCloseTo(8 * 1.3, 6)
    expect(r.gasCost).toBeCloseTo(25, 6)
  })
  it('n° pezzi scala i kg e il costo materiale (2 pezzi = doppio), tempo/gas invariati', () => {
    const r = laserRowCost(
      { id: 'r3', lunghezzaMm: 1500, larghezzaMm: 1500, spessoreMm: 3, materiale: 'ferro', nPezzi: 2, tempoMin: 5, gas: 'ossigeno' },
      { ...P, densityFactorPerMaterial: { ...P.densityFactorPerMaterial, ferro: 8 } },
    )
    // 1.5*1.5*(3*8) = 54 kg per lamiera → ×2 pezzi = 108
    expect(r.kg).toBeCloseTo(108, 6)
    expect(r.materialCost).toBeCloseTo(108 * 1.3, 6)
    // il tempo/gas è totale, non scala coi pezzi
    expect(r.gasCost).toBeCloseTo(5 * 2.5, 6)
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
      id: 'c1', commessaNumber: 'CM-1', supplierId: '', supplierName: 'Fornitore X', date: '2026-07-02', operatorName: '',
      laserRows: [
        { id: 'r1', lunghezzaMm: 1000, larghezzaMm: 1000, spessoreMm: 1, materiale: 'ferro', nPezzi: 1, tempoMin: 10, gas: 'ossigeno' },
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
