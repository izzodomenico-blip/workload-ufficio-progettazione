# Workload — Guida installazione sul server (uso in ufficio / LAN)

Obiettivo: far girare l'app su **un PC/server Windows sempre acceso**, così tutti i
colleghi in ufficio la aprono dal browser a `http://IP-DEL-SERVER:3000`.

L'app è un **unico processo Node** che serve sia le pagine (la build) sia le API, su
un'unica porta. I dati stanno in **un solo file** SQLite: `data/workload.db`.

> Tempo richiesto: ~20 minuti. Serve fare i comandi **una volta sola** sul PC-server.

---

## Passo 0 — Scegli il PC-server
- Un PC Windows che resta **sempre acceso** (non va in sospensione).
- Consigliato: **IP fisso** in rete locale (lo imposti sul router o nelle impostazioni di rete).
- Disattiva la sospensione: *Impostazioni → Sistema → Alimentazione → Sospensione = Mai*.

## Passo 1 — Installa Node.js (22 LTS o superiore)
1. Vai su **https://nodejs.org** e scarica **LTS** (versione 22 o superiore — serve per il database).
2. Installa (Avanti → Avanti → Fine, lascia tutte le opzioni di default).
3. Verifica: apri **Prompt dei comandi** e digita:
   ```
   node -v
   ```
   Deve stampare `v22.x` (o superiore).

## Passo 2 — Porta il progetto sul PC-server
Due modi, scegline uno.

**A) Con Git (consigliato, aggiornamenti facili)**
1. Installa Git da **https://git-scm.com** (Avanti → Fine).
2. Scarica il progetto (finirà in una cartella `workload-ufficio-progettazione`):
   ```
   cd %USERPROFILE%\Documents
   git clone https://github.com/izzodomenico-blip/workload-ufficio-progettazione.git
   cd workload-ufficio-progettazione
   ```

**B) Senza Git (ZIP)**
1. Su GitHub apri il repo → bottone verde **Code → Download ZIP**.
2. Estrai lo ZIP, es. in `Documenti\workload-ufficio-progettazione`.
3. Apri il Prompt dei comandi in quella cartella (nella barra indirizzi di Esplora
   file scrivi `cmd` e Invio).

## Passo 3 — Installa e costruisci l'app
Dalla cartella del progetto, nel Prompt:
```
npm ci
npm run build
```
- `npm ci` scarica le librerie (qualche minuto la prima volta).
- `npm run build` crea la cartella `dist/` (le pagine pronte).

## Passo 4 — Prova che parta
```
npm start
```
Apri il browser sul PC-server: **http://localhost:3000** — devi vedere l'app.
Poi ferma con **CTRL+C** (il prossimo passo la fa ripartire da sola e sempre).

> Scorciatoia per i passi 3–4: doppio click su **`serve-prod.cmd`** (fa tutto lui).

## Passo 5 — Tenerla SEMPRE online (PM2)
PM2 riavvia l'app se crolla e la fa ripartire all'accensione del PC.
```
npm i -g pm2 pm2-windows-startup
pm2-startup install
pm2 start ecosystem.config.cjs
pm2 save
```
Verifica: `pm2 status` (deve essere **online**). Log in tempo reale: `pm2 logs`.

Comandi utili:
| Cosa | Comando |
|---|---|
| Stato | `pm2 status` |
| Log | `pm2 logs` |
| Riavvia | `pm2 restart workload-ufficio-progettazione` |
| Ferma | `pm2 stop workload-ufficio-progettazione` |

> In alternativa a PM2 puoi usare **NSSM** o l'**Utilità di pianificazione** di Windows
> per lanciare `node server/index.js` all'avvio. PM2 è il più semplice.

## Passo 6 — Apri la porta 3000 nel firewall
Apri il **Prompt dei comandi come Amministratore** (tasto destro → *Esegui come amministratore*) e incolla:
```
netsh advfirewall firewall add rule name="Workload 3000" dir=in action=allow protocol=TCP localport=3000
```

## Passo 7 — Trova l'IP del server e fai accedere i colleghi
Sul PC-server:
```
ipconfig
```
Cerca **"Indirizzo IPv4"** (es. `192.168.0.27`).
I colleghi, sui loro PC in ufficio, aprono nel browser:
```
http://192.168.0.27:3000
```
(metti l'IP reale del tuo server). Fatto: è consultabile da tutti in ufficio.

> Comodo: chiedi a chi gestisce la rete di dare un nome, es. `http://workload:3000`.

## Passo 8 — Imposta le password (sul server)
Le password non arrivano dal repo (sono per-istanza). Impostale con **PowerShell** sul server:
```
# Sezione Consuntivi (Prezzi + Report)
Invoke-RestMethod -Uri http://localhost:3000/api/consuntivi-auth/set-password -Method Post -ContentType application/json -Body '{"newPassword":"InnoMarco"}'

# Carico base (opzionale)
Invoke-RestMethod -Uri http://localhost:3000/api/admin/set-password -Method Post -ContentType application/json -Body '{"newPassword":"Lorenzo17"}'
```
Finché non le imposti, quelle sezioni sono aperte senza password.

## Passo 9 — Backup dei dati
Tutto sta in **`data\workload.db`** (l'app fa anche backup automatici in `data\`).
Copia periodicamente la cartella **`data\`** su una share di rete o cloud. È l'unico dato da salvare.

## Passo 10 — Aggiornare l'app in futuro
Quando c'è una nuova versione:
```
git pull            (oppure riscarica lo ZIP e sostituisci i file, tenendo la cartella data\)
npm ci
npm run build
pm2 restart workload-ufficio-progettazione
```

---

## Problemi comuni
- **"node non è riconosciuto"** → Node non installato o Prompt da riaprire dopo l'installazione (Passo 1).
- **La pagina non si apre dai colleghi** → firewall (Passo 6) o IP sbagliato (Passo 7); verifica che sul server `http://localhost:3000` funzioni.
- **Porta 3000 occupata** → un'altra istanza è già attiva: `pm2 status` / chiudi il vecchio processo, oppure cambia porta nel `ecosystem.config.cjs` (`PORT`).
- **Dopo il riavvio del PC non riparte** → rifai `pm2-startup install` e `pm2 save` (Passo 5).
- **Errore sul database all'avvio** → serve Node **22+** (Passo 1).

## (Opzionale) Accesso da fuori ufficio
Questa guida copre la **rete interna**. Per l'accesso via internet servirebbe un
**Cloudflare Tunnel** (URL HTTPS pubblico, nessuna porta da aprire) o un reverse proxy
con dominio + HTTPS. Chiedi e te lo preparo.
