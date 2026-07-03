import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const cfg = require('../ecosystem.config.cjs')

describe('ecosystem.config.cjs', () => {
  it('ha due app con i nomi attesi', () => {
    const names = cfg.apps.map((a) => a.name)
    expect(names).toEqual(['workload-ufficio-progettazione', 'workload-watchdog'])
  })
  it('app server: backoff, memoria, kill_timeout, niente tetto restart', () => {
    const server = cfg.apps.find((a) => a.name === 'workload-ufficio-progettazione')
    expect(server.script).toBe('server/index.js')
    expect(server.exp_backoff_restart_delay).toBe(200)
    expect(server.max_memory_restart).toBe('400M')
    expect(server.kill_timeout).toBe(5000)
    expect(server).not.toHaveProperty('max_restarts')
    expect(server.env).toMatchObject({ PORT: '3000', HOST: '0.0.0.0' })
  })
  it('app watchdog: script e memoria', () => {
    const wd = cfg.apps.find((a) => a.name === 'workload-watchdog')
    expect(wd.script).toBe('server/watchdog.js')
    expect(wd.max_memory_restart).toBe('150M')
    expect(wd.env).toMatchObject({ PORT: '3000', APP_NAME: 'workload-ufficio-progettazione' })
  })
})
