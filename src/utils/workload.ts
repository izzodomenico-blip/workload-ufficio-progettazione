import type { Absence, Person, Task } from '../types'
import { CLOSED_STATUSES } from '../types'
import { endOfWeek, startOfWeek, workingDaysBetween, workingDaysOverlap } from './dates'
import { getAbsenceHoursForPersonInWeek, personHasTasksDuringAbsences } from './availability'

export interface WorkloadResult {
  personId: string
  weekHours: number
  capacityHours: number
  absenceHours: number
  realCapacityHours: number
  loadPercent: number
  level: WorkloadLevel
  taskCount: number
  isFullyAbsent: boolean
  hasTasksDuringAbsence: boolean
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

function isCountableForLoad(t: Task): boolean {
  if (CLOSED_STATUSES.includes(t.status)) return false
  return true
}

export function hoursAssignedInWeek(task: Task, weekStart: Date, weekEnd: Date): number {
  const totalDays = workingDaysBetween(task.startDate, task.dueDate)
  const overlap = workingDaysOverlap(task.startDate, task.dueDate, weekStart, weekEnd)
  if (overlap === 0) return 0
  if (totalDays === 0) return task.estimatedHours
  const remainingFraction = Math.max(0, 1 - task.progressPercent / 100)
  return task.estimatedHours * remainingFraction * (overlap / totalDays)
}

export function computeWorkload(
  person: Person,
  tasks: Task[],
  absences: Absence[],
  reference: Date = new Date(),
): WorkloadResult {
  const ws = startOfWeek(reference)
  const we = endOfWeek(reference)
  const personTasks = tasks.filter((t) => t.assigneeId === person.id && isCountableForLoad(t))
  let weekHours = 0
  let counted = 0
  for (const t of personTasks) {
    const h = hoursAssignedInWeek(t, ws, we)
    if (h > 0) {
      weekHours += h
      counted++
    }
  }
  const capacity = person.weeklyCapacityHours
  const absenceHours = getAbsenceHoursForPersonInWeek(person.id, absences, ws, we)
  const realCapacity = Math.max(0, capacity - absenceHours)
  const isFullyAbsent = realCapacity === 0 && absenceHours > 0

  let percent = 0
  if (realCapacity > 0) {
    percent = (weekHours / realCapacity) * 100
  } else if (weekHours > 0) {
    // capacità zero con task assegnati — segnala saturazione massima
    percent = 999
  }

  const level: WorkloadLevel = isFullyAbsent ? 'absent' : loadLevel(percent)
  const hasTasksDuringAbsence = personHasTasksDuringAbsences(person.id, tasks, absences)

  return {
    personId: person.id,
    weekHours: Math.round(weekHours * 10) / 10,
    capacityHours: capacity,
    absenceHours: Math.round(absenceHours * 10) / 10,
    realCapacityHours: Math.round(realCapacity * 10) / 10,
    loadPercent: Math.round(percent),
    level,
    taskCount: counted,
    isFullyAbsent,
    hasTasksDuringAbsence,
  }
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
