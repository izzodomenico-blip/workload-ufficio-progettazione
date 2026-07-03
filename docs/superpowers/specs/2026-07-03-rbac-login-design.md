# Login + Permessi (RBAC) — Design / Spec (sotto-progetto B)

Data: 2026-07-03
Stato: approvato in brainstorming, in attesa di revisione spec

Parte di un programma più ampio (A rebranding ✅, **B login/permessi**, C affidabilità,
D backup, E pacchetto). Questo spec copre **solo B**.

## 1. Obiettivo
Introdurre login con credenziali e permessi per ruolo: l'amministratore (tu) fa tutto;
gli altri accedono solo a determinate finestre e non possono eliminare il lavoro altrui
né vedere dati riservati. L'enforcement è **reale, lato server**, non solo cosmetico.

## 2. Decisioni (dal brainstorming)
- Permessi per **ruoli predefiniti** (non matrice per-utente).
- **Account dedicati** (non le persone), ognuno collegabile a una persona dell'anagrafica.
- Proprietà lavoro: si registra il **creatore**; non-admin **vede e modifica** l'altrui ma
  **elimina solo il proprio**; admin elimina tutto.
- Enforcement: sessione cookie + **filtro in lettura** + **diff-guard in scrittura** sul
  `PUT /api/app-data` (mantiene il modello "albero intero"). Password con **scrypt** (Node built-in).

## 3. Modello dati

### 3.1 Utenti e sessioni (SOLO server-side, mai in AppData)
Nuove tabelle SQLite (migration 009), fuori dall'albero sincronizzato:
```
users:
  id TEXT PK, username TEXT UNIQUE, password_hash TEXT, salt TEXT,
  role TEXT, linked_person_id TEXT NULL, active INTEGER,
  must_change_password INTEGER, created_at TEXT, updated_at TEXT
sessions:
  token TEXT PK, user_id TEXT, created_at TEXT, expires_at TEXT
```
`role ∈ {amministratore, progettista, officina, sola_lettura}`. Password: `scrypt(password, salt)`
(hash esadecimale), confronto timing-safe.

Le credenziali NON entrano mai in `AppData` né in `GET /api/app-data`. Al client arriva solo,
via `GET /api/auth/me`, l'oggetto sicuro: `{ id, username, role, linkedPersonId, permissions }`.

### 3.2 Proprietà: creatore su lavori/task/consuntivi
Aggiungere il campo opzionale `createdByUserId?: string` a `WorkItem`, `Task`, `Consuntivo`.
- Impostato dal **server** alla creazione (= utente della sessione). Immutabile in update
  (il server preserva sempre il valore originale).
- Retrocompat: i record esistenti hanno `createdByUserId` assente → considerati "legacy",
  eliminabili **solo dall'admin**.

## 4. Ruoli e matrice permessi

### 4.1 Struttura permessi (calcolata dal ruolo, inviata al client come sola lettura)
```
interface Permissions {
  sections: SectionId[]          // tab/finestre visibili
  canCreateWork: boolean         // crea lavori/task
  canEditWork: boolean           // modifica dati operativi delle sezioni visibili
  canDeleteOwnWork: boolean      // elimina il PROPRIO lavoro/task/consuntivo
  deleteAny: boolean             // admin: elimina qualsiasi cosa
  manageUsers: boolean           // gestione account (solo admin)
  managePeople: boolean          // anagrafica persone + carico base + ferie
  viewConsuntiviPrices: boolean  // Prezzi/Report consuntivi
  manageBackups: boolean         // backup/ripristino
  viewLog: boolean               // Storico (activity log)
}
```
`SectionId` = id dei tab attuali: `dashboard, planning, agenda, anagrafiche, disegni,
officina, operai, officina-planning, consuntivi, log` + il nuovo `utenti`.

### 4.2 Matrice per ruolo (proposta — rifinibile in revisione)

| Capacità | Amministratore | Progettista | Officina | Sola-lettura |
|---|---|---|---|---|
| **Sezioni visibili** | tutte + `utenti` | dashboard, planning, agenda, anagrafiche, disegni | officina, officina-planning, operai, consuntivi | dashboard, officina, consuntivi |
| canCreateWork | ✅ | ✅ | ✅ | ❌ |
| canEditWork | ✅ | ✅ | ✅ | ❌ |
| canDeleteOwnWork | ✅ | ✅ | ✅ | ❌ |
| deleteAny | ✅ | ❌ | ❌ | ❌ |
| manageUsers | ✅ | ❌ | ❌ | ❌ |
| managePeople (persone, carico base, ferie) | ✅ | ❌ | ❌ | ❌ |
| viewConsuntiviPrices (prezzi/report) | ✅ | ❌ | ❌ | ❌ |
| manageBackups | ✅ | ❌ | ❌ | ❌ |
| viewLog (storico) | ✅ | ❌ | ❌ | ❌ |

Note:
- **Consuntivi** per Officina/Sola-lettura: solo data-entry/visione; i bottoni **Prezzi 🔒 /
  Report 🔒** appaiono solo con `viewConsuntiviPrices` (admin), oltre alla password già esistente.
- **Persone / carico base / ferie**: solo `managePeople` (admin). Gli altri vedono le persone
  in sola lettura dove servono (assegnazioni), ma non aprono "Persone".
- **Eliminazioni**: lavori/task/consuntivi → creatore o admin. Altre entità (anagrafiche,
  tipologie disegno, operai, output/assegnazioni officina, profili tubi) → **solo admin**.

## 5. Enforcement backend

### 5.1 Autenticazione
- `POST /api/auth/login {username, password}` → verifica scrypt; crea sessione; imposta cookie
  **httpOnly, SameSite=Lax, Path=/** (`Secure` se HTTPS) con il token; ritorna `{ user, permissions }`.
- `POST /api/auth/logout` → invalida la sessione, cancella il cookie.
- `GET /api/auth/me` → utente + permessi correnti (o 401 se non loggato).
- **Middleware** su `/api` (eccetto `/api/auth/login`, `/api/health` e gli static): se manca una
  sessione valida → **401**. Attacca `req.user` (con `permissions`) alla richiesta.
- Scadenza sessione: sliding, es. 12h di inattività (rinnovata a ogni richiesta). Le sessioni
  stanno in tabella → sopravvivono ai riavvii del server (coerente con l'obiettivo 24/7).

### 5.2 Lettura filtrata — `GET /api/app-data`
Il server rimuove dall'albero ciò che il ruolo non può vedere, **prima** di inviarlo:
- `activityLog` → svuotato se `!viewLog`.
- `people[].baselineLoadPercent` → rimosso se `!managePeople`.
- Campi finanziari delle anagrafiche (`balance, exposure, creditLimit, overCreditLimit, risk`)
  → rimossi se `!managePeople` (dati sensibili).
- (Prezzi consuntivi non sono in AppData: già fuori.)
Il resto dei dati operativi è condiviso (l'app è uno strumento di squadra).

### 5.3 Scrittura autorizzata (diff-guard) — `PUT /api/app-data`
Il server confronta l'albero in arrivo con quello attuale in DB e applica regole per collezione;
se una modifica non è permessa → **403** con dettaglio, senza salvare nulla. Regole:
- **workItems / tasks / consuntivi**:
  - *create* (id nuovo): consentito se `canCreateWork`; il server stampa `createdByUserId = req.user.id`
    (ignora quello inviato).
  - *update* (id esistente): consentito se `canEditWork`; il server **preserva** `createdByUserId`
    e `createdAt` originali.
  - *delete* (id sparito): consentito se `deleteAny` **oppure** il record esistente ha
    `createdByUserId === req.user.id`. Altrimenti 403.
- **businessPartners / machineTypes / workshopWorkers / workshopOutputs / workshopAssignments /
  tubeProfiles / calculatedStandardComponents**:
  - create/update: consentito se `canEditWork`.
  - delete: consentito **solo** se `deleteAny` (admin).
- **people**: qualunque differenza (incluso `baselineLoadPercent`) consentita solo se `managePeople`.
  (Il campo baseline resta protetto anche dalla password admin esistente, come oggi.)
- **absences**: create/update/delete consentiti solo se `managePeople`.
- **activityLog**: **append-only, mai sostituito dal client**. Il server parte dal log esistente
  in DB e vi aggiunge solo le voci con `id` nuovo presenti nell'incoming (poi applica il cap).
  Questo evita che un client con log filtrato/vuoto (non-admin) azzeri lo storico e blocca
  manomissioni delle voci passate.
- **notifications**: pass-through (record di sistema).
- **CAMPI RIMOSSI IN LETTURA → PRESERVATI IN SCRITTURA**: per i campi che il read-filter toglie
  (`people[].baselineLoadPercent`, campi finanziari anagrafiche), il server **reintegra il valore
  dal DB** su ogni update dell'entità: il client non li ha mai ricevuti e non deve azzerarli.
  (Un cambio effettivo di questi campi resta possibile solo con la capacità relativa —
  `managePeople` — e passa quindi da un client admin.)
- **Anti-manomissione**: il server ignora sempre `createdByUserId` inviato dal client su update
  (usa quello in DB) e non permette a un non-admin di reintrodurre collezioni riservate assenti
  (rete di sicurezza `extractAppDataPreservingExisting` già preserva le collezioni assenti).

### 5.4 Endpoint gestione utenti (solo `manageUsers`)
- `GET /api/users` → lista utenti (senza hash).
- `POST /api/users {username, password, role, linkedPersonId?}` → crea.
- `PUT /api/users/:id {role?, linkedPersonId?, active?}` → modifica.
- `POST /api/users/:id/reset-password {newPassword}` → reset.
- `DELETE /api/users/:id` → disattiva/elimina (non l'ultimo admin).
Tutti dietro il middleware auth + check `manageUsers`.

## 6. Frontend

### 6.1 Auth context + login
- `AuthProvider` (nuovo): all'avvio chiama `GET /api/auth/me`. Se 401 → mostra la
  **schermata di login** (brandizzata Flowrlink) al posto dell'app. Dopo login → carica l'app.
- Header: mostra **utente corrente** (username/persona) + **Logout**.
- `useAuth()` espone `user` e `permissions`.

### 6.2 Filtro finestre e azioni (difesa in profondità sopra al backend)
- I tab in `Dashboard.tsx` sono filtrati per `permissions.sections`.
- I bottoni header ("Nuovo lavoro", "Ferie e permessi", "Persone") appaiono secondo i permessi
  (`canCreateWork`, `managePeople`).
- I bottoni **Elimina** su lavori/task/consuntivi appaiono solo se `deleteAny` o se sei il creatore;
  su altre entità solo se `deleteAny`.
- Consuntivi: bottoni Prezzi/Report solo se `viewConsuntiviPrices`.
- Nuova vista admin **"Utenti"**: crea/modifica utenti, assegna ruolo, collega persona, reset password.

### 6.3 Nota architetturale
`DataProvider.commitData` continua a fare `PUT /api/app-data`; se il server risponde **403**
(modifica non permessa) il client fa rollback ottimistico (come già fa su errore) e mostra un
toast "Operazione non consentita dai tuoi permessi".

## 7. Primo avvio (bootstrap)
Se la tabella `users` è vuota, il middleware consente **solo** `POST /api/auth/setup-admin`
(oltre a login/health) e il frontend mostra una **schermata di setup** per creare l'account
amministratore (username + password). Creato l'admin, il setup si disabilita e si passa al login.

## 8. Sicurezza / password
- `scrypt(password, salt, 64)`; salt casuale 16 byte; confronto `timingSafeEqual`. Min 8 caratteri.
- Cookie di sessione **httpOnly**, `SameSite=Lax`, `Secure` quando HTTPS; token casuale 32 byte.
- Nessuna credenziale nei log. Rate-limit soft sul login (es. ritardo dopo N tentativi falliti) —
  opzionale, valutare in revisione.
- I gate-password esistenti (carico base, prezzi consuntivi) **restano** come secondo fattore
  sopra al ruolo.

## 9. Retrocompatibilità / migrazione
- `createdByUserId` assente sui dati esistenti → legacy, eliminabili solo da admin.
- Nessuna perdita dati: le nuove tabelle sono additive; l'AppData non cambia forma (solo un campo
  opzionale in più su 3 entità).
- Alla prima messa online serve il bootstrap admin (§7).

## 10. Fuori scope (per questo sotto-progetto)
- Reset password via email / recupero self-service (l'admin resetta manualmente).
- SSO / provider esterni.
- Permessi per-utente su misura (solo ruoli).
- Audit avanzato oltre l'activity log esistente.

## 11. Test (TDD sul cuore di sicurezza)
Unit test (vitest per il frontend/pure; node:test o vitest per la logica server pura estratta):
- **Hashing password**: hash+verify scrypt, timing-safe, password errata → false.
- **Calcolo permessi** dal ruolo: ogni ruolo → set atteso.
- **Read-filter**: dato un ruolo, `filterAppDataForUser(tree, perms)` rimuove esattamente i
  campi/collezioni previsti (log, baseline, campi finanziari) e lascia il resto.
- **Write diff-guard** `authorizeAppDataChange(current, incoming, user)`:
  - non-admin elimina lavoro altrui → 403; elimina il proprio → ok.
  - non-admin modifica lavoro altrui → ok; crea lavoro → `createdByUserId` stampato dal server.
  - non-admin tocca `people`/baseline → 403; tocca collezione riservata → 403.
  - admin → tutto ok.
  - update non può cambiare `createdByUserId` (preservato).
  - client con `activityLog` vuoto (non-admin) NON azzera lo storico (append-only).
  - update di una persona con `baselineLoadPercent` assente (filtrato) NON azzera il valore in DB
    (campo reintegrato); idem campi finanziari anagrafiche.
- **Middleware auth**: nessuna sessione → 401; sessione valida → passa; scaduta → 401.

## 12. Piano a fasi (per il piano d'implementazione)
1. **Fondazione auth server**: tabelle users/sessions (migration 009), modulo `authService`
   (scrypt, sessioni), endpoint login/logout/me/setup-admin, middleware. Test.
2. **Modello permessi**: `permissions.ts` condiviso (ruolo→Permissions), `createdByUserId` nei tipi.
3. **Enforcement dati**: read-filter + write diff-guard su `/api/app-data`. Test (il cuore).
4. **Gestione utenti (backend)**: endpoint `/api/users*` + guard `manageUsers`.
5. **Frontend auth**: `AuthProvider`, login + setup screen (Flowrlink), header utente/logout, 401 handling.
6. **Filtri UI**: tab per `sections`, bottoni per permessi (create/delete/persone/prezzi), vista **Utenti**.
7. **Rifiniture**: toast 403, retrocompat, verifica end-to-end per ogni ruolo.
