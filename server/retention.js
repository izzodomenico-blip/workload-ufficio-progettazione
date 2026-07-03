function isoDay(d) { return d.toISOString().slice(0, 10) }
function isoMonth(d) { return d.toISOString().slice(0, 7) }
function isoWeek(d) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7)
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function selectForRetention(timestamps, opts = {}) {
  const { daily = 14, weekly = 8, monthly = 12 } = opts
  const items = [...new Set(timestamps)]
    .map((t) => ({ t, d: new Date(t) }))
    .filter((x) => Number.isFinite(x.d.getTime()))
    .sort((a, b) => b.d - a.d) // più recente prima

  const keep = new Set()
  const keepNewestPerGroup = (keyFn, limit) => {
    if (limit <= 0) return
    const seen = new Map() // chiave gruppo -> timestamp più recente (primo visto = più recente)
    for (const it of items) {
      const k = keyFn(it.d)
      if (!seen.has(k)) seen.set(k, it.t)
    }
    for (const [, t] of [...seen.entries()].slice(0, limit)) keep.add(t)
  }
  keepNewestPerGroup(isoDay, daily)
  keepNewestPerGroup(isoWeek, weekly)
  keepNewestPerGroup(isoMonth, monthly)

  return {
    keep: items.filter((it) => keep.has(it.t)).map((it) => it.t),
    drop: items.filter((it) => !keep.has(it.t)).map((it) => it.t),
  }
}
