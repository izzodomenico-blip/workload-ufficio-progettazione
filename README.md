# Workload - Ufficio Progettazione Meccanica

Web app locale per gestire carico di lavoro, commesse, studi, attività interne,
task, persone, assenze, pianificazione, anagrafiche, libreria Registro Disegni
output verso officina e report dell'ufficio progettazione.

La versione attuale è **v1.1**: frontend React/Vite + backend Node.js/Express +
database SQLite locale condiviso.

## Come si calcola il carico (workload)

Il carico di ogni persona è guidato **dai lavori**, non dai task:

- Ogni lavoro ha un **carico stimato** dichiarato nella tendina "Carico stimato
  del lavoro" (in ore) e una **data di consegna**.
- Le ore vengono distribuite dalla data odierna fino alla consegna e ripartite
  tra gli **assegnatari** del lavoro. Se un lavoro non ha assegnatari, il carico
  ricade sull'**owner**.
- Quindi **basta salvare il lavoro** con carico e consegna per vederlo nel
  workload e nella pianificazione: non serve creare task.
- I **task sono solo dettagli descrittivi**, utili per annotare dinamiche
  interne di un lavoro. **Non hanno peso**: non cambiano il carico né la salute
  del lavoro.

La salute del lavoro (OK / a rischio / in ritardo) è calcolata sempre dal lavoro
stesso (stato, date, avanzamento), confrontando l'avanzamento reale con quello
atteso in base ai giorni lavorativi fino alla consegna.

## Cosa cambia in v1.1

La vecchia versione salvava i dati nel `localStorage` del singolo browser. Questo
significava dati separati per PC, browser o profilo utente.

La nuova versione salva i dati in un database unico:

```text
data/workload.db
```

Tutti gli utenti della stessa rete aziendale aprono lo stesso link del PC/server
che ospita l'app e leggono/scrivono gli stessi dati.

### Sicurezza salvataggi condivisi

Il frontend usa il database SQLite come fonte dati principale. La cache
`localStorage` resta solo di appoggio locale, ma non puo salvare modifiche
finche non ha caricato i dati dal backend (gate `serverReady`).

L'integrita dei dati condivisi e garantita da una **rete di sicurezza lato
server**: ogni `PUT /api/app-data` che non include una collezione (es.
`machineTypes`) NON azzera quella collezione, ma conserva i valori gia presenti
nel database. Cosi un payload parziale o un frontend con un bug non possono
svuotare commesse, libreria disegni o output officina.

I salvataggi **non vengono mai bloccati** per disallineamento: l'app resta
sempre utilizzabile da tutti. Gli header `x-workload-data-revision` e
`x-workload-last-mutation-at` vengono comunque inviati come informazione (utili
per diagnostica e per futuri controlli di concorrenza), ma non rifiutano la
scrittura. In caso di modifica contemporanea sullo stesso elemento da due PC
vale l'ultima scrittura; dopo ogni salvataggio l'app ricarica i dati condivisi
dal database.

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

Nota importante: non usare link `localhost` sui PC dei colleghi. Per loro
`localhost` indica il proprio PC, non il server aziendale. Tutti devono usare lo
stesso IP del PC che sta eseguendo `npm run start`.

## Backup

Backup da interfaccia:

- **Strumenti > Backup dati > Scarica backup JSON** esporta tutti i dati in JSON.
- Il file contiene `backupInfo` e `data`.
- Il JSON include anche `businessPartners` e `machineTypes`.
- Il JSON include anche `workshopOutputs`.
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
- JSON senza `workshopOutputs`;
- stati legacy rimappati agli stati attuali.

Protezione moduli nuovi: se un vecchio backup non contiene `businessPartners`,
`machineTypes` o `workshopOutputs`, l'import non azzera automaticamente le
tabelle condivise gia presenti sul server.

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

La libreria serve come base dati interna per gli **Output verso officina** e per
la dashboard **Carico officina**. Non modifica il workload dell'ufficio tecnico.

Ogni tipologia ha:

- codice registro e nome;
- famiglia logica;
- peso base relativo;
- complessita default (`bassa`, `media`, `alta`, `speciale`);
- processi indicativi: laser, laser tubo, piegatura, saldatura, montaggio,
  verniciatura, collaudo;
- percentuale di incidenza per ogni processo default della tipologia;
- numero tipico di complessivi e particolari;
- note e stato `active`.

I coefficienti, i conteggi e le percentuali processo sono **valori indicativi
modificabili**. Servono per precompilare e uniformare i dati futuri, non sono
consuntivi e non devono essere letti come ore officina.

Le percentuali processo permettono di pesare meglio una macchina specifica: una
`I.RM - Rulliera motorizzata`, ad esempio, puo avere laser, piegatura,
saldatura e montaggio attivi, ma con incidenze diverse tra loro. Queste
percentuali vengono copiate sull'output officina e possono essere ritoccate per
la singola commessa.

### Come modificare una tipologia

1. Apri il tab **Libreria disegni**.
2. Cerca per codice o nome, oppure filtra per famiglia/stato.
3. Clicca **Modifica** sulla riga desiderata.
4. Aggiorna peso base, complessita, complessivi, particolari, processi,
   percentuali processo o note.
5. Salva: l'app usa le API dedicate `/api/machine-types`, registra l'evento
   nello storico modifiche e salva nella tabella SQLite `machine_types`.

Le modifiche alla libreria non passano piu dal salvataggio globale dell'intero
`AppData`: questo evita che un conflitto su lavori/task o una cache browser
vecchia impediscano il salvataggio della tipologia.

### Attivare o disattivare

Usa **Disattiva** o **Riattiva** dalla tabella. La tipologia non viene cancellata
fisicamente: cambia solo `active`, cosi resta nei backup e nello storico.

I backup `.db` e `.json` includono sempre la tabella/collezione
`machine_types` / `data.machineTypes`. I backup vecchi senza `machineTypes`
restano importabili e non cancellano la libreria gia presente sul server.

## Output verso officina

Le commesse possono avere una sezione **Output verso officina** dentro:

- **Nuovo lavoro / Modifica lavoro**;
- drawer dettaglio lavoro.

La sezione compare solo quando il tipo lavoro è **Commessa**. Per gli **Studi**
compare solo una nota leggera: gli output saranno disponibili quando lo studio
diventa commessa. Per i lavori **Interni** la sezione resta nascosta.

Gli output descrivono cosa arriverà in officina al rilascio progettazione:
tipologia macchina/disegno, quantità, complessità, complessivi, particolari
stimati, processi previsti, data rilascio prevista/effettiva e stato. Non sono
obbligatori e non sostituiscono i task dell'ufficio tecnico.

La tipologia viene selezionata dalla **Libreria disegni** usando ricerca per
codice, nome o famiglia. Alla selezione vengono copiati i default della
tipologia (`defaultComplexity`, processi, conteggi tipici), ma l'utente può
modificarli sulla singola commessa senza cambiare la libreria.

### Indice impatto officina

I processi non sono piu solo flag si/no: ogni processo ha anche una percentuale
di incidenza. La percentuale arriva dalla Libreria disegni e puo essere
modificata sul singolo output, cosi una rulliera motorizzata puo pesare
diversamente laser, piegatura, saldatura e montaggio rispetto a una
tendostruttura o a un manipolatore.

Ogni output ha un `impactScore` calcolato automaticamente. L'indice non
rappresenta ore, ma un peso relativo per aiutare la produzione a pianificare il
carico futuro.

La formula usa:

- quantità;
- peso base della tipologia (`defaultImpactWeight`);
- fattore complessità;
- processi richiesti;
- percentuali di incidenza dei processi richiesti;
- numero complessivi;
- numero particolari stimati.

Livelli indicativi:

- `0-10`: basso;
- `10-25`: medio;
- `25-50`: alto;
- `>50`: critico.

Gli output sono salvati in `workshop_outputs` e nei backup JSON come
`data.workshopOutputs`. I backup precedenti senza `workshopOutputs` restano
importabili e non cancellano automaticamente gli output gia presenti sul server.

## Dashboard Carico officina

La vista **Carico officina** (tab principale, vicino a *Libreria disegni*) è una
vista di **analisi e lettura** pensata per il responsabile produzione: mostra
cosa arriverà in officina nei prossimi giorni/settimane dopo il rilascio della
progettazione. La compilazione degli output resta nella commessa: qui non si
modifica nulla, si legge e si filtra.

Legge `workItems`, `workshopOutputs`, `machineTypes`, `people` e, dove
disponibili, le anagrafiche clienti.

### Cos'è `workshopDate`

Per ogni output la **data di arrivo officina** è calcolata in cascata:

1. `actualReleaseDate` dell'output, se valorizzata;
2. altrimenti `plannedReleaseDate` dell'output;
3. altrimenti `plannedProductionReleaseDate` del lavoro collegato;
4. altrimenti `dueDate` del lavoro.

Quando la data deriva dal lavoro (punti 3-4) e non dall'output, la riga viene
marcata con `~` e generata una criticità "output senza data di rilascio
impostata".

### Cos'è `impactScore` e perché non sono ore

`impactScore` è un **peso relativo** (vedi *Indice impatto officina*), non una
stima di ore officina. La dashboard non converte mai l'indice in ore: serve solo
a confrontare il peso relativo di output, settimane, processi e tipologie. La
nota *"L'indice di impatto è un valore relativo, non rappresenta ore officina"*
è sempre visibile.

### KPI

In alto, KPI su settimana corrente e prossima: output previsti, output
rilasciati, indice impatto settimana corrente e prossima, complessivi e
particolari previsti, output con laser piano e laser tubo. Più due KPI
sull'intero periodo selezionato: **tipologia più impattante** e **commessa più
impattante** (cliccabile per aprire il lavoro).

### Come leggere le prossime 4 settimane

Quattro card, una per settimana ISO, sempre a partire dalla settimana corrente
(indipendenti dal filtro periodo). Per ognuna: indice impatto totale, numero
output, complessivi, particolari, output laser piano/tubo, commesse coinvolte e
un **livello aggregato**:

- `0-20`: basso;
- `20-50`: medio;
- `50-90`: alto;
- `>90`: critico.

I livelli aggregati (`getAggregatedWorkshopImpactLevel`) sono più alti di quelli
del singolo output (`getWorkshopImpactLevel`) perché sommano più output.

### Come leggere il carico per processo

Aggrega gli output del **periodo selezionato** per processo (laser piano, laser
tubo, piega, saldatura, montaggio, verniciatura, collaudo). Per ognuno: numero
output, quantità, particolari, indice impatto totale, commesse coinvolte. Una
barra confronta visivamente il peso dei processi tra loro. Serve a vedere subito
dove si concentra il carico (es. laser tubo o saldatura).

Da questa versione l'indice per processo e pesato con la percentuale di
incidenza salvata sull'output: se un output ha impatto 20 e saldatura 30%, al
processo saldatura viene attribuita quota 6. Questo rende la lettura piu vicina
alla realta della singola macchina senza trasformare l'indice in ore.

### Come leggere il carico per tipologia

Aggrega per tipologia macchina/disegno (`I.TS`, `I.RM`, …) nel periodo
selezionato: quantità, output, complessivi, particolari, indice impatto totale,
commesse coinvolte e livello aggregato. Ordinato per impatto decrescente.

### Flusso giornaliero

Tabella raggruppata per giorno di arrivo officina (`workshopDate`), in ordine
crescente. Per ogni output: commessa/codice, cliente, tipologia, progettista,
quantità, complessivi, particolari, processi, indice impatto con livello e
stato. Cliccando una riga si apre il dettaglio della commessa.

### Criticità

Poche segnalazioni automatiche e leggibili: settimane con impatto critico, molti
output ad alta/speciale complessità o molti particolari nella stessa settimana,
concentrazioni di laser tubo o saldatura, output senza data di rilascio
impostata, output ancora "previsto" con data passata, output sospesi.

### Filtri

Periodo (settimana corrente, prossima, prossime 4/8 settimane, personalizzato),
cliente, commessa/codice, tipologia, famiglia, stato output, progettista,
processo. I filtri aggiornano flusso giornaliero, carico per processo e carico
per tipologia. KPI e prossime 4 settimane restano ancorati a settimana
corrente/prossima e ai filtri non temporali.

### Limiti

I dati dipendono dagli output inseriti nelle commesse: se una commessa non ha
output, non compare nel carico officina. L'indice impatto è relativo e
indicativo, non sostituisce una schedulazione di reparto.

### Report flusso officina (PDF / stampa)

Dalla dashboard Carico officina il pulsante **Report produzione** apre
un'anteprima in **tema chiaro pronta per stampa o PDF**, pensata da condividere
con il responsabile produzione.

**Come generarlo**

1. Apri il tab **Carico officina**.
2. Imposta i filtri desiderati (periodo, cliente, tipologia, ecc.).
3. Clicca **Report produzione**: si apre l'anteprima.
4. Clicca **Stampa · Salva PDF**: parte `window.print()`. Dal dialog del browser
   scegli "Salva come PDF" oppure una stampante. Viene stampata **solo l'area
   report**, non l'interfaccia dell'app.
5. **Chiudi** per tornare alla dashboard.

Non servono librerie esterne: usa la stampa nativa del browser e il CSS
`@media print` già presente (`.report-print-area`).

**Cosa contiene**

- intestazione con periodo analizzato e data/ora di generazione;
- nota fissa: l'indice di impatto **non rappresenta ore**, è relativo;
- riga "Filtri applicati" con i filtri attivi della dashboard;
- **Sintesi**: output previsti/rilasciati nel periodo, indice impatto totale,
  livello complessivo, complessivi, particolari, commesse, più una frase di
  criticità;
- **Flusso previsto verso officina**: tabella per data (prime 25 righe, con nota
  se ce ne sono altre);
- **Carico per processo** (laser piano/tubo, piega, saldatura, montaggio,
  verniciatura, collaudo);
- **Carico per tipologia** (prime 8 per impatto);
- **Distribuzione prossime 4 settimane**;
- **Criticità / attenzioni** (massimo 8, con badge gravità).

**Come si legge `impactScore`**

È un indicatore **relativo** (tipologia, quantità, complessità, complessivi,
particolari, processi). Serve a confrontare il peso tra output, settimane,
processi e tipologie. **Non sono ore** preventive o consuntive.

**Come usarlo con la produzione**

Il report rispetta i filtri correnti della dashboard: imposta il periodo
(es. prossime 4 settimane), genera il PDF e condividilo nella riunione di
produzione per concordare priorità e colli di bottiglia (laser tubo, saldatura,
settimane critiche) senza dover ragionare in ore.

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

GET    /api/workshop-outputs
POST   /api/workshop-outputs
PUT    /api/workshop-outputs/:id
DELETE /api/workshop-outputs/:id

GET /api/activity-log

GET /api/notifications
PUT /api/notifications/:id/read
PUT /api/notifications/read-all

GET /api/backup/status
```

Il frontend usa soprattutto `GET /api/app-data` e `PUT /api/app-data`, così le
funzioni esistenti restano coerenti con activity log e notifiche.

`GET /api/app-data` restituisce anche l'header `x-workload-data-revision`.
`PUT /api/app-data` deve rimandare la stessa revisione: se non corrisponde, il
server risponde `409` e protegge il database da sovrascritture basate su dati
vecchi.

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
- Gestione conflitti base con revisione server: un browser vecchio non puo
  sovrascrivere il database, ma non c'e ancora collaborazione realtime campo per
  campo.
