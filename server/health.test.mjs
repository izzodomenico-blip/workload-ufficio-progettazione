import { describe, it, expect } from 'vitest'
import { buildHealthPayload } from './health.js'

describe('buildHealthPayload', () => {
  const base = { uptimeSec: 42, startedAt: '2026-07-03T10:00:00.000Z', pid: 1234 }
  it('DB ok → 200 con campi salute', () => {
    const { status, body } = buildHealthPayload({ ...base, dbOk: true })
    expect(status).toBe(200)
    expect(body).toMatchObject({
      ok: true, service: 'workload-ufficio-progettazione', storage: 'sqlite',
      db: 'ok', uptimeSec: 42, startedAt: '2026-07-03T10:00:00.000Z', pid: 1234,
    })
  })
  it('DB in errore → 503 con db=error e messaggio', () => {
    const { status, body } = buildHealthPayload({ ...base, dbOk: false, error: 'DB locked' })
    expect(status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.db).toBe('error')
    expect(body.error).toBe('DB locked')
  })
  it('DB in errore senza messaggio → nessun campo error', () => {
    const { body } = buildHealthPayload({ ...base, dbOk: false })
    expect(body).not.toHaveProperty('error')
  })
})
