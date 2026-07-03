import { exec } from 'node:child_process'
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

function defaultRestart() {
  return new Promise((resolve) => {
    exec(`pm2 restart ${APP_NAME}`, () => resolve())
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
