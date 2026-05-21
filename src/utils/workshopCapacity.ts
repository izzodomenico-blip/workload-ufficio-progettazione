import type {
  WorkshopAssignment,
  WorkshopAssignmentProcess,
  WorkshopAssignmentSourceType,
  WorkshopOutput,
  WorkshopWorker,
} from '../types'
import { formatISODate, isoWeekNumber, parseISODate, startOfWeek } from './dates'
import { compareWorkshopWorkers } from './workshopWorkers'

export const WORKSHOP_ASSIGNMENT_PROCESS_LABELS: Record<WorkshopAssignmentProcess, string> = {
  laser_piano: 'Laser piano',
  laser_tubo: 'Laser tubi',
  piegatrice: 'Piegatrice',
  saldatura: 'Saldatura',
  tornitura: 'Tornitura',
  fresatura: 'Fresatura',
  montaggio: 'Montaggio',
  verniciatura: 'Verniciatura',
  collaudo: 'Collaudo',
  magazzino: 'Magazzino',
  manutenzione: 'Manutenzione',
  altro: 'Altro',
}

export const PROCESS_LOAD_WEIGHTS: Record<WorkshopAssignmentProcess, number> = {
  laser_piano: 1,
  laser_tubo: 1.2,
  piegatrice: 0.9,
  saldatura: 1.3,
  tornitura: 1,
  fresatura: 1,
  montaggio: 1.2,
  verniciatura: 0.8,
  collaudo: 0.7,
  magazzino: 0.7,
  manutenzione: 1,
  altro: 1,
}

export type WorkerLoadLevel = 'disponibile' | 'normale' | 'pieno' | 'sovraccarico'
export type OutputCoverageStatus = 'non_assegnato' | 'parziale' | 'assegnato'

export interface WorkerLoadSummary {
  worker: WorkshopWorker
  loadPoints: number
  capacityPoints: number
  percent: number
  level: WorkerLoadLevel
  assignments: WorkshopAssignment[]
}

export interface OutputCoverage {
  status: OutputCoverageStatus
  requiredProcesses: WorkshopAssignmentProcess[]
  coveredProcesses: WorkshopAssignmentProcess[]
  missingProcesses: WorkshopAssignmentProcess[]
  processStatus: Record<WorkshopAssignmentProcess, 'missing' | 'partial' | 'covered'>
}

export function getOutputRequiredProcesses(output: WorkshopOutput): WorkshopAssignmentProcess[] {
  const processes: WorkshopAssignmentProcess[] = []
  if (output.requiresLaser) processes.push('laser_piano')
  if (output.requiresTubeLaser) processes.push('laser_tubo')
  if (output.requiresBending) processes.push('piegatrice')
  if (output.requiresWelding) processes.push('saldatura')
  if (output.requiresTurning) processes.push('tornitura')
  if (output.requiresMilling) processes.push('fresatura')
  if (output.requiresAssembly) processes.push('montaggio')
  if (output.requiresPainting) processes.push('verniciatura')
  if (output.requiresTesting) processes.push('collaudo')
  return processes
}

export function getStandardComponentProcesses(output: WorkshopOutput): WorkshopAssignmentProcess[] {
  return (output.standardComponentsProcesses ?? [])
    .filter((process): process is WorkshopAssignmentProcess => process in WORKSHOP_ASSIGNMENT_PROCESS_LABELS)
}

export function estimateProcessLoadPoints(output: WorkshopOutput, process: WorkshopAssignmentProcess): number {
  const required = getOutputRequiredProcesses(output)
  const divisor = required.length > 0 ? required.length : 1
  const basePerProcess = output.impactScore / divisor
  return round1(basePerProcess * PROCESS_LOAD_WEIGHTS[process])
}

export function estimateStandardComponentLoadPoints(output: WorkshopOutput, process: WorkshopAssignmentProcess): number {
  const required = getStandardComponentProcesses(output)
  const divisor = required.length > 0 ? required.length : 1
  const basePerProcess = (output.standardComponentsImpactScore ?? 0) / divisor
  return round1(basePerProcess * PROCESS_LOAD_WEIGHTS[process])
}

export function getAssignableWorkersForProcess(
  process: WorkshopAssignmentProcess,
  workers: WorkshopWorker[],
): WorkshopWorker[] {
  return workers
    .filter((worker) => worker.active && worker.skills.includes(process))
    .sort(compareWorkshopWorkers)
}

export function aggregateWorkerLoadByDay(
  assignments: WorkshopAssignment[],
  workers: WorkshopWorker[],
  date: string,
  process?: WorkshopAssignmentProcess,
): WorkerLoadSummary[] {
  const byWorker = assignments.filter((assignment) => (
    assignment.plannedDate === date &&
    assignment.status !== 'sospeso' &&
    (!process || assignment.process === process)
  ))
  return workers.filter((worker) => worker.active && (!process || worker.skills.includes(process))).sort(compareWorkshopWorkers).map((worker) => {
    const workerAssignments = byWorker.filter((assignment) => assignment.workerId === worker.id)
    const loadPoints = round1(workerAssignments.reduce((sum, assignment) => sum + assignment.loadPoints, 0))
    const capacityPoints = worker.dailyCapacityPoints || 100
    const percent = capacityPoints > 0 ? Math.round((loadPoints / capacityPoints) * 100) : 0
    return {
      worker,
      loadPoints,
      capacityPoints,
      percent,
      level: getWorkerLoadLevel(percent),
      assignments: workerAssignments,
    }
  })
}

export function aggregateWorkerLoadByWeek(
  assignments: WorkshopAssignment[],
  workers: WorkshopWorker[],
  weekStart: string,
  process?: WorkshopAssignmentProcess,
): WorkerLoadSummary[] {
  const weekDays = getWeekDays(weekStart)
  const daySet = new Set(weekDays)
  const byWorker = assignments.filter((assignment) => (
    daySet.has(assignment.plannedDate) &&
    assignment.status !== 'sospeso' &&
    (!process || assignment.process === process)
  ))
  return workers.filter((worker) => worker.active && (!process || worker.skills.includes(process))).sort(compareWorkshopWorkers).map((worker) => {
    const workerAssignments = byWorker.filter((assignment) => assignment.workerId === worker.id)
    const loadPoints = round1(workerAssignments.reduce((sum, assignment) => sum + assignment.loadPoints, 0))
    const capacityPoints = worker.weeklyCapacityPoints || 500
    const percent = capacityPoints > 0 ? Math.round((loadPoints / capacityPoints) * 100) : 0
    return {
      worker,
      loadPoints,
      capacityPoints,
      percent,
      level: getWorkerLoadLevel(percent),
      assignments: workerAssignments,
    }
  })
}

export function getWorkerLoadLevel(percent: number): WorkerLoadLevel {
  if (percent > 100) return 'sovraccarico'
  if (percent >= 85) return 'pieno'
  if (percent >= 60) return 'normale'
  return 'disponibile'
}

/**
 * Indice di saturazione su scala 0–10 (10 = saturazione massima = 100% capacità).
 * Più intuitivo della percentuale per leggere a colpo d'occhio il carico di un
 * operaio o di una postazione. Oltre 10 = sovraccarico.
 */
export function saturationScore10(percent: number): number {
  return Math.round((percent / 10) * 10) / 10
}

// === Aggregazione mensile ===

export interface WorkerWeekCell {
  weekStart: string
  weekIso: number
  loadPoints: number
  capacityPoints: number
  percent: number
  level: WorkerLoadLevel
}

export interface WorkerMonthLoad {
  worker: WorkshopWorker
  weeks: WorkerWeekCell[]
  loadPoints: number
  capacityPoints: number
  percent: number
  level: WorkerLoadLevel
}

/**
 * Restituisce le settimane (lunedì ISO) che coprono il mese contenente
 * `monthAnchorISO` (una data qualsiasi del mese, YYYY-MM-DD).
 */
export function getMonthWeeks(monthAnchorISO: string): string[] {
  const anchor = parseISODate(monthAnchorISO)
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const firstWeek = startOfWeek(new Date(year, month, 1))
  const lastWeek = startOfWeek(new Date(year, month + 1, 0))
  const weeks: string[] = []
  const cursor = new Date(firstWeek)
  while (cursor.getTime() <= lastWeek.getTime()) {
    weeks.push(formatISODate(cursor))
    cursor.setDate(cursor.getDate() + 7)
  }
  return weeks
}

export function aggregateWorkerLoadByMonth(
  assignments: WorkshopAssignment[],
  workers: WorkshopWorker[],
  monthAnchorISO: string,
  process?: WorkshopAssignmentProcess,
): WorkerMonthLoad[] {
  const weeks = getMonthWeeks(monthAnchorISO)
  const active = assignments.filter((assignment) => (
    assignment.status !== 'sospeso' &&
    (!process || assignment.process === process)
  ))
  return workers.filter((worker) => worker.active && (!process || worker.skills.includes(process))).sort(compareWorkshopWorkers).map((worker) => {
    const weeklyCapacity = worker.weeklyCapacityPoints || 500
    const weekCells: WorkerWeekCell[] = weeks.map((weekStart) => {
      const daySet = new Set(getWeekDays(weekStart))
      const loadPoints = round1(
        active
          .filter((assignment) => assignment.workerId === worker.id && daySet.has(assignment.plannedDate))
          .reduce((sum, assignment) => sum + assignment.loadPoints, 0),
      )
      const percent = weeklyCapacity > 0 ? Math.round((loadPoints / weeklyCapacity) * 100) : 0
      return {
        weekStart,
        weekIso: isoWeekNumber(parseISODate(weekStart)),
        loadPoints,
        capacityPoints: weeklyCapacity,
        percent,
        level: getWorkerLoadLevel(percent),
      }
    })
    const loadPoints = round1(weekCells.reduce((sum, cell) => sum + cell.loadPoints, 0))
    const capacityPoints = weeklyCapacity * weeks.length
    const percent = capacityPoints > 0 ? Math.round((loadPoints / capacityPoints) * 100) : 0
    return {
      worker,
      weeks: weekCells,
      loadPoints,
      capacityPoints,
      percent,
      level: getWorkerLoadLevel(percent),
    }
  })
}

export function getAssignmentCoverageForOutput(
  output: WorkshopOutput,
  assignments: WorkshopAssignment[],
  sourceType: WorkshopAssignmentSourceType = 'output',
): OutputCoverage {
  const requiredProcesses = sourceType === 'standard_component'
    ? getStandardComponentProcesses(output)
    : getOutputRequiredProcesses(output)
  const activeAssignments = assignments.filter((assignment) => (
    assignment.workshopOutputId === output.id &&
    assignment.status !== 'sospeso' &&
    (assignment.sourceType ?? 'output') === sourceType
  ))
  const processStatus = Object.fromEntries(
    requiredProcesses.map((process) => {
      const matching = activeAssignments.filter((assignment) => assignment.process === process)
      const expected = sourceType === 'standard_component'
        ? estimateStandardComponentLoadPoints(output, process)
        : estimateProcessLoadPoints(output, process)
      const assigned = matching.reduce((sum, assignment) => sum + assignment.loadPoints, 0)
      const status = matching.length === 0
        ? 'missing'
        : assigned + 0.05 >= expected
          ? 'covered'
          : 'partial'
      return [process, status]
    }),
  ) as OutputCoverage['processStatus']
  const coveredProcesses = requiredProcesses.filter((process) => processStatus[process] === 'covered')
  const missingProcesses = requiredProcesses.filter((process) => processStatus[process] !== 'covered')
  const status: OutputCoverageStatus =
    requiredProcesses.length === 0 || coveredProcesses.length === requiredProcesses.length
      ? 'assegnato'
      : coveredProcesses.length === 0 && activeAssignments.length === 0
        ? 'non_assegnato'
        : 'parziale'
  return {
    status,
    requiredProcesses,
    coveredProcesses,
    missingProcesses,
    processStatus,
  }
}

export function getAssignmentPlannedWeek(plannedDate: string): string {
  return formatISODate(startOfWeek(parseISODate(plannedDate)))
}

export function getWeekDays(weekStart: string): string[] {
  const start = parseISODate(weekStart)
  return [0, 1, 2, 3, 4].map((offset) => {
    const d = new Date(start)
    d.setDate(d.getDate() + offset)
    return formatISODate(d)
  })
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
