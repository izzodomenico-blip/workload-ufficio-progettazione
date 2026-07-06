# Visibilità sezioni per-utente — Implementation Plan (sotto-progetto F)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'amministratore sceglie, per ogni utente, quali sezioni/tab vede — indipendentemente dal ruolo, che resta a governare le azioni.

**Architecture:** Una tabella di join `user_sections` tiene l'override per utente (assente = sezioni del ruolo). Una funzione pura `effectiveSections(role, override)` combina override (sezioni-contenuto) e sezioni speciali del ruolo; è calcolata lato server e riempie `permissions.sections`, che il frontend già usa per filtrare i tab. UI a caselle nella scheda Utenti.

**Tech Stack:** Node ≥22 ESM, node:sqlite, Express, React/TS, vitest.

## Global Constraints

- Nessuna nuova dipendenza runtime app. Node ≥ 22. ESM. Test `.test.mjs` con API vitest. Run singolo: `npx vitest run <file>`.
- Sezioni-contenuto (override-abili): `dashboard`, `planning`, `agenda`, `anagrafiche`, `disegni`, `officina`, `officina-planning`, `operai`, `consuntivi`. Speciali NON override-abili: `utenti`, `log`.
- Ruoli invariati (`amministratore`, `progettista`, `officina`, `sola_lettura`); l'override tocca **solo** `permissions.sections`.
- L'admin non può perdere la sezione `utenti` (il ruolo la ridà sempre).
- Retrocompatibile: utente senza righe `user_sections` = comportamento attuale.
- Migrazione idempotente: solo `CREATE TABLE IF NOT EXISTS` (il runner esegue tutti i `.sql` a ogni avvio). NIENTE `ALTER TABLE ADD COLUMN`.
- Enforcement: `sections` è un filtro di navigazione (client) calcolato lato server; la protezione dati resta del ruolo (appDataAuthz).

---

### Task 1: `effectiveSections` + `CONTENT_SECTIONS` (`server/services/permissions.js`)

**Files:**
- Modify: `server/services/permissions.js`
- Test: `server/services/permissions.test.mjs`

**Interfaces:**
- Consumes: `permissionsForRole` (già in questo file).
- Produces:
  - `CONTENT_SECTIONS: string[]` — le 9 sezioni override-abili.
  - `effectiveSections(role: string, override: string[]|null): string[]` — pura. Nessun/vuoto override → sezioni del ruolo; altrimenti override∩CONTENT unite alle speciali (`utenti`/`log`) che il ruolo concede, deduplicate.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi a `server/services/permissions.test.mjs` (in cima aggiungi `effectiveSections`, `CONTENT_SECTIONS` all'import esistente da `./permissions.js`):
```js
describe('effectiveSections', () => {
  it('nessun override o vuoto -> sezioni del ruolo', () => {
    expect(effectiveSections('progettista', [])).toEqual(permissionsForRole('progettista').sections)
    expect(effectiveSections('progettista', null)).toEqual(permissionsForRole('progettista').sections)
  })
  it('override contenuto per non-admin -> esattamente quelle', () => {
    expect(effectiveSections('progettista', ['consuntivi'])).toEqual(['consuntivi'])
  })
  it('admin mantiene utenti anche con override senza utenti', () => {
    const r = effectiveSections('amministratore', ['dashboard'])
    expect(r).toContain('dashboard')
    expect(r).toContain('utenti')
    expect(r).toContain('log')
  })
  it('voci invalide o speciali nell override vengono ignorate', () => {
    expect(effectiveSections('officina', ['consuntivi', 'utenti', 'inesistente'])).toEqual(['consuntivi'])
  })
})
```
(Il file importa già `permissionsForRole`; verifica che `describe`/`it`/`expect` siano importati da `vitest` come negli altri test del file.)

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run server/services/permissions.test.mjs`
Expected: FAIL (`effectiveSections is not a function`).

- [ ] **Step 3: Implementa in `server/services/permissions.js`**

Aggiungi in fondo al file:
```js
export const CONTENT_SECTIONS = [
  'dashboard', 'planning', 'agenda', 'anagrafiche', 'disegni',
  'officina', 'officina-planning', 'operai', 'consuntivi',
]

export function effectiveSections(role, override) {
  const roleSections = permissionsForRole(role).sections
  if (!Array.isArray(override) || override.length === 0) return roleSections
  const content = new Set(CONTENT_SECTIONS)
  const fromOverride = override.filter((s) => content.has(s))
  const specials = roleSections.filter((s) => s === 'utenti' || s === 'log')
  return [...new Set([...fromOverride, ...specials])]
}
```

- [ ] **Step 4: Esegui il test — deve passare**

Run: `npx vitest run server/services/permissions.test.mjs`
Expected: PASS (i preesistenti + 4 nuovi).

- [ ] **Step 5: Commit**

```bash
git add server/services/permissions.js server/services/permissions.test.mjs
git commit -m "feat(sezioni-utente): CONTENT_SECTIONS + effectiveSections (pura)"
```

---

### Task 2: tabella `user_sections` + authService

**Files:**
- Create: `server/migrations/010_add_user_sections.sql`
- Modify: `server/services/authService.js`
- Test: `server/services/authService.test.mjs`

**Interfaces:**
- Consumes: `CONTENT_SECTIONS` (Task 1); `runMigrations`, `getDb` da `../db.js`.
- Produces:
  - `getUserSections(userId, db?): string[]` — le sezioni override dell'utente (vuoto = nessun override).
  - `setUserSections(userId, sections, db?): void` — sostituisce le righe validando contro `CONTENT_SECTIONS`.
  - `getSessionUser` ora ritorna l'utente con `sections: string[]` (override).
  - `listUsers` ora ritorna ogni utente con `sections: string[]`.
  - `deleteUser` rimuove anche le righe `user_sections`.

- [ ] **Step 1: Migrazione `server/migrations/010_add_user_sections.sql`**

```sql
CREATE TABLE IF NOT EXISTS user_sections (
  user_id TEXT NOT NULL,
  section TEXT NOT NULL,
  PRIMARY KEY (user_id, section)
);
CREATE INDEX IF NOT EXISTS idx_user_sections_user ON user_sections(user_id);
```

- [ ] **Step 2: Scrivi il test che fallisce**

Aggiungi a `server/services/authService.test.mjs` (segui il setup db già usato nel file: `new DatabaseSync(':memory:')` + `runMigrations(db)`; aggiungi `getUserSections`, `setUserSections`, `createUser`, `deleteUser` all'import se non già presenti):
```js
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
```
(Nota: `getUserSections` ordina per `section`, quindi `['anagrafiche', 'consuntivi']` è l'ordine atteso.)

- [ ] **Step 3: Esegui il test — deve fallire**

Run: `npx vitest run server/services/authService.test.mjs`
Expected: FAIL (`getUserSections is not a function`).

- [ ] **Step 4: Implementa in `server/services/authService.js`**

Aggiungi l'import in cima (dopo gli altri import):
```js
import { CONTENT_SECTIONS } from './permissions.js'
```
Aggiungi le due funzioni (es. dopo `listUsers`):
```js
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
```
In `listUsers`, arricchisci ogni utente con l'override:
```js
export function listUsers(db = getDb()) {
  return db.prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE ASC').all().map((row) => {
    const pu = publicUser(row)
    return { ...pu, sections: getUserSections(pu.id, db) }
  })
}
```
In `getSessionUser`, sostituisci il `return user` finale con l'utente arricchito:
```js
  return { ...user, sections: getUserSections(user.id, db) }
```
In `deleteUser`, prima di `DELETE FROM users` aggiungi la pulizia delle righe:
```js
  db.prepare('DELETE FROM user_sections WHERE user_id = ?').run(String(id))
```

- [ ] **Step 5: Esegui il test — deve passare**

Run: `npx vitest run server/services/authService.test.mjs`
Expected: PASS (i preesistenti + 3 nuovi).

- [ ] **Step 6: Commit**

```bash
git add server/migrations/010_add_user_sections.sql server/services/authService.js server/services/authService.test.mjs
git commit -m "feat(sezioni-utente): tabella user_sections + get/set + arricchimento sessione/lista"
```

---

### Task 3: wiring rotte (permessi effettivi + salvataggio sezioni)

**Files:**
- Modify: `server/routes/index.js`

**Interfaces:**
- Consumes: `effectiveSections`, `CONTENT_SECTIONS` (Task 1); `getUserSections`, `setUserSections` (Task 2); `permissionsForRole` (già importato).

- [ ] **Step 1: Import**

Riga 41: `import { permissionsForRole, requirePermission } from '../services/permissions.js'` → aggiungi `effectiveSections`, `CONTENT_SECTIONS`:
```js
import { CONTENT_SECTIONS, effectiveSections, permissionsForRole, requirePermission } from '../services/permissions.js'
```
Nell'import da `../services/authService.js` (dove ci sono già `createUser`, `listUsers`, `updateUser`, ecc.) aggiungi `getUserSections`, `setUserSections`.

- [ ] **Step 2: `currentUser` — sezioni effettive**

Sostituisci il corpo di `currentUser` (righe ~704-709):
```js
function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE]
  const user = getSessionUser(token)
  if (!user) return null
  return { ...user, permissions: permissionsForRole(user.role) }
}
```
con:
```js
function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE]
  const user = getSessionUser(token)
  if (!user) return null
  const permissions = permissionsForRole(user.role)
  permissions.sections = effectiveSections(user.role, user.sections)
  return { ...user, permissions }
}
```

- [ ] **Step 3: login e setup-admin — sezioni effettive nella risposta**

Nella rotta `POST /auth/login`, dove si costruisce la risposta con `permissions: permissionsForRole(row.role)`, sostituisci con il calcolo effettivo:
```js
      const permissions = permissionsForRole(row.role)
      permissions.sections = effectiveSections(row.role, getUserSections(row.id))
      res.json({ user: { id: row.id, username: row.username, role: row.role, linkedPersonId: row.linkedPersonId, permissions } })
```
Nella rotta `POST /auth/setup-admin`, la risposta usa `permissions: permissionsForRole(user.role)`; sostituisci con:
```js
      const permissions = permissionsForRole(user.role)
      permissions.sections = effectiveSections(user.role, getUserSections(user.id))
      res.status(201).json({ user: { ...user, permissions } })
```
(Il primo admin non ha override → `effectiveSections` ritorna le sezioni del ruolo, cioè tutte.)

- [ ] **Step 4: `GET /users` — aggiungi `visibleSections`; `PUT /users/:id` — salva `sections`**

Sostituisci l'handler `GET /users`:
```js
  router.get('/users', (req, res, next) => {
    try {
      requirePermission(req.user.permissions, 'manageUsers')
      const rows = listUsers().map((u) => ({
        ...u,
        visibleSections: effectiveSections(u.role, u.sections).filter((s) => CONTENT_SECTIONS.includes(s)),
      }))
      res.json(rows)
    } catch (e) { next(e.statusCode ? e : badRequest(e)) }
  })
```
Sostituisci l'handler `PUT /users/:id`:
```js
  router.put('/users/:id', (req, res, next) => {
    try {
      requirePermission(req.user.permissions, 'manageUsers')
      const body = req.body ?? {}
      const updated = updateUser(req.params.id, { role: body.role, active: body.active, linkedPersonId: body.linkedPersonId })
      if (Array.isArray(body.sections)) setUserSections(req.params.id, body.sections)
      const sections = getUserSections(req.params.id)
      res.json({ ...updated, sections, visibleSections: effectiveSections(updated.role, sections).filter((s) => CONTENT_SECTIONS.includes(s)) })
    } catch (e) { next(e.statusCode ? e : badRequest(e)) }
  })
```

- [ ] **Step 5: Verifica sintassi + typecheck + suite + smoke isolato**

Run: `node --check server/routes/index.js && npm run typecheck && npm run test`
Expected: `--check` nessun output; typecheck PASS; suite verde.

Smoke isolato (DB temporaneo, NON tocca i dati reali):
```bash
TMPD=$(mktemp -d 2>/dev/null || echo "$TEMP/f3smoke"); mkdir -p "$TMPD"; WORKLOAD_DATA_DIR="$TMPD" WORKLOAD_DB_PATH="$TMPD/w.db" WORKLOAD_STATE_DIR="$TMPD" PORT=3974 HOST=127.0.0.1 WORKLOAD_DISABLE_IPV6_LOCALHOST=1 node server/index.js & sleep 2
curl -s -c "$TMPD/c.txt" -X POST http://127.0.0.1:3974/api/auth/setup-admin -H "content-type: application/json" -d '{"username":"admin","password":"Password1"}' -o /dev/null -w "setup=%{http_code}\n"
# crea un utente officina e limita le sue sezioni
curl -s -b "$TMPD/c.txt" -X POST http://127.0.0.1:3974/api/users -H "content-type: application/json" -d '{"username":"op","password":"Password1","role":"officina"}' -o "$TMPD/u.json" -w "createuser=%{http_code}\n"
UID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMPD/u.json','utf8')).id)")
curl -s -b "$TMPD/c.txt" -X PUT "http://127.0.0.1:3974/api/users/$UID" -H "content-type: application/json" -d '{"sections":["consuntivi"]}' -w "\nputsections\n"
```
Expected: `setup=201`, `createuser=201`, e il PUT ritorna JSON con `"sections":["consuntivi"]` e `"visibleSections":["consuntivi"]`. Ferma il server con un harness Node (`child.kill('SIGTERM')`) se `kill` non funziona su Git Bash; il DB temp è usa-e-getta.

- [ ] **Step 6: Commit**

```bash
git add server/routes/index.js
git commit -m "feat(sezioni-utente): sezioni effettive nei permessi + salvataggio override in PUT /users"
```

---

### Task 4: Frontend — scheda Utenti a caselle

**Files:**
- Modify: `src/services/apiClient.ts` (`AdminUserRow` + `updateUserApi`)
- Modify: `src/utils/roles.ts` (`CONTENT_SECTION_OPTIONS`)
- Modify: `src/components/UsersView.tsx`

**Interfaces:**
- Consumes: `GET /users` con `visibleSections` (Task 3); `PUT /users/:id` con `{ sections }`.

- [ ] **Step 1: `apiClient.ts` — tipi**

Trova `export interface AdminUserRow { ... }` e aggiungi due campi:
```ts
export interface AdminUserRow {
  id: string
  username: string
  role: Role
  linkedPersonId: string
  active: boolean
  sections: string[]
  visibleSections: string[]
}
```
`updateUserApi` — estendi il tipo del patch con `sections`:
```ts
export function updateUserApi(id: string, patch: { role?: Role; active?: boolean; linkedPersonId?: string; sections?: string[] }): Promise<AdminUserRow> {
  return request(`/api/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) })
}
```
(Adatta ai nomi esatti se `AdminUserRow` ha già i primi 5 campi: aggiungi solo `sections`/`visibleSections`.)

- [ ] **Step 2: `src/utils/roles.ts` — etichette sezioni**

Aggiungi (adatta l'import per includere `SectionId`):
```ts
import type { Role, SectionId } from '../types'

export const CONTENT_SECTION_OPTIONS: Array<[SectionId, string]> = [
  ['dashboard', 'Dashboard'],
  ['planning', 'Pianificazione'],
  ['agenda', 'Agenda'],
  ['anagrafiche', 'Anagrafiche'],
  ['disegni', 'Disegni'],
  ['officina', 'Carico officina'],
  ['officina-planning', 'Pian. officina'],
  ['operai', 'Operai'],
  ['consuntivi', 'Consuntivi'],
]
```
(Mantieni `ROLE_OPTIONS` esistente.)

- [ ] **Step 3: `UsersView.tsx` — colonna caselle**

Aggiungi l'import: `import { CONTENT_SECTION_OPTIONS, ROLE_OPTIONS } from '../utils/roles'` (unifica con l'import esistente di `ROLE_OPTIONS`).
Aggiungi la funzione di toggle (dopo `change`):
```tsx
  async function toggleSection(u: AdminUserRow, section: string) {
    const next = new Set(u.visibleSections)
    if (next.has(section)) next.delete(section)
    else next.add(section)
    try { await updateUserApi(u.id, { sections: [...next] }); await reload() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.') }
  }
```
Nella `<thead>`, aggiungi una colonna prima dell'ultima (`<th />`):
```tsx
<th className="px-2 py-1">Sezioni visibili <span className="normal-case text-slate-500">(vuoto = come il ruolo)</span></th>
```
Nel corpo riga, aggiungi una `<td>` con le caselle prima della cella dei bottoni:
```tsx
              <td className="px-2 py-1">
                <div className="flex max-w-[420px] flex-wrap gap-x-3 gap-y-0.5">
                  {CONTENT_SECTION_OPTIONS.map(([id, label]) => (
                    <label key={id} className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                      <input type="checkbox" checked={u.visibleSections.includes(id)} onChange={() => toggleSection(u, id)} />
                      {label}
                    </label>
                  ))}
                </div>
              </td>
```

- [ ] **Step 4: Verifica typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/apiClient.ts src/utils/roles.ts src/components/UsersView.tsx
git commit -m "feat(sezioni-utente): scheda Utenti con caselle sezioni visibili per-utente"
```

---

## Ordine e verifica finale

Task 1 → 2 → 3 → 4. Alla fine:
```bash
npm run test && npm run typecheck && npm run build
```
Expected: suite verde (permissions + authService + preesistenti), typecheck PASS, build PASS.

Verifica funzionale (manuale, con server acceso): come admin, in Utenti, togli/aggiungi spunte a un utente → al suo login vede esattamente quei tab; togliendo tutte le spunte torna alle sezioni del ruolo.
