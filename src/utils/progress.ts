import type { Status, Task, WorkItem } from '../types'
import { ALL_STATUSES } from '../types'
import { clamp } from './format'
import { todayISO, workingDaysBetween } from './dates'

export type HealthStatus = 'ok' | 'a rischio' | 'in ritardo' | 'in attesa' | 'sospeso' | 'completato'

const VALID_STATUSES = new Set<string>(ALL_STATUSES)

const LEGACY_STATUS_MAP: Record<string, Status> = {
  'Assegnato': 'Pianificato',
  'In attesa input commerciale': 'In attesa',
  'In attesa input cliente': 'In attesa',
  'In attesa scelta tecnica': 'In attesa',
  'In verifica responsabile': 'In verifica',
  'Da correggere': 'In corso',
  'Pronto per rilascio': 'In verifica',
  'Rilasciato produzione': 'Completato',
  'Annullato': 'Sospeso',
}

export function mapLegacyStatus(status: string): Status {
  if (VALID_STATUSES.has(status)) return status as Status
  return LEGACY_STATUS_MAP[status] ?? 'Da pianificare'
}

export function calculateExpectedProgress(
  startDate: string,
  dueDate: string,
  today: string = todayISO(),
): number {
  if (today < startDate) return 0
  if (today > dueDate) return 100

  const totalDays = workingDaysBetween(startDate, dueDate)
  if (totalDays <= 0) return today >= dueDate ? 100 : 0

  const elapsedDays = workingDaysBetween(startDate, today)
  return clamp(Math.round((elapsedDays / totalDays) * 100), 0, 100)
}

function isCompleted(status: Status, progressPercent: number): boolean {
  return status === 'Completato' || progressPercent >= 100
}

export function getTaskHealth(
  task: Pick<Task, 'status' | 'startDate' | 'dueDate' | 'progressPercent'>,
  today: string = todayISO(),
  hasAbsenceConflict = false,
): HealthStatus {
  const status = mapLegacyStatus(task.status)
  const progress = task.progressPercent

  if (isCompleted(status, progress)) return 'completato'
  if (status === 'Sospeso') return 'sospeso'
  if (status === 'In attesa') return 'in attesa'
  if (today > task.dueDate) return 'in ritardo'

  const expected = calculateExpectedProgress(task.startDate, task.dueDate, today)
  if (expected - progress >= 20 || hasAbsenceConflict) return 'a rischio'

  return 'ok'
}

function healthFromEntity(
  status: Status,
  startDate: string,
  dueDate: string,
  progressPercent: number,
  today: string,
  hasAbsenceConflict = false,
): HealthStatus {
  return getTaskHealth(
    { status, startDate, dueDate, progressPercent },
    today,
    hasAbsenceConflict,
  )
}

/**
 * Salute aggregata di un work-item dai suoi task.
 * Priorità: in ritardo > a rischio > in attesa > sospeso > (tutti completati) > ok.
 * "completato" richiede che TUTTI i task lo siano (1 task non chiude il work-item).
 */
function aggregateHealth(healths: HealthStatus[]): HealthStatus {
  if (healths.length === 0) return 'ok'
  if (healths.includes('in ritardo')) return 'in ritardo'
  if (healths.includes('a rischio')) return 'a rischio'
  if (healths.includes('in attesa')) return 'in attesa'
  if (healths.includes('sospeso')) return 'sospeso'
  if (healths.every((h) => h === 'completato')) return 'completato'
  return 'ok'
}

export function getWorkItemHealth(
  workItem: WorkItem,
  tasks: Task[],
  today: string = todayISO(),
): HealthStatus {
  const itemTasks = tasks.filter((t) => t.workItemId === workItem.id)

  if (itemTasks.length === 0) {
    return healthFromEntity(
      mapLegacyStatus(workItem.status),
      workItem.startDate,
      workItem.dueDate,
      workItem.progressPercent,
      today,
      false,
    )
  }

  return aggregateHealth(itemTasks.map((t) => getTaskHealth(t, today, false)))
}

/** Salute work-item con assenze valutate per ogni task. */
export function getWorkItemHealthWithAbsences(
  workItem: WorkItem,
  tasks: Task[],
  hasTaskAbsenceConflict: (task: Task) => boolean,
  today: string = todayISO(),
): HealthStatus {
  const itemTasks = tasks.filter((t) => t.workItemId === workItem.id)

  if (itemTasks.length === 0) {
    return healthFromEntity(
      mapLegacyStatus(workItem.status),
      workItem.startDate,
      workItem.dueDate,
      workItem.progressPercent,
      today,
      false,
    )
  }

  const healths = itemTasks.map((t) => getTaskHealth(t, today, hasTaskAbsenceConflict(t)))
  return aggregateHealth(healths)
}

export function countActiveTaskHealth(
  tasks: Task[],
  personId: string,
  hasTaskAbsenceConflict: (task: Task) => boolean,
  today: string = todayISO(),
): Record<'ok' | 'a rischio' | 'in ritardo' | 'in attesa' | 'sospeso', number> {
  const counts = { ok: 0, 'a rischio': 0, 'in ritardo': 0, 'in attesa': 0, sospeso: 0 }
  for (const t of tasks) {
    if (t.assigneeId !== personId) continue
    const h = getTaskHealth(t, today, hasTaskAbsenceConflict(t))
    if (h === 'completato') continue
    if (h in counts) counts[h as keyof typeof counts]++
  }
  return counts
}

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  ok: 'OK',
  'a rischio': 'A rischio',
  'in ritardo': 'In ritardo',
  'in attesa': 'In attesa',
  sospeso: 'Sospeso',
  completato: 'Completato',
}
