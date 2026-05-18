# Workload - Ufficio Progettazione Meccanica

Web app locale per gestire carico di lavoro, commesse, studi, attività interne,
task, persone, assenze, pianificazione e report dell'ufficio progettazione.

La versione attuale è **v1.1**: frontend React/Vite + backend Node.js/Express +
database SQLite locale condiviso.

## Cosa cambia in v1.1

La vecchia versione salvava i dati nel `localStorage` del singolo browser. Questo
significava dati separati per PC, browser o profilo utente.

La nuova versione salva i dati in un database unico:

```text
data/workload.db
```

Tutti gli utenti della stessa rete aziendale aprono lo stesso link del PC/server
che ospita l'app e leggono/scrivono gli stessi dati.

## Installazione

Richiede Node.js 24 o superiore, perché il server usa il modulo SQLite integrato
di Node.

```powershell
npm install
```

## Avvio in sviluppo

```powershell
npm run dev
```

Questo avvia:

- backend Express su `http://localhost:3000`
- frontend Vite su `http://localhost:5173` o porta libera successiva

In sviluppo Vite inoltra `/api` al backend.

## Avvio in produzione locale

Sul PC che farà da server:

```powershell
npm run build
npm run start
```

Il server ascolta su:

```text
0.0.0.0:3000
```

Sul PC server puoi aprire:

```text
http://localhost:3000
```

Per i colleghi usa l'IP del PC server:

```text
http://IP_DEL_PC_SERVER:3000
```

Esempio:

```text
http://192.168.1.50:3000
```

## Trovare l'IP del PC server su Windows

Apri PowerShell o Prompt dei comandi e usa:

```powershell
ipconfig
```

Cerca la scheda di rete aziendale e la voce **Indirizzo IPv4**. Quello è l'IP da
dare ai colleghi insieme alla porta `3000`.

## Database

Il database SQLite viene creato qui:

```text
data/workload.db
```

Il server crea le tabelle se non esistono. Se il database è vuoto, all'avvio lo
inizializza con dati demo minimi. Puoi anche eseguire:

```powershell
npm run db:seed
```

Il seed non sovrascrive un database già popolato. Per forzare il reset demo del
database da terminale:

```powershell
npm run db:seed -- --force
```

## Accesso dei colleghi

I colleghi devono essere nella stessa rete locale e aprire nel browser:

```text
http://IP_DEL_PC_SERVER:3000
```

Se il PC server è spento, in sospensione o il processo `npm run start` non è
attivo, l'app non sarà raggiungibile dagli altri PC.

## Backup

Backup da interfaccia:

- **Strumenti > Backup dati > Scarica backup JSON** esporta tutti i dati in JSON.
- Il file contiene `backupInfo` e `data`.
- L'export registra un evento nello storico.

Backup da terminale:

```powershell
npm run backup
```

Lo script crea in `backups/`:

- `backup_workload_ufficio_YYYY-MM-DD_HH-mm.json`
- `backup_workload_db_YYYY-MM-DD_HH-mm.db`

Il file `.db` è una copia consistente del database SQLite. Il JSON è utile per
import o controllo umano.

## Importare vecchi dati

Flusso consigliato dalla vecchia versione localStorage:

1. Apri la vecchia app sul browser dove sono presenti i dati.
2. Usa **Strumenti > Backup dati > Scarica backup JSON**.
3. Avvia la nuova versione v1.1 con backend.
4. Apri l'app dal server.
5. Usa **Strumenti > Backup dati > Importa backup JSON**.
6. Controlla l'anteprima e conferma.

L'import salva i dati nel database SQLite condiviso.

Compatibilità mantenuta:

- nuovi backup `{ backupInfo, data }`;
- vecchi export `AppData` diretti;
- JSON senza `absences`;
- JSON senza `activityLog`;
- JSON senza `notifications`;
- stati legacy rimappati agli stati attuali.

## Report e notifiche

Dal menu **Strumenti > Report**:

- **Esporta report settimanale Markdown** scarica il riepilogo `.md`.
- **Anteprima report executive / Stampa PDF** apre la vista stampabile.

Le notifiche interne restano locali all'app e vengono salvate nel database. Il
pulsante **Prepara email** usa ancora `mailto:`: l'invio è manuale dal client di
posta dell'utente.

Non inserire credenziali email, password SMTP o token nel frontend.

## Sicurezza minima

Questa versione non ha login ed è pensata per una rete locale aziendale fidata.

Non esporre la porta `3000` su internet, non aprire port forwarding dal router e
non pubblicare il server su cloud senza aggiungere autenticazione e protezioni
adeguate.

Il backend non abilita CORS aperto: in produzione il frontend e le API sono
serviti dallo stesso server Express.

## API REST

Endpoint principali:

```text
GET  /api/app-data
PUT  /api/app-data

GET  /api/people
POST /api/people
PUT  /api/people/:id

GET    /api/work-items
POST   /api/work-items
PUT    /api/work-items/:id
DELETE /api/work-items/:id

GET    /api/tasks
POST   /api/tasks
PUT    /api/tasks/:id
DELETE /api/tasks/:id

GET    /api/absences
POST   /api/absences
PUT    /api/absences/:id
DELETE /api/absences/:id

GET /api/activity-log

GET /api/notifications
PUT /api/notifications/:id/read
PUT /api/notifications/read-all
```

Il frontend usa soprattutto `GET /api/app-data` e `PUT /api/app-data`, così le
funzioni esistenti restano coerenti con activity log e notifiche.

## Script npm

```powershell
npm run dev        # backend + frontend in sviluppo
npm run build      # typecheck + build frontend
npm run start      # server produzione locale su porta 3000
npm run db:seed    # crea dati demo se il DB è vuoto
npm run backup     # backup JSON + copia DB in backups/
npm run typecheck  # controllo TypeScript frontend
```

## Struttura

```text
src/                 frontend React
server/              backend Express + SQLite
server/migrations/   schema SQL
data/workload.db     database locale condiviso
backups/             backup generati da npm run backup
dist/                frontend compilato servito da Express
```

## Limiti attuali

- Nessuna autenticazione.
- Nessun cloud obbligatorio.
- Nessuna sincronizzazione realtime push: gli altri utenti vedono i dati dal
  database al caricamento/refresh della pagina.
- Nessuna gestione conflitti avanzata se due utenti modificano gli stessi dati
  nello stesso istante.
