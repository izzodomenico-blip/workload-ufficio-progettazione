import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { ROOT_DIR, getDb } from './db.js'
import { timestampForFilename } from './services/appData.js'
import { selectForRetention } from './retention.js'

export const VERIFIED_DIR = path.join(ROOT_DIR, 'backups', 'verified')
export const OFFSITE_RECEIPT_PATH = path.join(ROOT_DIR, 'backups', 'offsite-status.json')

export function buildManifest({ stamp, sizeBytes, integrityResult, counts, sha256, now, reason }) {
  return {
    version: 1,
    stamp,
    createdAt: now.toISOString(),
    reason,
    sizeBytes,
    integrityResult,
    integrityOk: integrityResult === 'ok',
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    sha256,
  }
}

export function isSnapshotDue(lastAtIso, now, intervalMs = 24 * 3600000) {
  if (!lastAtIso) return true
  const last = new Date(lastAtIso).getTime()
  if (!Number.isFinite(last)) return true
  return now - last >= intervalMs
}

function uniquePath(p) {
  if (!fs.existsSync(p)) return p
  const ext = path.extname(p)
  const base = p.slice(0, -ext.length)
  let i = 1
  while (fs.existsSync(`${base}_${i}${ext}`)) i += 1
  return `${base}_${i}${ext}`
}

export function createVerifiedSnapshot({ now = new Date(), reason = 'daily', db = getDb(), dir = VERIFIED_DIR } = {}) {
  fs.mkdirSync(dir, { recursive: true })
  const stamp = `${timestampForFilename(now)}-${String(now.getSeconds()).padStart(2, '0')}`
  const dbFile = uniquePath(path.join(dir, `verified_${stamp}.db`))

  // 1. snapshot coerente dal DB vivo (include il WAL)
  db.exec(`VACUUM INTO '${dbFile.replaceAll("'", "''")}';`)

  // 2. verifica sullo snapshot: integrità + conteggi per tabella
  const snap = new DatabaseSync(dbFile)
  let integrityResult = 'unknown'
  const counts = {}
  try {
    integrityResult = snap.prepare('PRAGMA integrity_check').get()?.integrity_check ?? 'unknown'
    const tables = snap.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
    for (const { name } of tables) counts[name] = snap.prepare(`SELECT COUNT(*) AS c FROM "${name}"`).get().c
  } finally {
    snap.close()
  }

  // 3. checksum + manifest
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(dbFile)).digest('hex')
  const sizeBytes = fs.statSync(dbFile).size
  const manifest = buildManifest({ stamp, sizeBytes, integrityResult, counts, sha256, now, reason })
  fs.writeFileSync(dbFile.replace(/\.db$/, '.json'), JSON.stringify(manifest, null, 2), 'utf8')

  // 4. ritenzione GFS locale
  pruneVerified(dir)
  return { file: dbFile, manifest }
}

function listVerifiedManifests(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((n) => n.startsWith('verified_') && n.endsWith('.json'))
    .map((n) => {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))
        return { name: n, createdAt: m.createdAt, manifest: m }
      } catch { return null }
    })
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) // più recente prima
}

export function readLatestVerified(dir = VERIFIED_DIR) {
  const all = listVerifiedManifests(dir)
  return all.length ? all[0].manifest : null
}

export function readOffsiteReceipt() {
  try {
    if (!fs.existsSync(OFFSITE_RECEIPT_PATH)) return null
    return JSON.parse(fs.readFileSync(OFFSITE_RECEIPT_PATH, 'utf8'))
  } catch { return null }
}

function pruneVerified(dir) {
  const all = listVerifiedManifests(dir)
  if (all.length === 0) return
  const { drop } = selectForRetention(all.map((x) => x.manifest.createdAt))
  const dropSet = new Set(drop)
  for (const x of all) {
    if (!dropSet.has(x.manifest.createdAt)) continue
    const base = x.name.replace(/\.json$/, '')
    for (const f of [`${base}.json`, `${base}.db`]) {
      try { fs.unlinkSync(path.join(dir, f)) } catch { /* ignora */ }
    }
  }
}
