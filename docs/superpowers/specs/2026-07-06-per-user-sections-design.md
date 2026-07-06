# Visibilità sezioni per-utente — Design (sotto-progetto F)

**Data:** 2026-07-06
**Stato:** approvato in brainstorming, in attesa di revisione spec

## Obiettivo

L'amministratore decide, **per ogni utente**, quali sezioni/tab dell'app quell'utente vede,
indipendentemente dal ruolo. Il ruolo continua a governare cosa l'utente può **fare**
(creare/modificare/eliminare) e la protezione dei dati riservati; l'override cambia **solo la
visibilità/navigazione**.

Additivo e retrocompatibile: un utente **senza override** vede le sezioni del suo ruolo, come
oggi (nessun cambiamento di comportamento).

## Modello

- Le sezioni **contenuto** (override-abili): `dashboard`, `planning`, `agenda`, `anagrafiche`,
  `disegni`, `officina`, `officina-planning`, `operai`, `consuntivi`.
- Le sezioni **speciali** NON override-abili: `utenti` (solo admin, legata a `manageUsers`) e
  `log`/Storico (legata a `viewLog`). Restano governate dal ruolo, per non mostrare tab vuoti.
- **Override per utente** = insieme delle sezioni-contenuto che quell'utente vede. Se l'insieme
  è vuoto (nessuna riga) → si usano le sezioni del ruolo (default).
- Sezioni effettive dell'utente = `override(contenuto)` ∪ `sezioni speciali che il ruolo
  concede`. Così un amministratore **non può** togliersi la sezione Utenti (il ruolo gliela
  ridà sempre).

### Onestà tecnica (dichiarata)
Le `permissions.sections` guidano il **filtro dei tab lato client** (già esistente in
`Dashboard.tsx`). Nascondere una sezione **nasconde il tab**: è un controllo di navigazione.
I dati dietro restano protetti dai permessi del ruolo (filtro in lettura + guardie in
scrittura di appDataAuthz). NON è un muro "l'utente non può proprio leggere quei dati via API".
Per l'obiettivo ("quale dashboard ciascuno vede") è il livello corretto. Un muro dati
per-sezione lato server è un'estensione futura, fuori scope.

## Perché una tabella di join (non una colonna)

Il runner delle migrazioni (`runMigrations` in `db.js`) esegue **tutti** i file `.sql` a ogni
avvio; l'idempotenza si basa su `CREATE TABLE IF NOT EXISTS`. Un `ALTER TABLE ADD COLUMN` non è
idempotente e romperebbe al secondo avvio. Una tabella di join `user_sections` si crea con
`IF NOT EXISTS` → idempotente, nessuna modifica al runner, nessun rischio sulle migrazioni
esistenti.

## Componenti (unità piccole, isolate, testabili)

### F1 — Migrazione `010_add_user_sections.sql`
```sql
CREATE TABLE IF NOT EXISTS user_sections (
  user_id TEXT NOT NULL,
  section TEXT NOT NULL,
  PRIMARY KEY (user_id, section)
);
CREATE INDEX IF NOT EXISTS idx_user_sections_user ON user_sections(user_id);
```
Nessun tocco ai dati esistenti; un utente senza righe = nessun override.

### F2 — `permissions.js`: sezioni contenuto + funzione pura
- Esporta `CONTENT_SECTIONS` = le 9 sezioni override-abili (sopra).
- Esporta `effectiveSections(role, override)` — **pura**:
  - `roleSections = permissionsForRole(role).sections`.
  - se `override` è assente o vuoto → ritorna `roleSections` (invariato).
  - altrimenti → `content = override ∩ CONTENT_SECTIONS`, `specials = roleSections ∩ {utenti, log}`,
    ritorna l'unione deduplicata `content ∪ specials`.

### F3 — `authService.js`: leggere/scrivere l'override
- `getUserSections(userId, db): string[]` — le sezioni override dell'utente (array; vuoto = nessun override).
- `setUserSections(userId, sections, db): void` — sostituisce le righe: valida ogni voce contro
  `CONTENT_SECTIONS` (scarta le non valide e le speciali), cancella le righe esistenti dell'utente,
  reinserisce quelle valide (dedup). Un array vuoto → nessuna riga (torna al default ruolo).
- `publicUser`/`listUsers` includono due campi:
  - `sections: string[]` — l'override grezzo (`[]` = nessun override).
  - `visibleSections: string[]` — le **sezioni-contenuto effettive** (server-side:
    `effectiveSections(role, override)` ∩ `CONTENT_SECTIONS`), usate dalla UI per pre-spuntare
    le caselle. Con override vuoto = le sezioni-contenuto del ruolo.
- `deleteUser` cancella anche le righe `user_sections` dell'utente.
- `getSessionUser` include `sections` nell'utente restituito (serve al calcolo permessi).

### F4 — `routes/index.js`: permessi effettivi + salvataggio sezioni
- In `currentUser`, calcola `permissions.sections = effectiveSections(user.role, user.sections)`
  (invece del solo `permissionsForRole(user.role).sections`). Le altre chiavi permesso restano
  dal ruolo.
- `PUT /api/users/:id` (già gated `manageUsers`): se il body contiene `sections` (array), chiama
  `setUserSections(id, sections)` oltre all'`updateUser` per role/active/linkedPersonId.

### F5 — Frontend `UsersView.tsx` + `apiClient`
- `apiClient`: `AdminUserRow` con `sections: string[]` e `visibleSections: string[]`;
  `updateUserApi` accetta `sections?: string[]`.
- `UsersView`: per ogni utente, un **pannello compatto di spunte** per le sezioni-contenuto
  (etichette leggibili), pre-spuntate da `visibleSections`; al salva invia le sezioni spuntate via
  `updateUserApi(id, { sections })`. **Svuotare tutte le spunte = torna al comportamento del
  ruolo** (override cancellato). Etichetta chiara: "Sezioni visibili (nessuna spunta = come il ruolo)".
- Il filtro dei tab (`Dashboard.tsx` `visibleTabs`) usa già `permissions.sections` → funziona
  senza modifiche.

## Testing

- **F2** `effectiveSections`: nessun override → sezioni del ruolo; override `['consuntivi']` per
  un progettista → `['consuntivi']` (+ eventuali speciali del ruolo, che per progettista sono
  nessuna); admin con override senza `utenti` → `utenti` resta presente (ruolo la ridà); voci
  non valide/speciali nell'override → ignorate.
- **F3** `getUserSections`/`setUserSections` su DB temporaneo (node:sqlite + `runMigrations`):
  set → get ritorna le sezioni valide; voci invalide scartate; set `[]` → get vuoto; delete utente
  → righe rimosse.
- **F4** (integrazione leggera, opzionale): `PUT /api/users/:id` con `sections` aggiorna l'override
  (già coperto a livello unità da F3; il route è un wrapper sottile). Frontend: typecheck.
- Runner: `vitest` (`.test.mjs`). Il DB reale non viene toccato (DB temporaneo iniettato).

## Vincoli globali

- Nessuna nuova dipendenza runtime app. Node ≥ 22, ESM, test `.test.mjs` con API vitest.
- Ruoli invariati: `amministratore`, `progettista`, `officina`, `sola_lettura`. L'override tocca
  **solo** `permissions.sections`, nessun'altra chiave permesso.
- Sezioni speciali `utenti`/`log` non override-abili; l'admin non può perdere `utenti`.
- Retrocompatibile: utenti senza righe `user_sections` = comportamento attuale (sezioni del ruolo).
- Enforcement: le `sections` restano un filtro di **navigazione** (client), calcolato lato server;
  la protezione dei dati resta quella del ruolo (appDataAuthz). Nessun muro dati per-sezione.

## Fuori scope (estensioni future)

- Permessi-azione per-utente (crea/modifica/elimina, gestione utenti, prezzi) a la carte.
- Muro dati per-sezione lato server (impedire la lettura via API dei dati di una sezione nascosta).
- Override delle sezioni speciali (`utenti`, `log`) — richiederebbe anche i permessi corrispondenti.
