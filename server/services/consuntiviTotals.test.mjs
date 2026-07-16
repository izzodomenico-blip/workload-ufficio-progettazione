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
