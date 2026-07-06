# Affinamenti permessi — Design (sotto-progetto G)

**Data:** 2026-07-06
**Stato:** approvato in brainstorming, in attesa di revisione spec

## Obiettivo

Due affinamenti dei permessi, richiesti dall'uso reale:

- **Parte A — Prezzi/Report Consuntivi per singolo utente.** L'amministratore abilita per
  singolo utente la visibilità dei bottoni Prezzi/Report in Consuntivi (permesso
  `viewConsuntiviPrices`, oggi solo del ruolo admin). La password Consuntivi resta il secondo
  lucchetto per aprirli, invariata per tutti.
- **Parte B — Ferie e permessi per i progettisti.** I progettisti possono **vedere e
  modificare** il calendario Ferie e permessi (assenze), come l'admin — ma NON la gestione
  persone / dati finanziari. Serve separare le assenze dal permesso `managePeople` in un
  permesso dedicato `manageAbsences`, con enforcement **vero lato server**.

Additivo e retrocompatibile: nessun utente perde nulla; cambia solo chi guadagna accesso.

## Stato attuale (verificato)

- `viewConsuntiviPrices`: permesso in `permissions.js`, `true` solo per `amministratore`
  (base `false`). I bottoni Prezzi/Report in `ConsuntiviView.tsx:47,50` sono gated da
  `user?.permissions.viewConsuntiviPrices`. L'API prezzi è protetta dalla **password
  Consuntivi** (`requireConsuntiviPassword`), indipendente dal ruolo → resta il vero gate dati.
- `people` e `absences` sono autorizzati **insieme** da `managePeople` nel write-guard
  (`appDataAuthz.js:84-105`: se non `managePeople`, entrambe devono restare invariate, con
  reintegro del `baselineLoadPercent` per `people`). Il bottone "Ferie e permessi"
  (`App.tsx:60,84`) e "Persone" (`App.tsx:70,94`) sono gated da `managePeople`. Le assenze
  NON sono filtrate in lettura (tutti i ruoli le ricevono già via GET /app-data).

## Parte A — Prezzi/Report per-utente

### Modello
- Nuovo dato per utente: **grants** (permessi concessi). Whitelist attuale =
  `['viewConsuntiviPrices']` (estendibile senza riscrivere).
- Permesso effettivo = permesso del **ruolo OPPURE** grant per-utente (limitato alla whitelist).
- Il grant abilita solo la **visibilità dei bottoni** (client). La password Consuntivi resta
  la barriera d'accesso ai dati (invariata). Onestà: concedere il grant = "vede il bottone e
  può inserire la password", identico all'esperienza admin di oggi.

### Componenti A
- **G1 — migrazione `011_add_user_permissions.sql`**: tabella di join `user_permissions
  (user_id TEXT, permission TEXT, PRIMARY KEY(user_id, permission))` + indice; `IF NOT EXISTS`
  (idempotente sotto il runner run-all-every-startup).
- **G2a — `permissions.js`**: esporta `GRANTABLE_PERMISSIONS = ['viewConsuntiviPrices']` e la
  funzione pura `applyGrants(permissions, grants)` — per ogni permesso in `GRANTABLE_PERMISSIONS`
  presente in `grants`, imposta `permissions[p] = true`; ignora voci fuori whitelist; ritorna
  `permissions` (muta e ritorna).
- **G3 — `authService.js`**: `getUserPermissions(userId, db?): string[]` (i grant),
  `setUserPermissions(userId, grants, db?): void` (valida contro `GRANTABLE_PERMISSIONS`,
  sostituisce le righe); `getSessionUser` e `listUsers` arricchiti con `grants: string[]`;
  `deleteUser` pulisce anche `user_permissions`.
- **G5 — `routes/index.js`**: `currentUser`/login/setup-admin applicano `applyGrants(permissions,
  user.grants)` (dopo `permissionsForRole` e dopo `effectiveSections`); `GET /users` espone
  `grants`; `PUT /users/:id` (gated `manageUsers`) salva `grants` se presenti nel body.
- **G6a — frontend**: `AdminUserRow.grants: string[]`; `updateUserApi` accetta `grants?: string[]`;
  in `UsersView` una casella **"Prezzi/Report Consuntivi"** per utente (toggle → `updateUserApi`).

## Parte B — Ferie/permessi per progettisti (`manageAbsences`)

### Modello
- Nuovo permesso **`manageAbsences`**: `base()` = false; **`amministratore` = true,
  `progettista` = true**; `officina`/`sola_lettura` = false.
- Le **assenze** (`absences`) sono autorizzate da `manageAbsences` invece che da `managePeople`;
  le **persone** (`people`) restano su `managePeople`. Reintegro del `baselineLoadPercent`
  invariato (resta legato a `people`/`managePeople`).
- Il bottone "Ferie e permessi" passa a `manageAbsences`; "Persone" resta `managePeople`.

### Componenti B
- **G2b — `permissions.js`**: aggiungi `manageAbsences` a `base()` (false), al ramo
  `amministratore` (true) e al ramo `progettista` (true).
- **G4 — `appDataAuthz.js`**: nel write-guard, separa il ciclo `['people','absences']`:
  `people` gated da `perms.managePeople` (con reintegro baseline se assente); `absences` gated
  da `perms.manageAbsences` (invariate se assente). Nessun altro cambiamento all'autorizzazione.
- **G6b — frontend**: `Permissions` (in `src/types/index.ts`) += `manageAbsences: boolean`; in
  `App.tsx` i due bottoni "Ferie e permessi" (righe ~60, ~84) passano da `perm?.managePeople` a
  `perm?.manageAbsences`; i due bottoni "Persone" restano `perm?.managePeople`.
- La modale `AbsencesCalendarModal` non richiede modifiche: le sue scritture passano da
  `PUT /app-data`, ora autorizzate per `manageAbsences`.

## Testing

- **A** `applyGrants` (permissions.test): grant `viewConsuntiviPrices` → `true`; nessun grant →
  invariato (valore del ruolo); voce fuori whitelist ignorata.
- **A** `get/setUserPermissions` (authService.test, DB temp + `runMigrations`): set/get, scarto
  voci non-whitelist, set `[]` azzera, `deleteUser` rimuove le righe.
- **B** `permissions.test`: `permissionsForRole('progettista').manageAbsences === true`;
  `permissionsForRole('officina').manageAbsences === false`; admin true.
- **B (critico) `appDataAuthz.test`**: progettista scrive `absences` ✓ ma NON `people` ✗;
  officina/sola_lettura non scrivono `absences` ✗; admin tutto ✓. (Estende i test adversariali
  esistenti del diff-guard.)
- Frontend: typecheck + build.
- Runner: `vitest` (`.test.mjs`). DB reale non toccato (DB temp iniettato).

## Vincoli globali

- Nessuna nuova dipendenza runtime app. Node ≥ 22. ESM. Test `.test.mjs` con API vitest.
- Ruoli invariati salvo l'aggiunta di `manageAbsences` (admin+progettista). Whitelist grant =
  solo `viewConsuntiviPrices` (YAGNI).
- Migrazione idempotente (`CREATE TABLE IF NOT EXISTS`); niente `ALTER TABLE ADD COLUMN`.
- Retrocompatibile: utente senza grant = come oggi; il permesso `manageAbsences` è additivo.
- Enforcement reale lato server: Parte B nel write-guard (`appDataAuthz`); Parte A è visibilità
  bottoni (la password Consuntivi resta il gate dati, invariata).
- L'admin non perde nulla; `managePeople` conserva persone + finanziari + `baselineLoadPercent`.

## Fuori scope

- Whitelist grant oltre `viewConsuntiviPrices` (aggiungibile in futuro con lo stesso meccanismo).
- Rimozione/bypass della password Consuntivi per utenti abilitati.
- Permessi assenze per officina/sola_lettura (solo progettista+admin, come richiesto).
- `manageAbsences` per-utente (è una scelta di ruolo, come richiesto).
