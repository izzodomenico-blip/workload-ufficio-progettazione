import type { Absence, AppData, Person, Task } from '../types'
import { CLOSED_STATUSES, isOpen } from '../types'
import {
  addDays,
  endOfWeek,
  formatISODate,
  isoWeekNumber,
  startOfWeek,
  workingDaysOverlap,
} from './dates'
import { computeWorkload, type WorkloadLevel } from './workload'
import { getTaskHealth } from './progress'

export interface PlanningWeek {
  index: number
  weekIso: number
  weekStart: Date
  weekEnd: Date
  weekStartISO: string
  weekEndISO: string
  weekLabel: string
  weekRangeLabel: string
}

export interface PersonWeekCell {
  weekIndex: number
  weekIso: number
  weekStart: Date
  weekEnd: Date
  weekStartISO: string
  weekEndISO: string
  weekLabel: string
  weekRangeLabel: string
  assignedHours: number
  theoreticalCapacity: number
  absenceHours: number
  realCapacity: number
  loadPercent: number
  level: WorkloadLevel
  taskCount: number
  riskCount: number
  delayCount: number
  hasTasksDuringAbsence: boolean
  isFullyAbsent: boolean
}

export interface PersonPlanningRow {
  person: Person
  weeks: PersonWeekCell[]
}

export interface PlanningMatrix {
  weeks: PlanningWeek[]
  rows: PersonPlanningRow[]
  summary: {
    criticalWeeks: number
    overloadedPeople: number
    totalPlannedHours: number
    totalAbsenceHours: number
  }
}

const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

function shortRange(ws: Date, we: Date): string {
  const sameMonth = ws.getMonth() === we.getMonth()
  if (sameMonth) return `${ws.getDate()}-${we.getDate()} ${MONTHS_SHORT[ws.getMonth()]}`
  return `${ws.getDate()} ${MONTHS_SHORT[ws.getMonth()]} – ${we.getDate()} ${MONTHS_SHORT[we.getMonth()]}`
}

export function getPlanningWeeks(today: Date = new Date(), count: number = 4): PlanningWeek[] {
  const out: PlanningWeek[] = []
  for (let i = 0; i < count; i++) {
    const ref = addDays(today, i * 7)
    const ws = startOfWeek(ref)
    const we = endOfWeek(ref)
    const iso = isoWeekNumber(ws)
    out.push({
      index: i,
      weekIso: iso,
      weekStart: ws,
      weekEnd: we,
      weekStartISO: formatISODate(ws),
      weekEndISO: formatISODate(we),
      weekLabel: `S${iso}`,
      weekRangeLabel: shortRange(ws, we),
    })
  }
  return out
}

export function computePersonWeeklyPlanning(
  person: Person,
  tasks: Task[],
  absences: Absence[],
  week: PlanningWeek,
): PersonWeekCell {
  // Riusa la logica esistente per la singola settimana
  const w = computeWorkload(person, tasks, absences, week.weekStart)

  // Conta task per persona attivi nella settimana e classifica salute
  const todayISO = formatISODate(new Date())
  let riskCount = 0
  let delayCount = 0
  for (const t of tasks) {
    if (t.assigneeId !== person.id) continue
    if (!isOpen(t.status)) continue
    const overlap = workingDaysOverlap(t.startDate, t.dueDate, week.weekStart, week.weekEnd)
    if (overlap === 0) continue
    const health = getTaskHealth(t, todayISO)
    if (health === 'in ritardo') delayCount++
    else if (health === 'a rischio') riskCount++
  }

  // hasTasksDuringAbsence circoscritto a questa settimana
  const personAbsences = absences.filter((a) => a.personId === person.id)
  const weekAbsences = personAbsences.filter(
    (a) => a.startDate <= week.weekEndISO && a.endDate >= week.weekStartISO,
  )
  let hasTasksDuringAbsence = false
  if (weekAbsences.length > 0) {
    for (const t of tasks) {
      if (t.assigneeId !== person.id) continue
      if (CLOSED_STATUSES.includes(t.status)) continue
      const overlap = workingDaysOverlap(t.startDate, t.dueDate, week.weekStart, week.weekEnd)
      if (overlap === 0) continue
      for (const a of weekAbsences) {
        if (t.startDate <= a.endDate && a.startDate <= t.dueDate) {
          hasTasksDuringAbsence = true
          break
        }
      }
      if (hasTasksDuringAbsence) break
    }
  }

  return {
    weekIndex: week.index,
    weekIso: week.weekIso,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    weekStartISO: week.weekStartISO,
    weekEndISO: week.weekEndISO,
    weekLabel: week.weekLabel,
    weekRangeLabel: week.weekRangeLabel,
    assignedHours: w.weekHours,
    theoreticalCapacity: w.capacityHours,
    absenceHours: w.absenceHours,
    realCapacity: w.realCapacityHours,
    loadPercent: w.loadPercent,
    level: w.level,
    taskCount: w.taskCount,
    riskCount,
    delayCount,
    hasTasksDuringAbsence,
    isFullyAbsent: w.isFullyAbsent,
  }
}

export function computePlanningMatrix(
  data: AppData,
  today: Date = new Date(),
  count: number = 4,
): PlanningMatrix {
  const weeks = getPlanningWeeks(today, count)
  const activePeople = data.people.filter((p) => p.active)

  const rows: PersonPlanningRow[] = activePeople.map((person) => ({
    person,
    weeks: weeks.map((w) => computePersonWeeklyPlanning(person, data.tasks, data.absences, w)),
  }))

  let criticalWeeks = 0
  let totalPlannedHours = 0
  let totalAbsenceHours = 0
  const overloadedPeopleSet = new Set<string>()

  for (let i = 0; i < weeks.length; i++) {
    let isCritical = false
    for (const row of rows) {
      const cell = row.weeks[i]
      if (cell.level === 'overloaded') {
        overloadedPeopleSet.add(row.person.id)
        isCritical = true
      }
      if (cell.delayCount > 0 || cell.riskCount > 0) isCritical = true
      if (cell.isFullyAbsent && cell.assignedHours > 0) isCritical = true
      if (cell.hasTasksDuringAbsence) isCritical = true
    }
    if (isCritical) criticalWeeks++
  }

  for (const row of rows) {
    for (const cell of row.weeks) {
      totalPlannedHours += cell.assignedHours
      totalAbsenceHours += cell.absenceHours
    }
  }

  return {
    weeks,
    rows,
    summary: {
      criticalWeeks,
      overloadedPeople: overloadedPeopleSet.size,
      totalPlannedHours: Math.round(totalPlannedHours * 10) / 10,
      totalAbsenceHours: Math.round(totalAbsenceHours * 10) / 10,
    },
  }
}

/**
 * Restituisce i task aperti di una persona che hanno overlap con la settimana data.
 * Ordinati per scadenza crescente.
 */
export function getTasksForPersonInWeek(
  person: Person,
  tasks: Task[],
  week: PlanningWeek,
): Task[] {
  return tasks
    .filter((t) => {
      if (t.assigneeId !== person.id) return false
      if (CLOSED_STATUSES.includes(t.status)) return false
      const overlap = workingDaysOverlap(t.startDate, t.dueDate, week.weekStart, week.weekEnd)
      return overlap > 0
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

/**
 * Restituisce le assenze di una persona che si sovrappongono alla settimana data.
 */
export function getAbsencesForPersonInWeek(
  personId: string,
  absences: Absence[],
  week: PlanningWeek,
): Absence[] {
  return absences.filter(
    (a) =>
      a.personId === personId &&
      a.startDate <= week.weekEndISO &&
      a.endDate >= week.weekStartISO,
  )
}
