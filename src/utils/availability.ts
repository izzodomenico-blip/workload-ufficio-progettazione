import type { Absence, Person, Task } from '../types'
import { CLOSED_STATUSES } from '../types'
import { formatISODate, parseISODate } from './dates'

function isWorkingDay(date: Date): boolean {
  const d = date.getDay()
  return d !== 0 && d !== 6
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

export function getAbsencesForPerson(personId: string, absences: Absence[]): Absence[] {
  return absences.filter((a) => a.personId === personId)
}

export function getAbsencesInRange(absences: Absence[], startDate: string, endDate: string): Absence[] {
  return absences.filter((a) => rangesOverlap(a.startDate, a.endDate, startDate, endDate))
}

export function isPersonAbsentOnDate(personId: string, date: Date, absences: Absence[]): boolean {
  if (!isWorkingDay(date)) return false
  const iso = formatISODate(date)
  return absences.some((a) => a.personId === personId && a.startDate <= iso && iso <= a.endDate)
}

/**
 * Restituisce le ore di assenza di una persona nei giorni lavorativi (lun-ven)
 * compresi tra weekStart e weekEnd inclusi. Se più assenze si sovrappongono
 * sullo stesso giorno, prende la massima (no double count).
 */
export function getAbsenceHoursForPersonInWeek(
  personId: string,
  absences: Absence[],
  weekStart: Date,
  weekEnd: Date,
): number {
  const relevant = absences.filter((a) => a.personId === personId)
  if (relevant.length === 0) return 0
  let total = 0
  const cursor = new Date(weekStart)
  cursor.setHours(0, 0, 0, 0)
  const limit = new Date(weekEnd)
  limit.setHours(23, 59, 59, 999)
  while (cursor.getTime() <= limit.getTime()) {
    if (isWorkingDay(cursor)) {
      const iso = formatISODate(cursor)
      let maxHours = 0
      for (const a of relevant) {
        if (a.startDate <= iso && iso <= a.endDate) {
          if (a.hoursPerDay > maxHours) maxHours = a.hoursPerDay
        }
      }
      total += maxHours
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return total
}

export function getRealWeeklyCapacity(
  person: Person,
  absences: Absence[],
  weekStart: Date,
  weekEnd: Date,
): number {
  const absenceHours = getAbsenceHoursForPersonInWeek(person.id, absences, weekStart, weekEnd)
  return Math.max(0, person.weeklyCapacityHours - absenceHours)
}

/**
 * Vero se l'assegnatario di un task ha una o più assenze il cui periodo
 * si sovrappone, anche solo parzialmente, al periodo del task.
 */
export function getAssigneeAbsencesDuringTask(
  assigneeId: string,
  absences: Absence[],
  taskStart: string,
  taskEnd: string,
): Absence[] {
  return absences.filter(
    (a) => a.personId === assigneeId && rangesOverlap(a.startDate, a.endDate, taskStart, taskEnd),
  )
}

/**
 * Vero se la persona ha task aperti il cui periodo intercetta una sua assenza
 * (utile per segnalare conflitti pianificazione/assenza).
 */
export function personHasTasksDuringAbsences(personId: string, tasks: Task[], absences: Absence[]): boolean {
  const personAbsences = absences.filter((a) => a.personId === personId)
  if (personAbsences.length === 0) return false
  for (const t of tasks) {
    if (t.assigneeId !== personId) continue
    if (CLOSED_STATUSES.includes(t.status)) continue
    for (const a of personAbsences) {
      if (rangesOverlap(t.startDate, t.dueDate, a.startDate, a.endDate)) return true
    }
  }
  return false
}

/** Ore working-day in cui un'assenza ricade nel range [start, end]. */
export function absenceWorkingDaysInRange(absence: Absence, start: string, end: string): number {
  const aStart = absence.startDate < start ? start : absence.startDate
  const aEnd = absence.endDate > end ? end : absence.endDate
  if (aEnd < aStart) return 0
  let count = 0
  const cursor = parseISODate(aStart)
  const limit = parseISODate(aEnd)
  while (cursor.getTime() <= limit.getTime()) {
    if (isWorkingDay(cursor)) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}
