# Workload · Ufficio Progettazione Meccanica

App interna per il monitoraggio del carico di lavoro dell'ufficio tecnico/progettazione meccanica.
Permette di tracciare commesse, studi/preventivi, attività interne e relativi task,
con visione del carico settimanale per ogni progettista.

## Stato attuale

**v0.2 — CRUD completo da interfaccia.**

L'app è **frontend-only**. Tutti i dati vivono nel `localStorage` del browser
con chiave `workload-ufficio-progettazione:v1`. Non c'è ancora un backend né un
database condiviso: aprendo l'app da un PC diverso vedrai dati diversi (a meno
di trasferire un export JSON).

> Il prossimo step (v0.3) trasformerà l'app in **multiutente locale** con un
> backend leggero **Node.js + Express + SQLite** in modo che le 5 postazioni
> dell'ufficio condividano lo stesso stato in tempo reale.

## Funzionalità

### Dashboard
- KPI settimana corrente: commesse aperte, studi aperti, task in ritardo, task bloccati, carico medio, persona più sovraccarica
- Card workload per persona con barra %, ore/capacità, top task, evidenza ritardi
- Tabella lavori aperti con cambio stato rapido inline
- Kanban a 6 colonne (Da pianificare / In corso / In attesa / In verifica / Pronto-Rilasciato / Sospeso-Annullato)
- Filtri persona / cliente / tipo / priorità / stato + ricerca testuale

### CRUD da interfaccia (v0.2)
- **Nuovo lavoro** dal pulsante in header (commessa, studio o interno)
- **Modifica / Elimina** dal drawer di dettaglio (con conferma e cascade sui task)
- **Aggiungi / Modifica / Elimina task** dal drawer
- **Cambio stato rapido** via select inline su tabella, kanban e drawer (per work-item e task)
- **Conversione studio → commessa** con possibilità di rinominare il codice
- **Persone & capacità**: modifica nome, ruolo, ore settimanali, skill, attivo/disattivato, note
- Toast di conferma su salvataggio / eliminazione

### Validazioni
- Work-item: titolo, tipo, stato, scadenza obbligatori; date e numeri coerenti
- Task: titolo, assegnatario, scadenza obbligatori
- Persona: nome, ruolo, capacità (0–80h)

### Import / Export
- **Esporta JSON**: scarica i dati correnti
- **Importa JSON**: carica un file precedentemente esportato (validazione struttura)
- **Reset demo**: ripristina i dati di esempio (con conferma)

### Design
- Dark mode, palette industriale (slate/sky/amber/violet)
- Layout responsive, max-width 1600px

## Avvio rapido

```powershell
npm install
npm run dev        # http://localhost:5173
npm run build      # bundle di produzione in dist/
npm run typecheck  # tsc -b --noEmit
```

Richiede Node 20+ (testato su Node 24).

## Persistenza locale

I dati vengono salvati automaticamente in `localStorage` ad ogni modifica.
**Pulendo i dati del browser perdi tutto** — fai un export JSON regolare se vuoi
conservare il lavoro.

I dati seguono la struttura definita in [src/types/index.ts](src/types/index.ts):

- `Person` — id, name, role, weeklyCapacityHours, skills, active, notes
- `WorkItem` — type ('commessa' | 'studio' | 'interno'), code, customer, title,
  description, priority, status, ownerId, assigneeIds, date, ore, progress,
  acquisitionProbability (solo studio), blockers, notes
- `Task` — workItemId, title, assigneeId, status, date, ore, progress, blockers, notes

## Architettura

```
src/
├── App.tsx                       Mount providers + header globale
├── main.tsx                      Entry React
├── styles.css                    Tailwind v4 + theme + utility custom
├── types/index.ts                Type definitions e costanti dominio
├── data/demoData.ts              Dataset demo (5 persone, 11 lavori, 23 task)
├── services/
│   └── dataService.ts            CRUD puri immutabili su AppData
├── state/
│   ├── DataProvider.tsx          Context: stato + tutte le mutazioni + persistenza
│   └── ToastProvider.tsx         Sistema notifiche
├── storage/
│   └── localStorage.ts           Layer di persistenza (load/save/clear/export/import)
├── utils/
│   ├── dates.ts                  ISO weeks, working days, ritardo
│   ├── workload.ts               Calcolo carico settimanale
│   ├── format.ts                 uid, clamp, ecc.
│   └── validation.ts             Validatori workItem/task/person
└── components/
    ├── Dashboard.tsx             Orchestratore della dashboard
    ├── HeroStats.tsx             KPI + settimana corrente
    ├── WorkloadPersonCard.tsx    Card carico per persona
    ├── WorkItemsTable.tsx        Tabella lavori
    ├── WorkloadKanban.tsx        Kanban
    ├── WorkItemDetailDrawer.tsx  Drawer dettaglio (Modifica/Elimina/+Task)
    ├── WorkItemFormModal.tsx     Form creazione/modifica work-item
    ├── TaskFormModal.tsx         Form creazione/modifica task
    ├── PeopleSettingsModal.tsx   Form gestione persone
    ├── FiltersBar.tsx            Filtri
    ├── ImportExportPanel.tsx     Export/Import/Reset
    ├── ConfirmDialog.tsx         Dialogo conferma generico
    ├── Modal.tsx                 Shell modale riusabile
    ├── StatusSelect.tsx          Select stato inline
    ├── PriorityBadge.tsx
    ├── TypeBadge.tsx
    ├── BlockersEditor.tsx        Editor lista bloccanti
    ├── AssigneesPicker.tsx       Multi-select assegnatari
    └── FormField.tsx             Wrapper label + errore
```

### Centralizzazione dati

**Tutte le operazioni di scrittura passano per il `DataProvider`** (hook `useData()`),
che internamente delega al modulo puro [src/services/dataService.ts](src/services/dataService.ts)
e persiste su `localStorage`. **I componenti non toccano mai direttamente
`localStorage`**: questo rende immediato lo step successivo (sostituire la
persistenza con chiamate HTTP a un backend Express).

## Roadmap

### v0.3 — Multiutente locale (prossimo step)

Trasformare l'app in **client/server** accessibile dalle 5 postazioni dell'ufficio
sulla stessa rete:

- Backend **Node.js + Express** (server REST locale, porta `:3001`)
- Database **SQLite** in un file su disco condiviso o sul PC di chi avvia il server
- API REST: `GET/POST/PATCH/DELETE` su `/api/workitems`, `/api/tasks`, `/api/people`
- Sostituzione del layer `storage/localStorage.ts` con un client HTTP
  (`storage/apiClient.ts`); la firma del `dataService` resta invariata
- Polling ogni 10–15 s o WebSocket per sincronizzazione tra postazioni
- Import/Export JSON mantenuti come backup

### Idee successive
- Drag-and-drop nel Kanban
- Vista carico multi-settimana / capacity planning
- Autenticazione semplice e ruoli (responsabile vs progettista)
- Time tracking con `loggedHours` cumulativi per giorno
- Notifiche email/Teams su cambi di stato chiave
- Audit log e storico stati
- Allegati (link a Drive/SharePoint)

## Note tecniche

- **React 19** con `createRoot`, `<StrictMode>`
- **Vite 7** + plugin React + plugin Tailwind nativo
- **TypeScript 5.8** con `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`
- **Tailwind 4** con `@theme` per le custom property e `@utility` per le utility
- Nessuna libreria UI esterna, nessun router (singola dashboard)
