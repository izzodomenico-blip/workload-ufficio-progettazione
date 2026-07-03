# Pacchetto autoinstallante — Design (sotto-progetto E)

**Data:** 2026-07-03
**Stato:** approvato in brainstorming, in attesa di revisione spec

## Obiettivo

Su un PC-server Windows pulito: estrai uno zip e con **un click** (installer come
Amministratore) l'app Flowrlink è online 24/7 con lo stato attuale dei dati, il servizio di
C attivo, il backup NAS di D attivabile nello stesso flusso, e **nessun aggiornamento futuro
può perdere dati**. È il sotto-progetto conclusivo: riunisce C (servizio) e D (backup) in un
unico installer.

## Principio guida: stato separato dal codice

Un'unica variabile d'ambiente **`WORKLOAD_STATE_DIR`** definisce dove vivono i dati:
`data/` (DB), `backups/` (verificati + ricevuta NAS) e `logs/`. Default = cartella progetto
(`ROOT_DIR`) → dev/test invariati. In produzione l'installer la imposta a
**`C:\ProgramData\Flowrlink`**. Così la cartella del codice è **sostituibile** senza mai
toccare i dati.

## Stato attuale (da riusare/aggiornare)

- `make-package.ps1`: impacchetta i sorgenti (esclude node_modules/dist/data/backups/segreti/
  log/.git/.superpowers) + snapshot coerente del DB (`snapshot-db.mjs`) in `data/`, e zippa.
  Da aggiornare: mettere il DB come `seed/` invece che `data/`.
- `install-server.ps1`: installer attuale che usa **PM2 classico + pm2-windows-startup** —
  approccio che **C ha sostituito** con `install-service.ps1` (servizio Windows
  boot-before-login). Da **riscrivere** perché orchestri C+D e la cartella stato.
- `install-service.ps1` (C): servizio Windows `Flowrlink`. Da aggiornare: passare
  `WORKLOAD_STATE_DIR` nell'env del servizio.
- `install-backup-task.ps1` + `backup-data.ps1` (D): backup NAS. `backup-data.ps1` legge oggi
  `$PSScriptRoot\backups\verified` — da far leggere da `WORKLOAD_STATE_DIR`.

## Componenti (unità piccole, isolate)

### E1 — knob `WORKLOAD_STATE_DIR` nell'app
- `server/db.js`: aggiungi ed esporta `STATE_DIR` = `WORKLOAD_STATE_DIR` risolto, default
  `ROOT_DIR`. `DATA_DIR` mantiene l'override `WORKLOAD_DATA_DIR` ma il default diventa
  `STATE_DIR/data`. `DB_PATH` invariato (default `DATA_DIR/workload.db`). Helper puro
  esportato `resolveStateDir(env, rootDir): string` (per test).
- `server/backupService.js`: `BACKUPS_DIR = path.join(STATE_DIR, 'backups')` (importa
  `STATE_DIR` da `./db.js`). `AUTO_BACKUPS_DIR`/`STATUS_PATH` restano derivati da `BACKUPS_DIR`.
- `server/verifiedBackup.js`: `VERIFIED_DIR = path.join(STATE_DIR, 'backups', 'verified')`,
  `OFFSITE_RECEIPT_PATH = path.join(STATE_DIR, 'backups', 'offsite-status.json')`.
- `server/index.js`: `CRASH_LOG`, `BACKUP_LOG` → `path.join(STATE_DIR, 'logs', …)` (importa
  `STATE_DIR`).
- `server/watchdog.js`: `LOG_FILE = path.join(STATE_DIR, 'logs', 'watchdog.log')` (importa
  `STATE_DIR` da `./db.js`, non più `process.cwd()`).
- Compatibilità: con default `ROOT_DIR`, tutti i path restano identici a oggi → nessuna
  regressione, i test esistenti (che usano `WORKLOAD_DATA_DIR`/`WORKLOAD_DB_PATH` o `dir`
  iniettato) continuano a passare.

### E2 — `make-package.ps1` (seed invece di data)
Impacchetta il DB coerente come **`seed/workload.db`** (non `data/`). Il resto invariato
(sorgenti + tutti gli script + zip estraibile ovunque, voce-per-voce con separatori `/`).
Così ri-estrarre non porta mai un DB "vecchio" sopra i dati vivi (che stanno in ProgramData).

### E3 — `install-server.ps1` (riscritto): l'unico installer
Idempotente, come Amministratore, dentro la cartella estratta. Fa in ordine:
1. **Node ≥ 22** (winget se manca, col flusso "riapri shell" già esistente).
2. **`npm ci` + `npm run build`**.
3. **Cartella stato**: crea `C:\ProgramData\Flowrlink\{data,backups,logs}`.
4. **Migrazione una-tantum**: se lo stato in ProgramData è vuoto E si trova un DB esistente
   da migrare → **copia** i dati in ProgramData dopo una **copia di sicurezza** dell'origine.
   Sorgente cercata, in ordine: (a) il parametro opzionale `-MigrateFrom <cartella>` se
   passato (per un vecchio install in un'altra cartella); (b) `.\data\workload.db` relativo
   all'installer (caso: pacchetto estratto SOPRA un vecchio install nella stessa cartella).
   Se nessuna sorgente esiste, si salta la migrazione (si va al seed). Non si **sposta** né
   cancella l'origine: si copia, così l'origine resta come ulteriore backup finché
   l'operatore non la rimuove. Mai due sorgenti di verità *attive* (il servizio punta solo a
   ProgramData).
5. **Seed prima installazione**: se lo stato è ancora vuoto e il pacchetto ha
   `seed/workload.db` → copialo in `ProgramData\data\workload.db`. Se lo stato non è vuoto
   (aggiornamento) → **non toccare i dati**.
6. **`WORKLOAD_STATE_DIR`**: impostala a livello Machine (`C:\ProgramData\Flowrlink`) e
   passala al servizio.
7. **Servizio 24/7**: chiama `install-service.ps1` (C).
8. **Firewall** porta 3000 (idempotente).
9. **Backup NAS opzionale**: chiedi "configurare ora il backup sul NAS? (s/n)". Se sì, chiedi
   il percorso `\\NAS\…` e chiama `install-backup-task.ps1 -Dest <percorso>` (che a sua volta
   chiede l'utente NAS).
10. **Riepilogo**: URL `http://IP:3000`, stato (`pm2 status`), promemoria: le password admin
    si impostano al primo avvio nell'app (schermata setup), le password sezioni via DEPLOY-LAN.

### E4 — allineamento C+D allo stato
- `install-service.ps1` (C) + `scripts/install-windows-service.cjs`: aggiungi
  `WORKLOAD_STATE_DIR` all'env del servizio (accanto a `PM2_HOME`/`PM2_BIN`).
- `backup-data.ps1` (D): legge la cartella `backups\verified` e scrive la ricevuta da
  `WORKLOAD_STATE_DIR` (env) invece che da `$PSScriptRoot`; fallback a `$PSScriptRoot\backups`
  se l'env non è impostata (retrocompat dev/uso manuale).

### E5 — documentazione
`DEPLOY-LAN.md`: sezione unica "Installazione in un colpo" (crea pacchetto → estrai →
install-server.ps1) + "Aggiornare in sicurezza" (i dati in ProgramData non si toccano) +
"Dove sono i dati" (`C:\ProgramData\Flowrlink`).

## Flusso sicurezza dati (il cuore)

- **Prima installazione** (stato vuoto): `seed/workload.db` → `ProgramData\data`.
- **Aggiornamento** (stato esistente): dati **intoccati**; si sostituisce solo codice+build e
  si riavvia il servizio. Uno snapshot verificato di D esiste già prima del riavvio.
- **Migrazione** (dati nella vecchia posizione): **copiati** una sola volta in ProgramData,
  dopo copia di sicurezza; l'origine resta come backup finché l'operatore non la rimuove. Il
  servizio punta solo a ProgramData → mai due DB "vivi".

## Confini (fuori scope)

- Nessuna nuova dipendenza runtime app. Nessuna modifica a schema DB, API dati o frontend:
  solo path di stato configurabili + script + docs.
- Non si tocca la logica di C (servizio) o D (backup) oltre al passaggio di `WORKLOAD_STATE_DIR`.
- Nessun installer grafico (MSI/exe firmato): resta uno script PowerShell "un click". Un
  vero installer firmato è un'estensione futura.
- Cloud/aggiornamenti automatici (auto-update): fuori scope.

## Testing

- **E1**: `resolveStateDir(env, rootDir)` puro — default `rootDir` senza env, path risolto con
  env. Verifica che `DATA_DIR`/`BACKUPS_DIR`/`VERIFIED_DIR`/log derivino da `STATE_DIR`.
  L'intera suite esistente resta verde (nessuna regressione con default). Un test di
  integrazione: con `WORKLOAD_STATE_DIR` a una temp dir, `createVerifiedSnapshot` e i backup
  finiscono lì (non in `backups/verified` del progetto).
- **E2/E3/E4**: script Windows → verifica parse (PowerShell) + `node --check` sui `.cjs` +
  **accettazione manuale** sul server (installazione reale, servizio online, salute,
  migrazione dati). Non automatizzabile in CI.
- Runner: `vitest` (`.test.mjs`), come il resto del repo.

## Vincoli globali

- Node ≥ 22. ESM. Test `.test.mjs` con API vitest.
- `WORKLOAD_STATE_DIR` default = `ROOT_DIR` (dev/test invariati); produzione =
  `C:\ProgramData\Flowrlink`. Nome servizio Windows `Flowrlink`. Porta 3000.
- Credenziali NAS mai nel repo (le chiede `install-backup-task.ps1`).
- L'installer non sovrascrive MAI dati esistenti; migrazione solo dopo copia di sicurezza.
- Retrocompatibile: default invariati; gli script vecchi restano validi come riferimento.
