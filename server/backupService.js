import fs from 'node:fs'
import path from 'node:path'
import { DB_PATH, ROOT_DIR, getAppData, getDb } from './db.js'
import { createBackupPayload, timestampForFilename } from './services/appData.js'

export const BACKUPS_DIR = path.join(ROOT_DIR, 'backups')
export const AUTO_BACKUPS_DIR = path.join(BACKUPS_DIR, 'auto')
const STATUS_PATH = path.join(BACKUPS_DIR, 'backup-status.json')
const DEFAULT_AUTO_BACKUP_LIMIT = 30
const AUTO_BACKUP_INTERVAL_MS = Number(process.env.WORKLOAD_AUTO_BACKUP_INTERVAL_MS ?? 30 * 60 * 1000)

let pendingTimer = null
let pendingReason = null
let pendingDueAt = null

export function createDatabaseBackup(reason = 'manual', options = {}) {
  const kind = options.kind ?? 'auto'
  const targetDir = kind === 'manual' ? BACKUPS_DIR : AUTO_BACKUPS_DIR
  ensureBackupDirs()

  const now = new Date()
  const stamp = timestampForFilenameWithSeconds(now)
  const dbPath = kind === 'manual'
    ? uniquePath(path.join(targetDir, `backup_workload_db_${stamp}.db`))
    : uniquePath(path.join(targetDir, `auto_backup_workload_${stamp}.db`))
  const jsonPath = kind === 'manual'
    ? uniquePath(path.join(targetDir, `backup_workload_ufficio_${stamp}.json`))
    : uniquePath(path.join(targetDir, `auto_backup_workload_${stamp}.json`))

  const db = getDb()
  const appData = getAppData(db)
  const payload = createBackupPayload(appData, now)
  fs.writeFileSync(jsonPath, JSON.stringify({
    ...payload,
    backupInfo: {
      ...payload.backupInfo,
      reason,
      backupKind: kind,
    },
  }, null, 2), 'utf8')

  const escapedDbPath = dbPath.replaceAll("'", "''")
  db.exec(`VACUUM INTO '${escapedDbPath}';`)

  const status = readStatus()
  if (kind === 'manual') {
    writeStatus({
      ...status,
      lastManualBackupAt: now.toISOString(),
      lastManualBackupReason: reason,
      lastManualBackupError: null,
    })
  } else {
    writeStatus({
      ...status,
      lastAutoBackupAt: now.toISOString(),
      lastAutoBackupReason: reason,
      lastAutoBackupError: null,
    })
    cleanupOldAutoBackups(options.limit ?? DEFAULT_AUTO_BACKUP_LIMIT)
    recordAutomaticBackupActivity(reason, now, db)
  }

  return {
    kind,
    reason,
    createdAt: now.toISOString(),
    dbPath,
    jsonPath,
  }
}

export function scheduleAutoBackup(reason = 'mutation') {
  try {
    ensureBackupDirs()
    const status = readStatus()
    const lastAutoAt = status.lastAutoBackupAt ? new Date(status.lastAutoBackupAt).getTime() : 0
    const now = Date.now()
    const elapsed = lastAutoAt > 0 ? now - lastAutoAt : Number.POSITIVE_INFINITY

    if (elapsed >= AUTO_BACKUP_INTERVAL_MS) {
      createDatabaseBackup(reason, { kind: 'auto' })
      return { scheduled: false, created: true }
    }

    pendingReason = reason
    pendingDueAt = lastAutoAt + AUTO_BACKUP_INTERVAL_MS
    if (!pendingTimer) {
      pendingTimer = setTimeout(() => {
        pendingTimer = null
        const dueReason = pendingReason ?? 'mutation'
        pendingReason = null
        pendingDueAt = null
        try {
          createDatabaseBackup(dueReason, { kind: 'auto' })
        } catch (error) {
          recordAutoBackupError(error, dueReason)
          console.error('Backup automatico fallito:', error)
        }
      }, Math.max(1_000, pendingDueAt - now))
    }
    return { scheduled: true, created: false, dueAt: new Date(pendingDueAt).toISOString() }
  } catch (error) {
    recordAutoBackupError(error, reason)
    console.error('Schedulazione backup automatico fallita:', error)
    return { scheduled: false, created: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function createPreMutationBackup(reason = 'risky-mutation') {
  try {
    return createDatabaseBackup(`pre-${reason}`, { kind: 'auto' })
  } catch (error) {
    recordAutoBackupError(error, reason)
    console.error('Backup pre-mutazione fallito:', error)
    return null
  }
}

export function createManualBackup(reason = 'manual') {
  try {
    return createDatabaseBackup(reason, { kind: 'manual' })
  } catch (error) {
    const status = readStatus()
    writeStatus({
      ...status,
      lastManualBackupError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export function cleanupOldAutoBackups(limit = DEFAULT_AUTO_BACKUP_LIMIT) {
  ensureBackupDirs()
  const dbFiles = fs.readdirSync(AUTO_BACKUPS_DIR)
    .filter((name) => name.startsWith('auto_backup_workload_') && name.endsWith('.db'))
    .map((name) => {
      const fullPath = path.join(AUTO_BACKUPS_DIR, name)
      return { name, fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  for (const file of dbFiles.slice(limit)) {
    safeUnlink(file.fullPath)
    const stamp = file.name.replace('auto_backup_workload_', '').replace(/\.db$/, '')
    safeUnlink(path.join(AUTO_BACKUPS_DIR, `auto_backup_workload_${stamp}.json`))
  }
}

export function getBackupStatus() {
  ensureBackupDirs()
  const status = readStatus()
  const autoFiles = listBackupFiles(AUTO_BACKUPS_DIR, 'auto_backup_workload_', '.db')
  const manualFiles = listBackupFiles(BACKUPS_DIR, 'backup_workload_db_', '.db')
  const latestAuto = autoFiles[0]
  const latestManual = manualFiles[0]

  return {
    lastAutoBackupAt: status.lastAutoBackupAt ?? (latestAuto ? new Date(latestAuto.mtimeMs).toISOString() : null),
    lastManualBackupAt: status.lastManualBackupAt ?? (latestManual ? new Date(latestManual.mtimeMs).toISOString() : null),
    autoBackupCount: autoFiles.length,
    backupDirectory: AUTO_BACKUPS_DIR,
    autoBackupEnabled: true,
    pendingAutoBackupAt: pendingDueAt ? new Date(pendingDueAt).toISOString() : null,
    lastAutoBackupError: status.lastAutoBackupError ?? null,
  }
}

function ensureBackupDirs() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true })
  fs.mkdirSync(AUTO_BACKUPS_DIR, { recursive: true })
}

function readStatus() {
  try {
    if (!fs.existsSync(STATUS_PATH)) return {}
    return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function writeStatus(status) {
  ensureBackupDirs()
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf8')
}

function recordAutoBackupError(error, reason) {
  const status = readStatus()
  writeStatus({
    ...status,
    lastAutoBackupReason: reason,
    lastAutoBackupError: error instanceof Error ? error.message : String(error),
  })
}

export function recordAutomaticBackupActivity(reason, at = new Date(), db = getDb()) {
  try {
    const timestamp = at.toISOString()
    const entry = {
      id: `log_backup_${at.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp,
      entityType: 'system',
      entityId: 'backup-auto',
      action: 'exported',
      title: 'Backup automatico creato',
      description: reason ? `Motivo: ${reason}.` : undefined,
    }
    db.prepare('INSERT INTO activity_log (id, timestamp, data, updated_at) VALUES (?, ?, ?, ?)')
      .run(entry.id, timestamp, JSON.stringify(entry), timestamp)
    db.prepare(`
      DELETE FROM activity_log
      WHERE id NOT IN (
        SELECT id FROM activity_log ORDER BY timestamp DESC LIMIT 1000
      )
    `).run()
  } catch (error) {
    console.error('Registrazione storico backup automatico fallita:', error)
  }
}

function listBackupFiles(dir, prefix, suffix) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
    .map((name) => {
      const fullPath = path.join(dir, name)
      return { name, fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

function uniquePath(initialPath) {
  if (!fs.existsSync(initialPath)) return initialPath
  const ext = path.extname(initialPath)
  const base = initialPath.slice(0, -ext.length)
  let i = 1
  while (fs.existsSync(`${base}_${i}${ext}`)) i += 1
  return `${base}_${i}${ext}`
}

function timestampForFilenameWithSeconds(date) {
  const base = timestampForFilename(date)
  return `${base}-${String(date.getSeconds()).padStart(2, '0')}`
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath)
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error(`Impossibile eliminare backup vecchio ${filePath}:`, error)
  }
}
