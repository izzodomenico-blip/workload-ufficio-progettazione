import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DB_PATH, closeDb, getDb, isDatabaseEmpty, saveAppData } from './db.js'
import { createApiRouter } from './routes/index.js'
import { freshSeedData } from './services/seedData.js'
import { appendLine } from './logging.js'
import { formatCrash, installProcessGuards } from './hardening.js'
import { createVerifiedSnapshot, isSnapshotDue, readLatestVerified } from './verifiedBackup.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const DIST_DIR = path.join(ROOT_DIR, 'dist')
const DIST_INDEX = path.join(DIST_DIR, 'index.html')
const CRASH_LOG = path.join(ROOT_DIR, 'logs', 'crash.log')
const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'

const db = getDb()
if (isDatabaseEmpty(db) && process.env.WORKLOAD_SKIP_AUTO_SEED !== '1') {
  saveAppData(freshSeedData(), db)
  console.log(`Database inizializzato con dati demo: ${DB_PATH}`)
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '25mb' }))
app.use('/api', createApiRouter())
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint API non trovato.' })
})

app.use(express.static(DIST_DIR))
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  if (!fs.existsSync(DIST_INDEX)) {
    res
      .status(503)
      .type('text/plain')
      .send('Backend attivo. Esegui npm run build per servire anche il frontend da questo server.')
    return
  }
  res.sendFile(DIST_INDEX)
})

const servers = []

const server = app.listen(PORT, HOST, () => {
  console.log(`Workload server attivo su http://${HOST}:${PORT}`)
  console.log(`Database SQLite: ${DB_PATH}`)
})
servers.push(server)

if (HOST === '0.0.0.0' && process.env.WORKLOAD_DISABLE_IPV6_LOCALHOST !== '1') {
  const localhostServer = app.listen(PORT, '::1', () => {
    console.log(`Workload server attivo anche su http://localhost:${PORT}`)
  })
  localhostServer.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.warn(`Porta IPv6 localhost già occupata su ${PORT}: http://localhost:${PORT} potrebbe rispondere da un altro processo.`)
      return
    }
    console.error('Errore listener IPv6 localhost:', error)
  })
  servers.push(localhostServer)
}

function gracefulExit(code) {
  const safety = setTimeout(() => {
    closeDb()
    process.exit(code)
  }, 3000)
  safety.unref()
  let pending = servers.length
  const done = () => {
    pending--
    if (pending <= 0) {
      clearTimeout(safety)
      closeDb()
      process.exit(code)
    }
  }
  if (pending === 0) {
    clearTimeout(safety)
    closeDb()
    process.exit(code)
    return
  }
  for (const activeServer of servers) {
    if (!activeServer.listening) {
      done()
      continue
    }
    activeServer.close(done)
  }
}

process.on('SIGINT', () => gracefulExit(0))
process.on('SIGTERM', () => gracefulExit(0))

installProcessGuards(process, {
  onFatal: (kind, err) => {
    try {
      appendLine(CRASH_LOG, formatCrash(kind, err, new Date().toISOString()))
    } catch {
      // logging non deve impedire l'uscita
    }
    gracefulExit(1)
  },
})

// Scheduler backup verificato: all'avvio e ogni ora, se è passato ≥ ~24h, crea uno snapshot verificato.
const BACKUP_LOG = path.join(ROOT_DIR, 'logs', 'backup.log')
function runVerifiedSnapshotIfDue() {
  try {
    const latest = readLatestVerified()
    if (!isSnapshotDue(latest?.createdAt ?? null, Date.now())) return
    const { manifest } = createVerifiedSnapshot({ reason: 'scheduler' })
    appendLine(BACKUP_LOG, `${new Date().toISOString()} snapshot verificato creato integrità=${manifest.integrityResult} totale=${manifest.total}`)
  } catch (error) {
    try { appendLine(BACKUP_LOG, `${new Date().toISOString()} snapshot verificato FALLITO: ${error instanceof Error ? error.message : String(error)}`) } catch { /* ignora */ }
  }
}
runVerifiedSnapshotIfDue()
const backupTimer = setInterval(runVerifiedSnapshotIfDue, 60 * 60 * 1000)
backupTimer.unref()
