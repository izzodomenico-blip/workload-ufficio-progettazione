import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { runMigrations } from '../db.js'
import * as a from './authService.js'
const { getUserSections, setUserSections, createUser, deleteUser, getUserPermissions, setUserPermissions } = a

// DB isolato per test: le funzioni di authService accettano un `db` esplicito
// (ultimo parametro), quindi non serve toccare la memoizzazione globale di getDb().
function freshDb() {
  const p = path.join(os.tmpdir(), `authtest-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`)
  const db = new DatabaseSync(p)
  db.exec('PRAGMA journal_mode = WAL;')
  runMigrations(db)
  return db
}

describe('password hashing', () => {
  it('hash e verify tornano true con la stessa password, false con altra', () => {
    const salt = 'abcd'
    const h = a.hashPassword('segreta123', salt)
    expect(a.verifyPassword('segreta123', { salt, passwordHash: h })).toBe(true)
    expect(a.verifyPassword('sbagliata', { salt, passwordHash: h })).toBe(false)
  })
})

describe('utenti e sessioni', () => {
  it('crea utente, lo trova, verifica login, crea/legge/elimina sessione', () => {
    const db = freshDb()
    const u = a.createUser({ username: 'mario', password: 'segreta123', role: 'progettista', linkedPersonId: '' }, db)
    expect(u.username).toBe('mario')
    expect(u.role).toBe('progettista')
    expect(u).not.toHaveProperty('passwordHash')
    expect(a.hasAnyUser(db)).toBe(true)
    const row = a.getUserByUsername('mario', db)
    expect(a.verifyPassword('segreta123', row)).toBe(true)
    const s = a.createSession(u.id, db)
    expect(a.getSessionUser(s.token, db)?.username).toBe('mario')
    a.deleteSession(s.token, db)
    expect(a.getSessionUser(s.token, db)).toBe(null)
  })

  it('username duplicato lancia; ultimo admin non eliminabile', () => {
    const db = freshDb()
    const admin = a.createUser({ username: 'admin', password: 'segreta123', role: 'amministratore' }, db)
    expect(() => a.createUser({ username: 'admin', password: 'segreta123', role: 'officina' }, db)).toThrow()
    expect(() => a.deleteUser(admin.id, db)).toThrow(/ultimo amministratore/i)
  })
})

describe('user_sections (visibilità sezioni per-utente)', () => {
  it('set/get override e scarta voci invalide o speciali', () => {
    const db = new DatabaseSync(':memory:'); runMigrations(db)
    const u = createUser({ username: 'sec1', password: 'Password1', role: 'officina' }, db)
    setUserSections(u.id, ['consuntivi', 'anagrafiche', 'utenti', 'boh'], db)
    expect(getUserSections(u.id, db)).toEqual(['anagrafiche', 'consuntivi'])
    db.close()
  })
  it('set vuoto azzera override', () => {
    const db = new DatabaseSync(':memory:'); runMigrations(db)
    const u = createUser({ username: 'sec2', password: 'Password1', role: 'officina' }, db)
    setUserSections(u.id, ['consuntivi'], db)
    setUserSections(u.id, [], db)
    expect(getUserSections(u.id, db)).toEqual([])
    db.close()
  })
  it('deleteUser rimuove anche le righe user_sections', () => {
    const db = new DatabaseSync(':memory:'); runMigrations(db)
    const u = createUser({ username: 'sec3', password: 'Password1', role: 'officina' }, db)
    setUserSections(u.id, ['consuntivi'], db)
    deleteUser(u.id, db)
    expect(getUserSections(u.id, db)).toEqual([])
    db.close()
  })
})

describe('user_permissions (grant per-utente)', () => {
  it('set/get grant e scarta voci fuori whitelist', () => {
    const db = new DatabaseSync(':memory:'); runMigrations(db)
    const u = createUser({ username: 'gr1', password: 'Password1', role: 'officina' }, db)
    setUserPermissions(u.id, ['viewConsuntiviPrices', 'manageUsers', 'boh'], db)
    expect(getUserPermissions(u.id, db)).toEqual(['viewConsuntiviPrices'])
    db.close()
  })
  it('set vuoto azzera; deleteUser pulisce', () => {
    const db = new DatabaseSync(':memory:'); runMigrations(db)
    const u = createUser({ username: 'gr2', password: 'Password1', role: 'officina' }, db)
    setUserPermissions(u.id, ['viewConsuntiviPrices'], db)
    setUserPermissions(u.id, [], db)
    expect(getUserPermissions(u.id, db)).toEqual([])
    setUserPermissions(u.id, ['viewConsuntiviPrices'], db)
    deleteUser(u.id, db)
    expect(getUserPermissions(u.id, db)).toEqual([])
    db.close()
  })
})
