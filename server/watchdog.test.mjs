import { describe, it, expect, vi } from 'vitest'
import { createWatchdog } from './watchdog.js'

function make(overrides = {}) {
  const restartApp = vi.fn(async () => {})
  const log = vi.fn()
  const wd = createWatchdog({ restartApp, log, threshold: 3, graceMs: 60000, ...overrides })
  return { wd, restartApp, log }
}

describe('createWatchdog.pollOnce', () => {
  it('riavvia dopo 3 fallimenti consecutivi, una sola volta', async () => {
    const { wd, restartApp } = make({ checkHealth: async () => false })
    await wd.pollOnce(1000)
    await wd.pollOnce(2000)
    expect(restartApp).not.toHaveBeenCalled()
    const r = await wd.pollOnce(3000)
    expect(r.restarted).toBe(true)
    expect(restartApp).toHaveBeenCalledTimes(1)
  })
  it('un esito healthy impedisce il riavvio', async () => {
    let healthy = false
    const { wd, restartApp } = make({ checkHealth: async () => healthy })
    await wd.pollOnce(1000) // F
    healthy = true
    await wd.pollOnce(2000) // T
    healthy = false
    await wd.pollOnce(3000) // F  → finestra [F,T,F] non tutti F
    expect(restartApp).not.toHaveBeenCalled()
  })
  it('durante la grazia salta il controllo', async () => {
    const check = vi.fn(async () => false)
    const { wd, restartApp } = make({ checkHealth: check })
    await wd.pollOnce(1000); await wd.pollOnce(2000); await wd.pollOnce(3000) // riavvio, grazia fino a 63000
    expect(restartApp).toHaveBeenCalledTimes(1)
    const callsBefore = check.mock.calls.length
    const r = await wd.pollOnce(10000) // dentro la grazia
    expect(r.skipped).toBe(true)
    expect(check.mock.calls.length).toBe(callsBefore) // non ha ricontrollato
  })
})
