import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONFIG_PATH = process.env.WORKLOAD_ADMIN_CONFIG_PATH
  ? path.resolve(process.env.WORKLOAD_ADMIN_CONFIG_PATH)
  : path.resolve(__dirname, '..', 'admin.config.json')

const FORMAT_VERSION = 1

function safeReadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof parsed.passwordHash === 'string' && typeof parsed.salt === 'string') {
      return parsed
    }
    return null
  } catch (err) {
    console.warn('adminAuth: impossibile leggere admin.config.json:', err?.message ?? err)
    return null
  }
}

function writeConfig(config) {
  const tmp = `${CONFIG_PATH}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
  fs.renameSync(tmp, CONFIG_PATH)
}

function hashPassword(plain, salt) {
  return crypto.createHash('sha256').update(`${salt}:${plain}`).digest('hex')
}

function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Lo stato della protezione admin:
 *  - protected: true se è configurata una password
 *  - configPath: percorso del file
 */
export function getAdminStatus() {
  const cfg = safeReadConfig()
  return {
    protected: !!cfg,
    configPath: CONFIG_PATH,
  }
}

/**
 * Verifica una password contro la config salvata.
 *  - Se non è configurata alcuna password → ritorna true (campo non protetto).
 *  - Se è configurata → verifica hash con timing-safe compare.
 */
export function verifyAdminPassword(plain) {
  const cfg = safeReadConfig()
  if (!cfg) return true // non protetto
  if (typeof plain !== 'string' || plain.length === 0) return false
  const candidate = hashPassword(plain, cfg.salt)
  return timingSafeEqualString(candidate, cfg.passwordHash)
}

/**
 * Imposta una nuova password admin.
 *  - Se ne esiste già una, richiede la password corrente per cambiarla.
 *  - Se non esiste, viene creata.
 *  - Per rimuovere la protezione: passare currentPassword corretta e newPassword vuota.
 */
export function setAdminPassword({ currentPassword, newPassword }) {
  const cfg = safeReadConfig()
  if (cfg) {
    if (!verifyAdminPassword(currentPassword)) {
      const err = new Error('Password corrente non corretta.')
      err.statusCode = 403
      throw err
    }
  }
  if (typeof newPassword !== 'string') {
    const err = new Error('newPassword deve essere una stringa.')
    err.statusCode = 400
    throw err
  }
  if (newPassword.length === 0) {
    // Rimozione protezione
    if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH)
    return { protected: false }
  }
  if (newPassword.length < 4) {
    const err = new Error('La password deve essere lunga almeno 4 caratteri.')
    err.statusCode = 400
    throw err
  }
  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(newPassword, salt)
  writeConfig({
    version: FORMAT_VERSION,
    salt,
    passwordHash,
    createdAt: cfg?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  return { protected: true }
}

/**
 * Confronta due array di persone e ritorna i diff sul campo baselineLoadPercent.
 * Considera anche persone aggiunte (con baseline > 0) e rimosse.
 */
export function hasBaselineChanges(beforePeople, afterPeople) {
  const byId = new Map((beforePeople ?? []).map((p) => [p.id, p]))
  for (const after of afterPeople ?? []) {
    const before = byId.get(after.id)
    const beforeVal = normalizePercent(before?.baselineLoadPercent)
    const afterVal = normalizePercent(after?.baselineLoadPercent)
    if (beforeVal !== afterVal) return true
  }
  // Persone rimosse che avevano baseline > 0 — improbabile via PUT app-data, ma copriamo
  const afterIds = new Set((afterPeople ?? []).map((p) => p.id))
  for (const before of beforePeople ?? []) {
    if (afterIds.has(before.id)) continue
    if (normalizePercent(before?.baselineLoadPercent) !== 0) return true
  }
  return false
}

function normalizePercent(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 100) return 100
  return v
}
