# Workload - Ufficio Progettazione Meccanica

App locale per monitorare carico di lavoro, commesse, studi, attività interne,
task, assenze, pianificazione e report dell'ufficio progettazione.

La versione attuale è **v1.0-local**: è pronta per un primo uso reale locale sul
PC aziendale, senza backend, senza database e senza autenticazione.

## Funzionalità principali

- Dashboard con KPI, workload persone, lavori aperti, kanban e filtri.
- CRUD per lavori, task, persone e assenze.
- Campi tecnici dei lavori, stati semplificati, avanzamento reale vs atteso e salute automatica.
- Ferie, permessi, malattie, trasferte e capacità teorica vs reale.
- Pianificazione 4 settimane e agenda persone.
- Report settimanale Markdown.
- Report executive con anteprima e stampa/PDF dal browser.
- Storico modifiche e notifiche interne su cambio stato.
- Backup JSON robusto, import con anteprima e reset demo protetto.

## Uso locale e sicurezza dati

L'app è frontend-only. Tutti i dati inseriti vengono salvati nel browser tramite
`localStorage`, con chiave principale:

```text
workload-ufficio-progettazione:v1
```

GitHub salva il codice dell'app, non i dati reali inseriti durante l'uso. Se
modifichi commesse, task, persone o assenze nel browser, quelle informazioni
restano nel profilo browser del PC finché non esporti un backup JSON.

Il backup JSON è il file che salva i dati reali dell'app. Fai backup frequenti:
è consigliato un backup giornaliero quando l'app viene usata ogni giorno, oppure
almeno settimanale.

Prima di cancellare cache, dati del browser o profilo utente, esporta un backup
JSON. Prima di cambiare PC, esporta il backup dal vecchio PC e importalo sul
nuovo. Sul PC aziendale usa sempre lo stesso browser e lo stesso profilo utente:
aprire l'app da un altro browser o profilo può mostrare dati diversi.

La data dell'ultimo backup viene salvata separatamente in:

```text
workload-ufficio-progettazione:lastBackupAt
```

## Avvio dell'app

Installazione dipendenze:

```powershell
npm install
```

Avvio in sviluppo:

```powershell
npm run dev
```

Apri l'indirizzo indicato da Vite, di solito:

```text
http://localhost:5173
```

Controlli tecnici:

```powershell
npm run typecheck
npm run build
```

## Backup JSON

Dal menu **Strumenti > Backup dati** usa **Scarica backup JSON**.

Il file viene scaricato con nome automatico:

```text
backup_workload_ufficio_YYYY-MM-DD_HH-mm.json
```

Il backup contiene:

- `backupInfo`: nome app, data/ora esportazione, versione `v1.0-local` e conteggi.
- `data`: tutti i dati dell'app, inclusi persone, lavori, task, assenze, storico e notifiche.

Ogni backup esportato registra anche un evento nello storico modifiche.

## Import backup

Dal menu **Strumenti > Backup dati** usa **Importa backup JSON**.

L'import non sovrascrive subito i dati. Prima viene mostrata un'anteprima con:

- nome file;
- data esportazione, se presente;
- versione, se presente;
- conteggi di persone, lavori, task, assenze, eventi storico e notifiche.

Solo il pulsante **Conferma import** sostituisce i dati presenti nel browser.
Se il file non è valido, l'import viene bloccato e i dati attuali restano intatti.

Sono accettati sia i nuovi backup con struttura `{ backupInfo, data }`, sia i
vecchi export diretti `AppData`. I vecchi JSON senza `absences`, `activityLog` o
`notifications` vengono completati con array vuoti. Gli stati legacy vengono
mappati agli stati attuali.

## Reset demo protetto

Dal menu **Strumenti > Backup dati** usa **Reset demo protetto**.

Il reset apre una modale dedicata e non parte finché non viene spuntata la
checkbox:

```text
Ho capito che i dati attuali verranno sostituiti.
```

La modale mostra anche lo stato dell'ultimo backup e un pulsante **Scarica backup
prima del reset**. Quel pulsante esporta i dati attuali, aggiorna la data
dell'ultimo backup e lascia aperta la modale, così puoi procedere solo dopo aver
messo al sicuro i dati.

Il reset registra un evento nello storico modifiche.

## Report PDF e Markdown

Dal menu **Strumenti > Report**:

- **Esporta report settimanale Markdown** scarica un file `.md` con il riepilogo.
- **Anteprima report executive / Stampa PDF** apre l'anteprima stampabile.

Per generare il PDF usa la stampa del browser:

1. Apri l'anteprima report executive.
2. Premi il pulsante di stampa oppure usa `Ctrl+P`.
3. Seleziona "Salva come PDF" come stampante.
4. Salva il file nella cartella desiderata.

## Notifiche interne e mailto manuale

L'app genera notifiche interne quando cambia lo stato di un lavoro o di un task.
Le notifiche compaiono nella campanella in header e vengono salvate in
`localStorage`.

Il pulsante **Prepara email** apre un link `mailto:` verso il responsabile
dell'ufficio tecnico con oggetto e corpo già compilati. L'invio resta manuale:
l'utente deve confermare l'invio nel proprio client di posta.

L'invio email automatico reale non è implementato in questa versione locale,
perché richiederebbe un backend dove custodire credenziali SMTP o token. Non
inserire password, token o credenziali email nel frontend.

## Struttura tecnica

```text
src/
  App.tsx
  main.tsx
  styles.css
  types/index.ts
  data/demoData.ts
  services/dataService.ts
  state/DataProvider.tsx
  state/ToastProvider.tsx
  storage/localStorage.ts
  utils/backup.ts
  utils/activityLog.ts
  utils/availability.ts
  utils/dates.ts
  utils/notifications.ts
  utils/personAgenda.ts
  utils/planning.ts
  utils/progress.ts
  utils/validation.ts
  utils/weeklyReport.ts
  components/
```

Tutte le scritture passano dal `DataProvider`, che aggiorna lo stato React e
persiste su `localStorage`. Il modulo `src/utils/backup.ts` gestisce backup,
validazione import e data dell'ultimo backup.

## Note operative

- Non esiste sincronizzazione multiutente: ogni browser/profilo ha il proprio stato.
- Il backup JSON è l'unico modo operativo per trasferire i dati su un altro PC.
- Pulire i dati del browser senza backup può perdere il lavoro inserito.
- La build di produzione viene generata in `dist/` con `npm run build`.
