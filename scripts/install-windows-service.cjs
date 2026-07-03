// Registra (idempotente) il servizio Windows "Flowrlink" che esegue service-launcher.cjs.
// Richiede node-windows installato (lo fa install-service.ps1). Eseguire come Amministratore.
const path = require('node:path')
const { Service } = require('node-windows')

const projectDir = path.resolve(__dirname, '..')
const svc = new Service({
  name: 'Flowrlink',
  description: 'Flowrlink — server workload/CRM ufficio progettazione (PM2 sotto servizio).',
  script: path.join(projectDir, 'scripts', 'service-launcher.cjs'),
  env: [
    { name: 'PM2_RUNTIME_PATH', value: process.env.PM2_RUNTIME_PATH || '' },
    { name: 'PM2_HOME', value: process.env.PM2_HOME || '' },
    { name: 'PM2_BIN', value: process.env.PM2_BIN || '' },
    { name: 'PORT', value: '3000' },
    { name: 'HOST', value: '0.0.0.0' },
  ],
})

svc.on('install', () => {
  console.log('Servizio Flowrlink installato. Avvio…')
  svc.start()
})
svc.on('alreadyinstalled', () => {
  console.log('Servizio Flowrlink già installato: riavvio per applicare la config.')
  svc.restart()
})
svc.on('start', () => console.log('Servizio Flowrlink avviato.'))
svc.on('error', (e) => { console.error('Errore servizio:', e); process.exit(1) })

svc.install()
