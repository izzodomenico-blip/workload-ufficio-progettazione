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
