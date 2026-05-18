import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DB_PATH, closeDb, getDb, isDatabaseEmpty, saveAppData } from './db.js'
import { createApiRouter } from './routes/index.js'
import { freshSeedData } from './services/seedData.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const DIST_DIR = path.join(ROOT_DIR, 'dist')
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

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next()
      return
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res.type('text/plain').send('Backend attivo. Esegui npm run build per servire anche il frontend da questo server.')
  })
}

const server = app.listen(PORT, HOST, () => {
  console.log(`Workload server attivo su http://${HOST}:${PORT}`)
  console.log(`Database SQLite: ${DB_PATH}`)
})

function shutdown() {
  server.close(() => {
    closeDb()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
