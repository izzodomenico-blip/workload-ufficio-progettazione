import { exec, execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { recordResult, shouldRestart } from './watchdogLogic.js'
import { appendLine, rotateIfNeeded } from './logging.js'

const PORT = Number(process.env.PORT || 3000)
const APP_NAME = process.env.APP_NAME || 'workload-ufficio-progettazione'
const INTERVAL_MS = Number(process.env.HEALTH_INTERVAL_MS || 30000)
const TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_MS || 5000)
const THRESHOLD = Number(process.env.HEALTH_FAIL_THRESHOLD || 3)
const GRACE_MS = Number(process.env.RESTART_GRACE_MS || 60000)
const LOG_FILE = path.join(process.cwd(), 'logs', 'watchdog.log')

async function defaultCheckHealth() {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: ac.signal })
    return res.status === 200
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// Risolve il binario pm2 da usare per il restart.
// Preferisce PM2_BIN assoluto (impostato dal servizio); in fallback deriva il "pm2"
// accanto a PM2_RUNTIME_PATH; ultimo fallback: 'pm2' sul PATH.
export function resolvePm2Bin(env = process.env, exists = fs.existsSync) {
  if (env.PM2_BIN && exists(env.PM2_BIN)) return env.PM2_BIN
  if (env.PM2_RUNTIME_PATH) {
    const sibling = env.PM2_RUNTIME_PATH.replace(/pm2-runtime$/, 'pm2')
    if (sibling !== env.PM2_RUNTIME_PATH && exists(sibling)) return sibling
  }
  return 'pm2'
}

function defaultRestart() {
  return new Promise((resolve) => {
    const bin = resolvePm2Bin()
    const stamp = () => new Date().toISOString()
    const done = (err, stdout, stderr) => {
      if (err) {
        defaultLog(`${stamp()} pm2 restart FALLITO (${bin}): ${err.message} ${String(stderr || '').trim()}`)
      } else {
        defaultLog(`${stamp()} pm2 restart eseguito (${bin}) ${String(stdout || '').trim()}`.trim())
      }
      resolve()
    }
    if (bin === 'pm2') {
      exec(`pm2 restart ${APP_NAME}`, done)
    } else {
      // bin è un percorso assoluto al file JS di pm2: eseguilo con node
      execFile(process.execPath, [bin, 'restart', APP_NAME], done)
    }
  })
}

function defaultLog(line) {
  appendLine(LOG_FILE, line)
  rotateIfNeeded(LOG_FILE, 2000)
}

export function createWatchdog({
  checkHealth = defaultCheckHealth,
  restartApp = defaultRestart,
  log = defaultLog,
  threshold = THRESHOLD,
  graceMs = GRACE_MS,
} = {}) {
  let history = []
  let graceUntil = 0
  const now = () => new Date().toISOString()

  async function pollOnce(clockMs = Date.now()) {
    if (clockMs < graceUntil) {
      log(`${now()} grazia post-riavvio: controllo saltato`)
      return { skipped: true }
    }
    const healthy = await checkHealth()
    history = recordResult(history, healthy, threshold)
    log(`${now()} health=${healthy ? 'ok' : 'FAIL'} finestra=${history.map((h) => (h ? '1' : '0')).join('')}`)
    if (shouldRestart(history, threshold)) {
      log(`${now()} soglia ${threshold} fallimenti raggiunta: pm2 restart ${APP_NAME}`)
      await restartApp()
      history = []
      graceUntil = clockMs + graceMs
      return { restarted: true }
    }
    return { restarted: false, healthy }
  }

  return { pollOnce }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  const wd = createWatchdog()
  defaultLog(
    `${new Date().toISOString()} watchdog avviato (porta ${PORT}, soglia ${THRESHOLD}, intervallo ${INTERVAL_MS}ms)`,
  )
  setInterval(() => {
    void wd.pollOnce()
  }, INTERVAL_MS)
}
