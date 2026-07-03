import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { buildManifest, isSnapshotDue, createVerifiedSnapshot } from './verifiedBackup.js'
import { runMigrations } from './db.js'

describe('buildManifest', () => {
  it('deriva integrityOk e total', () => {
    const now = new Date('2026-07-03T10:00:00.000Z')
    const m = buildManifest({ stamp: '2026-07-03_10-00', sizeBytes: 123, integrityResult: 'ok', counts: { a: 2, b: 3 }, sha256: 'abc', now, reason: 'daily' })
    expect(m.integrityOk).toBe(true)
    expect(m.total).toBe(5)
    expect(m.createdAt).toBe('2026-07-03T10:00:00.000Z')
    expect(m.sha256).toBe('abc')
    expect(m.version).toBe(1)
  })
  it('integrityOk false se integrity_check non ok', () => {
    const m = buildManifest({ stamp: 's', sizeBytes: 1, integrityResult: 'malformato', counts: {}, sha256: 'x', now: new Date(), reason: 'daily' })
    expect(m.integrityOk).toBe(false)
    expect(m.total).toBe(0)
  })
})

describe('isSnapshotDue', () => {
  const now = Date.parse('2026-07-03T12:00:00.000Z')
  it('true se nessun ultimo', () => { expect(isSnapshotDue(null, now)).toBe(true) })
  it('true se più vecchio dell intervallo', () => {
    expect(isSnapshotDue('2026-07-02T00:00:00.000Z', now, 24 * 3600000)).toBe(true)
  })
  it('false se entro l intervallo', () => {
    expect(isSnapshotDue('2026-07-03T06:00:00.000Z', now, 24 * 3600000)).toBe(false)
  })
  it('true se data non valida', () => { expect(isSnapshotDue('boh', now)).toBe(true) })
})

describe('createVerifiedSnapshot (DB e dir iniettati, isolato)', () => {
  it('produce db+manifest con integrità ok e conteggi', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-'))
    // DB sorgente temporaneo con lo schema reale (runMigrations è esportato e non usa env)
    const srcDb = new DatabaseSync(path.join(dir, 'src.db'))
    runMigrations(srcDb)
    srcDb.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('probe', '1')")

    const outDir = path.join(dir, 'verified')
    const { file, manifest } = createVerifiedSnapshot({ now: new Date(), reason: 'test', db: srcDb, dir: outDir })

    expect(fs.existsSync(file)).toBe(true)
    expect(fs.existsSync(file.replace(/\.db$/, '.json'))).toBe(true)
    expect(manifest.integrityOk).toBe(true)
    expect(manifest.total).toBeGreaterThan(0)
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/)

    // lo snapshot è un DB valido e integro
    const snap = new DatabaseSync(file)
    expect(snap.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok')
    snap.close()

    srcDb.close()
    fs.rmSync(dir, { recursive: true, force: true }) // pulizia completa, niente residui nel repo
  })
})
