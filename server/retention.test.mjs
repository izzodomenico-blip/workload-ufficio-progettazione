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
