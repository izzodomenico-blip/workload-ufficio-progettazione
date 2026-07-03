# Rebranding Flowrlink — Implementation Plan (sotto-progetto A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rinominare il programma in **Flowrlink** e integrarne il marchio (simbolo + wordmark) nell'app con eleganza, senza cambiare funzionalità.

**Architecture:** Si generano asset a fondo trasparente dal `flowrlink-mark.png` fornito; l'header (`src/App.tsx`) mostra il simbolo `<img>` + il wordmark "Flowrlink" reso via CSS gradiente + sottotitolo; `index.html` prende favicon e titolo nuovi; i footer dei report cambiano il nome-app. Nessun test unitario: è lavoro visivo/di stringhe → verifica con build, screenshot e grep.

**Tech Stack:** React 19 + TypeScript + Vite, Tailwind v4, Python+Pillow (solo per generare gli asset una volta).

## Global Constraints
- Nuovo nome app: **Flowrlink**. Sottotitolo header: **CRM & Workload**. Titolo scheda: **Flowrlink · CRM & Workload**.
- Rinominare SOLO il **nome dell'app**. NON toccare la logica "carico di lavoro":
  `computeWorkload`, `WorkloadKanban`, `WorkloadPersonCard`, `WorkloadLevel`,
  `PersonWorkloadReport`, `getWorkloadActivitiesForPerson`, `utils/workload.ts`, la
  label "Workload per persona", i record `LEVEL_*`.
- NON rinominare il pacchetto npm `workload-ufficio-progettazione` (interno, usato da deploy).
- Colori marchio: gradiente **cyan → indaco** (token app: `--color-accent` #38bdf8 → `--color-accent-2` #818cf8), coerenti col simbolo.
- Nessuna nuova dipendenza runtime. Pillow è già disponibile nell'ambiente (solo build-time asset).

---

### Task 1: Generare gli asset a fondo trasparente

**Files:**
- Create: `public/flowrlink-mark.png` (simbolo trasparente, aspetto originale) — generato
- Create: `public/favicon.png` (simbolo trasparente quadrato 256×256) — generato
- Usa come sorgente: `flowrlink-mark.png` (radice repo, 321×245, opaco su bianco)

**Interfaces:**
- Produces: due file in `public/` referenziati da Task 2 (`/flowrlink-mark.png`) e Task 3 (`/favicon.png`).

- [ ] **Step 1: Scrivere lo script di generazione asset**

Crea un file temporaneo `scripts/make-brand-assets.py` (cartella `scripts/` esiste già; se no, crearla):

```python
from PIL import Image

SRC = 'flowrlink-mark.png'
HI, LO = 250, 205  # luminanza: >=HI -> trasparente, <=LO -> pieno, in mezzo sfuma

src = Image.open(SRC).convert('RGBA')
w, h = src.size
px = src.load()
out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
op = out.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        lum = (r + g + b) / 3
        if lum >= HI:
            alpha = 0
        elif lum <= LO:
            alpha = 255
        else:
            alpha = int(255 * (HI - lum) / (HI - LO))
        op[x, y] = (r, g, b, min(a, alpha))

out.save('public/flowrlink-mark.png')

# favicon quadrato
s = max(w, h)
sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
sq.paste(out, ((s - w) // 2, (s - h) // 2), out)
sq.resize((256, 256), Image.LANCZOS).save('public/favicon.png')
print('OK: public/flowrlink-mark.png, public/favicon.png')
```

- [ ] **Step 2: Eseguire lo script**

Run: `python scripts/make-brand-assets.py`
Expected: stampa `OK: public/flowrlink-mark.png, public/favicon.png` senza errori.

- [ ] **Step 3: Verificare che i file esistano e siano trasparenti**

Run:
```
python -c "from PIL import Image; im=Image.open('public/flowrlink-mark.png').convert('RGBA'); px=im.load(); print('mark angolo alpha=', px[0,0][3]); im2=Image.open('public/favicon.png'); print('favicon size=', im2.size, 'mode=', im2.mode)"
```
Expected: `mark angolo alpha= 0` (angolo trasparente) e `favicon size= (256, 256) mode= RGBA`.

Se dopo la generazione, in fase di verifica visiva (Task 2) il simbolo appare sbiadito
o con alone chiaro sui bordi, rigenera abbassando `LO` (es. 195) o alzando `HI` (es. 252)
e riesegui lo Step 2.

- [ ] **Step 4: Commit**

```bash
git add public/flowrlink-mark.png public/favicon.png scripts/make-brand-assets.py
git commit -m "feat(rebranding): asset simbolo Flowrlink a fondo trasparente + favicon"
```

---

### Task 2: Header Flowrlink (simbolo + wordmark + sottotitolo)

**Files:**
- Modify: `src/App.tsx` — funzione `Logo()` (righe ~118-139) e blocco brand (righe ~31-36)

**Interfaces:**
- Consumes: `public/flowrlink-mark.png` (Task 1).
- Produces: header brandizzato Flowrlink.

- [ ] **Step 1: Sostituire la funzione `Logo()`**

In `src/App.tsx`, sostituisci l'INTERA funzione `Logo()` (dal commento `// Marchio "fuso"...`
fino alla `}` di chiusura, righe ~118-139) con:

```tsx
function Logo() {
  return (
    <img
      src="/flowrlink-mark.png"
      alt="Flowrlink"
      className="h-14 w-auto shrink-0 select-none sm:h-16"
      draggable={false}
    />
  )
}
```

- [ ] **Step 2: Sostituire il blocco brand (wordmark + sottotitolo)**

In `src/App.tsx`, sostituisci queste righe (il blocco `<div className="leading-tight">…</div>`, righe ~31-36):

```tsx
            <div className="leading-tight">
              <div className="text-2xl font-bold tracking-tight text-slate-100">Workload</div>
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
                Ufficio Progettazione Meccanica
              </div>
            </div>
```

con:

```tsx
            <div className="leading-tight">
              <div className="bg-gradient-to-r from-[color:var(--color-accent)] to-[color:var(--color-accent-2)] bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
                Flowrlink
              </div>
              <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                CRM &amp; Workload
              </div>
            </div>
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build completa senza errori TypeScript.

- [ ] **Step 4: Verifica visiva (screenshot)**

Avvia l'app (o usa l'istanza già attiva) e cattura l'header. Criteri:
- simbolo Flowrlink (link+circuito) nitido, **senza riquadro/alone bianco** sul fondo scuro;
- "Flowrlink" in gradiente cyan→indaco, ben leggibile;
- sottotitolo "CRM & Workload" piccolo maiuscoletto sotto.
Se c'è alone bianco sul simbolo → rigenera l'asset (Task 1 Step 3, nota).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(rebranding): header Flowrlink (simbolo + wordmark gradiente + sottotitolo)"
```

---

### Task 3: Favicon e titolo scheda (`index.html`)

**Files:**
- Modify: `index.html` (righe 5 e 8)

**Interfaces:**
- Consumes: `public/favicon.png` (Task 1).

- [ ] **Step 1: Cambiare il link favicon**

In `index.html`, sostituisci:
```html
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```
con:
```html
    <link rel="icon" type="image/png" href="/favicon.png" />
```

- [ ] **Step 2: Cambiare il titolo**

In `index.html`, sostituisci:
```html
    <title>Workload &middot; Ufficio Progettazione Meccanica</title>
```
con:
```html
    <title>Flowrlink &middot; CRM &amp; Workload</title>
```

- [ ] **Step 3: Build + verifica**

Run: `npm run build`
Expected: build ok.
Poi ricarica l'app nel browser: la **scheda** mostra la nuova icona Flowrlink e il titolo "Flowrlink · CRM & Workload".

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(rebranding): favicon Flowrlink e titolo scheda"
```

---

### Task 4: Rinomina nome-app nei footer dei report

**Files:**
- Modify: `src/components/CalculatedStandardComponentsReportModal.tsx:193`
- Modify: `src/components/StandardParametersReportModal.tsx:195`
- Modify: `src/components/WeeklyReportModal.tsx:778`
- Modify: `src/components/WorkshopPlanningReportModal.tsx:391`
- Modify: `src/components/WorkshopReportModal.tsx:433`

**Interfaces:**
- Nessuna dipendenza tra task; sono sostituzioni di stringa nei footer.

- [ ] **Step 1: CalculatedStandardComponentsReportModal**

Sostituisci `Report generato dall'app Workload Ufficio Progettazione.` con
`Report generato dall'app Flowrlink.` (lascia invariato il resto della frase).

- [ ] **Step 2: StandardParametersReportModal**

Sostituisci `Report generato dall'app Workload Ufficio Progettazione.` con
`Report generato dall'app Flowrlink.` (lascia invariato il resto della frase).

- [ ] **Step 3: WeeklyReportModal (riga ~778)**

Sostituisci `Workload · Ufficio Progettazione Meccanica · Report generato il` con
`Flowrlink · CRM & Workload · Report generato il` (lascia invariato `{fmtDayMonth(generatedAt)}` e il resto).

- [ ] **Step 4: WorkshopPlanningReportModal (riga ~391)**

Sostituisci `Workload · Officina · Report pianificazione` con
`Flowrlink · Officina · Report pianificazione`.

- [ ] **Step 5: WorkshopReportModal (riga ~433)**

Sostituisci `Workload · Ufficio Progettazione Meccanica · Report flusso officina` con
`Flowrlink · Ufficio Progettazione Meccanica · Report flusso officina`.

- [ ] **Step 6: Verifica — nessun brand "Workload" residuo**

Run:
```
grep -rn "app Workload\|Workload · \|Workload &middot;" src index.html
```
Expected: NESSUN risultato (tutte le occorrenze del nome-app sono ora "Flowrlink").
Poi:
```
grep -rn "Workload" src | grep -viE "computeWorkload|WorkloadKanban|WorkloadPersonCard|WorkloadLevel|PersonWorkloadReport|getWorkloadActivitiesForPerson|WorkloadActivity|utils/workload|Workload per persona"
```
Expected: nessun risultato (restano solo le occorrenze di dominio "carico di lavoro").

- [ ] **Step 7: Build + Commit**

Run: `npm run build`
Expected: build ok.
```bash
git add src/components/CalculatedStandardComponentsReportModal.tsx src/components/StandardParametersReportModal.tsx src/components/WeeklyReportModal.tsx src/components/WorkshopPlanningReportModal.tsx src/components/WorkshopReportModal.tsx
git commit -m "feat(rebranding): nome app Flowrlink nei footer dei report"
```

---

## Self-review (controllo del piano contro lo spec)

- Spec §3 asset trasparenti → Task 1 ✓
- Spec §4 header simbolo+wordmark+sottotitolo → Task 2 ✓
- Spec §5 favicon+titolo → Task 3 ✓
- Spec §6 rinomina brand (solo nome app, non logica) → Task 4 (grep di controllo esclude i termini di dominio) ✓
- Spec §8 verifica (build, screenshot, grep) → presente in Task 2/3/4 ✓
- Nessun placeholder; percorsi e stringhe esatti; nessun test unitario perché è lavoro visivo/di stringhe (verifica build+screenshot+grep).
