# Workload — Sempre online in ufficio (LAN)

Guida per far girare l'app su un PC/server sempre acceso, così i colleghi in ufficio
la consultano dal browser via `http://IP-DEL-SERVER:3000`.

L'app è **auto-contenuta**: un solo processo Node (`server/index.js`) serve sia il
frontend (la build in `dist/`) sia le API, su un'unica porta. Database = un file
SQLite locale (`data/workload.db`).

---

## 0. Prerequisiti (una volta sola sul PC-server)
- **Node.js 22+** installato (l'app usa `node:sqlite`).
- Il progetto copiato sul PC-server (o `git clone` del repo).
- PC-server con **IP fisso** in LAN (consigliato) e sempre acceso.

## 1. Build + primo avvio (test)
Dalla cartella del progetto:
```
npm ci
npm run build
npm start
```
`npm start` avvia il server su **:3000**. Apri `http://localhost:3000` sul PC-server
per verificare. Scorciatoia: doppio click su **`serve-prod.cmd`** (fa `npm ci` + build + avvio).

Ogni volta che aggiorni il codice (`git pull`): rifai `npm run build`, poi riavvia (vedi sotto).

## 2. Tenerlo SEMPRE online con PM2 (riavvio automatico + all'accensione)
```
npm i -g pm2 pm2-windows-startup
pm2-startup install
pm2 start ecosystem.config.cjs
pm2 save
```
- `ecosystem.config.cjs` è già configurato in **produzione** (avvia `server/index.js` su :3000, `autorestart`).
- `pm2 save` + `pm2-startup` fanno ripartire l'app dopo un riavvio di Windows.
- Comandi utili: `pm2 status`, `pm2 logs`, `pm2 restart workload-ufficio-progettazione`.

> Alternativa a PM2: **NSSM** (Non-Sucking Service Manager) che avvolge
> `node server/index.js` in un servizio Windows. PM2 è più semplice.

## 3. Aprire la porta 3000 nel firewall di Windows (sul PC-server)
In un prompt **come Amministratore**:
```
netsh advfirewall firewall add rule name="Workload 3000" dir=in action=allow protocol=TCP localport=3000
```

## 4. Accesso dai PC dei colleghi
Sul PC-server trova l'IP LAN: `ipconfig` → "Indirizzo IPv4" (es. `192.168.0.27`).
I colleghi aprono nel browser: **`http://192.168.0.27:3000`** (metti il tuo IP reale).
Opzionale: assegna un nome DNS interno (es. `http://workload:3000`) sul router/AD.

## 5. Password (per-istanza, NON nel repo)
`admin.config.json` (carico base) e `consuntivi.config.json` (sezione Consuntivi)
sono **gitignored**: sul server vanno reimpostate. La password Consuntivi si imposta con:
```
curl -X POST http://localhost:3000/api/consuntivi-auth/set-password -H "content-type: application/json" -d "{\"newPassword\":\"LaTuaPassword\"}"
```
(analogo `/api/admin/set-password` per il carico base). Finché non le imposti, quelle
sezioni sono accessibili senza password.

## 6. Backup dati
Tutto sta in **`data/workload.db`** (+ `data/` backup automatici dell'app).
Copia periodicamente la cartella `data/` (es. su una share di rete o cloud).
È l'unico dato da salvare.

## 7. Aggiornare l'app
```
git pull
npm ci
npm run build
pm2 restart workload-ufficio-progettazione
```

---

**Da fuori ufficio (opzionale, non incluso in questo scenario):** per l'accesso via
internet servirebbe un Cloudflare Tunnel (URL HTTPS pubblico, nessuna porta aperta)
oppure un reverse proxy con dominio + HTTPS. Chiedi e te lo preparo.
