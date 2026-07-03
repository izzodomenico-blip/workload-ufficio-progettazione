export function formatCrash(kind, err, nowIso) {
  const detail = err && err.stack ? err.stack : String(err)
  return `${nowIso} [${kind}] ${detail}`
}

export function installProcessGuards(proc, { onFatal }) {
  proc.on('uncaughtException', (err) => onFatal('uncaughtException', err))
  proc.on('unhandledRejection', (reason) => onFatal('unhandledRejection', reason))
}
