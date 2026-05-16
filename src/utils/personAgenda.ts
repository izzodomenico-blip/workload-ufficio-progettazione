import type { Absence, AppData, Person, Task, WorkItem } from '../types'
import { CLOSED_STATUSES, isOpen } from '../types'
import {
  addDays,
  endOfWeek,
  formatISODate,
  isoWeekNumber,
  startOfWeek,
  workingDaysOverlap,
} from './dates'
import { computeWorkload, hoursAssignedInWeek, type WorkloadResult } from './workload'
import { calculateExpectedProgress, getTaskHealth, type HealthStatus } from './progress'
import { getAbsencesInRange, getAssigneeAbsencesDuringTask } from './availability'

export interface WeekAgendaTask {
  task: Task
  workItem: WorkItem | undefined
  health: HealthStatus
  expectedProgress: number
  hoursInWeek: number
  hasAbsenceConflict: boolean
  startsInWeek: boolean
  endsInWeek: boolean
  spansThroughWeek: boolean
}

export interface WeekAgenda {
  weekIso: number
  weekStart: Date
  weekEnd: Date
  weekStartISO: string
  weekEndISO: string
  workload: WorkloadResult
  tasks: WeekAgendaTask[]
  absences: Absence[]
}

export interface PersonStats {
  openTasks: number
  delayedTasks: number
  riskTasks: number
  waitingTasks: number
  completedTasks: number
  remainingHoursThisWeek: number
}

export type TimelineKind = 'task-start' | 'task-due' | 'absence-start' | 'absence-end'

export interface TimelineEvent {
  kind: TimelineKind
  date: string
  task?: Task
  workItem?: WorkItem
  absence?: Absence
  health?: HealthStatus
  label: string
}

export interface PersonAgenda {
  person: Person
  currentWeek: WeekAgenda
  nextWeek: WeekAgenda
  stats: PersonStats
  timeline: TimelineEvent[]
}

const HEALTH_ORDER: Record<HealthStatus, number> = {
  'in ritardo': 0,
  'a rischio': 1,
  ok: 2,
  'in attesa': 3,
  sospeso: 4,
  completato: 5,
}

function buildWeekAgenda(
  person: Person,
  tasks: Task[],
  absences: Absence[],
  workItems: WorkItem[],
  ref: Date,
  todayISO: string,
): WeekAgenda {
  const ws = startOfWeek(ref)
  const we = endOfWeek(ref)
  const wsISO = formatISODate(ws)
  const weISO = formatISODate(we)
  const workload = computeWorkload(person, tasks, absences, ws)
  const workItemById = new Map(workItems.map((w) => [w.id, w]))

  const personTasks = tasks.filter((t) => {
    if (t.assigneeId !== person.id) return false
    if (CLOSED_STATUSES.includes(t.status)) return false
    return workingDaysOverlap(t.startDate, t.dueDate, ws, we) > 0
  })

  const weekTasks: WeekAgendaTask[] = personTasks.map((t) => {
    const conflicts = getAssigneeAbsencesDuringTask(t.assigneeId, absences, t.startDate, t.dueDate)
    return {
      task: t,
      workItem: workItemById.get(t.workItemId),
      health: getTaskHealth(t, todayISO, conflicts.length > 0),
      expectedProgress: calculateExpectedProgress(t.startDate, t.dueDate, todayISO),
      hoursInWeek: Math.round(hoursAssignedInWeek(t, ws, we) * 10) / 10,
      hasAbsenceConflict: conflicts.length > 0,
      startsInWeek: t.startDate >= wsISO && t.startDate <= weISO,
      endsInWeek: t.dueDate >= wsISO && t.dueDate <= weISO,
      spansThroughWeek: t.startDate < wsISO && t.dueDate > weISO,
    }
  })

  weekTasks.sort((a, b) => {
    const o = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]
    if (o !== 0) return o
    return a.task.dueDate.localeCompare(b.task.dueDate)
  })

  const weekAbsences = getAbsencesInRange(
    absences.filter((a) => a.personId === person.id),
    wsISO,
    weISO,
  )

  return {
    weekIso: isoWeekNumber(ws),
    weekStart: ws,
    weekEnd: we,
    weekStartISO: wsISO,
    weekEndISO: weISO,
    workload,
    tasks: weekTasks,
    absences: weekAbsences,
  }
}

export function getPersonCurrentWeekTasks(
  data: AppData,
  personId: string,
  today: Date = new Date(),
): WeekAgendaTask[] {
  const person = data.people.find((p) => p.id === personId)
  if (!person) return []
  const todayISO = formatISODate(today)
  return buildWeekAgenda(person, data.tasks, data.absences, data.workItems, today, todayISO).tasks
}

export function getPersonNextWeekTasks(
  data: AppData,
  personId: string,
  today: Date = new Date(),
): WeekAgendaTask[] {
  const person = data.people.find((p) => p.id === personId)
  if (!person) return []
  const todayISO = formatISODate(today)
  return buildWeekAgenda(person, data.tasks, data.absences, data.workItems, addDays(today, 7), todayISO).tasks
}

export function getPersonAbsencesSummary(
  data: AppData,
  personId: string,
  today: Date = new Date(),
): { current: Absence[]; next: Absence[] } {
  const wsCur = startOfWeek(today)
  const weCur = endOfWeek(today)
  const nextRef = addDays(today, 7)
  const wsNext = startOfWeek(nextRef)
  const weNext = endOfWeek(nextRef)
  const personAbsences = data.absences.filter((a) => a.personId === personId)
  return {
    current: getAbsencesInRange(personAbsences, formatISODate(wsCur), formatISODate(weCur)),
    next: getAbsencesInRange(personAbsences, formatISODate(wsNext), formatISODate(weNext)),
  }
}

function computePersonStats(
  person: Person,
  tasks: Task[],
  current: WeekAgenda,
  todayISO: string,
): PersonStats {
  let openTasks = 0
  let delayedTasks = 0
  let riskTasks = 0
  let waitingTasks = 0
  let completedTasks = 0
  for (const t of tasks) {
    if (t.assigneeId !== person.id) continue
    if (t.status === 'Completato') {
      completedTasks++
      continue
    }
    if (!isOpen(t.status)) continue
    openTasks++
    if (t.status === 'In attesa') waitingTasks++
    const h = getTaskHealth(t, todayISO)
    if (h === 'in ritardo') delayedTasks++
    else if (h === 'a rischio') riskTasks++
  }
  const remainingHoursThisWeek = Math.max(
    0,
    Math.round((current.workload.realCapacityHours - current.workload.weekHours) * 10) / 10,
  )
  return {
    openTasks,
    delayedTasks,
    riskTasks,
    waitingTasks,
    completedTasks,
    remainingHoursThisWeek,
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

function buildTimeline(current: WeekAgenda, next: WeekAgenda): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const rangeStart = current.weekStartISO
  const rangeEnd = next.weekEndISO

  const seenTask = new Map<string, WeekAgendaTask>()
  for (const wt of [...current.tasks, ...next.tasks]) {
    if (!seenTask.has(wt.task.id)) seenTask.set(wt.task.id, wt)
  }
  for (const wt of seenTask.values()) {
    if (wt.task.startDate >= rangeStart && wt.task.startDate <= rangeEnd) {
      events.push({
        kind: 'task-start',
        date: wt.task.startDate,
        task: wt.task,
        workItem: wt.workItem,
        health: wt.health,
        label: `Inizio · ${wt.task.title}`,
      })
    }
    if (wt.task.dueDate >= rangeStart && wt.task.dueDate <= rangeEnd) {
      events.push({
        kind: 'task-due',
        date: wt.task.dueDate,
        task: wt.task,
        workItem: wt.workItem,
        health: wt.health,
        label: `Scadenza · ${wt.task.title}`,
      })
    }
  }

  const seenAbsence = new Map<string, Absence>()
  for (const a of [...current.absences, ...next.absences]) {
    if (!seenAbsence.has(a.id)) seenAbsence.set(a.id, a)
  }
  for (const a of seenAbsence.values()) {
    if (a.startDate >= rangeStart && a.startDate <= rangeEnd) {
      events.push({
        kind: 'absence-start',
        date: a.startDate,
        absence: a,
        label: `Inizio assenza · ${capitalize(a.type)}`,
      })
    }
    if (
      a.startDate !== a.endDate &&
      a.endDate >= rangeStart &&
      a.endDate <= rangeEnd
    ) {
      events.push({
        kind: 'absence-end',
        date: a.endDate,
        absence: a,
        label: `Fine assenza · ${capitalize(a.type)}`,
      })
    }
  }

  events.sort((a, b) => {
    const d = a.date.localeCompare(b.date)
    if (d !== 0) return d
    // task-due before task-start same day (for visibility), absence-start before absence-end
    const order: Record<TimelineKind, number> = {
      'task-due': 0,
      'absence-start': 1,
      'absence-end': 2,
      'task-start': 3,
    }
    return order[a.kind] - order[b.kind]
  })
  return events
}

export function getPersonTimeline(
  data: AppData,
  personId: string,
  today: Date = new Date(),
): TimelineEvent[] {
  const person = data.people.find((p) => p.id === personId)
  if (!person) return []
  const todayISO = formatISODate(today)
  const current = buildWeekAgenda(person, data.tasks, data.absences, data.workItems, today, todayISO)
  const next = buildWeekAgenda(person, data.tasks, data.absences, data.workItems, addDays(today, 7), todayISO)
  return buildTimeline(current, next)
}

export function getPersonAgenda(
  data: AppData,
  personId: string,
  today: Date = new Date(),
): PersonAgenda | null {
  const person = data.people.find((p) => p.id === personId)
  if (!person) return null
  const todayISO = formatISODate(today)
  const currentWeek = buildWeekAgenda(person, data.tasks, data.absences, data.workItems, today, todayISO)
  const nextWeek = buildWeekAgenda(person, data.tasks, data.absences, data.workItems, addDays(today, 7), todayISO)
  const stats = computePersonStats(person, data.tasks, currentWeek, todayISO)
  const timeline = buildTimeline(currentWeek, nextWeek)
  return { person, currentWeek, nextWeek, stats, timeline }
}
