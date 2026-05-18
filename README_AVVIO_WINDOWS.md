# Avvio Windows - Workload Ufficio Progettazione

## Quando usare `npm run build`

Usa:

```powershell
npm run build
```

quando hai aggiornato il codice del frontend o hai scaricato una nuova versione dell'app. Questo comando prepara la versione compilata che il server locale servirà ai browser.

Di norma basta eseguirlo dopo modifiche o aggiornamenti, non ogni mattina.

## Quando usare `npm run start`

Usa:

```powershell
npm run start
```

per avviare l'app in produzione locale sul PC/server aziendale. Il server resta attivo finché la finestra rimane aperta.

Lo script:

```text
scripts/windows/Avvia_Workload.bat
```

entra automaticamente nella cartella del progetto ed esegue `npm run start`.

## Creare un collegamento sul desktop

1. Apri la cartella `scripts/windows`.
2. Fai clic destro su `Avvia_Workload.bat`.
3. Seleziona **Crea collegamento**.
4. Sposta il collegamento sul Desktop.
5. Rinominalo, ad esempio: `Avvia Workload`.

Da quel momento puoi avviare il server con doppio clic.

## Avvio automatico con `shell:startup`

Per far partire l'app quando accedi a Windows:

1. Premi `Win + R`.
2. Scrivi:

```text
shell:startup
```

3. Premi Invio.
4. Copia nella cartella che si apre il collegamento desktop a `Avvia_Workload.bat`.

Al prossimo accesso Windows avvierà automaticamente il server. Lascia aperta la finestra: serve anche per vedere eventuali errori.

## URL sul PC server

Sul PC che ospita l'app usa:

```text
http://localhost:3000
```

## URL per i colleghi

I colleghi devono usare l'indirizzo IP del PC server:

```text
http://IP_DEL_PC_SERVER:3000
```

Esempio:

```text
http://192.168.1.50:3000
```

Per trovare l'IP del PC server su Windows, apri PowerShell o Prompt dei comandi ed esegui:

```powershell
ipconfig
```

Cerca **Indirizzo IPv4** nella scheda di rete aziendale.
