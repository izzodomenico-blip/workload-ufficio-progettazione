# Workload - Ufficio Progettazione Meccanica

Web app locale per gestire carico di lavoro, commesse, studi, attività interne,
task, persone, assenze, pianificazione, anagrafiche, libreria Registro Disegni
e report dell'ufficio progettazione.

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
- Il JSON include anche `businessPartners` e `machineTypes`.
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

### Backup automatici server

Il backend crea backup automatici lato server nella cartella:

```text
backups/auto/
```

I file automatici hanno nomi del tipo:

```text
auto_backup_workload_YYYY-MM-DD_HH-mm-ss.db
auto_backup_workload_YYYY-MM-DD_HH-mm-ss.json
```

I backup automatici sono separati dai backup manuali: `npm run backup` continua
a scrivere direttamente in `backups/`, mentre l'automatico scrive solo in
`backups/auto/`.

Strategia anti-spreco:

- per le modifiche normali viene creato al massimo un backup automatico ogni 30 minuti;
- se arrivano altre modifiche entro 30 minuti, il server tiene un backup pendente per il prossimo intervallo;
- prima di operazioni rischiose viene creato subito un backup automatico pre-mutazione.

Operazioni rischiose:

- import JSON;
- reset demo;
- eliminazione di un work item;
- chiamate esterne a `PUT /api/app-data` non marcate come salvataggio normale dal frontend.

Rotazione:

- vengono conservati solo gli ultimi 30 backup automatici `.db`;
- i backup automatici più vecchi e il relativo `.json` vengono eliminati;
- i backup manuali in `backups/` non vengono cancellati dalla rotazione automatica.

Stato backup:

```text
GET /api/backup/status
```

Lo stato è mostrato anche nel menu **Strumenti > Backup dati**.

Per ripristinare manualmente un backup `.db`:

1. Spegni il server chiudendo la finestra `npm run start`.
2. Fai una copia di sicurezza dell'attuale `data/workload.db`.
3. Copia il file `.db` scelto da `backups/auto/` o `backups/` in `data/`.
4. Rinominalo in `workload.db`.
5. Riavvia con `npm run start`.

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
- JSON senza `machineTypes`;
- stati legacy rimappati agli stati attuali.

## Report e notifiche

Dal menu **Strumenti > Report**:

- **Esporta report settimanale Markdown** scarica il riepilogo `.md`.
- **Anteprima report executive / Stampa PDF** apre la vista stampabile.

Le notifiche interne restano locali all'app e vengono salvate nel database. Il
pulsante **Prepara email** usa ancora `mailto:`: l'invio è manuale dal client di
posta dell'utente.

Non inserire credenziali email, password SMTP o token nel frontend.

## Anagrafiche (clienti / fornitori / personale)

Dalla v1.2 l'app gestisce un archivio di **anagrafiche** dedicato. La nuova vista
**Anagrafiche** (tab in alto, accanto a Storico) consente di:

- creare/modificare manualmente clienti, fornitori, personale e altri soggetti;
- **disattivare/riattivare** un'anagrafica (soft delete: non viene mai
  cancellata fisicamente di default);
- ricercare per ragione sociale, P.IVA, codice fiscale, codice conto, email, PEC,
  città o telefono;
- importare in blocco dal file gestionale `ANAGRAFICA.xml` (formato Excel
  SpreadsheetML 2003);
- vedere i **lavori collegati** a ogni anagrafica nel pannello dettaglio.

### Dove mettere `ANAGRAFICA.xml`

Il file va salvato in `imports/` (cartella esclusa da Git via `.gitignore`).
Esempio:

```
workload-ufficio-progettazione/
└── imports/
    └── ANAGRAFICA.xml           ← non tracciato da Git
```

> ⚠️ `imports/` e tutti i file `*.xml` sono **ignorati da Git**. Non spostare
> mai il file dentro al repo principale, non includerlo nei commit e non
> caricarlo su GitHub. Custodisci `ANAGRAFICA.xml` e i backup in una cartella
> aziendale protetta.

### Come importare

1. Vai sul tab **Anagrafiche** → pulsante **↑ Importa XML/CSV/JSON**.
2. Seleziona il file `ANAGRAFICA.xml`. Il backend lo legge in locale (nessun
   upload cloud) ed esegue il parsing SpreadsheetML.
3. Compare un'anteprima con: file, righe lette, **nuove**, **aggiornate**,
   **scartate**, eventuali avvisi di parsing e i primi record con l'azione
   pianificata.
4. Conferma con **Conferma import**. L'app:
   - aggiorna o crea le anagrafiche;
   - **non cancella mai** anagrafiche esistenti;
   - registra un singolo evento nello storico modifiche
     (`Import anagrafica completato: X nuove, Y aggiornate, Z scartate`);
   - innesca il backup automatico server e include `business_partners`.

### Regole di deduplica

Per ogni record letto dal file, il backend cerca un match in questo ordine:

1. **codice conto** (`accountCode`) uguale;
2. **P.IVA + ragione sociale** uguali;
3. **codice fiscale + ragione sociale** uguali.

Se trova un match, **aggiorna** l'anagrafica esistente (preservando id,
`createdAt` e i campi non presenti nel file). Altrimenti **crea** un nuovo
record. Le righe senza ragione sociale o senza alcun identificativo (conto /
P.IVA / CF) vengono **scartate**.

### Mappatura colonne XML → BusinessPartner

| Colonna XML        | Campo BusinessPartner |
|--------------------|------------------------|
| Conto              | `accountCode`          |
| Ragione Sociale    | `name` (obbligatorio)  |
| Partita Iva        | `vatNumber`            |
| Codice Fiscale     | `fiscalCode`           |
| Codice SDI         | `sdiCode`              |
| Indirizzo          | `address`              |
| CAP                | `postalCode`           |
| Località           | `city`                 |
| Prov               | `province`             |
| Nazione            | `country`              |
| Telefono           | `phone`                |
| Cod Pag            | `paymentCode`          |
| Pagamento          | `paymentDescription`   |
| Banca di appoggio  | `bankName`             |
| ABI / CAB          | `abi` / `cab`          |
| Cod. Iva/Esenzione | `vatExemptionCode`     |
| Email              | `email`                |
| PEC                | `pec`                  |
| Saldo              | `balance`              |
| Esposizione        | `exposure`             |
| Fido               | `creditLimit`          |
| Fuori fido         | `overCreditLimit`      |
| Rischio            | `risk`                 |

Se nel file non c'è una colonna `Tipo`, il default è `cliente` e `active=true`.

### Autocomplete cliente nei lavori

Nel form **Nuovo lavoro / Modifica lavoro**, dopo aver digitato almeno **3
lettere** nel campo **Cliente** compare un menu a tendina con risultati
dall'anagrafica (solo `active=true`). Selezionando una voce:

- `customer` = ragione sociale dell'anagrafica;
- `customerPartnerId` viene impostato sul lavoro (collegamento permanente).

Se scrivi un cliente non in anagrafica, viene salvato come **testo libero**
(`customer` solo, `customerPartnerId` vuoto) — comparirà la nota "Cliente non
presente in anagrafica — verrà salvato come testo libero". I lavori esistenti
con `customer` testuale **continuano a funzionare** senza migrazione: nel drawer
appare "Cliente libero / non collegato ad anagrafica".

### Backup e privacy

I backup includono **sempre** la tabella `business_partners` sia in:

- `.db` (snapshot SQLite, copia di tutta la base dati);
- `.json` (export manuale e auto, struttura `data.businessPartners`).

I JSON di backup contengono **dati aziendali sensibili** (P.IVA, codici
fiscali, email, PEC, saldo, esposizione, fido, rischio). Trattali come
documenti riservati:

- non condividerli via canali pubblici;
- conservali in `backups/` su disco aziendale protetto;
- non committarli su Git (le cartelle `imports/`, `backups/`, `data/` sono
  già escluse).

I backup precedenti senza `businessPartners` continuano a funzionare: l'app
inizializza l'array a vuoto.

## Libreria Registro Disegni

La vista **Libreria disegni** contiene le tipologie di disegno/macchina derivate
dal Registro Disegni aziendale INNO.TEC, ad esempio `I.RM - Rulliere
motorizzate`, `I.TS - Tendostrutture`, `I.MP - Manipolatore` e gli standard
`S.SC` / `S.TS`.

La libreria serve come base dati interna per le fasi successive legate
all'**Output verso officina**. In questo step non calcola ancora carichi
officina e non modifica il workload dell'ufficio tecnico.

Ogni tipologia ha:

- codice registro e nome;
- famiglia logica;
- peso base relativo;
- complessita default (`bassa`, `media`, `alta`, `speciale`);
- processi indicativi: laser, laser tubo, piegatura, saldatura, montaggio,
  verniciatura, collaudo;
- numero tipico di complessivi e particolari;
- note e stato `active`.

I coefficienti e i conteggi sono **valori indicativi modificabili**. Servono per
precompilare e uniformare i dati futuri, non sono consuntivi e non devono essere
letti come ore officina.

### Come modificare una tipologia

1. Apri il tab **Libreria disegni**.
2. Cerca per codice o nome, oppure filtra per famiglia/stato.
3. Clicca **Modifica** sulla riga desiderata.
4. Aggiorna peso base, complessita, complessivi, particolari, processi o note.
5. Salva: l'app registra l'evento nello storico modifiche e salva nel database.

### Attivare o disattivare

Usa **Disattiva** o **Riattiva** dalla tabella. La tipologia non viene cancellata
fisicamente: cambia solo `active`, cosi resta nei backup e nello storico.

I backup `.db` e `.json` includono sempre la tabella/collezione
`machine_types` / `data.machineTypes`. I backup vecchi senza `machineTypes`
restano importabili e inizializzano la libreria come array vuoto.

## Sicurezza minima

Questa versione non ha login ed è pensata per una rete locale aziendale fidata.

Non esporre la porta `3000` su internet, non aprire port forwarding dal router e
non pubblicare il server su cloud senza aggiungere autenticazione e protezioni
adeguate. **Da v1.2 il database contiene anche P.IVA, PEC, codici fiscali ed
esposizione dei clienti** — il rischio di esposizione è aumentato.

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

GET    /api/business-partners
POST   /api/business-partners
PUT    /api/business-partners/:id
PUT    /api/business-partners/:id/activate
PUT    /api/business-partners/:id/deactivate
DELETE /api/business-partners/:id            ← soft delete (active=false)

POST   /api/business-partners/parse-xml      ← body { xml, filename } → records[]

GET    /api/machine-types
POST   /api/machine-types
PUT    /api/machine-types/:id                <- active=false per disattivare

GET /api/activity-log

GET /api/notifications
PUT /api/notifications/:id/read
PUT /api/notifications/read-all

GET /api/backup/status
```

Il frontend usa soprattutto `GET /api/app-data` e `PUT /api/app-data`, così le
funzioni esistenti restano coerenti con activity log e notifiche.

## Script npm

```powershell
npm run dev        # backend + frontend in sviluppo
npm run build      # typecheck + build frontend
npm run start      # server produzione locale su porta 3000
npm run db:seed    # crea dati demo se il DB è vuoto
npm run db:repair-people  # ripristina/riattiva i 5 membri base senza toccare lavori e task
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
backups/auto/        backup automatici server
dist/                frontend compilato servito da Express
```

## Limiti attuali

- Nessuna autenticazione.
- Nessun cloud obbligatorio.
- Nessuna sincronizzazione realtime push: gli altri utenti vedono i dati dal
  database al caricamento/refresh della pagina.
- Nessuna gestione conflitti avanzata se due utenti modificano gli stessi dati
  nello stesso istante.
