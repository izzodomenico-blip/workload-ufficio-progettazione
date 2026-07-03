# Login + Permessi (RBAC) — Implementation Plan (sotto-progetto B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere login con credenziali e permessi per ruolo, con enforcement reale lato server (autenticazione, lettura filtrata, scrittura autorizzata), così che l'admin faccia tutto e gli altri accedano solo a certe finestre e non eliminino il lavoro altrui né vedano dati riservati.

**Architecture:** Utenti/sessioni in tabelle SQLite dedicate (fuori da AppData). Auth via cookie di sessione httpOnly; middleware su `/api`. Il modello "albero intero" resta: `GET /api/app-data` viene FILTRATO per ruolo, `PUT /api/app-data` viene AUTORIZZATO con un diff-guard che rifiuta le modifiche non permesse. I permessi sono calcolati dal ruolo **solo lato server** e inviati al client (unica fonte di verità, niente drift). Password con `scrypt` (Node built-in).

**Tech Stack:** Node/Express, `node:sqlite`, `node:crypto` (scrypt, randomBytes, timingSafeEqual), React 19 + TypeScript, vitest.

## Global Constraints
- Ruoli: `amministratore`, `progettista`, `officina`, `sola_lettura` (stringhe esatte).
- Le credenziali/utenti NON entrano mai in `AppData` né in `GET /api/app-data`.
- Enforcement REALE lato server: lettura filtrata + diff-guard in scrittura. La UI filtra come difesa in profondità, non come unica barriera.
- Password: `scrypt(password, salt, 64)`, salt 16 byte hex, confronto `timingSafeEqual`, min 8 caratteri.
- Cookie sessione: `httpOnly`, `SameSite=Lax`, `Path=/`, `Secure` solo se HTTPS; token 32 byte hex; scadenza sliding 12h.
- Nessuna nuova dipendenza runtime (niente cookie-parser/passport/bcrypt): usare `node:crypto`, `res.cookie` (built-in Express), parse manuale di `req.headers.cookie`.
- `createdByUserId?: string` aggiunto a `WorkItem`, `Task`, `Consuntivo`; impostato dal server alla creazione, immutabile in update; assente = legacy (elimina solo admin).
- Struttura `Permissions` (server la calcola, il client la consuma):
  `{ sections: string[], canCreateWork, canEditWork, canDeleteOwnWork, deleteAny, manageUsers, managePeople, viewConsuntiviPrices, manageBackups, viewLog }`.

---

## File structure

**Nuovi (server):**
- `server/migrations/009_add_users_sessions.sql` — tabelle `users`, `sessions`.
- `server/services/authService.js` — scrypt, CRUD utenti (SQLite), sessioni, bootstrap.
- `server/services/permissions.js` — `permissionsForRole(role)`, `ROLES`, `SECTIONS`.
- `server/services/appDataAuthz.js` — `filterAppDataForUser`, `authorizeAppDataChange`.
- Test: `server/services/authService.test.mjs`, `server/services/permissions.test.mjs`, `server/services/appDataAuthz.test.mjs` (eseguiti con vitest — vedi Task 1).

**Nuovi (frontend):**
- `src/state/AuthProvider.tsx` — context auth (me/login/logout/setup), gate dell'app.
- `src/components/LoginScreen.tsx` — login + setup primo admin (brand Flowrlink).
- `src/components/UsersView.tsx` — gestione utenti (admin).

**Modificati (server):** `server/routes/index.js` (middleware auth + endpoint auth/users + filtro GET + authz PUT), `server/services/appData.js` (normalize `createdByUserId`), `server/db.js` (nessuna modifica se authService usa `getDb()` direttamente).

**Modificati (frontend):** `src/types/index.ts` (createdByUserId + tipi auth), `src/services/apiClient.ts` (auth/users + 401), `src/state/DataProvider.tsx` (403 → toast+rollback), `src/App.tsx` (AuthProvider wrap + header utente/logout), `src/components/Dashboard.tsx` (tab per sezioni + gate bottoni + tab Utenti).

---

### Task 1: Vitest per il server + authService (scrypt + utenti + sessioni)

**Files:**
- Create: `server/migrations/009_add_users_sessions.sql`
- Create: `server/services/authService.js`
- Create: `server/services/authService.test.mjs`
- Modify: `vitest.config` — nessuna (vitest gira già `*.test.*`); assicurarsi che includa `server/**`. Se serve, `package.json` script `test` già `vitest run` prende tutto il repo.

**Interfaces:**
- Produces: `hashPassword(plain, salt)→hex`, `verifyPassword(plain, {salt, passwordHash})→bool`, `createUser({username,password,role,linkedPersonId})→user`, `listUsers()→user[]`, `getUserByUsername(username)→row|undefined`, `getUserById(id)→row|undefined`, `updateUser(id, patch)→user`, `setUserPassword(id, newPassword)→void`, `deleteUser(id)→void`, `countAdmins()→number`, `hasAnyUser()→bool`, `createSession(userId)→{token,expiresAt}`, `getSessionUser(token)→user|null` (con rinnovo sliding), `deleteSession(token)→void`. `user` pubblico = `{id, username, role, linkedPersonId, active}` (mai l'hash).

- [ ] **Step 1: Migration 009**

Create `server/migrations/009_add_users_sessions.sql`:
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL,
  linked_person_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
```
(Le migration girano da sole all'avvio, sono idempotenti — vedi `server/db.js runMigrations`.)

- [ ] **Step 2: Scrivere i test (falliscono)** — `server/services/authService.test.mjs`

```js
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { runMigrations } from '../db.js'
import * as a from './authService.js'

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
```

Nota: `runMigrations` è già esportata da `server/db.js` e accetta un `db` esplicito.

- [ ] **Step 3: Verificare il fallimento**

Run: `npx vitest run server/services/authService.test.mjs`
Expected: FAIL (`Cannot find module './authService.js'`).

- [ ] **Step 4: Implementare `server/services/authService.js`**

```js
import crypto from 'node:crypto'
import { getDb } from '../db.js'

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
  return db.prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE ASC').all().map(publicUser)
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
  return user
}

export function deleteSession(token, db = getDb()) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(String(token))
}
```

- [ ] **Step 5: Verificare i test — devono passare**

Run: `npx vitest run server/services/authService.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/migrations/009_add_users_sessions.sql server/services/authService.js server/services/authService.test.mjs
git commit -m "feat(rbac): tabelle utenti/sessioni + authService (scrypt, sessioni)"
```

---

### Task 2: Modello permessi (`permissions.js`) + tipi frontend + createdByUserId

**Files:**
- Create: `server/services/permissions.js`
- Create: `server/services/permissions.test.mjs`
- Modify: `src/types/index.ts` (tipi auth + `createdByUserId?` su WorkItem/Task/Consuntivo)
- Modify: `server/services/appData.js` (passthrough `createdByUserId` in normalizeWorkItem/Task/Consuntivo)

**Interfaces:**
- Consumes: ruoli da Task 1.
- Produces: `permissionsForRole(role)→Permissions`, `ROLES`, `ROLE_LABELS`, `SECTIONS`. Tipi TS `Role`, `SectionId`, `Permissions`, `AuthUser`.

- [ ] **Step 1: Test permessi (fallisce)** — `server/services/permissions.test.mjs`

```js
import { describe, it, expect } from 'vitest'
import { permissionsForRole } from './permissions.js'

describe('permissionsForRole', () => {
  it('amministratore: tutto', () => {
    const p = permissionsForRole('amministratore')
    expect(p.deleteAny).toBe(true)
    expect(p.manageUsers).toBe(true)
    expect(p.viewConsuntiviPrices).toBe(true)
    expect(p.sections).toContain('utenti')
    expect(p.sections).toContain('consuntivi')
  })
  it('progettista: ufficio tecnico, niente riservati', () => {
    const p = permissionsForRole('progettista')
    expect(p.canCreateWork).toBe(true)
    expect(p.deleteAny).toBe(false)
    expect(p.manageUsers).toBe(false)
    expect(p.viewConsuntiviPrices).toBe(false)
    expect(p.sections).toEqual(expect.arrayContaining(['dashboard', 'planning', 'agenda', 'anagrafiche', 'disegni']))
    expect(p.sections).not.toContain('utenti')
  })
  it('officina: sezioni officina + consuntivi data-entry', () => {
    const p = permissionsForRole('officina')
    expect(p.sections).toEqual(expect.arrayContaining(['officina', 'officina-planning', 'operai', 'consuntivi']))
    expect(p.viewConsuntiviPrices).toBe(false)
  })
  it('sola_lettura: nessuna scrittura', () => {
    const p = permissionsForRole('sola_lettura')
    expect(p.canCreateWork).toBe(false)
    expect(p.canEditWork).toBe(false)
    expect(p.canDeleteOwnWork).toBe(false)
  })
  it('ruolo sconosciuto → permessi minimi (sola lettura vuota)', () => {
    const p = permissionsForRole('xxx')
    expect(p.canEditWork).toBe(false)
    expect(p.sections).toEqual([])
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npx vitest run server/services/permissions.test.mjs`
Expected: FAIL (modulo assente).

- [ ] **Step 3: Implementare `server/services/permissions.js`**

```js
export const ROLES = ['amministratore', 'progettista', 'officina', 'sola_lettura']
export const ROLE_LABELS = {
  amministratore: 'Amministratore',
  progettista: 'Progettista',
  officina: 'Officina',
  sola_lettura: 'Sola lettura',
}
export const SECTIONS = [
  'dashboard', 'planning', 'agenda', 'anagrafiche', 'disegni',
  'officina', 'operai', 'officina-planning', 'consuntivi', 'log', 'utenti',
]

function base() {
  return {
    sections: [],
    canCreateWork: false,
    canEditWork: false,
    canDeleteOwnWork: false,
    deleteAny: false,
    manageUsers: false,
    managePeople: false,
    viewConsuntiviPrices: false,
    manageBackups: false,
    viewLog: false,
  }
}

export function permissionsForRole(role) {
  const p = base()
  if (role === 'amministratore') {
    return {
      sections: [...SECTIONS],
      canCreateWork: true, canEditWork: true, canDeleteOwnWork: true, deleteAny: true,
      manageUsers: true, managePeople: true, viewConsuntiviPrices: true, manageBackups: true, viewLog: true,
    }
  }
  if (role === 'progettista') {
    return { ...p, sections: ['dashboard', 'planning', 'agenda', 'anagrafiche', 'disegni'],
      canCreateWork: true, canEditWork: true, canDeleteOwnWork: true }
  }
  if (role === 'officina') {
    return { ...p, sections: ['officina', 'officina-planning', 'operai', 'consuntivi'],
      canCreateWork: true, canEditWork: true, canDeleteOwnWork: true }
  }
  if (role === 'sola_lettura') {
    return { ...p, sections: ['dashboard', 'officina', 'consuntivi'] }
  }
  return p
}
```

- [ ] **Step 4: Verificare i test — passano**

Run: `npx vitest run server/services/permissions.test.mjs`
Expected: PASS.

- [ ] **Step 5: Tipi frontend** — in `src/types/index.ts` aggiungi in fondo:

```typescript
// === Auth / permessi (sotto-progetto B) ===
export type Role = 'amministratore' | 'progettista' | 'officina' | 'sola_lettura'
export type SectionId =
  | 'dashboard' | 'planning' | 'agenda' | 'anagrafiche' | 'disegni'
  | 'officina' | 'operai' | 'officina-planning' | 'consuntivi' | 'log' | 'utenti'

export interface Permissions {
  sections: SectionId[]
  canCreateWork: boolean
  canEditWork: boolean
  canDeleteOwnWork: boolean
  deleteAny: boolean
  manageUsers: boolean
  managePeople: boolean
  viewConsuntiviPrices: boolean
  manageBackups: boolean
  viewLog: boolean
}

export interface AuthUser {
  id: string
  username: string
  role: Role
  linkedPersonId: string
  permissions: Permissions
}
```

E aggiungi `createdByUserId?: string` a `WorkItem`, `Task`, `Consuntivo` (nuovo campo opzionale in ciascuna interfaccia).

- [ ] **Step 6: Passthrough server** — in `server/services/appData.js`, nelle funzioni `normalizeWorkItem`, `normalizeTask`, `normalizeConsuntivo`, aggiungere alla fine dell'oggetto ritornato:

```javascript
    createdByUserId: isString(o.createdByUserId) ? o.createdByUserId : '',
```

(normalizeWorkItem e normalizeTask usano `...o` quindi lo conservano già; aggiungere la riga esplicita garantisce il tipo stringa. normalizeConsuntivo NON usa `...o`, quindi la riga è necessaria lì.)

- [ ] **Step 7: Verifica typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.
```bash
git add server/services/permissions.js server/services/permissions.test.mjs src/types/index.ts server/services/appData.js
git commit -m "feat(rbac): modello permessi per ruolo + tipi auth + createdByUserId"
```

---

### Task 3: Read-filter (`filterAppDataForUser`)

**Files:**
- Create: `server/services/appDataAuthz.js` (parte 1: filtro)
- Create: `server/services/appDataAuthz.test.mjs` (parte 1)

**Interfaces:**
- Consumes: `Permissions` (forma da Task 2).
- Produces: `filterAppDataForUser(tree, perms) → tree'` (copia con i campi riservati rimossi).

- [ ] **Step 1: Test filtro (fallisce)** — `server/services/appDataAuthz.test.mjs`

```js
import { describe, it, expect } from 'vitest'
import { filterAppDataForUser } from './appDataAuthz.js'
import { permissionsForRole } from './permissions.js'

const tree = () => ({
  people: [{ id: 'p1', name: 'A', baselineLoadPercent: 30 }],
  workItems: [], tasks: [], absences: [], notifications: [],
  activityLog: [{ id: 'l1', timestamp: 't', entityType: 'system', action: 'created', title: 'x' }],
  businessPartners: [{ id: 'bp1', name: 'Cli', balance: 999, exposure: 5, creditLimit: 10, risk: 2 }],
  machineTypes: [], workshopOutputs: [], workshopWorkers: [], workshopAssignments: [],
  calculatedStandardComponents: [], consuntivi: [], tubeProfiles: [],
})

describe('filterAppDataForUser', () => {
  it('non-admin: rimuove log, baseline, campi finanziari', () => {
    const out = filterAppDataForUser(tree(), permissionsForRole('progettista'))
    expect(out.activityLog).toEqual([])
    expect(out.people[0]).not.toHaveProperty('baselineLoadPercent')
    expect(out.businessPartners[0]).not.toHaveProperty('balance')
    expect(out.businessPartners[0]).not.toHaveProperty('exposure')
    expect(out.businessPartners[0].name).toBe('Cli')
  })
  it('admin: lascia tutto', () => {
    const out = filterAppDataForUser(tree(), permissionsForRole('amministratore'))
    expect(out.activityLog.length).toBe(1)
    expect(out.people[0].baselineLoadPercent).toBe(30)
    expect(out.businessPartners[0].balance).toBe(999)
  })
  it('non muta l\'albero originale', () => {
    const t = tree()
    filterAppDataForUser(t, permissionsForRole('progettista'))
    expect(t.people[0].baselineLoadPercent).toBe(30)
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npx vitest run server/services/appDataAuthz.test.mjs`
Expected: FAIL (modulo assente).

- [ ] **Step 3: Implementare il filtro** — `server/services/appDataAuthz.js`

```js
const FINANCIAL_FIELDS = ['balance', 'exposure', 'creditLimit', 'overCreditLimit', 'risk']

export function filterAppDataForUser(tree, perms) {
  const out = { ...tree }
  if (!perms.viewLog) out.activityLog = []
  if (!perms.managePeople) {
    out.people = (tree.people || []).map((p) => {
      const { baselineLoadPercent, ...rest } = p
      return rest
    })
    out.businessPartners = (tree.businessPartners || []).map((bp) => {
      const copy = { ...bp }
      for (const f of FINANCIAL_FIELDS) delete copy[f]
      return copy
    })
  }
  return out
}
```

- [ ] **Step 4: Verificare i test — passano**

Run: `npx vitest run server/services/appDataAuthz.test.mjs`
Expected: PASS (i 3 test del filtro).

- [ ] **Step 5: Commit**

```bash
git add server/services/appDataAuthz.js server/services/appDataAuthz.test.mjs
git commit -m "feat(rbac): filtro in lettura dell'AppData per ruolo"
```

---

### Task 4: Write diff-guard (`authorizeAppDataChange`) — il cuore

**Files:**
- Modify: `server/services/appDataAuthz.js` (aggiungi `authorizeAppDataChange`)
- Modify: `server/services/appDataAuthz.test.mjs` (aggiungi test authz)

**Interfaces:**
- Consumes: current tree (da DB, completo), incoming tree (dal client, filtrato), `user` = `{id, permissions}`.
- Produces: `authorizeAppDataChange(current, incoming, user) → tree'` autorizzato (con `createdByUserId` stampati, campi riservati reintegrati, log append-only) OPPURE lancia `Error` con `statusCode=403`.

- [ ] **Step 1: Test authz (falliscono)** — aggiungi in `appDataAuthz.test.mjs`

```js
import { authorizeAppDataChange } from './appDataAuthz.js'
import { permissionsForRole } from './permissions.js'

const EMPTY = {
  people: [], workItems: [], tasks: [], absences: [], notifications: [], activityLog: [],
  businessPartners: [], machineTypes: [], workshopOutputs: [], workshopWorkers: [],
  workshopAssignments: [], calculatedStandardComponents: [], consuntivi: [], tubeProfiles: [],
}
const wi = (id, owner) => ({ id, type: 'commessa', code: id, title: id, status: 'In corso', dueDate: '2026-01-01', createdByUserId: owner })
const progettista = { id: 'u1', permissions: permissionsForRole('progettista') }
const admin = { id: 'a1', permissions: permissionsForRole('amministratore') }

describe('authorizeAppDataChange — proprietà lavoro', () => {
  it('non-admin NON può eliminare lavoro altrui (403)', () => {
    const current = { ...EMPTY, workItems: [wi('w1', 'u2')] }
    const incoming = { ...EMPTY, workItems: [] } // ha eliminato w1 (di u2)
    expect(() => authorizeAppDataChange(current, incoming, progettista)).toThrow(/permess/i)
  })
  it('non-admin PUÒ eliminare il proprio lavoro', () => {
    const current = { ...EMPTY, workItems: [wi('w1', 'u1')] }
    const incoming = { ...EMPTY, workItems: [] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.workItems.length).toBe(0)
  })
  it('non-admin che crea un lavoro: il server stampa createdByUserId = utente', () => {
    const current = { ...EMPTY }
    const incoming = { ...EMPTY, workItems: [{ id: 'wNew', type: 'commessa', code: 'x', title: 'x', status: 'In corso', dueDate: '2026-01-01', createdByUserId: 'FALSO' }] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.workItems[0].createdByUserId).toBe('u1')
  })
  it('update non può cambiare createdByUserId (preservato dal DB)', () => {
    const current = { ...EMPTY, workItems: [wi('w1', 'u2')] }
    const incoming = { ...EMPTY, workItems: [{ ...wi('w1', 'HACK'), title: 'modificato' }] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.workItems[0].createdByUserId).toBe('u2') // preservato
    expect(out.workItems[0].title).toBe('modificato') // edit consentito
  })
  it('admin può eliminare lavoro altrui', () => {
    const current = { ...EMPTY, workItems: [wi('w1', 'u2')] }
    const incoming = { ...EMPTY, workItems: [] }
    const out = authorizeAppDataChange(current, incoming, admin)
    expect(out.workItems.length).toBe(0)
  })
})

describe('authorizeAppDataChange — sezioni riservate', () => {
  it('non-managePeople NON può cambiare una persona (403)', () => {
    const current = { ...EMPTY, people: [{ id: 'p1', name: 'A', weeklyCapacityHours: 40 }] }
    const incoming = { ...EMPTY, people: [{ id: 'p1', name: 'MODIFICATO', weeklyCapacityHours: 40 }] }
    expect(() => authorizeAppDataChange(current, incoming, progettista)).toThrow(/permess/i)
  })
  it('non-admin NON può eliminare un\'anagrafica (403)', () => {
    const current = { ...EMPTY, businessPartners: [{ id: 'bp1', name: 'C' }] }
    const incoming = { ...EMPTY, businessPartners: [] }
    expect(() => authorizeAppDataChange(current, incoming, progettista)).toThrow(/permess/i)
  })
  it('activityLog: client vuoto NON azzera lo storico (append-only)', () => {
    const current = { ...EMPTY, activityLog: [{ id: 'l1', timestamp: 't', entityType: 'system', action: 'created', title: 'x' }] }
    const incoming = { ...EMPTY, activityLog: [] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.activityLog.length).toBe(1)
  })
  it('baseline assente (filtrato) NON azzera il valore in DB', () => {
    const current = { ...EMPTY, people: [{ id: 'p1', name: 'A', weeklyCapacityHours: 40, baselineLoadPercent: 25 }] }
    const incoming = { ...EMPTY, people: [{ id: 'p1', name: 'A', weeklyCapacityHours: 40 }] } // baseline filtrato
    // progettista non può toccare people; ma il campo baseline deve comunque restare 25 se la persona è invariata:
    // qui la persona è "identica" a meno del campo filtrato -> deve risultare autorizzata e baseline preservata
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.people[0].baselineLoadPercent).toBe(25)
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npx vitest run server/services/appDataAuthz.test.mjs`
Expected: FAIL (authorizeAppDataChange non esiste).

- [ ] **Step 3: Implementare `authorizeAppDataChange`** — aggiungi in `server/services/appDataAuthz.js`

```js
// Collezioni la cui eliminazione è ammessa solo ad admin (deleteAny).
const ADMIN_DELETE_ONLY = [
  'businessPartners', 'machineTypes', 'workshopWorkers',
  'workshopOutputs', 'workshopAssignments', 'tubeProfiles', 'calculatedStandardComponents',
]
// Collezioni con proprietà (creatore): delete = creatore o admin.
const OWNED = ['workItems', 'tasks', 'consuntivi']

function byId(list) {
  const m = new Map()
  for (const x of list || []) m.set(x.id, x)
  return m
}
function forbid(msg) { const e = new Error(msg); e.statusCode = 403; e.detail = 'permission-denied'; throw e }

export function authorizeAppDataChange(current, incoming, user) {
  const perms = user.permissions
  const out = { ...incoming }

  // 1) Collezioni con proprietà (workItems/tasks/consuntivi)
  for (const key of OWNED) {
    const cur = byId(current[key])
    const inc = incoming[key] || []
    const incIds = new Set(inc.map((x) => x.id))
    // eliminazioni: presenti in current ma non in incoming
    for (const [id, item] of cur) {
      if (!incIds.has(id)) {
        const owner = item.createdByUserId || ''
        if (!perms.deleteAny && !(perms.canDeleteOwnWork && owner === user.id)) {
          forbid(`Non hai i permessi per eliminare ${key} altrui.`)
        }
      }
    }
    // create/update
    out[key] = inc.map((item) => {
      const before = cur.get(item.id)
      if (!before) {
        if (!perms.canCreateWork) forbid(`Non hai i permessi per creare in ${key}.`)
        return { ...item, createdByUserId: user.id } // stampa creatore
      }
      // update: consentito con canEditWork; preserva createdByUserId
      if (!perms.canEditWork && JSON.stringify(before) !== JSON.stringify(item)) {
        forbid(`Non hai i permessi per modificare ${key}.`)
      }
      return { ...item, createdByUserId: before.createdByUserId || '' }
    })
  }

  // 2) Collezioni admin-delete-only + edit con canEditWork
  for (const key of ADMIN_DELETE_ONLY) {
    const cur = byId(current[key])
    const inc = incoming[key] || []
    const incIds = new Set(inc.map((x) => x.id))
    for (const [id] of cur) {
      if (!incIds.has(id) && !perms.deleteAny) forbid(`Solo l'amministratore può eliminare in ${key}.`)
    }
    for (const item of inc) {
      const before = cur.get(item.id)
      const changed = !before || JSON.stringify(before) !== JSON.stringify(item)
      if (changed && !perms.canEditWork && !perms.deleteAny) forbid(`Non hai i permessi per modificare ${key}.`)
    }
    out[key] = inc
  }

  // 3) people + absences: solo managePeople. Se non hai managePeople, devono risultare INVARIATE
  //    (a meno dei campi filtrati, che vengono reintegrati dal DB).
  for (const key of ['people', 'absences']) {
    if (perms.managePeople) { out[key] = incoming[key]; continue }
    const cur = byId(current[key])
    const inc = incoming[key] || []
    if (inc.length !== cur.size) forbid(`Non hai i permessi per modificare ${key}.`)
    const merged = []
    for (const item of inc) {
      const before = cur.get(item.id)
      if (!before) forbid(`Non hai i permessi per modificare ${key}.`)
      // reintegra i campi filtrati (baseline, finanziari) dal DB e confronta il resto
      const reintegrated = key === 'people'
        ? { ...item, baselineLoadPercent: before.baselineLoadPercent }
        : item
      if (JSON.stringify(before) !== JSON.stringify({ ...before, ...reintegrated })) {
        forbid(`Non hai i permessi per modificare ${key}.`)
      }
      merged.push(reintegrated)
    }
    out[key] = merged
  }

  // 4) businessPartners: reintegra i campi finanziari filtrati (se non managePeople)
  if (!perms.managePeople) {
    const cur = byId(current.businessPartners)
    out.businessPartners = (out.businessPartners || []).map((bp) => {
      const before = cur.get(bp.id)
      if (!before) return bp
      const fin = {}
      for (const f of FINANCIAL_FIELDS) if (before[f] !== undefined) fin[f] = before[f]
      return { ...bp, ...fin }
    })
  }

  // 5) activityLog append-only: parti dal log corrente, aggiungi solo le voci con id nuovo
  {
    const curLog = current.activityLog || []
    const seen = new Set(curLog.map((e) => e.id))
    const additions = (incoming.activityLog || []).filter((e) => e && e.id && !seen.has(e.id))
    out.activityLog = [...additions, ...curLog]
  }

  return out
}
```

- [ ] **Step 4: Verificare i test — passano**

Run: `npx vitest run server/services/appDataAuthz.test.mjs`
Expected: PASS (filtro + authz, tutti verdi).

- [ ] **Step 5: Commit**

```bash
git add server/services/appDataAuthz.js server/services/appDataAuthz.test.mjs
git commit -m "feat(rbac): diff-guard di autorizzazione in scrittura (cuore enforcement)"
```

---

### Task 5: Middleware auth + endpoint auth (login/logout/me/setup) + wiring GET/PUT

**Files:**
- Modify: `server/routes/index.js`

**Interfaces:**
- Consumes: authService (Task 1), permissions (Task 2), appDataAuthz (Task 3/4).
- Produces: cookie di sessione; `req.user` con `permissions`; `GET /api/app-data` filtrato; `PUT /api/app-data` autorizzato; `POST /api/auth/login|logout`, `GET /api/auth/me`, `POST /api/auth/setup-admin`.

- [ ] **Step 1: Import in cima a `server/routes/index.js`**

Aggiungi:
```javascript
import {
  createSession, createUser, deleteSession, getSessionUser,
  getUserByUsername, hasAnyUser, verifyPassword,
} from '../services/authService.js'
import { permissionsForRole } from '../services/permissions.js'
import { authorizeAppDataChange, filterAppDataForUser } from '../services/appDataAuthz.js'
```

- [ ] **Step 2: Helper cookie + auth (module-level, in fondo al file vicino a `badRequest`)**

```javascript
const SESSION_COOKIE = 'flowrlink_session'

function parseCookies(req) {
  const raw = req.headers.cookie
  const out = {}
  if (!raw) return out
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE]
  const user = getSessionUser(token)
  if (!user) return null
  return { ...user, permissions: permissionsForRole(user.role) }
}

function setSessionCookie(res, token) {
  const secure = process.env.WORKLOAD_HTTPS === '1'
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 12 * 60 * 60 * 1000,
  })
}
```

- [ ] **Step 3: Middleware auth all'inizio del router**

In `createApiRouter`, SUBITO dopo `const router = Router()`, prima di `router.get('/health'...)`:

```javascript
  // Endpoint pubblici (senza sessione): health, login, setup-admin, stato-setup.
  const PUBLIC = new Set(['/health', '/auth/login', '/auth/setup-admin', '/auth/setup-status'])

  router.get('/auth/setup-status', (_req, res) => {
    res.json({ needsSetup: !hasAnyUser() })
  })

  router.post('/auth/setup-admin', (req, res, next) => {
    try {
      if (hasAnyUser()) { const e = new Error('Setup già eseguito.'); e.statusCode = 409; throw e }
      const { username, password } = req.body ?? {}
      const user = createUser({ username, password, role: 'amministratore', linkedPersonId: '' })
      const { token } = createSession(user.id)
      setSessionCookie(res, token)
      res.status(201).json({ user: { ...user, permissions: permissionsForRole(user.role) } })
    } catch (error) { next(error.statusCode ? error : badRequest(error)) }
  })

  router.post('/auth/login', (req, res, next) => {
    try {
      const { username, password } = req.body ?? {}
      const row = getUserByUsername(username)
      if (!row || !row.active || !verifyPassword(String(password ?? ''), row)) {
        const e = new Error('Credenziali non valide.'); e.statusCode = 401; throw e
      }
      const { token } = createSession(row.id)
      setSessionCookie(res, token)
      res.json({ user: { id: row.id, username: row.username, role: row.role, linkedPersonId: row.linkedPersonId, permissions: permissionsForRole(row.role) } })
    } catch (error) { next(error.statusCode ? error : badRequest(error)) }
  })

  router.post('/auth/logout', (req, res) => {
    deleteSession(parseCookies(req)[SESSION_COOKIE])
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  router.get('/auth/me', (req, res) => {
    const user = currentUser(req)
    if (!user) { res.status(401).json({ error: 'Non autenticato.' }); return }
    res.json({ user })
  })

  // Guardia: tutte le altre rotte /api richiedono sessione valida.
  router.use((req, res, next) => {
    // il path qui è relativo al mount /api (es. '/app-data')
    if (PUBLIC.has(req.path)) return next()
    const user = currentUser(req)
    if (!user) { res.status(401).json({ error: 'Sessione richiesta.', detail: 'auth-required' }); return }
    req.user = user
    next()
  })
```

- [ ] **Step 4: Applicare filtro a GET /app-data e authz a PUT /app-data**

In `router.get('/app-data', ...)` sostituisci il corpo con:
```javascript
  router.get('/app-data', (req, res) => {
    sendAppData(res, filterAppDataForUser(getAppData(), req.user.permissions))
  })
```

In `router.put('/app-data', ...)`, DOPO aver ottenuto `const data = extractAppDataPreservingExisting(...)` e PRIMA di `saveAppData(data)`, inserisci l'autorizzazione:
```javascript
      const authorized = authorizeAppDataChange(getAppData(), data, req.user)
```
e poi usa `authorized` al posto di `data` nelle chiamate `saveAppData(...)` e nei controlli successivi (il blocco baseline esistente `hasBaselineChanges` resta e opera su `authorized.people`). La risposta va comunque filtrata:
```javascript
        const saved = saveAppData(authorized)
        scheduleAutoBackup(reason)
        sendAppData(res, filterAppDataForUser(saved, req.user.permissions))
        return
```
(e analogamente nel ramo non-normal: `const saved = saveAppData(authorized)` poi `sendAppData(res, filterAppDataForUser(saved, req.user.permissions))`.)

Nota: gli errori con `statusCode` (401/403) sono già gestiti dall'error handler finale del router.

- [ ] **Step 5: Verifica manuale con curl (server acceso)**

Avvia `npm run build && npm start` (o riavvia il server). Poi:
```
# senza sessione -> 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/app-data
# stato setup (primo avvio: needsSetup true se non ci sono utenti)
curl -s http://localhost:3000/api/auth/setup-status
```
Se il DB ha già dati ma nessun utente, `needsSetup` = true. Crea l'admin:
```
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/setup-admin -H "content-type: application/json" -d "{\"username\":\"admin\",\"password\":\"Password1\"}"
# ora con il cookie: app-data 200 e filtrato per admin (tutto)
curl -s -b cookies.txt -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/app-data
```
Expected: primo `401`, setup `201`, ultimo `200`.

- [ ] **Step 6: Commit**

```bash
git add server/routes/index.js
git commit -m "feat(rbac): middleware auth, endpoint login/logout/me/setup, filtro+authz su app-data"
```

---

### Task 6: Endpoint gestione utenti (admin)

**Files:**
- Modify: `server/routes/index.js`

**Interfaces:**
- Consumes: authService, `req.user`.
- Produces: `GET/POST /api/users`, `PUT /api/users/:id`, `POST /api/users/:id/reset-password`, `DELETE /api/users/:id` (dietro `manageUsers`).

- [ ] **Step 1: Import aggiuntivi** (in cima) — aggiungere alle import da authService:
```javascript
import { deleteUser, listUsers, setUserPassword, updateUser } from '../services/authService.js'
```

- [ ] **Step 2: Rotte utenti** — dopo le rotte `/auth/*`, dentro `createApiRouter` (sono già protette dal middleware; aggiungiamo il check `manageUsers`):

```javascript
  function requireManageUsers(req) {
    if (!req.user?.permissions?.manageUsers) { const e = new Error('Riservato agli amministratori.'); e.statusCode = 403; throw e }
  }

  router.get('/users', (req, res, next) => {
    try { requireManageUsers(req); res.json(listUsers()) } catch (e) { next(e.statusCode ? e : badRequest(e)) }
  })
  router.post('/users', (req, res, next) => {
    try {
      requireManageUsers(req)
      const { username, password, role, linkedPersonId } = req.body ?? {}
      res.status(201).json(createUser({ username, password, role, linkedPersonId: linkedPersonId || '' }))
    } catch (e) { next(e.statusCode ? e : badRequest(e)) }
  })
  router.put('/users/:id', (req, res, next) => {
    try {
      requireManageUsers(req)
      const { role, active, linkedPersonId } = req.body ?? {}
      res.json(updateUser(req.params.id, { role, active, linkedPersonId }))
    } catch (e) { next(e.statusCode ? e : badRequest(e)) }
  })
  router.post('/users/:id/reset-password', (req, res, next) => {
    try {
      requireManageUsers(req)
      setUserPassword(req.params.id, String((req.body ?? {}).newPassword ?? ''))
      res.json({ ok: true })
    } catch (e) { next(e.statusCode ? e : badRequest(e)) }
  })
  router.delete('/users/:id', (req, res, next) => {
    try { requireManageUsers(req); deleteUser(req.params.id); res.status(204).end() } catch (e) { next(e.statusCode ? e : badRequest(e)) }
  })
```

- [ ] **Step 3: Verifica curl (con cookie admin)**

```
curl -s -b cookies.txt http://localhost:3000/api/users
curl -s -b cookies.txt -X POST http://localhost:3000/api/users -H "content-type: application/json" -d "{\"username\":\"mario\",\"password\":\"Password1\",\"role\":\"progettista\"}"
```
Expected: lista con admin; creazione di `mario` (201). Con un cookie di `mario` (login), `GET /api/users` → 403.

- [ ] **Step 4: Commit**

```bash
git add server/routes/index.js
git commit -m "feat(rbac): endpoint gestione utenti (solo admin)"
```

---

### Task 7: Frontend — apiClient auth + AuthProvider + LoginScreen

**Files:**
- Modify: `src/services/apiClient.ts`
- Create: `src/state/AuthProvider.tsx`
- Create: `src/components/LoginScreen.tsx`

**Interfaces:**
- Consumes: endpoint auth (Task 5).
- Produces: `useAuth() → { user, permissions, login, logout, refresh }`; gate dell'app che mostra `LoginScreen` finché non autenticati.

- [ ] **Step 1: apiClient — funzioni auth + credenziali cookie**

In `src/services/apiClient.ts`:
- Nella funzione `requestWithResponse`, aggiungi `credentials: 'same-origin'` alle opzioni fetch (per inviare il cookie di sessione):
```typescript
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'content-type': 'application/json', ...options?.headers },
  })
```
- Aggiungi in fondo:
```typescript
import type { AuthUser, Role } from '../types'

export interface SetupStatus { needsSetup: boolean }
export function fetchSetupStatus(): Promise<SetupStatus> { return request<SetupStatus>('/api/auth/setup-status') }
export function fetchMe(): Promise<{ user: AuthUser }> { return request<{ user: AuthUser }>('/api/auth/me') }
export function apiLogin(username: string, password: string): Promise<{ user: AuthUser }> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}
export function apiSetupAdmin(username: string, password: string): Promise<{ user: AuthUser }> {
  return request('/api/auth/setup-admin', { method: 'POST', body: JSON.stringify({ username, password }) })
}
export function apiLogout(): Promise<{ ok: boolean }> { return request('/api/auth/logout', { method: 'POST', body: '{}' }) }

export interface AdminUserRow { id: string; username: string; role: Role; linkedPersonId: string; active: boolean }
export function fetchUsers(): Promise<AdminUserRow[]> { return request('/api/users') }
export function createUserApi(input: { username: string; password: string; role: Role; linkedPersonId?: string }): Promise<AdminUserRow> {
  return request('/api/users', { method: 'POST', body: JSON.stringify(input) })
}
export function updateUserApi(id: string, patch: { role?: Role; active?: boolean; linkedPersonId?: string }): Promise<AdminUserRow> {
  return request(`/api/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) })
}
export function resetUserPasswordApi(id: string, newPassword: string): Promise<{ ok: boolean }> {
  return request(`/api/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) })
}
export function deleteUserApi(id: string): Promise<void> {
  return request(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' }) as unknown as Promise<void>
}
```

- [ ] **Step 2: AuthProvider** — `src/state/AuthProvider.tsx`

```tsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '../types'
import { apiLogin, apiLogout, apiSetupAdmin, fetchMe, fetchSetupStatus } from '../services/apiClient'

type Status = 'loading' | 'needsSetup' | 'loggedOut' | 'loggedIn'
interface AuthCtx {
  status: Status
  user: AuthUser | null
  login: (u: string, p: string) => Promise<void>
  setupAdmin: (u: string, p: string) => Promise<void>
  logout: () => Promise<void>
}
const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  const boot = useCallback(async () => {
    try {
      const me = await fetchMe()
      setUser(me.user); setStatus('loggedIn'); return
    } catch { /* 401 */ }
    try {
      const s = await fetchSetupStatus()
      setStatus(s.needsSetup ? 'needsSetup' : 'loggedOut')
    } catch { setStatus('loggedOut') }
  }, [])

  useEffect(() => { void boot() }, [boot])

  const login = useCallback(async (u: string, p: string) => {
    const r = await apiLogin(u, p); setUser(r.user); setStatus('loggedIn')
  }, [])
  const setupAdmin = useCallback(async (u: string, p: string) => {
    const r = await apiSetupAdmin(u, p); setUser(r.user); setStatus('loggedIn')
  }, [])
  const logout = useCallback(async () => {
    try { await apiLogout() } finally { setUser(null); setStatus('loggedOut') }
  }, [])

  return <Ctx.Provider value={{ status, user, login, setupAdmin, logout }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth richiede <AuthProvider>')
  return c
}
```

- [ ] **Step 3: LoginScreen** — `src/components/LoginScreen.tsx`

```tsx
import { useState } from 'react'
import { useAuth } from '../state/AuthProvider'
import { useToast } from '../state/ToastProvider'

export function LoginScreen() {
  const { status, login, setupAdmin } = useAuth()
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const isSetup = status === 'needsSetup'

  async function submit() {
    setBusy(true)
    try {
      if (isSetup) await setupAdmin(username.trim(), password)
      else await login(username.trim(), password)
    } catch {
      toast.error(isSetup ? 'Setup non riuscito (password min 8).' : 'Credenziali non valide.')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-800/80 bg-[color:var(--color-panel)] p-7 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
        <div className="flex flex-col items-center gap-2">
          <img src="/flowrlink-mark.png" alt="Flowrlink" className="h-16 w-auto" />
          <div className="bg-gradient-to-r from-[color:var(--color-accent)] to-[color:var(--color-accent-2)] bg-clip-text text-2xl font-extrabold text-transparent">Flowrlink</div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">CRM &amp; Workload</div>
        </div>
        <h1 className="text-center text-sm font-semibold text-slate-200">
          {isSetup ? 'Crea l\'account amministratore' : 'Accedi'}
        </h1>
        <div className="space-y-3">
          <input className="input-base" placeholder="Username" value={username} autoFocus
            onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
          <input type="password" className="input-base" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
          <button className="btn-primary w-full" disabled={busy || !username || !password} onClick={submit}>
            {isSetup ? 'Crea amministratore' : 'Entra'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verifica typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.
```bash
git add src/services/apiClient.ts src/state/AuthProvider.tsx src/components/LoginScreen.tsx
git commit -m "feat(rbac): frontend auth (apiClient, AuthProvider, LoginScreen)"
```

---

### Task 8: Gate dell'app + header utente/logout + 403 handling

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/state/DataProvider.tsx`

**Interfaces:**
- Consumes: `useAuth`.
- Produces: app mostrata solo se `loggedIn`; header con utente + logout; toast su 403.

- [ ] **Step 1: Wrappare l'app con AuthProvider e il gate** — in `src/App.tsx`

Trova il componente radice esportato (es. `export default function App()` che rende `<DataProvider><ToastProvider>...<Shell/>`). Avvolgi con `AuthProvider` e inserisci un gate `AppGate` che mostra `LoginScreen` finché non loggato. Struttura:

```tsx
import { AuthProvider, useAuth } from './state/AuthProvider'
import { LoginScreen } from './components/LoginScreen'

// dentro l'albero dei provider, il più ESTERNO è AuthProvider; DataProvider va DENTRO al gate
// (così i dati si caricano solo da autenticati). Esempio:
export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppGate />
      </AuthProvider>
    </ToastProvider>
  )
}

function AppGate() {
  const { status } = useAuth()
  if (status === 'loading') return <div className="flex min-h-screen items-center justify-center text-slate-500">Caricamento…</div>
  if (status !== 'loggedIn') return <LoginScreen />
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  )
}
```
Adatta l'ordine dei provider esistenti (ToastProvider deve avvolgere sia LoginScreen sia l'app perché usano i toast). Mantieni gli altri provider dentro `DataProvider` come oggi.

- [ ] **Step 2: Header — utente corrente + logout** — in `src/App.tsx`, dentro `Shell`, nella barra destra dell'header (accanto ai bottoni esistenti), aggiungi:

```tsx
            <UserMenu />
```
e definisci il componente:
```tsx
function UserMenu() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800/80 bg-[color:var(--color-surface-1)]/80 px-2.5 py-1.5">
      <span className="text-sm text-slate-300">{user.username}</span>
      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">{user.role}</span>
      <button className="btn-ghost text-xs" onClick={() => void logout()} title="Esci">Logout</button>
    </div>
  )
}
```

- [ ] **Step 3: 403 handling in DataProvider** — in `src/state/DataProvider.tsx`, nel `.catch` di `commitData` (dove gestisce gli errori del salvataggio), aggiungi il ramo 403 PRIMA del ramo generico. Il messaggio d'errore del server per 403 è `Non hai i permessi...`. Il `request` di apiClient lancia un `Error` con quel `message`. Aggiungi:

```typescript
        if (err instanceof Error && /permess|Riservato|amministratore/i.test(err.message)) {
          // permesso negato: rollback e avviso, come per gli altri errori
          if (pendingCommitsRef.current <= 1) {
            dataRef.current = previous; setData(previous); saveToStorage(previous)
          }
          toast.error(`Operazione non consentita: ${err.message}`)
          return
        }
```
(Va inserito nel blocco catch esistente, dopo la gestione di `DataConflictError` e prima del rollback generico. Il rollback riporta lo stato ottimistico a `previous`.)

- [ ] **Step 4: Verifica typecheck + build + commit**

Run: `npm run typecheck && npm run build`
Expected: PASS.
```bash
git add src/App.tsx src/state/DataProvider.tsx
git commit -m "feat(rbac): gate login dell'app, header utente/logout, gestione 403"
```

---

### Task 9: Filtro tab + gate bottoni + vista Utenti

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Create: `src/components/UsersView.tsx`
- Modify: `src/App.tsx` (gate bottoni header "Nuovo lavoro"/"Ferie e permessi"/"Persone")
- Modify: `src/components/ConsuntiviView.tsx` (bottoni Prezzi/Report solo se `viewConsuntiviPrices`)

**Interfaces:**
- Consumes: `useAuth().user.permissions`.
- Produces: UI filtrata per permessi + gestione utenti admin.

- [ ] **Step 1: Filtro tab in Dashboard** — in `src/components/Dashboard.tsx`

Importa `useAuth`. Dopo aver definito `TABS`, filtra i tab visibili:
```tsx
  const { user } = useAuth()
  const allowed = new Set(user?.permissions.sections ?? [])
  const visibleTabs = TABS.filter((t) => allowed.has(t.id))
```
Usa `visibleTabs` al posto di `TABS` nel rendering della barra. Se il `tab` attivo non è più visibile (cambio ruolo), fai fallback al primo visibile:
```tsx
  useEffect(() => {
    if (visibleTabs.length && !allowed.has(tab)) setTab(visibleTabs[0].id)
  }, [allowed, tab, visibleTabs])
```
Aggiungi il tab **Utenti** all'array `TABS` (gruppo `sistema`), reso solo se `allowed.has('utenti')` (già coperto dal filtro):
```tsx
  { id: 'utenti', label: 'Utenti', icon: 'M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-2.67 0-8 1.34-8 4v3h10v-3a4.7 4.7 0 0 1 2-3.74A12.7 12.7 0 0 0 8 13Z', hint: 'Gestione utenti e permessi', group: 'sistema' },
```
E il ramo di render:
```tsx
      ) : tab === 'utenti' ? (
        <UsersView />
```
con `const UsersView = lazy(() => import('./UsersView').then((m) => ({ default: m.UsersView })))`.

- [ ] **Step 2: UsersView** — `src/components/UsersView.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { createUserApi, deleteUserApi, fetchUsers, resetUserPasswordApi, updateUserApi, type AdminUserRow } from '../services/apiClient'
import { ROLE_OPTIONS } from '../utils/roles'
import type { Role } from '../types'

export function UsersView() {
  const { data } = useData()
  const toast = useToast()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [nu, setNu] = useState({ username: '', password: '', role: 'progettista' as Role, linkedPersonId: '' })

  const reload = () => fetchUsers().then(setUsers).catch(() => toast.error('Impossibile caricare gli utenti.'))
  useEffect(() => { void reload() }, [])

  const people = useMemo(() => data.people.filter((p) => p.active), [data.people])

  async function create() {
    try { await createUserApi(nu); setNu({ username: '', password: '', role: 'progettista', linkedPersonId: '' }); await reload(); toast.success('Utente creato.') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore creazione utente.') }
  }
  async function change(id: string, patch: { role?: Role; active?: boolean; linkedPersonId?: string }) {
    try { await updateUserApi(id, patch); await reload() } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.') }
  }
  async function resetPw(id: string) {
    const np = prompt('Nuova password (min 8):'); if (!np) return
    try { await resetUserPasswordApi(id, np); toast.success('Password reimpostata.') } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.') }
  }
  async function remove(id: string) {
    if (!confirm('Eliminare l\'utente?')) return
    try { await deleteUserApi(id); await reload() } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.') }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-100">Utenti</h2>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-800/80 p-4">
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Username</span>
          <input className="input-base" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Password</span>
          <input type="password" className="input-base" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Ruolo</span>
          <select className="input-base" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as Role })}>
            {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Persona collegata</span>
          <select className="input-base" value={nu.linkedPersonId} onChange={(e) => setNu({ ...nu, linkedPersonId: e.target.value })}>
            <option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <button className="btn-primary" onClick={create}>+ Crea utente</button>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase text-slate-400"><tr>
          <th className="px-2 py-1">Username</th><th className="px-2 py-1">Ruolo</th><th className="px-2 py-1">Persona</th><th className="px-2 py-1">Attivo</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-slate-800/60">
              <td className="px-2 py-1">{u.username}</td>
              <td className="px-2 py-1">
                <select className="input-base" value={u.role} onChange={(e) => change(u.id, { role: e.target.value as Role })}>
                  {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              <td className="px-2 py-1">
                <select className="input-base" value={u.linkedPersonId} onChange={(e) => change(u.id, { linkedPersonId: e.target.value })}>
                  <option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
              <td className="px-2 py-1"><input type="checkbox" checked={u.active} onChange={(e) => change(u.id, { active: e.target.checked })} /></td>
              <td className="px-2 py-1 text-right">
                <button className="btn-ghost text-xs" onClick={() => resetPw(u.id)}>Reset password</button>
                <button className="btn-ghost text-xs text-red-300" onClick={() => remove(u.id)}>Elimina</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

Crea anche `src/utils/roles.ts`:
```typescript
import type { Role } from '../types'
export const ROLE_OPTIONS: Array<[Role, string]> = [
  ['amministratore', 'Amministratore'],
  ['progettista', 'Progettista'],
  ['officina', 'Officina'],
  ['sola_lettura', 'Sola lettura'],
]
```

- [ ] **Step 3: Gate bottoni header** — in `src/App.tsx` (Shell), avvolgi i bottoni con i permessi:
- "Nuovo lavoro" → mostrato solo se `permissions.canCreateWork`.
- "Ferie e permessi" e "Persone" → solo se `permissions.managePeople`.
Usa `const { user } = useAuth()` e `const perm = user?.permissions`. Esempio:
```tsx
        {perm?.canCreateWork && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary" title="Crea un nuovo lavoro">
            <Icon path="M12 5v14M5 12h14" /> Nuovo lavoro
          </button>
        )}
```
(analogo per i due gruppi ferie/persone, avvolti in `{perm?.managePeople && ( … )}`).

- [ ] **Step 4: Consuntivi — bottoni prezzi/report** — in `src/components/ConsuntiviView.tsx`, importa `useAuth`; mostra i bottoni **Prezzi 🔒** e **Report 🔒** solo se `user?.permissions.viewConsuntiviPrices`:
```tsx
          {user?.permissions.viewConsuntiviPrices && <button className="btn-ghost" onClick={() => setPricingOpen(true)}>Prezzi 🔒</button>}
          {user?.permissions.viewConsuntiviPrices && <button className="btn-ghost" onClick={() => setReportOpen(true)}>Report 🔒</button>}
```

- [ ] **Step 5: Verifica typecheck + build + commit**

Run: `npm run typecheck && npm run build`
Expected: PASS.
```bash
git add src/components/Dashboard.tsx src/components/UsersView.tsx src/utils/roles.ts src/App.tsx src/components/ConsuntiviView.tsx
git commit -m "feat(rbac): filtro tab per ruolo, vista Utenti, gate bottoni header/consuntivi"
```

---

### Task 10: Verifica end-to-end per ruolo

**Files:** nessuna modifica (verifica).

- [ ] **Step 1: Suite completa**

Run: `npm run test && npm run typecheck && npm run build`
Expected: tutti verdi (i test authService/permissions/appDataAuthz + i calc consuntivi già presenti).

- [ ] **Step 2: Prova manuale (server acceso, browser)**

1. Primo avvio senza utenti → schermata **setup**; crea admin. Entri, vedi tutte le sezioni + **Utenti**.
2. In **Utenti** crea `mario` (progettista) e `capo` (officina). Logout.
3. Login come `mario`: vedi solo Dashboard/Pianificazione/Agenda/Anagrafiche/Libreria; NON vedi Consuntivi/Officina/Utenti/Storico. Crea un lavoro (ok). Prova a eliminare un lavoro creato dall'admin → **niente bottone elimina** e (se forzato via rete) il server risponde 403 con toast.
4. Login come `capo` (officina): vedi Officina/Pianificazione officina/Operai/Consuntivi (senza bottoni Prezzi/Report). 
5. Login come admin: elimina qualsiasi cosa, gestisci utenti, vedi prezzi.

- [ ] **Step 3: Commit (nessuna modifica) / chiusura**

Se emergono aggiustamenti durante la prova, applicarli con commit mirati; altrimenti la fase è completa.

---

## Self-review (piano vs spec)

- §3.1 utenti/sessioni → Task 1 ✓ · §3.2 createdByUserId → Task 2 ✓
- §4 permessi/ruoli → Task 2 (`permissions.js` + tipi) ✓
- §5.1 auth (login/logout/me/setup/middleware) → Task 5 ✓
- §5.2 read-filter → Task 3 ✓ · §5.3 write diff-guard (proprietà, riservati, log append-only, campi reintegrati) → Task 4 ✓ (test mirati)
- §5.4 gestione utenti → Task 6 ✓
- §6 frontend (auth, login, header, filtri UI, vista Utenti, consuntivi) → Task 7/8/9 ✓
- §7 bootstrap primo avvio → Task 5 (setup-status/setup-admin) + Task 7/8 (schermata) ✓
- §8 password/cookie → Task 1 (scrypt) + Task 5 (cookie) ✓
- §9 retrocompat (createdByUserId assente = legacy, additivo) → Task 2/4 ✓
- §11 test → Task 1/2/3/4 (TDD sul cuore) ✓
- Nessun placeholder; firme coerenti tra task (Permissions, authService, appDataAuthz). Codice completo per il cuore server; UI con componenti completi e punti d'integrazione espliciti (l'esecutore adatta l'ordine dei provider esistenti in App.tsx come indicato).
