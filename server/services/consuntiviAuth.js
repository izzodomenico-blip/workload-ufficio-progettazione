import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { STATE_DIR } from '../db.js'

// Password DEDICATA della sezione Consuntivi (Prezzi + Report), separata dal gate
// admin globale (carico base). Stesso schema hash+salt di adminAuth, file distinto.

export const CONSUNTIVI_CONFIG_PATH = process.env.WORKLOAD_CONSUNTIVI_CONFIG_PATH
  ? path.resolve(process.env.WORKLOAD_CONSUNTIVI_CONFIG_PATH)
  : path.join(STATE_DIR, 'consuntivi.config.json')

const FORMAT_VERSION = 1

function safeReadConfig() {
  try {
    if (!fs.existsSync(CONSUNTIVI_CONFIG_PATH)) return null
    const raw = fs.readFileSync(CONSUNTIVI_CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof parsed.passwordHash === 'string' && typeof parsed.salt === 'string') {
      return parsed
    }
    return null
  } catch (err) {
    console.warn('consuntiviAuth: impossibile leggere consuntivi.config.json:', err?.message ?? err)
    return null
  }
}

function writeConfig(config) {
  const tmp = `${CONSUNTIVI_CONFIG_PATH}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
  fs.renameSync(tmp, CONSUNTIVI_CONFIG_PATH)
}

function hashPassword(plain, salt) {
  return crypto.createHash('sha256').update(`${salt}:${plain}`).digest('hex')
}

function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export function getConsuntiviAuthStatus() {
  const cfg = safeReadConfig()
  return { protected: !!cfg, configPath: CONSUNTIVI_CONFIG_PATH }
}

/**
 * Verifica la password della sezione Consuntivi.
 *  - Se non e configurata alcuna password → ritorna true (sezione non protetta).
 *  - Se e configurata → verifica hash con timing-safe compare.
 */
export function verifyConsuntiviPassword(plain) {
  const cfg = safeReadConfig()
  if (!cfg) return true
  if (typeof plain !== 'string' || plain.length === 0) return false
  const candidate = hashPassword(plain, cfg.salt)
  return timingSafeEqualString(candidate, cfg.passwordHash)
}

/**
 * Imposta/cambia la password della sezione Consuntivi.
 *  - Se ne esiste gia una, richiede la password corrente per cambiarla.
 *  - newPassword vuota → rimuove la protezione.
 */
export function setConsuntiviPassword({ currentPassword, newPassword }) {
  const cfg = safeReadConfig()
  if (cfg) {
    if (!verifyConsuntiviPassword(currentPassword)) {
      const err = new Error('Password corrente della sezione Consuntivi non corretta.')
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
    if (fs.existsSync(CONSUNTIVI_CONFIG_PATH)) fs.unlinkSync(CONSUNTIVI_CONFIG_PATH)
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
