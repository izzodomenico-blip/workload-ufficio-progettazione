import type { Absence, Person, Status, Task, WorkItem } from '../types'
import { CLOSED_STATUSES } from '../types'
import { endOfWeek, formatISODate, startOfWeek, workingDaysBetween, workingDaysOverlap } from './dates'
import { getAbsenceHoursForPersonInWeek } from './availability'

export interface WorkloadResult {
  personId: string
  /** Ore totali settimanali considerate (dichiarate + base) */
  weekHours: number
  /** Solo ore da task/lavori dichiarati */
  declaredHours: number
  /** Ore derivate dal carico base configurato sulla persona */
  baselineHours: number
  /** % carico base configurato sulla persona (0 se non impostato) */
  baselinePercent: number
  capacityHours: number
  absenceHours: number
  realCapacityHours: number
  loadPercent: number
  level: WorkloadLevel
  taskCount: number
  activityCount: number
  isFullyAbsent: boolean
  hasTasksDuringAbsence: boolean
}

export type WorkloadActivityKind = 'task' | 'workItem'

export interface WorkloadActivity {
  kind: WorkloadActivityKind
  id: string
  workItemId: string
  title: string
  status: Status
  startDate: string
  dueDate: string
  estimatedHours: number
  progressPercent: number
  hoursInWeek: number
  remainingHours: number
  task?: Task
  workItem?: WorkItem
}

export type WorkloadLevel = 'absent' | 'available' | 'normal' | 'full' | 'overloaded'

export function loadLevel(percent: number): Exclude<WorkloadLevel, 'absent'> {
  if (percent <= 60) return 'available'
  if (percent <= 85) return 'normal'
  if (percent <= 100) return 'full'
  return 'overloaded'
}

export const LOAD_LABELS: Record<WorkloadLevel, string> = {
  absent: 'assente',
  available: 'disponibile',
  normal: 'carico normale',
  full: 'pieno',
  overloaded: 'sovraccarico',
}

export const LOAD_BAR_CLASS: Record<WorkloadLevel, string> = {
  absent: 'bg-zinc-500',
  available: 'bg-emerald-500',
  normal: 'bg-amber-400',
  full: 'bg-orange-500',
  overloaded: 'bg-red-500',
}

export const LOAD_TEXT_CLASS: Record<WorkloadLevel, string> = {
  absent: 'text-zinc-300',
  available: 'text-emerald-300',
  normal: 'text-amber-300',
  full: 'text-orange-300',
  overloaded: 'text-red-300',
}

export const LOAD_RING_CLASS: Record<WorkloadLevel, string> = {
  absent: 'ring-zinc-500/40',
  available: 'ring-emerald-500/30',
  normal: 'ring-amber-400/30',
  full: 'ring-orange-500/40',
  overloaded: 'ring-red-500/50',
}

function isCountableForLoad(entity: Pick<Task | WorkItem, 'status'>): boolean {
  if (CLOSED_STATUSES.includes(entity.status)) return false
  return true
}

/**
 * Calcola le ore di un task/lavoro che ricadono in una specifica settimana.
 *
 * Le ore residue (stimate × (1 − avanzamento)) vengono distribuite **dal giorno
 * di riferimento (oggi) alla scadenza**, non sull'intero arco originale del
 * task. Conseguenze:
 *  - un task con poco tempo residuo e poco avanzamento concentra molte ore
 *    nella settimana corrente (riflette l'urgenza reale)
 *  - un task scaduto con ore residue > 0 viene tutto attribuito alla settimana
 *    che contiene "oggi" (urgenza massima)
 *  - per settimane future, le ore arrivano solo se la scadenza è oltre quella
 *    settimana e da oggi rimangono giorni sufficienti per attraversarla
 *
 * @param today Riferimento "oggi" — per la pianificazione futura resta il giorno
 *              attuale, non l'inizio della settimana analizzata.
 */
export function hoursAssignedInWeek(
  item: Pick<Task | WorkItem, 'startDate' | 'dueDate' | 'estimatedHours' | 'progressPercent'>,
  weekStart: Date,
  weekEnd: Date,
  today: Date = new Date(),
): number {
  const remainingFraction = Math.max(0, 1 - item.progressPercent / 100)
  const remainingHours = item.estimatedHours * remainingFraction
  if (remainingHours === 0) return 0

  const todayISO = formatISODate(today)
  // Le ore residue si distribuiscono solo da oggi in avanti, mai retroattivamente.
  // Se il task inizia in futuro, si distribuiscono dal suo inizio.
  const effectiveStartISO = todayISO > item.startDate ? todayISO : item.startDate

  // Task scaduto con residuo > 0: tutta l'urgenza ricade sulla settimana corrente.
  if (effectiveStartISO > item.dueDate) {
    const isCurrentWeek = today >= weekStart && today <= weekEnd
    return isCurrentWeek ? remainingHours : 0
  }

  const overlap = workingDaysOverlap(effectiveStartISO, item.dueDate, weekStart, weekEnd)
  if (overlap === 0) return 0
  const remainingDays = workingDaysBetween(effectiveStartISO, item.dueDate)
  // Caso limite: solo weekend tra oggi e scadenza ma c'è overlap → tutto in quella settimana.
  if (remainingDays === 0) return remainingHours
  return remainingHours * (overlap / remainingDays)
}

/**
 * Attività che concorrono al carico di una persona in una settimana.
 *
 * Il carico è guidato dai **LAVORI** (ore stimate + assegnatari), non dai task.
 * I task sono un dettaglio facoltativo del lavoro e NON incidono sul carico
 * percentuale: servono solo a descrivere dinamiche interne. Per questo qui si
 * considerano esclusivamente i `workItems`.
 *
 * Distribuzione: le ore del lavoro si dividono tra gli assegnatari. Se il lavoro
 * non ha assegnatari, il carico ricade sull'owner (responsabile) del lavoro.
 */
export function getWorkloadActivitiesForPerson(
  person: Person,
  _tasks: Task[],
  workItems: WorkItem[] = [],
  weekStart: Date = startOfWeek(new Date()),
  weekEnd: Date = endOfWeek(weekStart),
  today: Date = new Date(),
): WorkloadActivity[] {
  const activities: WorkloadActivity[] = []

  for (const item of workItems) {
    if (!isCountableForLoad(item)) continue
    const responsible = workItemResponsibleIds(item)
    if (!responsible.includes(person.id)) continue
    const assigneeCount = Math.max(1, responsible.length)
    const perPersonItem = {
      ...item,
      estimatedHours: item.estimatedHours / assigneeCount,
    }
    const hoursInWeek = hoursAssignedInWeek(perPersonItem, weekStart, weekEnd, today)
    if (hoursInWeek <= 0) continue
    const remainingHours = Math.max(0, item.estimatedHours * (1 - item.progressPercent / 100)) / assigneeCount
    activities.push({
      kind: 'workItem',
      id: item.id,
      workItemId: item.id,
      title: item.title,
      status: item.status,
      startDate: item.startDate,
      dueDate: item.dueDate,
      estimatedHours: item.estimatedHours / assigneeCount,
      progressPercent: item.progressPercent,
      hoursInWeek: Math.round(hoursInWeek * 10) / 10,
      remainingHours: Math.round(remainingHours * 10) / 10,
      workItem: item,
    })
  }

  return activities.sort((a, b) => {
    const due = a.dueDate.localeCompare(b.dueDate)
    if (due !== 0) return due
    return b.remainingHours - a.remainingHours
  })
}

/**
 * Persone su cui ricade il carico di un lavoro: gli assegnatari, oppure l'owner
 * se non ci sono assegnatari. Garantisce che ogni lavoro con ore atterri sempre
 * su qualcuno.
 */
export function workItemResponsibleIds(item: Pick<WorkItem, 'assigneeIds' | 'ownerId'>): string[] {
  if (item.assigneeIds.length > 0) return item.assigneeIds
  return item.ownerId ? [item.ownerId] : []
}

function personHasActivitiesDuringAbsences(
  personId: string,
  activities: WorkloadActivity[],
  absences: Absence[],
): boolean {
  const personAbsences = absences.filter((absence) => absence.personId === personId)
  if (personAbsences.length === 0) return false
  return activities.some((activity) =>
    personAbsences.some((absence) => activity.startDate <= absence.endDate && absence.startDate <= activity.dueDate),
  )
}

export function computeWorkload(
  person: Person,
  tasks: Task[],
  absences: Absence[],
  reference: Date = new Date(),
  workItems: WorkItem[] = [],
  today: Date = new Date(),
): WorkloadResult {
  const ws = startOfWeek(reference)
  const we = endOfWeek(reference)
  const activities = getWorkloadActivitiesForPerson(person, tasks, workItems, ws, we, today)
  let declaredHours = 0
  let counted = 0
  for (const activity of activities) {
    if (activity.hoursInWeek > 0) {
      declaredHours += activity.hoursInWeek
      counted++
    }
  }
  const capacity = person.weeklyCapacityHours
  const absenceHours = getAbsenceHoursForPersonInWeek(person.id, absences, ws, we)
  const realCapacity = Math.max(0, capacity - absenceHours)
  const isFullyAbsent = realCapacity === 0 && absenceHours > 0

  // Carico base: % della capacità REALE. Si scala automaticamente con le assenze:
  // capacità reale 0 → 0 ore base.
  const baselinePercent = clampPercent(person.baselineLoadPercent ?? 0)
  const baselineHours = isFullyAbsent ? 0 : (realCapacity * baselinePercent) / 100

  const weekHours = declaredHours + baselineHours

  let percent = 0
  if (realCapacity > 0) {
    percent = (weekHours / realCapacity) * 100
  } else if (weekHours > 0) {
    // capacità zero con task assegnati — segnala saturazione massima
    percent = 999
  }

  const level: WorkloadLevel = isFullyAbsent ? 'absent' : loadLevel(percent)
  const hasTasksDuringAbsence = personHasActivitiesDuringAbsences(person.id, activities, absences)

  return {
    personId: person.id,
    weekHours: round1(weekHours),
    declaredHours: round1(declaredHours),
    baselineHours: round1(baselineHours),
    baselinePercent,
    capacityHours: capacity,
    absenceHours: round1(absenceHours),
    realCapacityHours: round1(realCapacity),
    loadPercent: Math.round(percent),
    level,
    taskCount: counted,
    activityCount: counted,
    isFullyAbsent,
    hasTasksDuringAbsence,
  }
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function topWorkloadActivitiesForPerson(
  tasks: Task[],
  workItems: WorkItem[],
  person: Person,
  limit = 3,
  reference: Date = new Date(),
  today: Date = new Date(),
): WorkloadActivity[] {
  const ws = startOfWeek(reference)
  const we = endOfWeek(reference)
  return getWorkloadActivitiesForPerson(person, tasks, workItems, ws, we, today).slice(0, limit)
}

export function topTasksForPerson(tasks: Task[], personId: string, limit = 3): Task[] {
  return tasks
    .filter((t) => t.assigneeId === personId && isCountableForLoad(t))
    .sort((a, b) => {
      // overdue first, then earliest due, then highest remaining hours
      const ar = a.dueDate.localeCompare(b.dueDate)
      if (ar !== 0) return ar
      const remA = a.estimatedHours * (1 - a.progressPercent / 100)
      const remB = b.estimatedHours * (1 - b.progressPercent / 100)
      return remB - remA
    })
    .slice(0, limit)
}
