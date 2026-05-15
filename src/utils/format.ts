export function uid(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8)
  const time = Date.now().toString(36).slice(-4)
  return `${prefix}_${time}${rand}`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function pct(n: number): string {
  return `${Math.round(n)}%`
}

export function hours(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? `${r}h` : `${r}h`
}
