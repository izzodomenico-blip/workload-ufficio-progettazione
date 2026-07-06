import crypto from 'node:crypto'
import { getDb } from '../db.js'
import { CONTENT_SECTIONS, GRANTABLE_PERMISSIONS } from './permissions.js'

const SCRYPT_KEYLEN = 64
const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12h sliding

export function getDbForTests() { return getDb() }

export function hashPassword(plain, salt) {
  return crypto.scryptSync(String(plain), String(salt), SCRYPT_KEYLEN).toString('hex')
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

export function verifyPassword(plain, row) {
  if (!row || typeof row.salt !== 'string' || typeof row.passwordHash !== 'string') {
    // supporta anche la forma snake_case dal DB
    if (row && row.password_hash) row = { salt: row.salt, passwordHash: row.password_hash }
    else return false
  }
  const candidate = hashPassword(plain, row.salt)
  return timingSafeEqualHex(candidate, row.passwordHash)
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`
}

const VALID_ROLES = new Set(['amministratore', 'progettista', 'officina', 'sola_lettura'])

function publicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    linkedPersonId: row.linked_person_id || '',
    active: !!row.active,
  }
}

export function hasAnyUser(db = getDb()) {
  return Number(db.prepare('SELECT COUNT(*) c FROM users').get().c) > 0
}

export function countAdmins(db = getDb()) {
  return Number(db.prepare("SELECT COUNT(*) c FROM users WHERE role='amministratore' AND active=1").get().c)
}

export function getUserByUsername(username, db = getDb()) {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username))
  if (!row) return undefined
  return { ...publicUser(row), salt: row.salt, passwordHash: row.password_hash, active: !!row.active }
}

export function getUserById(id, db = getDb()) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(String(id))
  return row ? publicUser(row) : undefined
}

export function listUsers(db = getDb()) {
  return db.prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE ASC').all().map((row) => {
    const pu = publicUser(row)
    return { ...pu, sections: getUserSections(pu.id, db), grants: getUserPermissions(pu.id, db) }
  })
}

export function getUserSections(userId, db = getDb()) {
  return db.prepare('SELECT section FROM user_sections WHERE user_id = ? ORDER BY section')
    .all(String(userId)).map((r) => r.section)
}

export function setUserSections(userId, sections, db = getDb()) {
  const valid = new Set(CONTENT_SECTIONS)
  const clean = [...new Set((Array.isArray(sections) ? sections : []).filter((s) => valid.has(s)))]
  db.prepare('DELETE FROM user_sections WHERE user_id = ?').run(String(userId))
  const ins = db.prepare('INSERT INTO user_sections (user_id, section) VALUES (?, ?)')
  for (const s of clean) ins.run(String(userId), s)
}

export function getUserPermissions(userId, db = getDb()) {
  return db.prepare('SELECT permission FROM user_permissions WHERE user_id = ? ORDER BY permission')
    .all(String(userId)).map((r) => r.permission)
}

export function setUserPermissions(userId, grants, db = getDb()) {
  const valid = new Set(GRANTABLE_PERMISSIONS)
  const clean = [...new Set((Array.isArray(grants) ? grants : []).filter((g) => valid.has(g)))]
  db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(String(userId))
  const ins = db.prepare('INSERT INTO user_permissions (user_id, permission) VALUES (?, ?)')
  for (const g of clean) ins.run(String(userId), g)
}

export function createUser({ username, password, role, linkedPersonId = '' }, db = getDb()) {
  const u = String(username || '').trim()
  if (u.length < 3) { const e = new Error('Username troppo corto (min 3).'); e.statusCode = 400; throw e }
  if (String(password || '').length < 8) { const e = new Error('Password troppo corta (min 8).'); e.statusCode = 400; throw e }
  if (!VALID_ROLES.has(role)) { const e = new Error('Ruolo non valido.'); e.statusCode = 400; throw e }
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(u)
  if (exists) { const e = new Error('Username già esistente.'); e.statusCode = 409; throw e }
  const salt = crypto.randomBytes(16).toString('hex')
  const now = new Date().toISOString()
  const id = uid('usr')
  db.prepare(`INSERT INTO users (id, username, password_hash, salt, role, linked_person_id, active, must_change_password, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`)
    .run(id, u, hashPassword(password, salt), salt, role, linkedPersonId || null, now, now)
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id))
}

export function updateUser(id, patch, db = getDb()) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(String(id))
  if (!row) { const e = new Error('Utente non trovato.'); e.statusCode = 404; throw e }
  const role = patch.role !== undefined ? patch.role : row.role
  if (!VALID_ROLES.has(role)) { const e = new Error('Ruolo non valido.'); e.statusCode = 400; throw e }
  const active = patch.active !== undefined ? (patch.active ? 1 : 0) : row.active
  // impedisci di lasciare zero amministratori attivi
  if (row.role === 'amministratore' && (role !== 'amministratore' || active === 0) && countAdmins(db) <= 1) {
    const e = new Error('Deve restare almeno un amministratore attivo.'); e.statusCode = 400; throw e
  }
  const linked = patch.linkedPersonId !== undefined ? (patch.linkedPersonId || null) : row.linked_person_id
  db.prepare('UPDATE users SET role=?, active=?, linked_person_id=?, updated_at=? WHERE id=?')
    .run(role, active, linked, new Date().toISOString(), id)
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id))
}

export function setUserPassword(id, newPassword, db = getDb()) {
  if (String(newPassword || '').length < 8) { const e = new Error('Password troppo corta (min 8).'); e.statusCode = 400; throw e }
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get(String(id))
  if (!row) { const e = new Error('Utente non trovato.'); e.statusCode = 404; throw e }
  const salt = crypto.randomBytes(16).toString('hex')
  db.prepare('UPDATE users SET password_hash=?, salt=?, updated_at=? WHERE id=?')
    .run(hashPassword(newPassword, salt), salt, new Date().toISOString(), id)
}

export function deleteUser(id, db = getDb()) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(String(id))
  if (!row) return
  if (row.role === 'amministratore' && countAdmins(db) <= 1) {
    const e = new Error("Non puoi eliminare l'ultimo amministratore."); e.statusCode = 400; throw e
  }
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
  db.prepare('DELETE FROM user_sections WHERE user_id = ?').run(String(id))
  db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(String(id))
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

export function createSession(userId, db = getDb()) {
  const token = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString()
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, new Date(now).toISOString(), expiresAt)
  return { token, expiresAt }
}

export function getSessionUser(token, db = getDb()) {
  if (!token) return null
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(String(token))
  if (!s) return null
  if (new Date(s.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }
  const user = getUserById(s.user_id, db)
  if (!user || !user.active) return null
  // rinnovo sliding
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?')
    .run(new Date(Date.now() + SESSION_TTL_MS).toISOString(), token)
  return { ...user, sections: getUserSections(user.id, db), grants: getUserPermissions(user.id, db) }
}

export function deleteSession(token, db = getDb()) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(String(token))
}
