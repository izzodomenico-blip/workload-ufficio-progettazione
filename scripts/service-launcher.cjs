// Lanciato dal servizio Windows "Flowrlink". Avvia PM2 in foreground (pm2-runtime)
// con l'ecosystem del progetto, così le due app girano sotto il servizio (boot-before-login).
// Il percorso di pm2-runtime arriva da PM2_RUNTIME_PATH (impostato all'installazione);
// in fallback lo si cerca nel prefix globale npm.
const { spawn, execSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const projectDir = path.resolve(__dirname, '..')

function resolvePm2Runtime() {
  if (process.env.PM2_RUNTIME_PATH && fs.existsSync(process.env.PM2_RUNTIME_PATH)) {
    return process.env.PM2_RUNTIME_PATH
  }
  const prefix = execSync('npm prefix -g', { encoding: 'utf8' }).trim()
  const candidate = path.join(prefix, 'node_modules', 'pm2', 'bin', 'pm2-runtime')
  if (!fs.existsSync(candidate)) {
    throw new Error(`pm2-runtime non trovato: ${candidate}. Esegui "npm i -g pm2".`)
  }
  return candidate
}

const runtime = resolvePm2Runtime()
const ecosystem = path.join(projectDir, 'ecosystem.config.cjs')
// pm2-runtime gira in foreground e mantiene il daemon PM2 accessibile alla CLI
// (`pm2 status`, `pm2 logs`). NON aggiungere flag "no-daemon": disattiverebbe la CLI.
const child = spawn(process.execPath, [runtime, 'start', ecosystem], {
  cwd: projectDir,
  stdio: 'inherit',
  env: process.env,
})
child.on('exit', (code) => process.exit(code ?? 0))
