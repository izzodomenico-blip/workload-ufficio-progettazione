# Affinamenti permessi — Implementation Plan (sotto-progetto G)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abilitare Prezzi/Report Consuntivi per singolo utente (grant) e permettere ai progettisti di gestire Ferie e permessi (permesso `manageAbsences` separato da `managePeople`).

**Architecture:** Parte A: tabella di join `user_permissions` + funzione pura `applyGrants` che alza a `true` i permessi concessi (whitelist), applicata lato server dopo `permissionsForRole`. Parte B: nuovo permesso `manageAbsences` (admin+progettista) e separazione delle assenze dal `managePeople` nel write-guard `appDataAuthz`. Logica non banale in funzioni pure/testate; enforcement reale lato server.

**Tech Stack:** Node ≥22 ESM, node:sqlite, Express, React/TS, vitest.

## Global Constraints

- Nessuna nuova dipendenza runtime app. Node ≥ 22. ESM. Test `.test.mjs` con API vitest. Run singolo: `npx vitest run <file>`.
- Whitelist grant = solo `['viewConsuntiviPrices']` (YAGNI). Nuovo permesso `manageAbsences`: admin+progettista true, officina/sola_lettura false.
- Migrazione idempotente: solo `CREATE TABLE IF NOT EXISTS` (niente `ALTER TABLE ADD COLUMN`).
- Ruoli invariati salvo aggiunta di `manageAbsences`. `managePeople` conserva persone + finanziari + `baselineLoadPercent`.
- Retrocompatibile: utente senza grant = come oggi.
- Enforcement reale lato server: Parte B nel write-guard; Parte A = visibilità bottoni (la password Consuntivi resta il gate dati, invariata).

---

### Task 1: `permissions.js` — `applyGrants` + `manageAbsences`

**Files:**
- Modify: `server/services/permissions.js`
- Test: `server/services/permissions.test.mjs`

**Interfaces:**
- Produces: `GRANTABLE_PERMISSIONS: string[]`; `applyGrants(permissions, grants): object` (muta e ritorna, alza a `true` i permessi in whitelist presenti in `grants`); `permissionsForRole` ora include `manageAbsences`.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi a `server/services/permissions.test.mjs` (aggiungi `applyGrants`, `GRANTABLE_PERMISSIONS` all'import esistente da `./permissions.js`):
```js
describe('applyGrants', () => {
  it('concede viewConsuntiviPrices', () => {
    const p = permissionsForRole('officina')
    expect(p.viewConsuntiviPrices).toBe(false)
    applyGrants(p, ['viewConsuntiviPrices'])
    expect(p.viewConsuntiviPrices).toBe(true)
  })
  it('nessun grant -> invariato', () => {
    const p = permissionsForRole('officina')
    applyGrants(p, [])
    expect(p.viewConsuntiviPrices).toBe(false)
  })
  it('ignora voci fuori whitelist', () => {
    const p = permissionsForRole('officina')
    applyGrants(p, ['manageUsers', 'deleteAny'])
    expect(p.manageUsers).toBe(false)
    expect(p.deleteAny).toBe(false)
  })
})
describe('manageAbsences nella matrice', () => {
  it('admin e progettista true; officina e sola_lettura false', () => {
    expect(permissionsForRole('amministratore').manageAbsences).toBe(true)
    expect(permissionsForRole('progettista').manageAbsences).toBe(true)
    expect(permissionsForRole('officina').manageAbsences).toBe(false)
    expect(permissionsForRole('sola_lettura').manageAbsences).toBe(false)
  })
})
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run server/services/permissions.test.mjs`
Expected: FAIL (`applyGrants is not a function` / `manageAbsences` undefined).

- [ ] **Step 3: Implementa in `server/services/permissions.js`**

In `base()` aggiungi la chiave (dopo `managePeople: false,`):
```js
    manageAbsences: false,
```
Nel ramo `amministratore` aggiungi `manageAbsences: true` all'oggetto ritornato (accanto a `managePeople: true`):
```js
      manageUsers: true, managePeople: true, manageAbsences: true, viewConsuntiviPrices: true, manageBackups: true, viewLog: true,
```
Nel ramo `progettista`, aggiungi `manageAbsences: true`:
```js
  if (role === 'progettista') {
    return { ...p, sections: ['dashboard', 'planning', 'agenda', 'anagrafiche', 'disegni'],
      canCreateWork: true, canEditWork: true, canDeleteOwnWork: true, manageAbsences: true }
  }
```
Aggiungi in fondo al file:
```js
export const GRANTABLE_PERMISSIONS = ['viewConsuntiviPrices']

export function applyGrants(permissions, grants) {
  if (Array.isArray(grants)) {
    for (const p of GRANTABLE_PERMISSIONS) {
      if (grants.includes(p)) permissions[p] = true
    }
  }
  return permissions
}
```

- [ ] **Step 4: Esegui il test — deve passare**

Run: `npx vitest run server/services/permissions.test.mjs`
Expected: PASS (preesistenti + nuovi).

- [ ] **Step 5: Commit**

```bash
git add server/services/permissions.js server/services/permissions.test.mjs
git commit -m "feat(permessi): applyGrants (whitelist) + permesso manageAbsences (admin+progettista)"
```

---

### Task 2: `appDataAuthz.js` — assenze gated da `manageAbsences`

**Files:**
- Modify: `server/services/appDataAuthz.js`
- Test: `server/services/appDataAuthz.test.mjs`

**Interfaces:**
- Consumes: `manageAbsences` (Task 1). Nel write-guard, `people` resta gated da `managePeople`, `absences` passa a `manageAbsences`.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi a `server/services/appDataAuthz.test.mjs` (dopo i test esistenti; riusa `EMPTY`, `progettista`, `admin` già definiti nel file, e aggiungi `officina`):
```js
const officina = { id: 'o1', permissions: permissionsForRole('officina') }

describe('authorizeAppDataChange — assenze (manageAbsences)', () => {
  const ab = (id, type) => ({ id, personId: 'p1', type, startDate: '2026-01-01', endDate: '2026-01-02' })
  it('progettista PUÒ modificare le assenze', () => {
    const current = { ...EMPTY, absences: [ab('a1', 'ferie')] }
    const incoming = { ...EMPTY, absences: [ab('a1', 'permesso')] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.absences[0].type).toBe('permesso')
  })
  it('progettista NON può modificare le persone', () => {
    const current = { ...EMPTY, people: [{ id: 'p1', name: 'A', baselineLoadPercent: 30 }] }
    const incoming = { ...EMPTY, people: [{ id: 'p1', name: 'MOD', baselineLoadPercent: 30 }] }
    expect(() => authorizeAppDataChange(current, incoming, progettista)).toThrow(/permess/i)
  })
  it('officina NON può modificare le assenze', () => {
    const current = { ...EMPTY, absences: [ab('a1', 'ferie')] }
    const incoming = { ...EMPTY, absences: [ab('a1', 'permesso')] }
    expect(() => authorizeAppDataChange(current, incoming, officina)).toThrow(/permess/i)
  })
  it('admin può tutto (assenze + persone)', () => {
    const current = { ...EMPTY, absences: [ab('a1', 'ferie')], people: [{ id: 'p1', name: 'A', baselineLoadPercent: 30 }] }
    const incoming = { ...EMPTY, absences: [ab('a1', 'permesso')], people: [{ id: 'p1', name: 'MOD', baselineLoadPercent: 50 }] }
    const out = authorizeAppDataChange(current, incoming, admin)
    expect(out.absences[0].type).toBe('permesso')
  })
})
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npx vitest run server/services/appDataAuthz.test.mjs`
Expected: FAIL sul primo test (`progettista PUÒ modificare le assenze`): oggi le assenze sono gated da `managePeople` (progettista non ce l'ha) → lancia invece di passare.

- [ ] **Step 3: Implementa in `server/services/appDataAuthz.js`**

Nel blocco `// 3) people + absences` (righe ~84-87), sostituisci:
```js
  // 3) people + absences: solo managePeople. Se non hai managePeople, devono risultare INVARIATE
  //    (a meno dei campi filtrati, che vengono reintegrati dal DB).
  for (const key of ['people', 'absences']) {
    if (perms.managePeople) { out[key] = incoming[key]; continue }
```
con:
```js
  // 3) people (managePeople) + absences (manageAbsences): se non hai il permesso relativo,
  //    devono risultare INVARIATE (a meno dei campi filtrati, reintegrati dal DB).
  const canWrite = { people: perms.managePeople, absences: perms.manageAbsences }
  for (const key of ['people', 'absences']) {
    if (canWrite[key]) { out[key] = incoming[key]; continue }
```
Il resto del ciclo (reintegro baseline per `people`, confronto, `forbid`) resta invariato.

- [ ] **Step 4: Esegui il test — deve passare**

Run: `npx vitest run server/services/appDataAuthz.test.mjs`
Expected: PASS (i 19 preesistenti + 4 nuovi).

- [ ] **Step 5: Commit**

```bash
git add server/services/appDataAuthz.js server/services/appDataAuthz.test.mjs
git commit -m "feat(permessi): assenze autorizzate da manageAbsences (progettista puo gestire ferie, non persone)"
```

---

### Task 3: migrazione `011` + authService (`user_permissions`)

**Files:**
- Create: `server/migrations/011_add_user_permissions.sql`
- Modify: `server/services/authService.js`
- Test: `server/services/authService.test.mjs`

**Interfaces:**
- Consumes: `GRANTABLE_PERMISSIONS` (Task 1); `runMigrations`, `getDb` da `../db.js`.
- Produces: `getUserPermissions(userId, db?): string[]`; `setUserPermissions(userId, grants, db?): void`; `getSessionUser`/`listUsers` arricchiti con `grants: string[]`; `deleteUser` pulisce `user_permissions`.

- [ ] **Step 1: Migrazione `server/migrations/011_add_user_permissions.sql`**

```sql
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (user_id, permission)
);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
```

- [ ] **Step 2: Scrivi il test che fallisce**

Aggiungi a `server/services/authService.test.mjs` (aggiungi `getUserPermissions`, `setUserPermissions` all'import; segui il setup `new DatabaseSync(':memory:')` + `runMigrations(db)` già usato):
```js
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
```

- [ ] **Step 3: Esegui il test — deve fallire**

Run: `npx vitest run server/services/authService.test.mjs`
Expected: FAIL (`getUserPermissions is not a function`).

- [ ] **Step 4: Implementa in `server/services/authService.js`**

All'import da `./permissions.js` (che già importa `CONTENT_SECTIONS`) aggiungi `GRANTABLE_PERMISSIONS`.
Aggiungi le due funzioni (accanto a `getUserSections`/`setUserSections`):
```js
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
```
In `listUsers`, aggiungi `grants` all'oggetto ritornato (che già include `sections`):
```js
    return { ...pu, sections: getUserSections(pu.id, db), grants: getUserPermissions(pu.id, db) }
```
In `getSessionUser`, il `return` finale (che già aggiunge `sections`) diventa:
```js
  return { ...user, sections: getUserSections(user.id, db), grants: getUserPermissions(user.id, db) }
```
In `deleteUser`, accanto alla riga `DELETE FROM user_sections`, aggiungi:
```js
  db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(String(id))
```

- [ ] **Step 5: Esegui il test — deve passare**

Run: `npx vitest run server/services/authService.test.mjs`
Expected: PASS (preesistenti + 2 nuovi).

- [ ] **Step 6: Commit**

```bash
git add server/migrations/011_add_user_permissions.sql server/services/authService.js server/services/authService.test.mjs
git commit -m "feat(permessi): tabella user_permissions + get/set grant + arricchimento sessione/lista"
```

---

### Task 4: wiring rotte (applica i grant + salva)

**Files:**
- Modify: `server/routes/index.js`

**Interfaces:**
- Consumes: `applyGrants` (Task 1); `getUserPermissions`, `setUserPermissions` (Task 3).

- [ ] **Step 1: Import**

All'import da `../services/permissions.js` (che già ha `CONTENT_SECTIONS, effectiveSections, permissionsForRole, requirePermission`) aggiungi `applyGrants`.
All'import da `../services/authService.js` (che già ha `getUserSections, setUserSections`) aggiungi `getUserPermissions`, `setUserPermissions`.

- [ ] **Step 2: `currentUser` — applica i grant**

Nel corpo di `currentUser` (dove già c'è `permissions.sections = effectiveSections(...)`), aggiungi dopo quella riga:
```js
  applyGrants(permissions, user.grants)
```
(prima del `return { ...user, permissions }`).

- [ ] **Step 3: login e setup-admin — applica i grant nella risposta**

In `POST /auth/login`, dopo `permissions.sections = effectiveSections(row.role, getUserSections(row.id))`, aggiungi:
```js
      applyGrants(permissions, getUserPermissions(row.id))
```
In `POST /auth/setup-admin`, dopo `permissions.sections = effectiveSections(user.role, getUserSections(user.id))`, aggiungi:
```js
      applyGrants(permissions, getUserPermissions(user.id))
```
(Per il primo admin non ci sono grant → nessun effetto.)

- [ ] **Step 4: `PUT /users/:id` — salva i grant**

Nell'handler `PUT /users/:id`, dove già c'è `if (Array.isArray(body.sections)) setUserSections(...)`, aggiungi subito dopo:
```js
      if (Array.isArray(body.grants)) setUserPermissions(req.params.id, body.grants)
```
e nella risposta includi `grants`. Sostituisci la riga `const sections = getUserSections(...)` + `res.json(...)` con:
```js
      const sections = getUserSections(req.params.id)
      const grants = getUserPermissions(req.params.id)
      res.json({ ...updated, sections, grants, visibleSections: effectiveSections(updated.role, sections).filter((s) => CONTENT_SECTIONS.includes(s)) })
```
(`GET /users` espone già `grants` perché `listUsers` ora lo include e l'handler fa `...u`.)

- [ ] **Step 5: Verifica + smoke isolato**

Run: `node --check server/routes/index.js && npm run typecheck && npm run test`
Expected: `--check` nessun output; typecheck PASS; suite verde.

Smoke isolato (DB temp, NON i dati reali):
```bash
TMPD=$(mktemp -d 2>/dev/null || echo "$TEMP/g4smoke"); mkdir -p "$TMPD"; WORKLOAD_DATA_DIR="$TMPD" WORKLOAD_DB_PATH="$TMPD/w.db" WORKLOAD_STATE_DIR="$TMPD" PORT=3975 HOST=127.0.0.1 WORKLOAD_DISABLE_IPV6_LOCALHOST=1 node server/index.js & sleep 2
curl -s -c "$TMPD/c.txt" -X POST http://127.0.0.1:3975/api/auth/setup-admin -H "content-type: application/json" -d '{"username":"admin","password":"Password1"}' -o /dev/null -w "setup=%{http_code}\n"
curl -s -b "$TMPD/c.txt" -X POST http://127.0.0.1:3975/api/users -H "content-type: application/json" -d '{"username":"opuser","password":"Password1","role":"officina"}' -o "$TMPD/u.json" -w "createuser=%{http_code}\n"
UID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMPD/u.json','utf8')).id)")
curl -s -b "$TMPD/c.txt" -X PUT "http://127.0.0.1:3975/api/users/$UID" -H "content-type: application/json" -d '{"grants":["viewConsuntiviPrices"]}' -w "\nputgrants\n"
```
Expected: `setup=201`, `createuser=201`, il PUT ritorna JSON con `"grants":["viewConsuntiviPrices"]`. Ferma il server con un harness Node (`child.kill('SIGTERM')`) se `kill` è inaffidabile su Git Bash; il DB temp è usa-e-getta.

- [ ] **Step 6: Commit**

```bash
git add server/routes/index.js
git commit -m "feat(permessi): applica i grant per-utente nei permessi + salva grant in PUT /users"
```

---

### Task 5: Frontend — casella prezzi + bottone Ferie per progettisti

**Files:**
- Modify: `src/services/apiClient.ts` (`AdminUserRow.grants` + `updateUserApi`)
- Modify: `src/types/index.ts` (`Permissions` += `manageAbsences`)
- Modify: `src/components/UsersView.tsx` (casella "Prezzi/Report")
- Modify: `src/App.tsx` (bottoni "Ferie e permessi" → `manageAbsences`)

**Interfaces:**
- Consumes: `GET /users` con `grants`; `PUT /users/:id` con `{ grants }`; `permissions.manageAbsences`.

- [ ] **Step 1: `apiClient.ts` — grants**

In `AdminUserRow` aggiungi `grants: string[]`:
```ts
export interface AdminUserRow {
  id: string
  username: string
  role: Role
  linkedPersonId: string
  active: boolean
  sections: string[]
  visibleSections: string[]
  grants: string[]
}
```
`updateUserApi` — aggiungi `grants` al patch:
```ts
export function updateUserApi(id: string, patch: { role?: Role; active?: boolean; linkedPersonId?: string; sections?: string[]; grants?: string[] }): Promise<AdminUserRow> {
  return request(`/api/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) })
}
```

- [ ] **Step 2: `src/types/index.ts` — Permissions**

Nell'interfaccia `Permissions`, aggiungi (dopo `managePeople: boolean`):
```ts
  manageAbsences: boolean
```

- [ ] **Step 3: `UsersView.tsx` — casella "Prezzi/Report"**

Aggiungi la funzione (dopo `toggleSection`):
```tsx
  async function toggleGrant(u: AdminUserRow, grant: string) {
    const next = new Set(u.grants)
    if (next.has(grant)) next.delete(grant)
    else next.add(grant)
    try { await updateUserApi(u.id, { grants: [...next] }); await reload() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.') }
  }
```
Nella `<thead>`, aggiungi una colonna prima dell'ultima (`<th />`):
```tsx
<th className="px-2 py-1">Prezzi/Report</th>
```
Nel corpo riga, aggiungi una `<td>` prima della cella dei bottoni:
```tsx
              <td className="px-2 py-1">
                <input type="checkbox" checked={u.grants.includes('viewConsuntiviPrices')} onChange={() => toggleGrant(u, 'viewConsuntiviPrices')} title="Vede i bottoni Prezzi/Report in Consuntivi (serve comunque la password Consuntivi)" />
              </td>
```

- [ ] **Step 4: `src/App.tsx` — bottone Ferie per manageAbsences**

In `App.tsx` ci sono quattro `{perm?.managePeople && (`: due avvolgono il bottone **"Ferie e permessi"** (quello con `onClick={() => setAbsencesOpen(true)}`), due avvolgono il bottone **"Persone"** (`onClick={() => setPeopleOpen(true)}`). Cambia SOLO i due che avvolgono il bottone Ferie (con `setAbsencesOpen`) da `perm?.managePeople` a `perm?.manageAbsences`. Lascia invariati i due che avvolgono "Persone" (`setPeopleOpen` → restano `perm?.managePeople`).

- [ ] **Step 5: Verifica typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/apiClient.ts src/types/index.ts src/components/UsersView.tsx src/App.tsx
git commit -m "feat(permessi): casella Prezzi/Report per-utente + bottone Ferie per manageAbsences"
```

---

## Ordine e verifica finale

Task 1 → 2 → 3 → 4 → 5. Alla fine:
```bash
npm run test && npm run typecheck && npm run build
```
Expected: suite verde (permissions + appDataAuthz + authService + preesistenti), typecheck PASS, build PASS.

Verifica funzionale (server acceso): come admin, in Utenti spunta "Prezzi/Report" per un officina → al suo login vede i bottoni Prezzi/Report (poi password). Un progettista vede il bottone "Ferie e permessi" e può creare/modificare assenze; NON vede "Persone".
