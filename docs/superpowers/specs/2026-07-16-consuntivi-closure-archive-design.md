# Consuntivi: chiusura certificata commesse + archivio — Design (sotto-progetto I)

**Data:** 2026-07-16
**Stato:** approvato in brainstorming

## Obiettivo

Quando una commessa dei Consuntivi è finita, l'utente la **chiude in modo certificato**:
il sistema congela i totali di quel momento, registra chi e quando, e sposta la commessa
fuori dalla pagina di lavoro, in un **Archivio** dedicato e curato. Le commesse chiuse non
sono più modificabili; dall'archivio si stampa un **Certificato di chiusura** e, con
password, si può riaprire.

Scelte fatte in brainstorming:
- **Snapshot congelato**: alla chiusura si calcolano e si CONGELANO i totali (€, kg,
  ripartizione per categoria) coi prezzi correnti. Cambi futuri dei prezzi non toccano l'archivio.
- **Password consuntivi** per chiudere e per riaprire (riapertura possibile: elimina lo snapshot,
  la commessa torna in lavorazione).
- **Layout a tab** nella pagina Consuntivi: «In lavorazione» | «Archivio».
- **€ in archivio** visibili solo agli utenti col permesso `viewConsuntiviPrices`
  (senza ridigitare la password); gli altri vedono card senza €.
- Approccio **server-autoritativo** (A): snapshot calcolato SOLO dal server, endpoint dedicati
  protetti da password. Il client non può falsificare i totali.

## Modello dati

Nuova tabella SQLite `consuntivi_closures` — migrazione `server/migrations/012_add_consuntivi_closures.sql`
(`CREATE TABLE IF NOT EXISTS`, idempotente, NO ALTER):

```sql
CREATE TABLE IF NOT EXISTS consuntivi_closures (
  id TEXT PRIMARY KEY,
  commessa_key TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`data` = JSON `ConsuntiviClosure`:

```ts
interface ConsuntiviClosure {
  id: string
  commessaKey: string          // c.commessaNumber.trim() || '(senza commessa)' — stessa chiave del report
  supplierName: string         // primo fornitore non vuoto dei consuntivi della commessa
  firstDate: string            // ISO min tra le date dei consuntivi
  lastDate: string             // ISO max
  consuntiviCount: number
  closedAt: string             // ISO datetime
  closedByUserId: string
  closedByUsername: string
  snapshot: {
    total: number              // € totale congelato
    totalKg: number
    kgByMaterial: Record<ConsuntivoMaterial, number>
    cats: { material: number; gas: number; time: number; welding: number; bending: number }
  }
}
```

I consuntivi restano nella loro tabella, intatti. La chiusura è un'entità separata, riferita
per `commessaKey`.

## Componenti

### I1 — Server: calcolo totali (gemello JS)
`server/services/consuntiviTotals.js`: porta il calcolo di `src/utils/consuntiviCalc.ts`
lato server (stesso pattern del gemello `DEFAULT_CONSUNTIVI_CONFIG`):
- `laserRowCost`, `tubeRowCost` (con `parseTubeSides`/`tubeShape` e coefficiente per forma),
  `weldingRowCost`, `bendingRowCost`, `consuntivoTotals(consuntivo, config)`.
- **Test di parità**: stesse fixture (consuntivo con lamiere+tubi+manodopera) → gli stessi
  numeri del calcolo client (tolleranza float `closeTo`), così i due calcoli non divergono.

### I2 — Server: endpoint chiusure + persistenza
`server/db.js`: lettura/scrittura `consuntivi_closures` (stesso pattern JSON-rows delle altre
collezioni); le chiusure entrano in `getAppData()` come collezione `consuntiviClosures`.

`server/routes/index.js`:
- `POST /api/consuntivi-closures` body `{ commessaKey }`, header `x-workload-admin-password`
  (password consuntivi, come `/consuntivi-pricing`):
  - 403 se password errata; 409 se la commessa è già chiusa; 404 se nessun consuntivo con quella chiave.
  - Il server raggruppa i consuntivi per `commessaKey` (stessa espressione del report:
    `commessaNumber.trim() || '(senza commessa)'`), calcola lo snapshot con
    `consuntiviTotals` + config prezzi corrente, salva la chiusura con utente della sessione
    e timestamp. Ritorna la chiusura creata. `scheduleAutoBackup('consuntivi-closure-created')`.
- `DELETE /api/consuntivi-closures/:id`, stessa password: elimina la chiusura (riapertura).
  404 se inesistente. `scheduleAutoBackup('consuntivi-closure-reopened')`.

### I3 — Server: filtro € e lock authz
- `filterAppDataForUser` (`server/services/appDataAuthz.js`): per utenti senza
  `viewConsuntiviPrices`, in ogni `consuntiviClosures[i].snapshot` rimuove `total` e `cats`
  (restano `totalKg`, `kgByMaterial`, conteggi e sigillo) — stesso schema dei campi
  finanziari dei business partner.
- `authorizeAppDataChange`:
  - `consuntiviClosures` è **server-autoritativa**: qualunque valore mandato dal client nel
    PUT albero-intero viene IGNORATO, si mantiene la versione del server (nessun 403:
    semplicemente `out.consuntiviClosures = current.consuntiviClosures`).
  - **Lock commesse chiuse**: costruito l'insieme delle `commessaKey` chiuse, per la collezione
    `consuntivi`: creare un consuntivo con chiave chiusa → 403 con messaggio chiaro
    («La commessa X è chiusa»); modificare un consuntivo esistente di commessa chiusa → 403;
    eliminarlo dall'albero → viene CONSERVATO (stesso schema "preserve" esistente).

### I4 — Client: tab + esclusione chiuse + modale chiusura
- `src/types/index.ts`: tipo `ConsuntiviClosure` (snapshot con `total`/`cats` opzionali,
  perché il server li rimuove senza permesso) + `consuntiviClosures` in `AppData`.
- `apiClient.ts`: `closeCommessa(commessaKey, password)`, `reopenCommessa(id, password)`.
- `ConsuntiviView`: tab **In lavorazione | Archivio** con contatori (n. consuntivi aperti /
  n. commesse chiuse). «In lavorazione» = tabella attuale MA esclusi i consuntivi le cui
  commesse sono chiuse; in toolbar il bottone **«Chiudi commessa 🔒»** (visibile a chi può
  creare/modificare consuntivi; l'azione vera è comunque protetta da password server-side).
- `CloseCommessaModal`: passi — scegli commessa aperta (elenco con n. consuntivi e periodo) →
  riepilogo (kg; € NON mostrato qui: il totale certificato lo calcola il server) → password
  consuntivi → conferma. Successo: toast + la commessa sparisce da «In lavorazione».

### I5 — Client: Archivio + Certificato (qualità visiva alta — skill frontend-design)
- `ConsuntiviArchivePanel`: ricerca per commessa/fornitore; griglia responsive di **card**:
  numero commessa in evidenza, fornitore, periodo (prima→ultima data), n. consuntivi,
  kg totali, **€ totale congelato** (solo con `viewConsuntiviPrices`), badge sigillo
  «CERTIFICATA · chiusa da {utente} il {data}», azioni: **Certificato** (stampa) e
  **Riapri 🔒** (chiede password, conferma). Empty state curato («Nessuna commessa chiusa»).
- `ClosureCertificateModal`: foglio stampabile col pattern **portal su `document.body`**
  (identico a cons-report/exec-report, che stampano correttamente): logo Flowrlink in testa,
  titolo «Certificato di chiusura commessa», dati congelati (commessa, fornitore, periodo,
  n. consuntivi, kg per materiale, ripartizione €, totale €), sigillo con utente/data,
  print CSS dedicato (classe portal propria + `display:none` degli altri figli di body via
  `:has`, `visibility:visible` sul portal, color-adjust exact).
- Report modale esistente (`ConsuntiviReportModal`): il selettore commesse elenca solo le **aperte**.

## Flusso

1. Lavoro normale su «In lavorazione» (invariato).
2. «Chiudi commessa 🔒» → scelta → password → il server congela e archivia.
3. La commessa sparisce da «In lavorazione» e dal selettore del report; appare in «Archivio».
4. Dall'archivio: card con totali congelati → «Certificato» stampa il PDF certificato;
   «Riapri 🔒» (password) la riporta in lavorazione eliminando lo snapshot.
5. Ogni tentativo di modificare/creare consuntivi su commessa chiusa → 403 chiaro.

## Sicurezza

- Password consuntivi mai in URL (header, come oggi); mai salvata.
- Snapshot calcolato SOLO server-side coi prezzi salvati: non falsificabile dal client.
- € delle chiusure mai inviati a utenti senza `viewConsuntiviPrices`.
- `consuntiviClosures` non scrivibile via PUT albero-intero (server-autoritativa).
- Riapertura solo con password. Nessun gate esistente indebolito.

## Testing

- Parità calcolo client/server (fixture condivise, stessi numeri).
- Endpoint (server di test su porta 39xx, temp DB via `WORKLOAD_*`, DB reale mai toccato):
  password errata 403; chiusura ok → snapshot corretto e coerente col calcolo; doppia
  chiusura 409; commessa inesistente 404; riapertura ok; riapertura id inesistente 404.
- Authz: creare/modificare consuntivo su commessa chiusa → 403; eliminazione → conservato;
  PUT albero-intero con `consuntiviClosures` manomesse → ignorate (restano quelle del server);
  GET senza permesso prezzi → snapshot senza `total`/`cats`.
- UI: typecheck + build; stampa certificato verificata con l'harness Chrome print-to-pdf
  (contenuto presente, app esclusa, logo presente).

## Vincoli globali

- Additivo e retrocompatibile: nessuna chiusura → tutto come oggi. Migrazione idempotente
  (`CREATE TABLE IF NOT EXISTS`), NO `ALTER TABLE`.
- Nessuna nuova dipendenza runtime. Node ≥ 22, ESM, vitest.
- Chiave commessa IDENTICA ovunque: `commessaNumber.trim() || '(senza commessa)'`.
- Qualità visiva alta per tab/card/certificato: usare la skill **frontend-design**
  nell'implementazione dei componenti UI (I4/I5).

## Fuori scope

- Modifica del report dettagliato esistente (resta per le commesse aperte).
- Export Excel/CSV dell'archivio; notifiche email alla chiusura.
- Chiusura parziale (sotto-insiemi di consuntivi di una commessa).
