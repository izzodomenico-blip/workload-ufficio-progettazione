import type { Person, Task } from '../types'
import { CLOSED_STATUSES } from '../types'
import { endOfWeek, startOfWeek, workingDaysBetween, workingDaysOverlap } from './dates'

export interface WorkloadResult {
  personId: string
  weekHours: number
  capacityHours: number
  loadPercent: number
  level: WorkloadLevel
  taskCount: number
}

export type WorkloadLevel = 'available' | 'normal' | 'full' | 'overloaded'

export function loadLevel(percent: number): WorkloadLevel {
  if (percent <= 60) return 'available'
  if (percent <= 85) return 'normal'
  if (percent <= 100) return 'full'
  return 'overloaded'
}

export const LOAD_LABELS: Record<WorkloadLevel, string> = {
  available: 'disponibile',
  normal: 'carico normale',
  full: 'pieno',
  overloaded: 'sovraccarico',
}

export const LOAD_BAR_CLASS: Record<WorkloadLevel, string> = {
  available: 'bg-emerald-500',
  normal: 'bg-amber-400',
  full: 'bg-orange-500',
  overloaded: 'bg-red-500',
}

export const LOAD_TEXT_CLASS: Record<WorkloadLevel, string> = {
  available: 'text-emerald-300',
  normal: 'text-amber-300',
  full: 'text-orange-300',
  overloaded: 'text-red-300',
}

export const LOAD_RING_CLASS: Record<WorkloadLevel, string> = {
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

export function computeWorkload(person: Person, tasks: Task[], reference: Date = new Date()): WorkloadResult {
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
  const percent = capacity > 0 ? (weekHours / capacity) * 100 : 0
  return {
    personId: person.id,
    weekHours: Math.round(weekHours * 10) / 10,
    capacityHours: capacity,
    loadPercent: Math.round(percent),
    level: loadLevel(percent),
    taskCount: counted,
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
