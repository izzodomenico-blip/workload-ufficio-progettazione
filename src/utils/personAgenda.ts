import type { Absence, AppData, Person, Task, WorkItem } from '../types'
import { isOpen } from '../types'
import {
  addDays,
  endOfWeek,
  formatISODate,
  isoWeekNumber,
  startOfWeek,
} from './dates'
import {
  computeWorkload,
  getWorkloadActivitiesForPerson,
  workItemResponsibleIds,
  type WorkloadActivity,
  type WorkloadResult,
} from './workload'
import { calculateExpectedProgress, getTaskHealth, getWorkItemHealth, type HealthStatus } from './progress'
import { getAbsencesInRange, getAssigneeAbsencesDuringTask } from './availability'

export interface WeekAgendaActivity {
  activity: WorkloadActivity
  task?: Task
  workItem?: WorkItem
  health: HealthStatus
  expectedProgress: number
  hoursInWeek: number
  hasAbsenceConflict: boolean
  startsInWeek: boolean
  endsInWeek: boolean
  spansThroughWeek: boolean
}

export type WeekAgendaTask = WeekAgendaActivity

export interface WeekAgenda {
  weekIso: number
  weekStart: Date
  weekEnd: Date
  weekStartISO: string
  weekEndISO: string
  workload: WorkloadResult
  tasks: WeekAgendaActivity[]
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

export type TimelineKind =
  | 'task-start'
  | 'task-due'
  | 'workitem-start'
  | 'workitem-due'
  | 'absence-start'
  | 'absence-end'

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

function healthForActivity(activity: WorkloadActivity, workItem: WorkItem | undefined, todayISO: string, hasConflict = false): HealthStatus {
  if (activity.kind === 'task' && activity.task) {
    return getTaskHealth(activity.task, todayISO, hasConflict)
  }
  return workItem ? getWorkItemHealth(workItem, [], todayISO) : 'ok'
}

function absencesForPersonDuringActivity(person: Person, absences: Absence[], activity: WorkloadActivity): Absence[] {
  if (activity.kind === 'task' && activity.task) {
    return getAssigneeAbsencesDuringTask(activity.task.assigneeId, absences, activity.startDate, activity.dueDate)
  }
  return getAbsencesInRange(
    absences.filter((a) => a.personId === person.id),
    activity.startDate,
    activity.dueDate,
  )
}

function buildWeekAgenda(
  person: Person,
  tasks: Task[],
  absences: Absence[],
  workItems: WorkItem[],
  ref: Date,
  todayISO: string,
  today: Date = new Date(),
): WeekAgenda {
  const ws = startOfWeek(ref)
  const we = endOfWeek(ref)
  const wsISO = formatISODate(ws)
  const weISO = formatISODate(we)
  const workload = computeWorkload(person, tasks, absences, ws, workItems, today)
  const workItemById = new Map(workItems.map((w) => [w.id, w]))

  const activities = getWorkloadActivitiesForPerson(person, tasks, workItems, ws, we, today)
  const weekTasks: WeekAgendaActivity[] = activities.map((activity) => {
    const workItem = activity.workItem ?? workItemById.get(activity.workItemId)
    const conflicts = absencesForPersonDuringActivity(person, absences, activity)
    return {
      activity,
      task: activity.task,
      workItem,
      health: healthForActivity(activity, workItem, todayISO, conflicts.length > 0),
      expectedProgress: calculateExpectedProgress(activity.startDate, activity.dueDate, todayISO),
      hoursInWeek: activity.hoursInWeek,
      hasAbsenceConflict: conflicts.length > 0,
      startsInWeek: activity.startDate >= wsISO && activity.startDate <= weISO,
      endsInWeek: activity.dueDate >= wsISO && activity.dueDate <= weISO,
      spansThroughWeek: activity.startDate < wsISO && activity.dueDate > weISO,
    }
  })

  weekTasks.sort((a, b) => {
    const o = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]
    if (o !== 0) return o
    return a.activity.dueDate.localeCompare(b.activity.dueDate)
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
): WeekAgendaActivity[] {
  const person = data.people.find((p) => p.id === personId)
  if (!person) return []
  const todayISO = formatISODate(today)
  return buildWeekAgenda(person, data.tasks, data.absences, data.workItems, today, todayISO, today).tasks
}

export function getPersonNextWeekTasks(
  data: AppData,
  personId: string,
  today: Date = new Date(),
): WeekAgendaActivity[] {
  const person = data.people.find((p) => p.id === personId)
  if (!person) return []
  const todayISO = formatISODate(today)
  return buildWeekAgenda(person, data.tasks, data.absences, data.workItems, addDays(today, 7), todayISO, today).tasks
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
  _tasks: Task[],
  workItems: WorkItem[],
  current: WeekAgenda,
  todayISO: string,
): PersonStats {
  let openTasks = 0
  let delayedTasks = 0
  let riskTasks = 0
  let waitingTasks = 0
  let completedTasks = 0

  // Statistiche guidate dai LAVORI (coerenti col carico). I task non vengono
  // conteggiati: sono un dettaglio facoltativo del lavoro.
  for (const w of workItems) {
    const responsible = workItemResponsibleIds(w)
    if (!responsible.includes(person.id)) continue
    if (w.status === 'Completato') {
      completedTasks++
      continue
    }
    if (!isOpen(w.status)) continue
    openTasks++
    if (w.status === 'In attesa') waitingTasks++
    const h = getWorkItemHealth(w, [], todayISO)
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

  const seenActivities = new Map<string, WeekAgendaActivity>()
  for (const wt of [...current.tasks, ...next.tasks]) {
    const key = `${wt.activity.kind}:${wt.activity.id}`
    if (!seenActivities.has(key)) seenActivities.set(key, wt)
  }
  for (const wt of seenActivities.values()) {
    const isTask = wt.activity.kind === 'task'
    if (wt.activity.startDate >= rangeStart && wt.activity.startDate <= rangeEnd) {
      events.push({
        kind: isTask ? 'task-start' : 'workitem-start',
        date: wt.activity.startDate,
        task: wt.task,
        workItem: wt.workItem,
        health: wt.health,
        label: `${isTask ? 'Inizio task' : 'Inizio lavoro'} · ${wt.activity.title}`,
      })
    }
    if (wt.activity.dueDate >= rangeStart && wt.activity.dueDate <= rangeEnd) {
      events.push({
        kind: isTask ? 'task-due' : 'workitem-due',
        date: wt.activity.dueDate,
        task: wt.task,
        workItem: wt.workItem,
        health: wt.health,
        label: `${isTask ? 'Scadenza task' : 'Scadenza lavoro'} · ${wt.activity.title}`,
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
    const order: Record<TimelineKind, number> = {
      'task-due': 0,
      'workitem-due': 1,
      'absence-start': 2,
      'absence-end': 3,
      'task-start': 4,
      'workitem-start': 5,
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
  const current = buildWeekAgenda(person, data.tasks, data.absences, data.workItems, today, todayISO, today)
  const next = buildWeekAgenda(person, data.tasks, data.absences, data.workItems, addDays(today, 7), todayISO, today)
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
  const currentWeek = buildWeekAgenda(person, data.tasks, data.absences, data.workItems, today, todayISO, today)
  const nextWeek = buildWeekAgenda(person, data.tasks, data.absences, data.workItems, addDays(today, 7), todayISO, today)
  const stats = computePersonStats(person, data.tasks, data.workItems, currentWeek, todayISO)
  const timeline = buildTimeline(currentWeek, nextWeek)
  return { person, currentWeek, nextWeek, stats, timeline }
}
