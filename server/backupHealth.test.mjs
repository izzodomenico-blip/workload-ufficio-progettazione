import { describe, it, expect } from 'vitest'
import { computeBackupHealth } from './backupHealth.js'

const NOW = Date.parse('2026-07-03T12:00:00.000Z')
const fresh = (h) => new Date(NOW - h * 3600000).toISOString()

describe('computeBackupHealth', () => {
  it('ok: snapshot fresco+integro e ricevuta offsite fresca', () => {
    const r = computeBackupHealth({
      latestVerified: { createdAt: fresh(2), integrityOk: true },
      offsiteReceipt: { lastOffsiteAt: fresh(1), lastOffsiteOk: true },
      now: NOW,
    })
    expect(r.status).toBe('ok')
    expect(r.reasons).toEqual([])
  })
  it('error: nessuno snapshot verificato', () => {
    const r = computeBackupHealth({ latestVerified: null, offsiteReceipt: null, now: NOW })
    expect(r.status).toBe('error')
  })
  it('error: integrità fallita batte tutto', () => {
    const r = computeBackupHealth({
      latestVerified: { createdAt: fresh(1), integrityOk: false },
      offsiteReceipt: { lastOffsiteAt: fresh(1), lastOffsiteOk: true },
      now: NOW,
    })
    expect(r.status).toBe('error')
  })
  it('warn: snapshot troppo vecchio', () => {
    const r = computeBackupHealth({
      latestVerified: { createdAt: fresh(40), integrityOk: true },
      offsiteReceipt: { lastOffsiteAt: fresh(1), lastOffsiteOk: true },
      now: NOW,
    })
    expect(r.status).toBe('warn')
  })
  it('warn: ricevuta offsite assente', () => {
    const r = computeBackupHealth({
      latestVerified: { createdAt: fresh(1), integrityOk: true },
      offsiteReceipt: null,
      now: NOW,
    })
    expect(r.status).toBe('warn')
  })
})
