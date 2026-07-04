# Guida completa — Flowrlink

Guida di riferimento a tutto il lavoro svolto: cosa fa il programma, come è fatto, come si
installa e si gestisce, e cosa fare in ogni situazione. È pensata per essere **consultata**
(vai alla sezione che ti serve), non letta tutta d'un fiato.

> Nota sicurezza: in questa guida **non ci sono password in chiaro** (finirebbero nel repo).
> Dove si parla di "la password che hai impostato", intendi quella scelta da te sul server.

## Indice
1. [Cos'è Flowrlink](#1-cosè-flowrlink)
2. [I cinque interventi (A–E)](#2-i-cinque-interventi-ae)
3. [Architettura tecnica](#3-architettura-tecnica)
4. [B — Login e permessi](#4-b--login-e-permessi)
5. [C — Affidabilità 24/7](#5-c--affidabilità-247)
6. [D — Backup senza perdita dati](#6-d--backup-senza-perdita-dati)
7. [E — Installazione e aggiornamenti](#7-e--installazione-e-aggiornamenti)
8. ["Come faccio a…" (operazioni quotidiane)](#8-come-faccio-a-operazioni-quotidiane)
9. [Dove sta tutto (mappa di file e cartelle)](#9-dove-sta-tutto-mappa-di-file-e-cartelle)
10. [Cosa resta da fare sul server (accettazione)](#10-cosa-resta-da-fare-sul-server-accettazione)
11. [Riferimenti tecnici](#11-riferimenti-tecnici)

---

## 1. Cos'è Flowrlink

Applicazione web per l'**ufficio di progettazione meccanica**: gestione del carico di lavoro
(workload), pianificazione, anagrafiche, carico officina, consuntivi. Gira su **un PC-server
Windows** sempre acceso in ufficio; i colleghi la aprono dal browser a `http://IP-DEL-SERVER:3000`.

È **un solo processo Node** che serve sia le pagine sia le API, su un'unica porta. I dati stanno
in **un solo file** SQLite. Frontend React, backend Node/Express.

---

## 2. I cinque interventi (A–E)

Il lavoro è stato diviso in cinque sotto-progetti indipendenti, ognuno con il suo ciclo
progetto → specifica → piano → implementazione → revisione → merge.

| # | Nome | Cosa risolve | In breve |
|---|---|---|---|
| **A** | Rebrand Flowrlink | Identità visiva | Nuovo nome e logo Flowrlink nell'header e nella schermata di accesso. |
| **B** | Login e permessi | Chiunque poteva fare tutto | Accesso con utente/password; 4 ruoli che limitano finestre e azioni; nessuno può eliminare il lavoro altrui o vedere dati riservati. Controlli **veri lato server**, non solo bottoni nascosti. |
| **C** | Affidabilità 24/7 | L'app poteva fermarsi | Servizio Windows che riparte da solo dopo crash, blocco (hang) o riavvio del PC, anche senza login. |
| **D** | Backup senza perdita dati | Backup solo sullo stesso disco | Backup verificati (controllo integrità), copia automatica sul NAS, storico a lungo termine, e un **semaforo** in-app che dice se sei al sicuro. |
| **E** | Pacchetto autoinstallante | Installazione manuale e fragile | Un unico script che installa tutto "in un colpo" e tiene i dati **fuori** dalla cartella del codice, così gli aggiornamenti non li toccano. |

Ogni sotto-progetto è stato chiuso con una **revisione di sicurezza indipendente**. Le revisioni
hanno trovato e fatto correggere problemi reali prima della messa in produzione (vedi §11).

---

## 3. Architettura tecnica

- **Un processo Node/Express** serve la build del frontend (`dist/`) + le API `/api/...` sulla
  porta **3000**.
- **Database**: SQLite in un file, modalità **WAL** (scritture atomiche, resistente a chiusure
  brusche). Un solo processo scrive → niente conflitti; adeguato per un piccolo ufficio.
- **Stato separato dal codice**: dati, backup, log e password delle sezioni vivono in
  **`C:\ProgramData\Flowrlink`**, NON nella cartella del programma. Governato da un'unica
  variabile `WORKLOAD_STATE_DIR`. Così sostituire il codice (aggiornamento) non tocca mai i dati.
- **Sempre online**: un **servizio Windows** (`Flowrlink`) tiene su il processo tramite PM2,
  parte all'accensione del PC prima del login.
- **Nessuna dipendenza esterna nuova** nel codice dell'app: solo Express + moduli nativi di Node
  (incluso il motore SQLite integrato). PM2 e gli strumenti di servizio sono tooling operativo
  sul server, non librerie dell'applicazione.
- **Requisito**: Node.js **22 o superiore** (serve per il database integrato).

Flusso di una richiesta: browser → porta 3000 → Express → (se `/api`) router API con **gate di
sessione** e controllo permessi → dati da SQLite; altrimenti serve la pagina React.

---

## 4. B — Login e permessi

### Come funziona l'accesso
- Al **primo avvio** in assoluto (nessun utente ancora) l'app mostra una **schermata di setup**:
  crei lì l'account **amministratore** (sei tu).
- Dopo, ogni accesso richiede utente e password. La sessione dura ~12 ore (si rinnova usando
  l'app) ed è legata a un cookie sicuro.
- Le password sono salvate solo come **hash+salt** (scrypt): non sono leggibili né recuperabili.
  Se le dimentichi, si reimpostano, non si "recuperano".

### I quattro ruoli
| Ruolo | Cosa vede/fa |
|---|---|
| **Amministratore** | Tutto: ogni sezione, gestione utenti, prezzi consuntivi, backup, può eliminare qualsiasi cosa. |
| **Progettista** | Dashboard, Pianificazione, Agenda, Anagrafiche, Libreria disegni. Crea e modifica lavori; elimina **solo i propri**. |
| **Officina** | Carico officina, Pianificazione officina, Operai, Consuntivi (senza prezzi). Crea e modifica; elimina solo i propri. |
| **Sola lettura** | Dashboard, Officina, Consuntivi — solo consultazione, nessuna modifica. |

### Cosa protegge (davvero)
- Chi non ha il permesso **non vede** la sezione (le schede in cima si filtrano da sole) **e**
  il server **rifiuta** comunque l'azione se qualcuno prova a forzarla via rete (risposta 403).
  Non è "solo un bottone nascosto".
- Nessuno può **eliminare il lavoro altrui**: la cancellazione è consentita solo a chi l'ha
  creato o all'amministratore.
- Dati **riservati** (storico modifiche, carico base delle persone, dati finanziari dei partner)
  sono **rimossi dalla risposta** per chi non ha il permesso, non solo nascosti a schermo.
- Le rotte "scorciatoia" che in passato permettevano di aggirare i controlli sono state
  **rimosse**; ogni scrittura passa dai controlli di ruolo.

### Gestione utenti
Come amministratore: scheda **Utenti** → crei utenti (username, password, ruolo, persona
collegata), cambi ruolo, disattivi, reimposti password, elimini. Regola di sicurezza: **deve
restare sempre almeno un amministratore attivo** (il sistema lo impedisce).

### Password delle sezioni protette
Oltre al login, due sezioni hanno una password dedicata (le imposti tu):
- **Consuntivi → Prezzi/Report**: password della sezione Consuntivi.
- **Carico base** delle persone: password admin dedicata.
Queste password stanno in `C:\ProgramData\Flowrlink` (non nel codice), quindi sopravvivono agli
aggiornamenti. Finché non le imposti, quelle funzioni restano aperte.

---

## 5. C — Affidabilità 24/7

Obiettivo: l'app raggiungibile **quasi sempre**, su un PC non presidiato, che si auto-ripara.

### Due livelli di protezione
1. **Servizio Windows (supervisore)** — riparte il processo se **crasha** (esce), lo avvia
   all'accensione del PC **prima del login**, e lo riavvia se consuma troppa memoria.
2. **Watchdog (guardiano della salute)** — un processo separato interroga `/api/health` ogni
   ~30 secondi; se l'app è **viva ma bloccata** (hang) per 3 controlli di fila (~90s), forza il
   riavvio. Il servizio da solo non se ne accorgerebbe (il processo è ancora "vivo").

### Cosa succede in ogni scenario
| Situazione | Risposta automatica |
|---|---|
| L'app va in errore non gestito | Esce in modo pulito e il servizio la fa ripartire da uno stato sano. |
| L'app si blocca (non risponde) | Il watchdog lo rileva e forza `pm2 restart` entro ~90s. |
| Il PC si riavvia | Il servizio riparte da solo, **anche senza che nessuno faccia login**. |
| Il database è bloccato | `/api/health` risponde 503 → il watchdog interviene. |

### Come capire se è sana
- `pm2 status` → devono essere **online** due voci (app + watchdog).
- `http://localhost:3000/api/health` dal browser → `"ok": true`, `"db": "ok"`.
- Log del perché ha riavviato: `C:\ProgramData\Flowrlink\logs\watchdog.log` e `crash.log`.
- Riavvii registrati anche in `pm2 logs`.

---

## 6. D — Backup senza perdita dati

Tre garanzie, ciascuna colma un buco:

### Verificato
Ogni giorno l'app crea in automatico uno **snapshot verificato** del database: copia coerente
(include il WAL) + **controllo integrità** (`PRAGMA integrity_check`) + conteggio righe +
**checksum SHA-256** + un file manifest con l'esito. Un backup che non passa la verifica è
marcato "non valido". Cartella: `C:\ProgramData\Flowrlink\backups\verified\`.

### Fuori dal PC (NAS)
Un **task pianificato** (a nome di un utente con accesso al NAS — le credenziali le tiene
Windows, non il repo) copia gli snapshot verificati su una **cartella di rete/NAS** e scrive una
"ricevuta" locale. Copia con `robocopy /MIR` (specchio): **il `-Dest` deve essere una cartella
dedicata SOLO a questi backup**, altrimenti ne cancella il contenuto.

### Storico a lungo termine (GFS)
Si tengono **14 giornalieri + 8 settimanali + 12 mensili**. Così sei protetto anche da una
corruzione scoperta dopo settimane: hai una copia vecchia sana.

### Semaforo in-app (per l'amministratore)
Nella sezione backup compare un **semaforo**:
- 🟢 **Verde** = al sicuro (snapshot recente + integro + copia NAS recente).
- 🟡 **Giallo** = attenzione (snapshot vecchio, o copia NAS mancante/vecchia/fallita).
- 🔴 **Rosso** = problema (nessuno snapshot, o integrità fallita).
Dettaglio anche su `http://localhost:3000/api/backup/health` e in `logs\backup.log`.

### Come ripristinare
- Dall'app (admin): sezione backup → scegli un backup → **Ripristina** (crea prima un backup di
  sicurezza dello stato attuale).
- Da un backup sul NAS: a server fermo, copia il `verified_*.db` desiderato in
  `C:\ProgramData\Flowrlink\data\workload.db`, oppure importane il `.json` dall'app.

---

## 7. E — Installazione e aggiornamenti

### Principio
Il **codice è sostituibile**, lo **stato è permanente** e vive in `C:\ProgramData\Flowrlink`
(`data/`, `backups/`, `logs/`, password sezioni). Aggiornare non tocca mai i dati.

### Installazione "in un colpo"
1. **Sul PC dei dati**: tasto destro su `make-package.ps1` → *Esegui con PowerShell*. Ottieni
   `workload-server-<data>.zip` che contiene l'app + uno **snapshot coerente del database
   attuale** come `seed/`.
2. **Sul server pulito**: copia lo zip, **estrailo in una cartella**, poi tasto destro su
   `install-server.ps1` → *Esegui con PowerShell (come Amministratore)*.
   Fa tutto da solo: Node (via winget se manca) → build → crea `C:\ProgramData\Flowrlink` →
   applica il seed (solo se lo stato è vuoto) → registra il **servizio Windows** → apre il
   firewall (porta 3000) → **chiede** se configurare subito il backup sul NAS → stampa
   `http://IP:3000`.
3. **Al primo avvio**: apri l'app e crea l'account amministratore (schermata di setup). Imposta
   le password delle sezioni se servono.

### Aggiornare in sicurezza
Rifai il pacchetto e rilancia `install-server.ps1` come Amministratore (stessa cartella o una
nuova). I dati in `C:\ProgramData\Flowrlink` **non si toccano**: si aggiorna solo il codice e si
riavvia il servizio.

### Migrare da una vecchia installazione
Se i dati erano dentro la vecchia cartella del programma, passa
`install-server.ps1 -MigrateFrom "C:\vecchia\cartella"`: **copia** i dati (e le password delle
sezioni) in `C:\ProgramData\Flowrlink` dopo una **copia di sicurezza**, lasciando intatta
l'origine. Non lascia mai due database "vivi".

---

## 8. "Come faccio a…" (operazioni quotidiane)

Comandi da eseguire sul PC-server (Prompt/PowerShell). "Servizi" = `services.msc`.

| Voglio… | Come |
|---|---|
| Vedere se è online | `pm2 status` (due voci online) oppure apri `http://localhost:3000` |
| Vedere i log in tempo reale | `pm2 logs` |
| Riavviare l'app | `pm2 restart workload-ufficio-progettazione` (o riavvia il servizio `Flowrlink` in `services.msc`) |
| Controllare la salute backup | Apri `http://localhost:3000/api/backup/health` o guarda il semaforo in-app |
| Sapere perché ha riavviato | `C:\ProgramData\Flowrlink\logs\watchdog.log` e `crash.log` |
| Aggiungere/modificare un utente | Nell'app (admin) → scheda **Utenti** |
| Reimpostare la password di un utente | Scheda **Utenti** → *Reset password* |
| Impostare la password Consuntivi | `Invoke-RestMethod -Uri http://localhost:3000/api/consuntivi-auth/set-password -Method Post -ContentType application/json -Body '{"newPassword":"..."}'` |
| Impostare la password Carico base | `Invoke-RestMethod -Uri http://localhost:3000/api/admin/set-password -Method Post -ContentType application/json -Body '{"newPassword":"..."}'` |
| Configurare/riconfigurare il backup NAS | `install-backup-task.ps1 -Dest "\\NAS\backup\flowrlink"` (come Amministratore) |
| Ripristinare un backup | App (admin) → sezione backup → *Ripristina* |
| Aggiornare l'app | Rifai il pacchetto → `install-server.ps1` come Amministratore |

Trovare l'IP del server: `ipconfig` → voce "Indirizzo IPv4".

---

## 9. Dove sta tutto (mappa di file e cartelle)

### Sul server — stato (mai cancellare)
```
C:\ProgramData\Flowrlink\
  data\workload.db            ← il database (unico file dei dati)
  backups\verified\           ← snapshot verificati (db + manifest .json)
  backups\offsite-status.json ← ricevuta dell'ultima copia sul NAS
  backups\auto\               ← backup automatici frequenti dell'app
  logs\                       ← watchdog.log, crash.log, backup.log, log PM2
  admin.config.json           ← hash password "carico base"
  consuntivi.config.json      ← hash password sezione Consuntivi
```

### Nel repository — script principali
| File | A cosa serve |
|---|---|
| `install-server.ps1` | Installer unico sul server (E). |
| `install-service.ps1` | Registra il servizio Windows `Flowrlink` (C). |
| `install-backup-task.ps1` | Registra il task backup sul NAS (D). |
| `backup-data.ps1` | Copia gli snapshot verificati sul NAS + ricevuta (D). |
| `make-package.ps1` | Crea il pacchetto zip con lo stato attuale (E). |
| `snapshot-db.mjs` | Snapshot coerente del DB (usato dai backup/migrazione). |
| `ecosystem.config.cjs` | Configurazione PM2 (app + watchdog). |
| `DEPLOY-LAN.md` | Guida passo-passo all'installazione in ufficio. |

### Nel codice — moduli chiave (per chi sviluppa)
| File | Responsabilità |
|---|---|
| `server/index.js` | Avvio server, scheduler backup, hardening, uscita pulita. |
| `server/routes/index.js` | Tutte le rotte API + gate di sessione + controllo permessi. |
| `server/services/authService.js` | Utenti, sessioni, hashing password (scrypt). |
| `server/services/permissions.js` | Matrice dei permessi per ruolo. |
| `server/services/appDataAuthz.js` | Filtro in lettura + controllo autorizzazioni in scrittura. |
| `server/verifiedBackup.js` | Snapshot verificati + manifest + ritenzione GFS. |
| `server/backupHealth.js` | Calcolo del semaforo salute backup. |
| `server/retention.js` | Logica GFS (giornalieri/settimanali/mensili). |
| `server/watchdog.js` | Guardiano salute → riavvio su hang. |
| `server/db.js` | Percorsi di stato (`WORKLOAD_STATE_DIR`), apertura DB, migrazioni. |

---

## 10. Cosa resta da fare sul server (accettazione)

Il codice è completo, testato e su `main`. L'**installazione reale** richiede il server fisico
(Amministratore + hardware) e non è stata eseguita: va fatta e verificata così.

1. Sul PC dati: `make-package.ps1` → zip.
2. Sul server pulito: estrai → `install-server.ps1` come Amministratore → app online su
   `http://IP:3000`, dati in `C:\ProgramData\Flowrlink`, `pm2 status` con due voci online.
3. Primo avvio: crea l'account amministratore.
4. Backup NAS: rispondi "s" durante l'installazione (o lancia `install-backup-task.ps1 -Dest
   \\NAS\...`) → il semaforo backup diventa **verde**.
5. **Prove di robustezza** (una volta):
   - Chiudi il processo (`taskkill`) → riparte in pochi secondi.
   - Riavvia il PC **senza login** → l'app risponde da un altro PC.
   - Rendi il NAS irraggiungibile → il semaforo diventa giallo/rosso (l'avviso funziona).
   - Rilancia l'installer (aggiornamento) → i dati **non cambiano**.

Se qualcosa non torna in questi passi, segnalalo: sono i punti che dipendono dall'ambiente reale
(credenziali NAS, criteri di gruppo Windows, permessi cartella) e si sistemano rapidamente.

---

## 11. Riferimenti tecnici

### Specifiche e piani (nel repo)
Ogni sotto-progetto ha una specifica di design e un piano d'implementazione in
`docs/superpowers/`:
- `specs/2026-07-03-rbac-login-design.md` + `plans/2026-07-03-rbac-login.md` (B)
- `specs/2026-07-03-reliability-24-7-design.md` + `plans/2026-07-03-reliability-24-7.md` (C)
- `specs/2026-07-03-backup-no-data-loss-design.md` + `plans/2026-07-03-backup-no-data-loss.md` (D)
- `specs/2026-07-03-self-installing-package-design.md` + `plans/2026-07-03-self-installing-package.md` (E)

### Commit di merge su `main`
| Sotto-progetto | Commit merge |
|---|---|
| B — Login e permessi | `c0c790b` |
| C — Affidabilità 24/7 | `4d475c8` |
| D — Backup senza perdita dati | `0f6131d` |
| E — Pacchetto autoinstallante | `bcda665` |

### Metodo di lavoro
Ogni sotto-progetto: progettazione condivisa → specifica scritta → piano a passi piccoli →
implementazione a pezzi con test automatici (TDD) → **revisione di sicurezza indipendente** →
correzione dei problemi trovati → merge. Le revisioni hanno colto problemi reali corretti prima
del merge: un aggiramento dei permessi (B), un watchdog che riavviava "in silenzio" senza dirlo
(C), e la perdita delle password di sezione durante gli aggiornamenti (E).

### Verifica cumulativa
91 test automatici verdi, controllo tipi e build puliti, catene critiche provate a runtime
(permessi per-ruolo, scheduler backup, avvio/spegnimento del servizio). Il database reale non è
mai stato toccato durante lo sviluppo e i test.
