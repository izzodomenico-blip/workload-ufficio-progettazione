# Affidabilità 24/7 — Design (sotto-progetto C)

**Data:** 2026-07-03
**Stato:** approvato in brainstorming, in attesa di revisione spec

## Obiettivo

Rendere l'app Flowrlink raggiungibile su `http://IP:3000` in pratica sempre, su un
PC-server Windows d'ufficio sempre acceso e non presidiato. Il servizio si auto-ripara
da tre classi di guasto: **crash** (il processo esce), **hang** (processo vivo ma non
risponde), **riavvio del PC** (deve ripartire anche se nessuno fa login). L'operatore
(non tecnico) deve poter capire lo stato senza guardare una console.

Ambito: **solo affidabilità di servizio**. La sicurezza dei dati (backup offsite) è il
sotto-progetto **D**; il pacchetto autoinstallante è **E**. Qui i riavvii sono resi
**sicuri per i dati**, ma il backup vero non è in questo spec.

Contesto di partenza: greenfield sul server (non ancora deployato). Robustezza
**preventiva** — nessun episodio di blocco concreto da indagare. Fondamenta già presenti
da riusare/rifinire: `ecosystem.config.cjs` (PM2), `DEPLOY-LAN.md`, `install-server.ps1`.

## Architettura a due livelli

1. **Livello processo (supervisore).** PM2 gira come **servizio Windows vero** (avvio al
   boot prima del login, esecuzione come LocalSystem). PM2 riavvia il processo se
   *crasha*, applica un limite di memoria, mantiene log e conteggio riavvii, e permette
   `pm2 status` / `pm2 logs` per l'ispezione a colpo d'occhio.

2. **Livello salute (watchdog).** Un processo separato interroga `/api/health` a
   intervalli regolari; dopo N fallimenti consecutivi forza `pm2 restart` dell'app.
   Copre l'**hang**, che il supervisore da solo non rileva (il processo è vivo).

I due livelli sono indipendenti: il supervisore copre morte/riavvio del processo, il
watchdog copre l'irraggiungibilità a processo vivo.

## Componenti (unità piccole, isolate, con interfacce chiare)

### C1 — `/api/health` con liveness reale
`server/routes/index.js`, handler `GET /health` (rotta pubblica, mount `/api`).
Attualmente ritorna `{ ok: true, service, storage }` senza toccare il DB.

**Nuovo contratto:**
- Esegue un ping DB rapido: `getDb().prepare('SELECT 1 AS ok').get()`.
- Se il ping riesce → **200** `{ ok: true, service, storage: 'sqlite', db: 'ok', uptimeSec, startedAt, pid }`.
- Se il ping lancia (DB bloccato/errore) → **503** `{ ok: false, db: 'error', error, uptimeSec, pid }`.
- Resta pubblico (nessun dato applicativo esposto), `cache-control: no-store`.
- `uptimeSec = Math.round(process.uptime())`; `startedAt` = ISO dell'avvio processo; `pid = process.pid`.

La logica di composizione della risposta vive in una funzione pura esportata
`buildHealthPayload({ dbOk, now, startedAt, pid })` (in un nuovo `server/health.js`) così
è testabile senza rete né DB. L'handler chiama il probe DB e passa `dbOk` alla funzione.

**Interfaccia prodotta:** `buildHealthPayload(input) -> { status: 200|503, body }`.

### C2 — Watchdog salute
`server/watchdog.js` (nuovo). Processo standalone avviato da PM2 come **seconda app**.

- Ogni `HEALTH_INTERVAL_MS` (default 30000) fa `GET http://127.0.0.1:${PORT}/api/health`
  con timeout `HEALTH_TIMEOUT_MS` (default 5000).
- Esito "unhealthy" se: timeout, errore di rete, o status ≠ 200.
- Tiene una finestra degli ultimi esiti. La **decisione** è una funzione pura esportata:
  `shouldRestart(history, threshold) -> boolean` — vero sse gli ultimi `threshold`
  (default 3) esiti sono tutti unhealthy. Un singolo esito healthy azzera la finestra.
- Quando `shouldRestart` è vero: esegue `pm2 restart <APP_NAME>` (via `child_process`,
  nessuna dipendenza), poi svuota la finestra e attende un periodo di grazia
  (`RESTART_GRACE_MS`, default 60000) prima di riprendere i controlli, per dare tempo al
  riavvio senza innescare un loop.
- Ogni esito e ogni azione di riavvio sono loggati in `logs/watchdog.log` con timestamp
  ISO; rotazione semplice per dimensione (tieni ultime ~2000 righe / ~1MB).
- Parametri da env con default sopra: `HEALTH_INTERVAL_MS`, `HEALTH_TIMEOUT_MS`,
  `HEALTH_FAIL_THRESHOLD`, `RESTART_GRACE_MS`, `PORT`, `APP_NAME`.

**Interfacce prodotte (pure, testabili):**
- `shouldRestart(history: boolean[], threshold: number) -> boolean`
- `recordResult(history, healthy, threshold) -> history'` (finestra scorrevole, max `threshold`)

**Nota edge:** se il demone PM2 stesso fosse bloccato, `pm2 restart` potrebbe non
rispondere — caso raro, coperto dal servizio Windows che supervisiona PM2. Fuori scope
un watchdog-del-watchdog.

### C3 — Hardening in-process
`server/index.js`.

- `process.on('uncaughtException', (err) => { logCrash(err); gracefulExit(1) })`
- `process.on('unhandledRejection', (reason) => { logCrash(reason); gracefulExit(1) })`
- `logCrash` scrive su `logs/crash.log` (append, timestamp ISO, stack) — funzione isolata.
- `gracefulExit(code)`: tenta la chiusura dei server + `closeDb()` con un timeout massimo
  (es. 3s) poi `process.exit(code)`. Riusa il `shutdown()` già presente, aggiungendo il
  codice d'uscita e un timeout di sicurezza per non restare appeso in chiusura.
- **Razionale fail-fast:** dopo un errore non gestito lo stato del processo è indefinito;
  meglio uscire pulito e lasciar ripartire il supervisore da uno stato sano, che
  proseguire in stato corrotto. PM2 (con backoff) assorbe i riavvii.

### C4 — Tuning `ecosystem.config.cjs`
Due app nello stesso file:
- App **server** (`server/index.js`): `autorestart: true`, `exp_backoff_restart_delay: 200`
  (backoff esponenziale: PM2 continua a riprovare con ritardo crescente e **non si
  arrende**). **Rimosso il tetto `max_restarts: 30`** che oggi fermerebbe i tentativi;
  con `exp_backoff_restart_delay` attivo PM2 riavvia indefinitamente. `max_memory_restart:
  '400M'`, `kill_timeout: 5000` (attende la chiusura pulita prima di terminare), log dedicati.
- App **watchdog** (`server/watchdog.js`): `autorestart: true`, `max_memory_restart: '150M'`.
- Env comuni: `NODE_ENV=production`, `PORT=3000`, `HOST=0.0.0.0`.

### C5 — `install-service.ps1` (servizio Windows, boot-before-login)
Script PowerShell idempotente (rilanciabile senza danni), da eseguire come Amministratore.
Fa, nell'ordine:
1. Verifica Node ≥ 22; se manca, messaggio chiaro (no installazione silenziosa insicura).
2. Installa PM2 globale se assente (`npm i -g pm2`).
3. `npm ci` + `npm run build` se `dist/` manca o è più vecchia dei sorgenti.
4. Registra un **servizio Windows** che avvia PM2 al boot come LocalSystem (prima del
   login). Meccanismo: un servizio la cui azione esegue `pm2-runtime start
   ecosystem.config.cjs` (PM2 in foreground supervisionato dal servizio). `ecosystem.config.cjs`
   è l'unica fonte di verità dei processi: a ogni boot il servizio ri-lancia le due app da
   lì, quindi **non serve** `pm2 save`/`pm2 resurrect`. Registrazione del servizio via
   `node-windows` (pacchetto npm, nessun binario esterno da procurare a mano; installato
   dallo script). Nome servizio: `Flowrlink`.
5. Regola firewall per la porta 3000 (idempotente: rimuove/riaggiunge la regola omonima).
6. Avvia il servizio e stampa l'indirizzo `http://IP:3000` e lo stato (`pm2 status`).

Nota confine con **E**: `install-service.ps1` è un mattone che il pacchetto autoinstallante
(E) richiamerà; qui lo produciamo e lo verifichiamo in isolamento.

### C6 — Sicurezza dei dati durante i riavvii
Non è backup (quello è D), ma i riavvii non devono corrompere il DB:
- SQLite in **WAL** (già attivo in `db.js`) → scritture atomiche, un kill a metà non
  corrompe il file.
- `kill_timeout` PM2 + `gracefulExit` con `closeDb()` → il checkpoint WAL si chiude pulito
  quando possibile.
- Il watchdog usa `pm2 restart` (stop+start gestito, con `kill_timeout`), non un kill duro.

### C7 — Documentazione
Aggiornare `DEPLOY-LAN.md` Passo 5: sostituire il flusso `pm2-windows-startup` (fragile,
richiede login) con `install-service.ps1` (servizio vero). Aggiungere una tabella
"Come capire se è sana" (pm2 status, logs/watchdog.log, /api/health dal browser).

## Osservabilità

- `pm2 status` → online + n° riavvii.
- `logs/watchdog.log` → esiti dei controlli + quando/perché ha riavviato.
- `logs/crash.log` → errori non gestiti con stack.
- `GET /api/health` dal browser → `ok`, `db`, `uptimeSec` (verifica manuale rapida).

## Testing

- **C1** `buildHealthPayload`: 200 con `dbOk:true`; 503 con `dbOk:false`; campi presenti.
- **C2** `shouldRestart` / `recordResult`: 3 fallimenti consecutivi ⇒ true; 1-2 ⇒ false;
  un healthy in mezzo azzera la finestra; la finestra non supera `threshold`.
- **C3** hardening: con handler montati, un errore simulato scrive su crash.log e invoca
  l'uscita (mock di `process.exit` e del writer di log) senza terminare il test runner.
- **Accettazione manuale** (in `DEPLOY-LAN.md`, non automatizzata):
  1. `pm2 status` online; `taskkill` del processo server → PM2 lo riavvia in pochi secondi.
  2. Riavvio del PC senza login → il servizio riparte e l'app risponde.
  3. Hang simulato (blocco temporaneo dell'event loop in un ramo di debug locale, non in
     produzione) → il watchdog riavvia entro ~90s e logga il motivo.

Runner: `vitest` (come il resto del repo). I test toccano solo funzioni pure/isolate;
nessun test avvia il server reale o PM2.

## Vincoli globali

- **Nessuna nuova dipendenza runtime dell'applicazione**: `server/*` continua a importare
  solo `express` + moduli nativi Node. PM2, `pm2-runtime`, `node-windows` sono **tooling
  operativo** installato sul server (globale o via `install-service.ps1`), non import del
  codice applicativo. Il watchdog invoca `pm2` via `child_process` (nessun import).
- **Node ≥ 22** (già richiesto da `node:sqlite`).
- **Windows** è la piattaforma target del deploy; gli script di servizio sono PowerShell.
  Il codice Node (health, watchdog, hardening) resta cross-platform e testabile ovunque.
- Log sotto `logs/` (nuova cartella, git-ignorata come `data/` e `backups/`).
- Porta 3000, host 0.0.0.0, nome app PM2 `workload-ufficio-progettazione`, nome servizio
  Windows `Flowrlink`.
- Retrocompatibile: nessuna modifica a schema DB, API dati o frontend. Solo aggiunte
  (health arricchito, watchdog, hardening, script) e tuning di config/docs.

## Fuori scope (rimandato)

- Backup offsite / anti-ransomware → **D**.
- Pacchetto zip autoinstallante con stato DB → **E** (riusa C5).
- Notifiche push/email su down (l'osservabilità qui è log + pm2 + /health). Valutabile poi.
- Watchdog-del-watchdog e failover multi-nodo (sovradimensionati per un ufficio).
