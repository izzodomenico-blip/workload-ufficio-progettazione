# Rebranding → Flowrlink — Design / Spec (sotto-progetto A)

Data: 2026-07-03
Stato: approvato in brainstorming, in attesa di revisione spec

Parte di un programma più ampio (5 sotto-progetti: A rebranding, B login/permessi,
C affidabilità, D backup, E pacchetto autoinstallante). Questo spec copre **solo A**.

## 1. Obiettivo
Rinominare il programma in **Flowrlink** e integrarne il marchio nell'app con eleganza,
coerente col tema scuro. Nessun cambio di funzionalità.

## 2. Decisioni (dal brainstorming)
- Header: **simbolo (link+circuito) + wordmark reso dall'app**, non l'immagine-logo intera.
- Sottotitolo header: **"CRM & Workload"**.
- Titolo scheda browser: **"Flowrlink · CRM & Workload"**.
- Favicon: il **simbolo Flowrlink**.

## 3. Asset
Sorgenti forniti (opachi, alla radice del repo): `flowrlink-logo-dark.png` (testo cyan
su nero), `flowrlink-logo-light.png` (testo scuro su bianco), `flowrlink-mark.png`
(simbolo cyan su bianco, 321×245).

Lavorazione:
- Da `flowrlink-mark.png` genero una versione **a fondo trasparente** (rimozione del
  bianco con tolleranza + feather sui bordi per evitare aloni su fondo scuro):
  - `public/flowrlink-mark.png` — simbolo trasparente (aspetto originale) per l'header.
  - `public/favicon.png` — simbolo trasparente **quadrato** (padding a quadrato) per la scheda.
- I due loghi completi restano nel repo come sorgente; l'app non li usa direttamente.

> Nota qualità: se dopo la rimozione del bianco restano aloni chiari sui bordi visibili
> su fondo scuro, si alza la soglia/feather e si ri-verifica a schermo. Criterio: sul
> fondo header non si devono vedere bordi bianchi.

## 4. Header (`src/App.tsx`, componente `Logo` + blocco brand)
Sostituisce l'attuale `Logo()` (SVG zigzag) e il wordmark "Workload":
- **Simbolo**: `<img src="/flowrlink-mark.png">`, altezza ~56–64px, `shrink-0`, `alt="Flowrlink"`.
- **Wordmark**: testo **"Flowrlink"** reso dall'app in **gradiente cyan→blu**
  (`bg-clip-text` con i token accent dell'app — cyan `--color-accent` verso indaco
  `--color-accent-2`), peso bold, ~text-2xl.
- **Sottotitolo**: **"CRM & Workload"**, piccolo, maiuscoletto, `tracking` ampio, colore tenue.
- Allineamento verticale col simbolo; gap coerente. L'altezza header resta ~88px
  (`--app-header-h` già a 88px, adeguare solo se il simbolo la supera).
- Skill **UI/UX** in fase di implementazione per bilanciare spaziature/colori.

## 5. Favicon + titolo (`index.html`)
- `<link rel="icon" type="image/png" href="/favicon.png" />` (sostituisce il favicon.svg zigzag).
- `<title>Flowrlink · CRM & Workload</title>`.
- Aggiornare eventuali meta con "Workload" come nome-app.
- `public/favicon.svg` (zigzag) può restare inutilizzato o essere rimosso.

## 6. Rinomina "Workload" — SOLO il brand
Cambiare le occorrenze del **nome dell'app**:
- Header (già coperto dal punto 4).
- Titolo/meta scheda (punto 5).
- Footer dei report che citano "app Workload" (es. `CalculatedStandardComponentsReportModal.tsx`
  → "Report generato dall'app **Flowrlink**"). Verificare con grep tutti i footer report.

**NON toccare** (sono logica "carico di lavoro", non brand):
- `computeWorkload`, `WorkloadKanban`, `WorkloadPersonCard`, tipo `WorkloadLevel`,
  la label "Workload per persona", `utils/workload.ts`, ecc.
- Il nome pacchetto npm `workload-ufficio-progettazione` (interno, usato da PM2/script/deploy):
  invariato per non rompere il deploy.

## 7. Fuori scope
- Cambio del nome cartella progetto / repo GitHub / npm package id.
- Temi chiari, altri usi dei loghi (biglietti, PDF brandizzati) oltre ai footer esistenti.

## 8. Verifica
1. `npm run build` pulito.
2. Avvio e **screenshot dell'header**: simbolo + "Flowrlink" + "CRM & Workload", nessun
   alone bianco, colori coerenti.
3. Favicon visibile nella scheda; titolo "Flowrlink · CRM & Workload".
4. Grep finale: nessuna occorrenza residua di "Workload" come **nome app** (restano solo
   quelle di dominio "carico di lavoro").

## 9. Piano a step (verifica per step)
1. Generare gli asset trasparenti (`public/flowrlink-mark.png`, `public/favicon.png`) →
   verifica: file creati, fondo trasparente, simbolo integro.
2. Header in `App.tsx` (simbolo + wordmark gradiente + sottotitolo) → verifica: build + screenshot.
3. `index.html` favicon + titolo + meta → verifica: scheda mostra icona e titolo nuovi.
4. Rinomina brand nei footer report → verifica: grep pulito.
