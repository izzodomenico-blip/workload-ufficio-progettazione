const SERVICE = 'workload-ufficio-progettazione'

export function buildHealthPayload({ dbOk, uptimeSec, startedAt, pid, error }) {
  const common = { service: SERVICE, storage: 'sqlite', uptimeSec, startedAt, pid }
  if (dbOk) {
    return { status: 200, body: { ok: true, db: 'ok', ...common } }
  }
  const body = { ok: false, db: 'error', ...common }
  if (error !== undefined) body.error = error
  return { status: 503, body }
}
