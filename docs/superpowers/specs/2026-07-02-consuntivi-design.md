# Consuntivi — Design / Spec

Data: 2026-07-02
Stato: approvato in brainstorming, in attesa di revisione spec

## 1. Obiettivo

Nuova pagina **Consuntivi** nel workload. Gli operai, dopo aver selezionato la commessa, compilano i dati reali di lavorazione (taglio laser, laser tubi, saldatura, piega). Il sistema calcola pesi e — dietro password — i costi, producendo un report dettagliato in kg e in €.

Origine: `CONSUNTIVO.xlsx` (fogli `DA COMPILARE` visibile + `PRIVATE` protetto/prezzi). Questo spec ne riproduce e generalizza la logica dentro l'app.

## 2. Modello dati

### Collezioni pubbliche (in `AppData`, sincronizzate, visibili agli operai)

Nessun prezzo qui. Solo dati di lavorazione + catalogo profili + fattori di densità.

```
type ConsuntivoMaterial = 'ferro' | 'inox' | 'zincato' | 'corten'
type ConsuntivoGas = 'ossigeno' | 'azoto'
type TubeCategory = 'tubolari' | 'tubi'

interface LaserCutRow {
  id: string
  lunghezzaMm: number
  larghezzaMm: number
  spessoreMm: number
  materiale: ConsuntivoMaterial
  tempoMin: number
  gas: ConsuntivoGas
}

interface TubeLaserRow {
  id: string
  categoria: TubeCategory
  profileId: string          // ref a TubeProfile
  profileLabel: string       // snapshot (es. "40x40x3")
  kgPerMeter: number         // snapshot del catalogo al momento dell'inserimento
  materiale: ConsuntivoMaterial
  lunghezzaMm: number
  nPezzi: number
  tempoMin: number
}

interface WeldingRow { id: string; people: number; hours: number }
interface BendingRow { id: string; hours: number }

interface Consuntivo {
  id: string
  workItemId: string
  workItemCode: string       // snapshot
  workItemTitle: string      // snapshot
  customer: string           // snapshot
  date: string               // data lavorazione (ISO)
  operatorName?: string
  laserRows: LaserCutRow[]
  tubeRows: TubeLaserRow[]
  weldingRows: WeldingRow[]  // multiriga
  bendingRows: BendingRow[]  // multiriga
  notes: string
  createdAt: string
  updatedAt: string
}

interface TubeProfile {      // catalogo editabile — la libreria a tendina
  id: string
  categoria: TubeCategory
  label: string              // es. "40x40x3", "Ø40x3", "40x20x2"
  kgPerMeter: number         // peso nominale da tabella commerciale
  active: boolean
  notes: string
  createdAt: string
  updatedAt: string
}
```

`AppData` guadagna: `consuntivi: Consuntivo[]`, `tubeProfiles: TubeProfile[]`, e un piccolo oggetto pubblico `consuntiviSettings`:

```
interface ConsuntiviSettings {
  densityFactorPerMaterial: Record<ConsuntivoMaterial, number>
  // default: ferro 7.85, inox 8.0, zincato 7.85, corten 7.85
}
```

La densità è **pubblica** perché serve a calcolare i kg mostrati agli operai in tempo reale. Non è un dato sensibile.

### Config protetta (NON in AppData — solo server-side)

```
interface PricingConfig {
  materialPricePerKg: Record<ConsuntivoMaterial, number>  // ferro 1.3, inox 4.5, zincato 2, corten 3
  gasCostPerMin: Record<ConsuntivoGas, number>            // ossigeno 2.5, azoto 3
  tubeLaserRatePerMin: number                             // €/min tempo laser tubi (nuovo; seed default 2.5, editabile in configuratore)
  weldingRatePerHour: number                              // 35
  bendingRatePerHour: number                              // 60
}
```

Salvata nella tabella `meta` (chiave `pricingConfig`, valore JSON). Mai inclusa in `GET /api/app-data`.

## 3. Modello di sicurezza

- Prezzi e report costi sono protetti dal **gate admin già esistente** (`verifyAdminPassword` in `server/services/adminAuth.js`, header `x-workload-admin-password`, endpoint `GET/POST /api/admin/*`). Stessa password del "carico base".
- I prezzi **non** transitano mai in `AppData` (che è servito a tutti i client): sarebbero leggibili nel Network tab dagli operai. Stanno solo dietro endpoint protetti.
- La **pagina data-entry** mostra i **kg** per riga (feedback utile, non sensibile) ma **mai** prezzi o costi.
- Il **report costi** e il **configuratore prezzi** richiedono password: dopo lo sblocco il client scarica i prezzi e calcola i costi lato client.

*Alternativa scartata:* mettere i prezzi in AppData — più semplice ma espone i margini a chiunque. Rifiutata.

## 4. Calcoli (funzioni pure in `consuntiviCalc.ts`)

Peso e materiale (lamiera):
- `kg = (lunghezzaMm/1000) * (larghezzaMm/1000) * (spessoreMm * densityFactorPerMaterial[materiale])`
- `costoMateriale = kg * materialPricePerKg[materiale]`
- `costoGas = tempoMin * gasCostPerMin[gas]`
- `costoRiga = costoMateriale + costoGas`

Peso e materiale (tubo):
- `kg = kgPerMeter * (lunghezzaMm/1000) * nPezzi`
- `costoMateriale = kg * materialPricePerKg[materiale]`
- `costoTempo = tempoMin * tubeLaserRatePerMin`
- `costoRiga = costoMateriale + costoTempo`

Saldatura / piega:
- `costoSaldaturaRiga = people * hours * weldingRatePerHour`
- `costoPiegaRiga = hours * bendingRatePerHour`

Aggregazioni:
- Totale consuntivo = somma costi di tutte le righe.
- Totale commessa = somma dei consuntivi con lo stesso `workItemId`.
- Report globale = totali + riepilogo kg per materiale (ferro/inox/zincato/corten) e per macro-lavorazione (laser, tubi).

I **kg** sono calcolabili lato client senza password (servono solo densità + input). I **costi** richiedono i prezzi protetti.

## 5. UI — pagina "Consuntivi"

Nuovo tab in `src/components/Dashboard.tsx` (union `MainTab`, `TABS`, import lazy, ramo di render). Gruppo `officina`.

Componenti nuovi:
- **`ConsuntiviView`** — elenco consuntivi con filtro per commessa e data; bottone "Nuovo consuntivo"; per admin, accessi a Configuratore prezzi / Catalogo profili / Report.
- **`WorkItemAutocomplete`** — selettore commessa (non esiste ancora; pattern di `BusinessPartnerAutocomplete`, filtra `data.workItems` per code/title/customer).
- **`ConsuntivoFormModal`** — 4 sezioni con righe dinamiche (aggiungi/rimuovi riga); kg live per riga (nessun costo mostrato). Usa `Modal` (`size='xl'`) e `FormField`.
- **`PricingConfigModal`** (protetto) — editor prezzi; sblocco password; salva via endpoint protetto.
- **`TubeProfilesLibrary`** (protetto) — CRUD catalogo profili tubi.
- **`ConsuntiviReportModal`** (protetto) — riepilogo kg + costi + € finale per commessa; totali globali; stampabile (pattern report esistente, es. `WorkshopPlanningReport`).
- Editor densità (`consuntiviSettings`) — piccolo pannello admin (pubblico, non serve password).

## 6. Backend

- **Migration** `server/migrations/008_add_consuntivi.sql`: tabelle `consuntivi` e `tube_profiles` (colonne indicizzate: `work_item_id`, `date` per consuntivi; `categoria`, `active` per tube_profiles; blob `data` JSON + `updated_at`). Idempotente (`CREATE TABLE IF NOT EXISTS`). `pricingConfig` non ha tabella dedicata: sta in `meta`.
- **`server/db.js`**: aggiungere `consuntivi` e `tubeProfiles` a `TABLES`, a `getAppData()`, e funzioni `replaceConsuntivi` / `replaceTubeProfiles` in `saveAppData()`. Helper get/set `pricingConfig` su `meta`.
- **`server/services/appData.js`**: `EMPTY_APP_DATA` (+ `consuntivi: []`, `tubeProfiles: []`, `consuntiviSettings` default), `normalizeConsuntivo`, `normalizeTubeProfile`, `normalizeConsuntiviSettings`, e mapping in `normalizeAppData()`.
- **`server/routes/index.js`**: aggiungere `consuntivi`, `tubeProfiles` ad `APP_DATA_COLLECTIONS`; `registerCollectionRoutes` per entrambe; rotte custom protette:
  - `GET /api/consuntivi/pricing` → richiede `verifyAdminPassword`, ritorna `PricingConfig`.
  - `PUT /api/consuntivi/pricing` → richiede password, salva `PricingConfig`.
- **`server/services/seedData.js`**: catalogo profili standard (tubolari quadri/rettangolari + tubi tondi comuni) con kg/m nominale; `PricingConfig` default (prezzi del file); `consuntiviSettings` default.

## 7. Frontend — wiring collezioni

Seguire il pattern esistente (workshopOutputs) in TUTTI i punti di enumerazione:
- `src/types/index.ts` — nuovi tipi + `AppData` (+ `consuntivi`, `tubeProfiles`, `consuntiviSettings`).
- `src/services/consuntiviService.ts` — CRUD `Consuntivo` (usa `uid('cons')`, activity log).
- `src/services/tubeProfilesService.ts` — CRUD `TubeProfile` (`uid('tp')`).
- `src/services/consuntiviCalc.ts` — funzioni pure di calcolo (peso/costi/aggregazioni).
- `src/services/apiClient.ts` — `fetchPricingConfig(password)`, `savePricingConfig(config, password)`; `withAppDataDefaults` (+ nuove collezioni/settings).
- `src/state/DataProvider.tsx` — context value + azioni CRUD per consuntivi/tubeProfiles + `updateConsuntiviSettings`.
- `src/utils/backup.ts` — `createBackupPayload`, `BackupCounts`, `validateBackupPayload`, `countAppData` (+ nuove collezioni).
- `src/data/demoData.ts` — seed demo (qualche profilo + un consuntivo d'esempio + settings default).

## 8. Fuori scope (YAGNI)

- Colonne Excel "Verniciatura" e "N°DDT" (non richieste). Aggiungibili in seguito.
- Export Excel del report (per ora stampa/PDF via browser).
- Densità dipendente dallo spessore o da tabelle materiali avanzate.

## 9. Piano a step (verifica per step)

1. Backend: migration 008 + db.js/appData.js/routes + seed → verifica: server parte, `GET /api/app-data` include `consuntivi`/`tubeProfiles`/`consuntiviSettings`, endpoint pricing risponde 403 senza password e 200 con password.
2. Tipi + calcoli puri (`consuntiviCalc.ts`) → verifica: test/asserzioni sui numeri del file Excel (righe note → kg e € attesi).
3. Wiring collezioni frontend (types/service/DataProvider/apiClient/backup/demoData) → verifica: build TS pulita, dati caricano, CRUD consuntivo persiste dopo reload.
4. UI data-entry (`ConsuntiviView`, `WorkItemAutocomplete`, `ConsuntivoFormModal`) con kg live → verifica: creo consuntivo, aggiungo righe, kg corretti, nessun costo mostrato.
5. Configuratore prezzi + catalogo profili (protetti) → verifica: senza password non si aprono/salvano; con password sì.
6. Report (`ConsuntiviReportModal`) protetto → verifica: totali kg/€ per commessa e globali coerenti con i calcoli; stampa ok.
```
