const MS_PER_DAY = 86_400_000

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d
}

export function endOfWeek(date: Date): Date {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function addWorkingDays(date: Date, workingDays: number): Date {
  const d = new Date(date)
  let remaining = Math.max(0, Math.floor(workingDays))
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) remaining--
  }
  return d
}

export function formatISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function formatItalianShort(iso: string): string {
  const d = parseISODate(iso)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

export function formatItalian(iso: string): string {
  const d = parseISODate(iso)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const diff = (d.getTime() - firstThursday.getTime()) / MS_PER_DAY
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}

export function workingDaysBetween(startISO: string, endISO: string): number {
  const start = parseISODate(startISO)
  const end = parseISODate(endISO)
  if (end < start) return 0
  let count = 0
  const cursor = new Date(start)
  while (cursor.getTime() <= end.getTime()) {
    const d = cursor.getDay()
    if (d !== 0 && d !== 6) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

export function workingDaysOverlap(startISO: string, endISO: string, rangeStart: Date, rangeEnd: Date): number {
  const taskStart = parseISODate(startISO)
  const taskEnd = parseISODate(endISO)
  const start = taskStart > rangeStart ? taskStart : rangeStart
  const end = taskEnd < rangeEnd ? taskEnd : rangeEnd
  if (end < start) return 0
  let count = 0
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  while (cursor.getTime() <= end.getTime()) {
    const d = cursor.getDay()
    if (d !== 0 && d !== 6) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

export function todayISO(): string {
  return formatISODate(new Date())
}

export function isOverdue(dueISO: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return parseISODate(dueISO) < today
}

export function daysUntil(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = parseISODate(iso)
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY)
}
