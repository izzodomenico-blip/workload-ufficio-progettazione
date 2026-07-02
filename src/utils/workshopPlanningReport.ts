import type {
  AppData,
  WorkItem,
  WorkshopAssignment,
  WorkshopAssignmentProcess,
  WorkshopAssignmentStatus,
  WorkshopOutput,
  WorkshopWorker,
} from '../types'
import {
  endOfWeek,
  formatISODate,
  formatItalianShort,
  isoWeekNumber,
  parseISODate,
  todayISO,
} from './dates'
import {
  WORKSHOP_ASSIGNMENT_PROCESS_LABELS,
  aggregateWorkerLoadByDay,
  aggregateWorkerLoadByMonth,
  aggregateWorkerLoadByWeek,
  getAssignmentCoverageForOutput,
  getMonthWeeks,
  getWeekDays,
  saturationScore10,
  type OutputCoverage,
  type WorkerLoadLevel,
} from './workshopCapacity'

export type PlanningViewMode = 'daily' | 'weekly' | 'monthly'

export interface WorkshopPlanningReportFilters {
  viewMode: PlanningViewMode
  selectedDate: string
  weekStart: string
  monthAnchor: string
  processFilter: WorkshopAssignmentProcess | ''
  workerFilter: string
  assignmentStatusFilter: WorkshopAssignmentStatus | ''
  query: string
  onlyOverloads: boolean
  onlyUnassigned: boolean
}

export interface PlanningReportWorkerRow {
  worker: WorkshopWorker
  loadPoints: number
  capacityPoints: number
  percent: number
  score10: number
  level: WorkerLoadLevel
}

export interface PlanningReportOutputRow {
  output: WorkshopOutput
  workItem?: WorkItem
  date: string
  coverage: OutputCoverage
}

export interface PlanningReportProcessRow {
  process: WorkshopAssignmentProcess
  label: string
  loadPoints: number
  assignmentCount: number
  workerCount: number
}

export interface PlanningReportPeriodBucket {
  label: string
  sublabel: string
  loadPoints: number
  capacityPoints: number
  score10: number
  level: WorkerLoadLevel
}

export interface PlanningReportAssignmentRow {
  assignment: WorkshopAssignment
  workerName: string
  outputLabel: string
  workItemCode: string
  customer: string
}

export type PlanningAlertTone = 'critico' | 'attenzione' | 'info'

export interface PlanningReportAlert {
  id: string
  tone: PlanningAlertTone
  title: string
  detail: string
}

export interface WorkshopPlanningReport {
  generatedAt: Date
  viewMode: PlanningViewMode
  periodLabel: string
  periodStartISO: string
  periodEndISO: string
  scopeLabel: string
  filtersSummary: string
  summary: {
    workersConsidered: number
    avgScore10: number
    overloaded: number
    available: number
    totalLoadPoints: number
    totalCapacityPoints: number
    saturationPercent: number
  }
  overloadedWorkers: PlanningReportWorkerRow[]
  availableWorkers: PlanningReportWorkerRow[]
  unassignedOutputs: PlanningReportOutputRow[]
  processLoad: PlanningReportProcessRow[]
  periodBreakdown: PlanningReportPeriodBucket[]
  topAssignments: PlanningReportAssignmentRow[]
  alerts: PlanningReportAlert[]
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function outputPlanningDate(output: WorkshopOutput, workItem?: WorkItem): string {
  return output.actualReleaseDate || output.plannedReleaseDate || workItem?.plannedProductionReleaseDate || workItem?.dueDate || ''
}

function resolvePeriod(filters: WorkshopPlanningReportFilters): { startISO: string; endISO: string; label: string } {
  if (filters.viewMode === 'daily') {
    const d = parseISODate(filters.selectedDate)
    return {
      startISO: filters.selectedDate,
      endISO: filters.selectedDate,
      label: `Giornaliera · ${formatItalianShort(filters.selectedDate)} (S${isoWeekNumber(d)})`,
    }
  }
  if (filters.viewMode === 'weekly') {
    const days = getWeekDays(filters.weekStart)
    const endISO = days[days.length - 1]
    return {
      startISO: filters.weekStart,
      endISO,
      label: `Settimanale · S${isoWeekNumber(parseISODate(filters.weekStart))} (${formatItalianShort(filters.weekStart)} → ${formatItalianShort(endISO)})`,
    }
  }
  const weeks = getMonthWeeks(filters.monthAnchor)
  const anchor = parseISODate(filters.monthAnchor)
  const months = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
  const lastWeekEnd = formatISODate(endOfWeek(parseISODate(weeks[weeks.length - 1])))
  return {
    startISO: weeks[0],
    endISO: lastWeekEnd,
    label: `Mensile · ${months[anchor.getMonth()]} ${anchor.getFullYear()}`,
  }
}

function periodDaySet(filters: WorkshopPlanningReportFilters): Set<string> {
  if (filters.viewMode === 'daily') return new Set([filters.selectedDate])
  if (filters.viewMode === 'weekly') return new Set(getWeekDays(filters.weekStart))
  const days = new Set<string>()
  for (const weekStart of getMonthWeeks(filters.monthAnchor)) {
    for (const day of getWeekDays(weekStart)) days.add(day)
  }
  return days
}

function toWorkerRow(row: { worker: WorkshopWorker; loadPoints: number; capacityPoints: number; percent: number; level: WorkerLoadLevel }): PlanningReportWorkerRow {
  return {
    worker: row.worker,
    loadPoints: row.loadPoints,
    capacityPoints: row.capacityPoints,
    percent: row.percent,
    score10: saturationScore10(row.percent),
    level: row.level,
  }
}

export function buildWorkshopPlanningReport(
  data: AppData,
  filters: WorkshopPlanningReportFilters,
  today: Date = new Date(),
): WorkshopPlanningReport {
  const { workshopAssignments, workshopWorkers, workshopOutputs, workItems } = data
  const workItemById = new Map(workItems.map((item) => [item.id, item]))
  const workerById = new Map(workshopWorkers.map((worker) => [worker.id, worker]))
  const outputById = new Map(workshopOutputs.map((output) => [output.id, output]))
  const station = filters.processFilter || undefined
  const todayStr = todayISO()
  const { startISO, endISO, label } = resolvePeriod(filters)

  // --- carico operai (vista corrente) ---
  let loadRows: PlanningReportWorkerRow[]
  if (filters.viewMode === 'daily') {
    loadRows = aggregateWorkerLoadByDay(workshopAssignments, workshopWorkers, filters.selectedDate, station).map(toWorkerRow)
  } else if (filters.viewMode === 'weekly') {
    loadRows = aggregateWorkerLoadByWeek(workshopAssignments, workshopWorkers, filters.weekStart, station).map(toWorkerRow)
  } else {
    loadRows = aggregateWorkerLoadByMonth(workshopAssignments, workshopWorkers, filters.monthAnchor, station).map(toWorkerRow)
  }
  if (filters.workerFilter) loadRows = loadRows.filter((row) => row.worker.id === filters.workerFilter)
  if (filters.onlyOverloads) loadRows = loadRows.filter((row) => row.level === 'sovraccarico')

  const overloadedWorkers = loadRows
    .filter((row) => row.level === 'sovraccarico')
    .sort((a, b) => b.percent - a.percent)
  const availableWorkers = loadRows
    .filter((row) => row.level === 'disponibile')
    .sort((a, b) => a.percent - b.percent)

  const totalLoadPoints = round1(loadRows.reduce((sum, row) => sum + row.loadPoints, 0))
  const totalCapacityPoints = round1(loadRows.reduce((sum, row) => sum + row.capacityPoints, 0))
  const measured = loadRows.filter((row) => row.capacityPoints > 0)
  const avgPercent = measured.length > 0 ? Math.round(measured.reduce((sum, row) => sum + row.percent, 0) / measured.length) : 0
  const saturationPercent = totalCapacityPoints > 0 ? Math.round((totalLoadPoints / totalCapacityPoints) * 100) : 0

  // --- assegnazioni del periodo (filtrate) ---
  const daySet = periodDaySet(filters)
  const q = filters.query.trim().toLowerCase()
  const periodAssignments = workshopAssignments.filter((assignment) => {
    if (!daySet.has(assignment.plannedDate)) return false
    if (station && assignment.process !== station) return false
    if (filters.workerFilter && assignment.workerId !== filters.workerFilter) return false
    if (filters.assignmentStatusFilter && assignment.status !== filters.assignmentStatusFilter) return false
    if (q) {
      const worker = workerById.get(assignment.workerId)
      const output = outputById.get(assignment.workshopOutputId)
      const workItem = workItemById.get(assignment.workItemId)
      const hay = `${worker?.displayName ?? ''} ${output?.machineTypeCode ?? ''} ${output?.machineTypeName ?? ''} ${workItem?.code ?? ''} ${workItem?.customer ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const activePeriodAssignments = periodAssignments.filter((assignment) => assignment.status !== 'sospeso')

  // --- carico per processo ---
  const processMap = new Map<WorkshopAssignmentProcess, { loadPoints: number; count: number; workers: Set<string> }>()
  for (const assignment of activePeriodAssignments) {
    const entry = processMap.get(assignment.process) ?? { loadPoints: 0, count: 0, workers: new Set<string>() }
    entry.loadPoints += assignment.loadPoints
    entry.count += 1
    entry.workers.add(assignment.workerId)
    processMap.set(assignment.process, entry)
  }
  const processLoad: PlanningReportProcessRow[] = Array.from(processMap.entries())
    .map(([process, entry]) => ({
      process,
      label: WORKSHOP_ASSIGNMENT_PROCESS_LABELS[process],
      loadPoints: round1(entry.loadPoints),
      assignmentCount: entry.count,
      workerCount: entry.workers.size,
    }))
    .sort((a, b) => b.loadPoints - a.loadPoints)

  // --- output non assegnati (nel periodo) ---
  const unassignedOutputs: PlanningReportOutputRow[] = workshopOutputs
    .filter((output) => output.status !== 'sospeso')
    .map((output) => {
      const workItem = workItemById.get(output.workItemId)
      return { output, workItem, date: outputPlanningDate(output, workItem), coverage: getAssignmentCoverageForOutput(output, workshopAssignments) }
    })
    .filter((row) => row.coverage.requiredProcesses.length > 0 && row.coverage.status !== 'assegnato')
    .filter((row) => (station ? row.coverage.requiredProcesses.includes(station) : true))
    // Output di lavori completati ma non ancora assegnati restano sempre nel
    // report finche' non li si assegna: non vengono filtrati per data, evitando
    // che spariscano quando il workItem chiude al 100% con dueDate gia' passata.
    .filter((row) => {
      const isCompletedAwaitingAssignment =
        row.workItem?.status === 'Completato' && row.coverage.status !== 'assegnato'
      if (isCompletedAwaitingAssignment) return true
      return row.date ? row.date >= startISO && row.date <= endISO : true
    })
    .filter((row) => {
      if (filters.onlyUnassigned && row.coverage.status !== 'non_assegnato') return false
      if (q) {
        const hay = `${row.workItem?.code ?? ''} ${row.workItem?.customer ?? ''} ${row.output.machineTypeCode} ${row.output.machineTypeName}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))

  // --- breakdown periodo ---
  const periodBreakdown = buildPeriodBreakdown(filters, activePeriodAssignments, loadRows, station)

  // --- top assegnazioni ---
  const topAssignments: PlanningReportAssignmentRow[] = periodAssignments
    .slice()
    .sort((a, b) => b.loadPoints - a.loadPoints)
    .slice(0, 20)
    .map((assignment) => {
      const output = outputById.get(assignment.workshopOutputId)
      const workItem = workItemById.get(assignment.workItemId)
      return {
        assignment,
        workerName: workerById.get(assignment.workerId)?.displayName ?? '—',
        outputLabel: output ? `${output.machineTypeCode} · ${output.machineTypeName}` : '—',
        workItemCode: workItem?.code ?? '—',
        customer: workItem?.customer ?? '—',
      }
    })

  // --- criticità ---
  const alerts = buildAlerts({
    loadRows,
    unassignedOutputs,
    periodAssignments,
    workerById,
    todayStr,
    station,
  })

  return {
    generatedAt: today,
    viewMode: filters.viewMode,
    periodLabel: label,
    periodStartISO: startISO,
    periodEndISO: endISO,
    scopeLabel: station ? `Postazione: ${WORKSHOP_ASSIGNMENT_PROCESS_LABELS[station]}` : "Tutta l'officina",
    filtersSummary: buildFiltersSummary(data, filters),
    summary: {
      workersConsidered: loadRows.length,
      avgScore10: saturationScore10(avgPercent),
      overloaded: overloadedWorkers.length,
      available: availableWorkers.length,
      totalLoadPoints,
      totalCapacityPoints,
      saturationPercent,
    },
    overloadedWorkers,
    availableWorkers,
    unassignedOutputs,
    processLoad,
    periodBreakdown,
    topAssignments,
    alerts,
  }
}

function buildPeriodBreakdown(
  filters: WorkshopPlanningReportFilters,
  assignments: WorkshopAssignment[],
  loadRows: PlanningReportWorkerRow[],
  station: WorkshopAssignmentProcess | undefined,
): PlanningReportPeriodBucket[] {
  const totalDailyCapacity = loadRows.reduce((sum, row) => {
    const cap = row.worker.dailyCapacityPoints || 100
    return sum + cap
  }, 0)
  const matches = (assignment: WorkshopAssignment, day: string) => (
    assignment.plannedDate === day &&
    assignment.status !== 'sospeso' &&
    (!station || assignment.process === station) &&
    (!filters.workerFilter || assignment.workerId === filters.workerFilter)
  )
  const bucketFromDays = (days: string[], label: string, sublabel: string): PlanningReportPeriodBucket => {
    const load = round1(assignments.filter((a) => days.some((d) => matches(a, d))).reduce((sum, a) => sum + a.loadPoints, 0))
    const capacity = round1(totalDailyCapacity * days.length)
    const percent = capacity > 0 ? Math.round((load / capacity) * 100) : 0
    return { label, sublabel, loadPoints: load, capacityPoints: capacity, score10: saturationScore10(percent), level: levelFromPercent(percent) }
  }

  if (filters.viewMode === 'daily') {
    return [bucketFromDays([filters.selectedDate], formatItalianShort(filters.selectedDate), 'giorno')]
  }
  if (filters.viewMode === 'weekly') {
    return getWeekDays(filters.weekStart).map((day) => bucketFromDays([day], formatItalianShort(day), 'giorno'))
  }
  return getMonthWeeks(filters.monthAnchor).map((weekStart) => bucketFromDays(
    getWeekDays(weekStart),
    `S${isoWeekNumber(parseISODate(weekStart))}`,
    formatItalianShort(weekStart),
  ))
}

function levelFromPercent(percent: number): WorkerLoadLevel {
  if (percent > 100) return 'sovraccarico'
  if (percent >= 85) return 'pieno'
  if (percent >= 60) return 'normale'
  return 'disponibile'
}

function buildAlerts(input: {
  loadRows: PlanningReportWorkerRow[]
  unassignedOutputs: PlanningReportOutputRow[]
  periodAssignments: WorkshopAssignment[]
  workerById: Map<string, WorkshopWorker>
  todayStr: string
  station: WorkshopAssignmentProcess | undefined
}): PlanningReportAlert[] {
  const alerts: PlanningReportAlert[] = []
  const { loadRows, unassignedOutputs, periodAssignments, workerById, todayStr } = input

  const overloaded = loadRows.filter((row) => row.level === 'sovraccarico')
  if (overloaded.length > 0) {
    alerts.push({
      id: 'overloaded',
      tone: 'critico',
      title: `${overloaded.length} operai in sovraccarico`,
      detail: overloaded.slice(0, 5).map((row) => `${row.worker.displayName} (${row.score10.toFixed(1)}/10)`).join(', ') + (overloaded.length > 5 ? ' …' : ''),
    })
  }

  const missing = unassignedOutputs.filter((row) => row.coverage.missingProcesses.length > 0)
  if (missing.length > 0) {
    alerts.push({
      id: 'missing-processes',
      tone: 'attenzione',
      title: `${missing.length} output con processi non assegnati`,
      detail: 'Mancano assegnazioni per alcuni processi richiesti dagli output nel periodo.',
    })
  }

  const overdue = unassignedOutputs.filter((row) => row.date && row.date < todayStr)
  if (overdue.length > 0) {
    alerts.push({
      id: 'overdue-unassigned',
      tone: 'critico',
      title: `${overdue.length} output con data passata non ancora assegnati`,
      detail: 'Sono attesi in officina ma non hanno copertura completa: pianificare con priorità.',
    })
  }

  const skillMismatch = periodAssignments.filter((assignment) => {
    const worker = workerById.get(assignment.workerId)
    return worker && !worker.skills.includes(assignment.process)
  })
  if (skillMismatch.length > 0) {
    alerts.push({
      id: 'skill-mismatch',
      tone: 'attenzione',
      title: `${skillMismatch.length} assegnazioni su processo non compatibile con la skill`,
      detail: 'Operai assegnati a una postazione per cui non risultano abilitati: verificare competenze o assegnazione.',
    })
  }

  const suspended = periodAssignments.filter((assignment) => assignment.status === 'sospeso')
  if (suspended.length > 0) {
    alerts.push({
      id: 'suspended',
      tone: 'info',
      title: `${suspended.length} assegnazioni sospese nel periodo`,
      detail: 'Non rientrano nel carico finché non riprendono.',
    })
  }

  const order: Record<PlanningAlertTone, number> = { critico: 0, attenzione: 1, info: 2 }
  return alerts.sort((a, b) => order[a.tone] - order[b.tone])
}

function buildFiltersSummary(data: AppData, filters: WorkshopPlanningReportFilters): string {
  const parts: string[] = []
  if (filters.processFilter) parts.push(`postazione ${WORKSHOP_ASSIGNMENT_PROCESS_LABELS[filters.processFilter]}`)
  if (filters.workerFilter) {
    const worker = data.workshopWorkers.find((w) => w.id === filters.workerFilter)
    parts.push(`operaio ${worker?.displayName ?? filters.workerFilter}`)
  }
  if (filters.assignmentStatusFilter) parts.push(`stato ${filters.assignmentStatusFilter.replace('_', ' ')}`)
  if (filters.query.trim()) parts.push(`ricerca "${filters.query.trim()}"`)
  if (filters.onlyOverloads) parts.push('solo sovraccarichi')
  if (filters.onlyUnassigned) parts.push('solo non assegnati')
  if (parts.length === 0) return 'Nessun filtro aggiuntivo: intera officina nel periodo.'
  return parts.join(', ')
}
