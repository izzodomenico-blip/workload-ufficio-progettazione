import type {
  Absence,
  ActivityLogEntry,
  AppData,
  Person,
  Task,
  WorkItem,
} from '../types'
import { uid } from './format'

export const ACTIVITY_LOG_LIMIT = 1000

export function createActivityLogEntry(
  input: Omit<ActivityLogEntry, 'id' | 'timestamp'>,
  at: Date = new Date(),
): ActivityLogEntry {
  return {
    id: uid('log'),
    timestamp: at.toISOString(),
    ...input,
  }
}

export function appendActivityLog(data: AppData, entry: ActivityLogEntry): AppData {
  const existing = Array.isArray(data.activityLog) ? data.activityLog : []
  const next = [entry, ...existing]
  if (next.length > ACTIVITY_LOG_LIMIT) next.length = ACTIVITY_LOG_LIMIT
  return { ...data, activityLog: next }
}

// === Title helpers ===

export function workItemLabel(w: WorkItem): string {
  return w.code ? `${w.code} · ${w.title}` : w.title
}

export function taskLabel(t: Task, wi?: WorkItem): string {
  if (!wi) return t.title
  const wiPart = wi.code || wi.title
  return `${t.title} (${wiPart})`
}

export function absenceLabel(a: Absence, person?: Person): string {
  const cap = a.type.charAt(0).toUpperCase() + a.type.slice(1)
  return person ? `${cap} · ${person.name}` : cap
}

// === Diff helpers ===

export function describeWorkItemChange(before: WorkItem, after: WorkItem): string {
  const parts: string[] = []
  if (before.status !== after.status) parts.push(`stato ${before.status} → ${after.status}`)
  if (before.progressPercent !== after.progressPercent) {
    parts.push(`avanzamento ${before.progressPercent}% → ${after.progressPercent}%`)
  }
  if (before.priority !== after.priority) parts.push(`priorità ${before.priority} → ${after.priority}`)
  if (before.dueDate !== after.dueDate) parts.push(`scadenza ${before.dueDate} → ${after.dueDate}`)
  if (before.startDate !== after.startDate) parts.push(`inizio ${before.startDate} → ${after.startDate}`)
  if (before.estimatedHours !== after.estimatedHours) {
    parts.push(`ore stimate ${before.estimatedHours}h → ${after.estimatedHours}h`)
  }
  if (before.title !== after.title) parts.push('titolo aggiornato')
  if (before.customer !== after.customer) parts.push('cliente aggiornato')
  if (before.ownerId !== after.ownerId) parts.push('owner aggiornato')
  if (before.assigneeIds.join(',') !== after.assigneeIds.join(',')) parts.push('assegnatari aggiornati')
  if (before.blockers.length !== after.blockers.length) {
    parts.push(`bloccanti ${before.blockers.length} → ${after.blockers.length}`)
  }
  // v0.9 — dettagli tecnici e operativi
  if ((before.technicalPhase ?? '') !== (after.technicalPhase ?? '')) {
    parts.push(`fase tecnica ${before.technicalPhase ?? '—'} → ${after.technicalPhase ?? '—'}`)
  }
  if ((before.plannedProductionReleaseDate ?? '') !== (after.plannedProductionReleaseDate ?? '')) {
    parts.push(`rilascio previsto ${before.plannedProductionReleaseDate ?? '—'} → ${after.plannedProductionReleaseDate ?? '—'}`)
  }
  if ((before.actualProductionReleaseDate ?? '') !== (after.actualProductionReleaseDate ?? '')) {
    parts.push(`rilascio effettivo ${before.actualProductionReleaseDate ?? '—'} → ${after.actualProductionReleaseDate ?? '—'}`)
  }
  if ((before.customerRequestDate ?? '') !== (after.customerRequestDate ?? '')) {
    parts.push(`data richiesta cliente ${before.customerRequestDate ?? '—'} → ${after.customerRequestDate ?? '—'}`)
  }
  if ((before.commercialPriority ?? '') !== (after.commercialPriority ?? '')) {
    parts.push(`priorità commerciale ${before.commercialPriority ?? '—'} → ${after.commercialPriority ?? '—'}`)
  }
  if ((before.offerReference ?? '') !== (after.offerReference ?? '')) {
    parts.push('riferimento offerta aggiornato')
  }
  if ((before.workFolderLink ?? '') !== (after.workFolderLink ?? '')) {
    parts.push('link cartella aggiornato')
  }
  if ((before.managerNotes ?? '') !== (after.managerNotes ?? '')) {
    parts.push('note responsabile aggiornate')
  }
  return parts.length === 0 ? 'modifica minore' : parts.join(' · ')
}

export function describeTaskChange(before: Task, after: Task): string {
  const parts: string[] = []
  if (before.status !== after.status) parts.push(`stato ${before.status} → ${after.status}`)
  if (before.progressPercent !== after.progressPercent) {
    parts.push(`avanzamento ${before.progressPercent}% → ${after.progressPercent}%`)
  }
  if (before.assigneeId !== after.assigneeId) parts.push('assegnatario aggiornato')
  if (before.dueDate !== after.dueDate) parts.push(`scadenza ${before.dueDate} → ${after.dueDate}`)
  if (before.startDate !== after.startDate) parts.push(`inizio ${before.startDate} → ${after.startDate}`)
  if (before.estimatedHours !== after.estimatedHours) {
    parts.push(`ore stimate ${before.estimatedHours}h → ${after.estimatedHours}h`)
  }
  if (before.title !== after.title) parts.push('titolo aggiornato')
  if (before.blockers.length !== after.blockers.length) {
    parts.push(`bloccanti ${before.blockers.length} → ${after.blockers.length}`)
  }
  return parts.length === 0 ? 'modifica minore' : parts.join(' · ')
}

export function describePersonChange(before: Person, after: Person): string {
  const parts: string[] = []
  if (before.weeklyCapacityHours !== after.weeklyCapacityHours) {
    parts.push(`capacità ${before.weeklyCapacityHours}h → ${after.weeklyCapacityHours}h`)
  }
  if (before.role !== after.role) parts.push('ruolo aggiornato')
  if (before.active !== after.active) parts.push(after.active ? 'persona attivata' : 'persona disattivata')
  if (before.name !== after.name) parts.push('nome aggiornato')
  if ((before.baselineLoadPercent ?? 0) !== (after.baselineLoadPercent ?? 0)) {
    parts.push(`carico base ${before.baselineLoadPercent ?? 0}% → ${after.baselineLoadPercent ?? 0}%`)
  }
  return parts.length === 0 ? '' : parts.join(' · ')
}

export function shouldLogPersonChange(before: Person, after: Person): boolean {
  return (
    before.weeklyCapacityHours !== after.weeklyCapacityHours ||
    before.role !== after.role ||
    before.active !== after.active ||
    before.name !== after.name ||
    (before.baselineLoadPercent ?? 0) !== (after.baselineLoadPercent ?? 0)
  )
}

export function describeAbsenceChange(before: Absence, after: Absence): string {
  const parts: string[] = []
  if (before.type !== after.type) parts.push(`tipo ${before.type} → ${after.type}`)
  if (before.startDate !== after.startDate) parts.push(`inizio ${before.startDate} → ${after.startDate}`)
  if (before.endDate !== after.endDate) parts.push(`fine ${before.endDate} → ${after.endDate}`)
  if (before.hoursPerDay !== after.hoursPerDay) {
    parts.push(`ore/g ${before.hoursPerDay} → ${after.hoursPerDay}`)
  }
  return parts.length === 0 ? 'modifica minore' : parts.join(' · ')
}

// === Convenience appenders that take a partial entry ===

export function logEntry(
  data: AppData,
  input: Omit<ActivityLogEntry, 'id' | 'timestamp'>,
  at?: Date,
): AppData {
  return appendActivityLog(data, createActivityLogEntry(input, at))
}

// === Query helpers ===

export function getRecentForWorkItem(
  data: AppData,
  workItemId: string,
  limit = 5,
): ActivityLogEntry[] {
  const taskIds = new Set(data.tasks.filter((t) => t.workItemId === workItemId).map((t) => t.id))
  // Also include orphan task ids referenced in log (deleted tasks)
  const log = data.activityLog ?? []
  const filtered: ActivityLogEntry[] = []
  for (const e of log) {
    if (e.entityType === 'workItem' && e.entityId === workItemId) {
      filtered.push(e)
    } else if (e.entityType === 'task') {
      if (taskIds.has(e.entityId)) {
        filtered.push(e)
      } else if (typeof e.before === 'object' && e.before && (e.before as Record<string, unknown>).workItemId === workItemId) {
        filtered.push(e)
      } else if (typeof e.after === 'object' && e.after && (e.after as Record<string, unknown>).workItemId === workItemId) {
        filtered.push(e)
      }
    }
    if (filtered.length >= limit) break
  }
  return filtered
}

export function isCompletionEvent(entry: ActivityLogEntry): boolean {
  if (entry.action !== 'status_changed' && entry.action !== 'updated') return false
  const after = entry.after
  if (!after || typeof after !== 'object') return false
  return (after as Record<string, unknown>).status === 'Completato'
}

export function getCompletionsInRange(
  data: AppData,
  startISO: string,
  endISO: string,
): { workItemIds: Set<string>; taskIds: Set<string> } {
  const workItemIds = new Set<string>()
  const taskIds = new Set<string>()
  const log = data.activityLog ?? []
  for (const e of log) {
    const day = e.timestamp.slice(0, 10)
    if (day < startISO || day > endISO) continue
    if (!isCompletionEvent(e)) continue
    if (e.entityType === 'workItem') workItemIds.add(e.entityId)
    else if (e.entityType === 'task') taskIds.add(e.entityId)
  }
  return { workItemIds, taskIds }
}
