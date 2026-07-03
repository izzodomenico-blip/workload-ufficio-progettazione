# Backup senza perdita dati — Design (sotto-progetto D)

**Data:** 2026-07-03
**Stato:** approvato in brainstorming, in attesa di revisione spec

## Obiettivo

Rendere impossibile perdere i dati e renderlo **visibile**. Tre garanzie, ognuna colma
un buco dell'attuale sistema di backup:
- **Verificato** — ogni backup destinato all'offsite passa `PRAGMA integrity_check` +
  conteggio righe + checksum. Un backup non verificato non conta come sicuro.
- **Fuori dal PC** — copia automatica su **NAS / share di rete** con ritenzione a lungo
  termine (GFS), non solo le ultime 30 copie sullo stesso disco.
- **Visibile** — la sezione admin dell'app mostra "backup sano / non sano"; se i backup si
  fermano o falliscono, l'admin se ne accorge subito.

Ambito: **solo backup e sua visibilità/verifica**. Il pacchetto autoinstallante è **E**
(riuserà l'helper di registrazione del task). Non si tocca il servizio 24/7 di **C** né lo
schema DB o la logica dati.

## Stato attuale (da riusare, non riscrivere)

`server/backupService.js` già fa: auto-backup ogni 30 min su mutazione (VACUUM INTO + JSON,
ultimi 30) in `backups/auto/`; backup pre-mutazione; backup manuali in `backups/`;
ripristino sicuro (`restoreFromBackup` crea prima un safety-backup); `getBackupStatus`;
`listBackupArchives`; `resolveBackupFile` (anti path-traversal). `snapshot-db.mjs` fa uno
snapshot coerente (VACUUM INTO, include il WAL) del file DB anche a server acceso.
`backup-data.ps1` fa già uno snapshot + copia zippata verso una destinazione, ma è opt-in,
con default **sullo stesso disco** (`backups/offsite`) e senza verifica/ritenzione GFS.

Le rotte `/api/backup/status`, `/api/backups*` sono già protette da `manageBackups` (RBAC,
sotto-progetto B): il pannello e le nuove API di D sono admin-only per costruzione.

## Vincolo che guida l'architettura

Il servizio 24/7 di C gira come **LocalSystem**, che **non ha accesso alle share di rete**.
Quindi: l'**app** (che ha accesso al DB e gira 24/7) crea e **verifica** gli snapshot in
locale; un **task pianificato a nome di un utente con credenziali NAS** li **copia** sul
NAS e scrive una **ricevuta** locale che l'app può leggere. Così la copia-di-rete vive dove
ci sono le credenziali, e la verifica/visibilità vivono nell'app.

## Architettura e flusso

1. **App, timer giornaliero** → `createVerifiedSnapshot()` produce in `backups/verified/`:
   - `verified_<stamp>.db` (VACUUM INTO, coerente col WAL)
   - `verified_<stamp>.json` (manifest: timestamp, dimensione, `integrityOk`, risultato
     `integrity_check`, conteggi per collezione, `sha256` del .db, motivo)
   - Applica la ritenzione GFS locale a `backups/verified/`.
2. **Task pianificato (utente con accesso NAS)** → copia i `verified_*` da
   `backups/verified/` al NAS, applica la ritenzione GFS sul NAS, scrive
   `backups/offsite-status.json` (ricevuta: `lastOffsiteAt`, `lastOffsiteOk`, `dest`,
   `copiedCount`, `error`).
3. **App, pannello admin** → legge lo stato locale (ultimo snapshot verificato + manifest)
   e la ricevuta offsite, calcola **salute** e la mostra col semaforo.

## Componenti (unità piccole, isolate, testabili)

### D1 — Snapshot verificato + manifest
`server/verifiedBackup.js` (nuovo).
- `createVerifiedSnapshot({ now }): { file, manifest }` — usa `getDb()` per `VACUUM INTO`
  su `backups/verified/verified_<stamp>.db`, poi apre lo snapshot e calcola:
  `PRAGMA integrity_check` (→ `integrityOk = risultato === 'ok'`), conteggi righe per
  tabella, `sha256` del file. Scrive `verified_<stamp>.json`. Se `integrity_check` ≠ 'ok',
  il manifest ha `integrityOk:false` (lo snapshot resta ma è marcato non valido).
- `readLatestVerified(): manifest | null` — legge l'ultimo manifest `verified_*.json`.
- Riusa lo stile di `backupService.js` (timestamp, `uniquePath`, ecc.). La **composizione
  del manifest** è una funzione pura esportata `buildManifest({ stamp, sizeBytes,
  integrityResult, counts, sha256, now, reason })` → oggetto manifest, testabile senza DB.
- **Scheduler giornaliero**: helper puro `isSnapshotDue(lastAtIso, now, intervalMs)` →
  boolean (default `intervalMs = 24h`), testabile. Il wiring vive in `server/index.js`:
  all'avvio e poi con un controllo periodico (es. ogni ora) chiama `createVerifiedSnapshot`
  se `isSnapshotDue` è vero. Gira dentro il processo app → **nessuna autenticazione
  necessaria**, e sfrutta il 24/7 di C. Il task NAS resta indipendente (copia l'ultimo
  snapshot verificato disponibile).

### D2 — Modello di salute backup (puro)
`server/backupHealth.js` (nuovo).
- `computeBackupHealth({ latestVerified, offsiteReceipt, now, maxAgeMs }): { status:
  'ok'|'warn'|'error', reasons: string[], details }` — funzione **pura**. Regole:
  - `error` se: nessuno snapshot verificato, oppure ultimo `integrityOk:false`.
  - `warn` se: snapshot verificato più vecchio di `maxAgeMs` (default 26h), oppure ricevuta
    offsite assente/più vecchia di `maxAgeMs`, oppure `offsiteReceipt.lastOffsiteOk:false`.
  - `ok` altrimenti. `reasons` elenca in chiaro cosa non va (per il pannello).

### D3 — API stato + pannello admin
- `server`: nuova rotta `GET /api/backup/health` (dietro `manageBackups`) → ritorna
  `computeBackupHealth(...)` con ultimo snapshot, manifest, ricevuta offsite, ritenzione.
- `src`: estende la UI backup esistente (`ImportExportPanel.tsx` / la sezione admin) con un
  **semaforo backup**: verde/giallo/rosso + riga sintetica ("Ultimo backup verificato: 2h fa
  · integrità OK · copia NAS: 1h fa"). Usa `apiClient` (nuova `fetchBackupHealth()`), tipi in
  `src/types`. Admin-only (già gated). Nessun bottone distruttivo nuovo.

### D4 — Task copia NAS + registrazione
- `backup-data.ps1` **potenziato**: copia i soli `verified_*` (db+json) da
  `backups/verified/` al NAS (`-Dest`), applica ritenzione GFS sul NAS, scrive la ricevuta
  `backups/offsite-status.json` (successo/errore, conteggio, timestamp). Idempotente.
- `install-backup-task.ps1` (nuovo): registra un task pianificato **giornaliero** che lancia
  `backup-data.ps1 -Dest <NAS>` **a nome di un utente con accesso al NAS** (chiede
  utente/credenziali all'installazione; NON le salva nel repo). Idempotente.

### D5 — Ritenzione GFS (pura)
`server/retention.js` (nuovo).
- `selectForRetention(timestamps: string[], { daily, weekly, monthly, now }): { keep:
  string[], drop: string[] }` — funzione **pura**. Tiene: gli ultimi `daily` giornalieri
  (14), poi 1 per settimana per `weekly` settimane (8), poi 1 per mese per `monthly` mesi
  (12). Usata sia dall'app (locale `backups/verified/`) sia dal task (NAS), stessa logica.
  Default: `daily:14, weekly:8, monthly:12`.

## Ritenzione

GFS: **14 giornalieri + 8 settimanali + 12 mensili**, applicata identica in locale
(`backups/verified/`) e sul NAS. Il DB è piccolo (pochi MB) → spazio trascurabile. Protegge
da corruzioni scoperte in ritardo (resta una copia vecchia sana).

## Visibilità e allerta

- Pannello admin con semaforo (D3). Rosso/giallo con motivo esplicito.
- Log dedicato `logs/backup.log` (riusa `server/logging.js` di C) per snapshot verificati e
  la ricevuta offsite.
- **Email fuori scope** (richiede config SMTP) — valutabile in futuro senza cambiare il resto.

## Confini (fuori scope, rimandato)

- **Pacchetto autoinstallante → E** (riuserà `install-backup-task.ps1`).
- **Cloud** come destinazione: fuori scope (scelto NAS); aggiungibile cambiando solo `-Dest`
  del task, senza toccare app/verifica.
- **Restore drill automatico** (ripristino di prova periodico su DB temporaneo): non in
  questa iterazione; la verifica di integrità + checksum copre "il backup è leggibile e
  coerente". Un drill completo è un'estensione futura.
- Nessuna modifica allo schema DB, alle API dati o al flusso di salvataggio.

## Testing

- **D1** `buildManifest`: campi corretti; `integrityOk` deriva da `integrity_check==='ok'`.
  `createVerifiedSnapshot` su un DB temporaneo reale (node:sqlite): produce db+json, integrità
  OK, conteggi coerenti; su un file corrotto simulato → `integrityOk:false`.
- **D2** `computeBackupHealth`: matrice di casi (fresco+integro+ricevuta→ok; snapshot
  stantìo→warn; integrità KO→error; ricevuta assente/vecchia→warn; nessuno snapshot→error).
- **D5** `selectForRetention`: dato un set di timestamp su più mesi, tiene i giusti
  giornalieri/settimanali/mensili e scarta il resto; nessun keep duplicato.
- **D3** API: `GET /api/backup/health` dietro `manageBackups` (non-admin → 403). Frontend:
  typecheck.
- **D4** task/script: verifica sintassi/parse (`node --check` dove applicabile, PowerShell
  parse) + **accettazione manuale** sul server (copia reale sul NAS, ricevuta scritta,
  semaforo verde). Non automatizzabile in CI.
- Runner: `vitest` (`.test.mjs` accanto al sorgente), come il resto del repo.

## Vincoli globali

- Nessuna nuova dipendenza runtime dell'app: solo `express` + moduli nativi Node
  (`node:sqlite`, `node:crypto` per lo sha256, `node:fs`). Gli script NAS sono PowerShell.
- Node ≥ 22. ESM. Test `.test.mjs` con API vitest.
- Le credenziali NAS **non entrano mai nel repo**: le chiede `install-backup-task.ps1` a
  runtime e le affida al task pianificato di Windows.
- Cartelle: snapshot verificati in `backups/verified/` (git-ignorata come `backups/`);
  ricevuta `backups/offsite-status.json`; log in `logs/backup.log`.
- Ritenzione default `daily:14, weekly:8, monthly:12`; freschezza salute default 26h; tutti
  sovrascrivibili (env per l'app, parametri per gli script).
- Retrocompatibile: si estende `backupService`/UI, non si rompe nulla dell'esistente.
