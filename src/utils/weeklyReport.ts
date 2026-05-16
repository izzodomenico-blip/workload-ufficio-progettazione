import type { Absence, AppData, Person, Task, WorkItem } from '../types'
import { isOpen } from '../types'
import { computeWorkload } from './workload'
import { calculateExpectedProgress, getTaskHealth, getWorkItemHealth } from './progress'
import {
  getAbsenceHoursForPersonInWeek,
  getAbsencesInRange,
  getAssigneeAbsencesDuringTask,
} from './availability'
import {
  addDays,
  endOfWeek,
  formatISODate,
  isoWeekNumber,
  parseISODate,
  startOfWeek,
} from './dates'
import { getCompletionsInRange } from './activityLog'

const MS_PER_DAY = 86_400_000

const MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]
const DOWS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

function fmtFull(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
function fmtFullWithDow(d: Date): string {
  return `${DOWS[d.getDay()]} ${fmtFull(d)}`
}
function fmtIso(iso: string): string {
  return fmtFull(parseISODate(iso))
}
function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// === report shape =========================================================

export type WorkloadLevel = 'absent' | 'available' | 'normal' | 'full' | 'overloaded'

export interface PersonWorkloadReport {
  person: Person
  capacity: number
  absenceHours: number
  realCapacity: number
  weekHours: number
  loadPercent: number
  level: WorkloadLevel
  hasTasksDuringAbsence: boolean
}

export interface TaskWithReasons {
  task: Task
  expected: number
  reasons: string[]
}

export interface CurrentWeekReport {
  weekIso: number
  weekStart: Date
  weekEnd: Date
  weekStartISO: string
  weekEndISO: string
  summary: {
    openCommesse: number
    openStudi: number
    openInterni: number
    openTasks: number
    completedTasks: number
    completedThisWeekCount: number
    lateTasks: number
    atRiskTasks: number
    avgLoadPercent: number
  }
  workload: PersonWorkloadReport[]
  workItemsByType: {
    commesse: WorkItem[]
    studi: WorkItem[]
    interni: WorkItem[]
  }
  completedThisWeek: {
    workItems: WorkItem[]
    tasks: Task[]
  }
  atRiskOrLate: {
    workItemsLate: WorkItem[]
    workItemsRisk: WorkItem[]
    tasksLate: TaskWithReasons[]
    tasksRisk: TaskWithReasons[]
  }
  absences: Absence[]
  criticalIssues: string[]
}

export interface NextWeekReport {
  weekIso: number
  weekStart: Date
  weekEnd: Date
  weekStartISO: string
  weekEndISO: string
  startingTasks: Task[]
  endingTasks: Task[]
  activeWorkItems: WorkItem[]
  reducedCapacityPeople: { person: Person; absenceHours: number; realCapacity: number }[]
}

const LEVEL_LABEL: Record<WorkloadLevel, string> = {
  absent: 'assente',
  available: 'disponibile',
  normal: 'normale',
  full: 'pieno',
  overloaded: 'sovraccarico',
}

// === computations =========================================================

export function getCurrentWeekReportData(data: AppData, today: Date = new Date()): CurrentWeekReport {
  const weekStart = startOfWeek(today)
  const weekEnd = endOfWeek(today)
  const weekStartISO = formatISODate(weekStart)
  const weekEndISO = formatISODate(weekEnd)
  const todayISO = formatISODate(today)

  // === summary
  const openCommesse = data.workItems.filter((w) => w.type === 'commessa' && isOpen(w.status)).length
  const openStudi = data.workItems.filter((w) => w.type === 'studio' && isOpen(w.status)).length
  const openInterni = data.workItems.filter((w) => w.type === 'interno' && isOpen(w.status)).length
  const openTasks = data.tasks.filter((t) => isOpen(t.status)).length
  const completedTasks = data.tasks.filter((t) => t.status === 'Completato').length
  const lateTasks = data.tasks.filter((t) => isOpen(t.status) && getTaskHealth(t, todayISO) === 'in ritardo').length
  const atRiskTasks = data.tasks.filter((t) => isOpen(t.status) && getTaskHealth(t, todayISO) === 'a rischio').length

  // === workload per person (only active people)
  const activePeople = data.people.filter((p) => p.active)
  const workload: PersonWorkloadReport[] = activePeople.map((p) => {
    const w = computeWorkload(p, data.tasks, data.absences, today)
    return {
      person: p,
      capacity: w.capacityHours,
      absenceHours: w.absenceHours,
      realCapacity: w.realCapacityHours,
      weekHours: w.weekHours,
      loadPercent: w.loadPercent,
      level: w.level,
      hasTasksDuringAbsence: w.hasTasksDuringAbsence,
    }
  })
  const measurable = workload.filter((w) => w.level !== 'absent')
  const avgLoadPercent = measurable.length === 0
    ? 0
    : Math.round(measurable.reduce((s, w) => s + w.loadPercent, 0) / measurable.length)

  // === work items grouped by type (open only, sorted by due)
  const sortByDue = (arr: WorkItem[]) => arr.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const workItemsByType = {
    commesse: sortByDue(data.workItems.filter((w) => w.type === 'commessa' && isOpen(w.status))),
    studi: sortByDue(data.workItems.filter((w) => w.type === 'studio' && isOpen(w.status))),
    interni: sortByDue(data.workItems.filter((w) => w.type === 'interno' && isOpen(w.status))),
  }

  // === completed this week — union di:
  //   1) eventi activityLog con status_changed → Completato in questa settimana
  //   2) fallback legacy: items attualmente Completato con dueDate in questa settimana
  const { workItemIds: logWiIds, taskIds: logTaskIds } = getCompletionsInRange(data, weekStartISO, weekEndISO)
  const logBasedWi = data.workItems.filter((w) => logWiIds.has(w.id))
  const logBasedTasks = data.tasks.filter((t) => logTaskIds.has(t.id))
  const legacyWi = data.workItems.filter((w) => w.status === 'Completato' && w.dueDate >= weekStartISO && w.dueDate <= weekEndISO)
  const legacyTasks = data.tasks.filter((t) => t.status === 'Completato' && t.dueDate >= weekStartISO && t.dueDate <= weekEndISO)
  const completedThisWeek = {
    workItems: Array.from(new Map([...logBasedWi, ...legacyWi].map((w) => [w.id, w])).values()),
    tasks: Array.from(new Map([...logBasedTasks, ...legacyTasks].map((t) => [t.id, t])).values()),
  }
  const completedThisWeekCount = completedThisWeek.workItems.length + completedThisWeek.tasks.length

  // === at risk or late
  const itemTasksMap = new Map<string, Task[]>()
  for (const t of data.tasks) {
    const arr = itemTasksMap.get(t.workItemId) ?? []
    arr.push(t)
    itemTasksMap.set(t.workItemId, arr)
  }

  const workItemsLate: WorkItem[] = []
  const workItemsRisk: WorkItem[] = []
  for (const w of data.workItems) {
    if (!isOpen(w.status)) continue
    const h = getWorkItemHealth(w, itemTasksMap.get(w.id) ?? [], todayISO)
    if (h === 'in ritardo') workItemsLate.push(w)
    else if (h === 'a rischio') workItemsRisk.push(w)
  }

  const tasksLate: TaskWithReasons[] = []
  const tasksRisk: TaskWithReasons[] = []
  for (const t of data.tasks) {
    if (!isOpen(t.status)) continue
    const h = getTaskHealth(t, todayISO)
    if (h !== 'in ritardo' && h !== 'a rischio') continue
    const expected = calculateExpectedProgress(t.startDate, t.dueDate, todayISO)
    const reasons: string[] = []
    if (h === 'in ritardo') reasons.push('scadenza superata')
    if (expected - t.progressPercent >= 20) {
      reasons.push(`avanzamento reale (${t.progressPercent}%) inferiore all’atteso (${expected}%)`)
    }
    const conflicts = getAssigneeAbsencesDuringTask(t.assigneeId, data.absences, t.startDate, t.dueDate)
    if (conflicts.length > 0) reasons.push('assenza dell’assegnatario nel periodo')
    const personLoad = workload.find((pl) => pl.person.id === t.assigneeId)
    if (personLoad?.level === 'overloaded') {
      reasons.push(`assegnatario sovraccarico (${personLoad.loadPercent}%)`)
    } else if (personLoad?.level === 'absent') {
      reasons.push('assegnatario assente tutta la settimana')
    } else if (personLoad && personLoad.absenceHours > 0 && personLoad.realCapacity < personLoad.capacity / 2) {
      reasons.push('capacità ridotta dell’assegnatario')
    }
    if (reasons.length === 0) reasons.push('avanzamento reale sotto l’atteso')
    if (h === 'in ritardo') tasksLate.push({ task: t, expected, reasons })
    else tasksRisk.push({ task: t, expected, reasons })
  }

  // === absences this week
  const absences = getAbsencesInRange(data.absences, weekStartISO, weekEndISO)

  // === critical issues (deduped narrative)
  const personById = new Map(data.people.map((p) => [p.id, p]))
  const criticalIssues: string[] = []

  for (const pl of workload) {
    if (pl.level === 'overloaded') {
      criticalIssues.push(`${pl.person.name} è in sovraccarico (${pl.loadPercent}%) per la settimana corrente.`)
    }
    if (pl.level === 'absent' && pl.weekHours > 0) {
      criticalIssues.push(`${pl.person.name} è assente tutta la settimana ma ha ${pl.weekHours}h di task assegnate.`)
    }
    if (pl.level !== 'absent' && pl.absenceHours > 0 && pl.realCapacity < pl.capacity / 2) {
      criticalIssues.push(`${pl.person.name} ha capacità reale ridotta (${pl.realCapacity} h su ${pl.capacity} h teoriche) per assenze.`)
    }
  }
  for (const tr of tasksLate) {
    const a = personById.get(tr.task.assigneeId)?.name ?? '—'
    criticalIssues.push(`Task "${tr.task.title}" (${a}) in ritardo.`)
  }
  for (const tr of tasksRisk) {
    const a = personById.get(tr.task.assigneeId)?.name ?? '—'
    criticalIssues.push(`Task "${tr.task.title}" (${a}) a rischio: avanzamento ${tr.task.progressPercent}% vs atteso ${tr.expected}%.`)
  }
  // Task con conflitto assenza non già segnalati
  const alreadySeen = new Set<string>([...tasksLate, ...tasksRisk].map((tr) => tr.task.id))
  for (const t of data.tasks) {
    if (!isOpen(t.status)) continue
    if (alreadySeen.has(t.id)) continue
    const conflicts = getAssigneeAbsencesDuringTask(t.assigneeId, data.absences, t.startDate, t.dueDate)
    if (conflicts.length > 0) {
      const a = personById.get(t.assigneeId)?.name ?? '—'
      criticalIssues.push(`Task "${t.title}" (${a}) interseca un’assenza dell’assegnatario.`)
    }
  }
  // Work item aperti senza task
  for (const w of data.workItems) {
    if (!isOpen(w.status)) continue
    const tasks = itemTasksMap.get(w.id) ?? []
    if (tasks.length === 0) {
      criticalIssues.push(`Lavoro "${w.code || w.title}" (${w.customer || 'cliente n/d'}) è aperto ma non ha task collegati.`)
    }
  }
  // Studi vicini a scadenza (entro 7 gg)
  const sevenDaysMs = 7 * MS_PER_DAY
  const todayTs = today.getTime()
  for (const w of data.workItems) {
    if (w.type !== 'studio' || !isOpen(w.status)) continue
    const due = parseISODate(w.dueDate).getTime()
    const diff = due - todayTs
    if (diff < 0) continue // già in ritardo, gestito dai blocchi sopra
    if (diff <= sevenDaysMs) {
      const days = Math.max(1, Math.ceil(diff / MS_PER_DAY))
      criticalIssues.push(`Studio "${w.code || w.title}" (${w.customer}) scade tra ${days} gg.`)
    }
  }

  return {
    weekIso: isoWeekNumber(weekStart),
    weekStart,
    weekEnd,
    weekStartISO,
    weekEndISO,
    summary: { openCommesse, openStudi, openInterni, openTasks, completedTasks, completedThisWeekCount, lateTasks, atRiskTasks, avgLoadPercent },
    workload,
    workItemsByType,
    completedThisWeek,
    atRiskOrLate: { workItemsLate, workItemsRisk, tasksLate, tasksRisk },
    absences,
    criticalIssues,
  }
}

export function getNextWeekReportData(data: AppData, today: Date = new Date()): NextWeekReport {
  const reference = addDays(today, 7)
  const weekStart = startOfWeek(reference)
  const weekEnd = endOfWeek(reference)
  const weekStartISO = formatISODate(weekStart)
  const weekEndISO = formatISODate(weekEnd)

  const startingTasks = data.tasks
    .filter((t) => isOpen(t.status) && t.startDate >= weekStartISO && t.startDate <= weekEndISO)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  const endingTasks = data.tasks
    .filter((t) => isOpen(t.status) && t.dueDate >= weekStartISO && t.dueDate <= weekEndISO)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const activeWorkItems = data.workItems
    .filter((w) => isOpen(w.status) && w.startDate <= weekEndISO && w.dueDate >= weekStartISO)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const reducedCapacityPeople: NextWeekReport['reducedCapacityPeople'] = []
  for (const p of data.people) {
    if (!p.active) continue
    const absenceHours = getAbsenceHoursForPersonInWeek(p.id, data.absences, weekStart, weekEnd)
    if (absenceHours > 0) {
      reducedCapacityPeople.push({
        person: p,
        absenceHours,
        realCapacity: Math.max(0, p.weeklyCapacityHours - absenceHours),
      })
    }
  }

  return {
    weekIso: isoWeekNumber(weekStart),
    weekStart,
    weekEnd,
    weekStartISO,
    weekEndISO,
    startingTasks,
    endingTasks,
    activeWorkItems,
    reducedCapacityPeople,
  }
}

// === markdown formatter ===================================================

export function formatReportMarkdown(
  current: CurrentWeekReport,
  next: NextWeekReport,
  data: AppData,
  generatedAt: Date = new Date(),
): string {
  const personById = new Map(data.people.map((p) => [p.id, p]))
  const workItemById = new Map(data.workItems.map((w) => [w.id, w]))
  const itemTasksMap = new Map<string, Task[]>()
  for (const t of data.tasks) {
    const arr = itemTasksMap.get(t.workItemId) ?? []
    arr.push(t)
    itemTasksMap.set(t.workItemId, arr)
  }

  const out: string[] = []
  const push = (s = '') => out.push(s)

  // === Header
  push('# Report settimanale ufficio progettazione')
  push()
  push(`**Settimana ISO:** S${current.weekIso}`)
  push(`**Periodo:** ${fmtFullWithDow(current.weekStart)} — ${fmtFullWithDow(current.weekEnd)}`)
  push(`**Generato il:** ${fmtFullWithDow(generatedAt)} alle ${fmtTime(generatedAt)}`)
  push()

  // === Sintesi generale
  push('## Sintesi')
  push()
  const s = current.summary
  push(
    `Sono attualmente aperti **${s.openCommesse}** commesse, **${s.openStudi}** studi/preventivi e **${s.openInterni}** ` +
    `attività interne, per un totale di **${s.openTasks}** task aperti. ` +
    `**${s.completedTasks}** task risultano in stato Completato; **${s.lateTasks}** sono in ritardo e ` +
    `**${s.atRiskTasks}** sono valutati a rischio. ` +
    `Il carico medio dell'ufficio per la settimana corrente è del **${s.avgLoadPercent}%**.`,
  )
  push()

  // === Carico per persona
  push('## Carico per persona')
  push()
  if (current.workload.length === 0) {
    push('_Nessuna persona attiva._')
    push()
  } else {
    for (const wl of current.workload) {
      push(`### ${wl.person.name} — ${wl.person.role}`)
      push(`- Capacità teorica: **${wl.capacity} h**`)
      push(`- Ore assenza settimana: ${wl.absenceHours > 0 ? `**${wl.absenceHours} h**` : '0 h'}`)
      push(`- Capacità reale: **${wl.realCapacity} h**`)
      push(`- Ore assegnate: **${wl.weekHours} h**`)
      push(`- Carico: **${wl.loadPercent}%** (${LEVEL_LABEL[wl.level]})`)
      if (wl.hasTasksDuringAbsence) push('- ⚠ Ha task pianificati in giorni di assenza')
      push()
    }
  }

  // === Attività principali in corso
  push('## Attività principali in corso')
  push()
  pushItemsGroup(out, 'Commesse', current.workItemsByType.commesse, personById, itemTasksMap)
  pushItemsGroup(out, 'Studi / preventivi', current.workItemsByType.studi, personById, itemTasksMap)
  pushItemsGroup(out, 'Attività interne', current.workItemsByType.interni, personById, itemTasksMap)

  // === Completate questa settimana
  push('## Attività completate questa settimana')
  push()
  push('> Sono incluse: attività marcate Completato durante la settimana (rilevate dallo storico modifiche) e attività con scadenza in settimana attualmente in stato Completato.')
  push()
  if (current.completedThisWeek.workItems.length === 0 && current.completedThisWeek.tasks.length === 0) {
    push('_Nessuna attività in stato Completato con scadenza in questa settimana._')
    push()
  } else {
    for (const w of current.completedThisWeek.workItems) {
      push(`- 🏁 Lavoro **${w.code || w.title}** · ${w.customer || '—'} — scadenza ${fmtIso(w.dueDate)}`)
    }
    for (const t of current.completedThisWeek.tasks) {
      const a = personById.get(t.assigneeId)?.name ?? '—'
      const wi = workItemById.get(t.workItemId)
      const wiLabel = wi ? `${wi.code || wi.title}` : '—'
      push(`- ✅ Task **${t.title}** (${a}) · ${wiLabel} — scadenza ${fmtIso(t.dueDate)}`)
    }
    push()
  }

  // === In ritardo o a rischio
  push('## Attività in ritardo o a rischio')
  push()
  const r = current.atRiskOrLate
  const totalIssues = r.workItemsLate.length + r.workItemsRisk.length + r.tasksLate.length + r.tasksRisk.length
  if (totalIssues === 0) {
    push('_Nessuna attività in ritardo o a rischio._')
    push()
  } else {
    if (r.workItemsLate.length > 0) {
      push(`### Lavori in ritardo (${r.workItemsLate.length})`)
      for (const w of r.workItemsLate) {
        const expected = calculateExpectedProgress(w.startDate, w.dueDate)
        push(`- **${w.code || w.title}** · ${w.customer || '—'} · ${w.title} — scadenza ${fmtIso(w.dueDate)} · Reale ${w.progressPercent}% / Atteso ${expected}%`)
      }
      push()
    }
    if (r.workItemsRisk.length > 0) {
      push(`### Lavori a rischio (${r.workItemsRisk.length})`)
      for (const w of r.workItemsRisk) {
        const expected = calculateExpectedProgress(w.startDate, w.dueDate)
        push(`- **${w.code || w.title}** · ${w.customer || '—'} · ${w.title} — scadenza ${fmtIso(w.dueDate)} · Reale ${w.progressPercent}% / Atteso ${expected}%`)
      }
      push()
    }
    if (r.tasksLate.length > 0) {
      push(`### Task in ritardo (${r.tasksLate.length})`)
      for (const tr of r.tasksLate) pushTaskWithReasons(out, tr, personById, workItemById)
      push()
    }
    if (r.tasksRisk.length > 0) {
      push(`### Task a rischio (${r.tasksRisk.length})`)
      for (const tr of r.tasksRisk) pushTaskWithReasons(out, tr, personById, workItemById)
      push()
    }
  }

  // === Ferie / permessi
  push('## Ferie / permessi / assenze della settimana')
  push()
  if (current.absences.length === 0) {
    push('_Nessuna assenza nella settimana corrente._')
    push()
  } else {
    for (const a of current.absences) {
      const person = personById.get(a.personId)?.name ?? '—'
      const period = a.startDate === a.endDate ? fmtIso(a.startDate) : `${fmtIso(a.startDate)} → ${fmtIso(a.endDate)}`
      const note = a.notes ? ` — ${a.notes}` : ''
      push(`- **${person}** · ${a.type} · ${period} · ${a.hoursPerDay} h/g${note}`)
    }
    push()
  }

  // === Prossima settimana
  push('## Attività previste prossima settimana')
  push(`_S${next.weekIso} · ${fmtFull(next.weekStart)} — ${fmtFull(next.weekEnd)}_`)
  push()
  const nothingNext =
    next.startingTasks.length === 0 &&
    next.endingTasks.length === 0 &&
    next.activeWorkItems.length === 0 &&
    next.reducedCapacityPeople.length === 0
  if (nothingNext) {
    push('_Nessuna attività o assenza pianificata per la prossima settimana._')
    push()
  } else {
    if (next.startingTasks.length > 0) {
      push(`### Task in partenza (${next.startingTasks.length})`)
      for (const t of next.startingTasks) pushNextTask(out, t, data, personById, workItemById)
      push()
    }
    if (next.endingTasks.length > 0) {
      push(`### Task in scadenza (${next.endingTasks.length})`)
      for (const t of next.endingTasks) pushNextTask(out, t, data, personById, workItemById)
      push()
    }
    if (next.activeWorkItems.length > 0) {
      push(`### Lavori attivi nella settimana (${next.activeWorkItems.length})`)
      for (const w of next.activeWorkItems) {
        push(`- **${w.code || w.title}** · ${w.customer || '—'} · ${w.title} — scadenza ${fmtIso(w.dueDate)} · ${w.status}`)
      }
      push()
    }
    if (next.reducedCapacityPeople.length > 0) {
      push(`### Persone con capacità ridotta (${next.reducedCapacityPeople.length})`)
      for (const p of next.reducedCapacityPeople) {
        push(`- **${p.person.name}** — assenze ${p.absenceHours} h · capacità reale ${p.realCapacity} h (su ${p.person.weeklyCapacityHours} h teoriche)`)
      }
      push()
    }
  }

  // === Criticità
  push('## Criticità / decisioni richieste')
  push()
  if (current.criticalIssues.length === 0) {
    push('_Nessuna criticità rilevante emersa dai dati attuali._')
  } else {
    for (const c of current.criticalIssues) push(`- ${c}`)
  }
  push()

  // === Footer
  push('---')
  push()
  push(
    "_Nota: il report è generato dai dati presenti nell'app. " +
    'In assenza di storico modifiche, le attività completate sono rilevate dallo stato corrente ' +
    'e non dalla data effettiva di completamento._',
  )
  push()

  return out.join('\n')
}

function pushItemsGroup(
  out: string[],
  label: string,
  items: WorkItem[],
  personById: Map<string, Person>,
  itemTasksMap: Map<string, Task[]>,
): void {
  out.push(`### ${label} (${items.length})`)
  out.push('')
  if (items.length === 0) {
    out.push('_Nessuna attività in questo gruppo._')
    out.push('')
    return
  }
  for (const w of items) {
    const owner = personById.get(w.ownerId)?.name ?? '—'
    const assignees = w.assigneeIds.map((id) => personById.get(id)?.name).filter(Boolean).join(', ') || '—'
    const expected = calculateExpectedProgress(w.startDate, w.dueDate)
    const health = getWorkItemHealth(w, itemTasksMap.get(w.id) ?? [])
    out.push(`- **${w.code || '—'}** · ${w.customer || '—'} · ${w.title}`)
    out.push(`  - Owner: ${owner} — Assegnati: ${assignees}`)
    out.push(`  - Stato: ${w.status} · Priorità: ${w.priority} · Salute: **${health}**`)
    out.push(`  - Avanzamento reale **${w.progressPercent}%** / atteso **${expected}%**`)
    out.push(`  - Scadenza: ${fmtIso(w.dueDate)}`)
  }
  out.push('')
}

function pushTaskWithReasons(
  out: string[],
  tr: TaskWithReasons,
  personById: Map<string, Person>,
  workItemById: Map<string, WorkItem>,
): void {
  const t = tr.task
  const a = personById.get(t.assigneeId)?.name ?? '—'
  const wi = workItemById.get(t.workItemId)
  const wiLabel = wi ? `${wi.code || wi.title} · ${wi.customer || '—'}` : '—'
  out.push(`- **${t.title}** · ${a} · ${wiLabel}`)
  out.push(`  - Scadenza: ${fmtIso(t.dueDate)} · Reale ${t.progressPercent}% / Atteso ${tr.expected}%`)
  if (tr.reasons.length > 0) out.push(`  - Motivo: ${tr.reasons.join('; ')}`)
}

function pushNextTask(
  out: string[],
  t: Task,
  data: AppData,
  personById: Map<string, Person>,
  workItemById: Map<string, WorkItem>,
): void {
  const a = personById.get(t.assigneeId)?.name ?? '—'
  const wi = workItemById.get(t.workItemId)
  const wiLabel = wi ? `${wi.code || wi.title} · ${wi.customer || '—'}` : '—'
  const remaining = Math.max(0, Math.round(t.estimatedHours * (1 - t.progressPercent / 100)))
  const conflicts = getAssigneeAbsencesDuringTask(t.assigneeId, data.absences, t.startDate, t.dueDate)
  const risk = conflicts.length > 0 ? ' — ⚠ assenza assegnatario nel periodo' : ''
  out.push(`- **${t.title}** · ${a} · ${wiLabel}`)
  out.push(`  - Inizio ${fmtIso(t.startDate)} · Scadenza ${fmtIso(t.dueDate)} · ~${remaining} h residue${risk}`)
}

// === entry point ==========================================================

export function generateWeeklyAdminReport(data: AppData, today: Date = new Date()): string {
  const current = getCurrentWeekReportData(data, today)
  const next = getNextWeekReportData(data, today)
  return formatReportMarkdown(current, next, data, today)
}
