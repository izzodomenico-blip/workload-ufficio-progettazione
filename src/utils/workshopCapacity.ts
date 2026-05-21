import type {
  WorkshopAssignment,
  WorkshopAssignmentProcess,
  WorkshopOutput,
  WorkshopWorker,
} from '../types'
import { formatISODate, parseISODate, startOfWeek } from './dates'

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
  if (output.requiresAssembly) processes.push('montaggio')
  if (output.requiresPainting) processes.push('verniciatura')
  if (output.requiresTesting) processes.push('collaudo')
  return processes
}

export function estimateProcessLoadPoints(output: WorkshopOutput, process: WorkshopAssignmentProcess): number {
  const required = getOutputRequiredProcesses(output)
  const divisor = required.length > 0 ? required.length : 1
  const basePerProcess = output.impactScore / divisor
  return round1(basePerProcess * PROCESS_LOAD_WEIGHTS[process])
}

export function getAssignableWorkersForProcess(
  process: WorkshopAssignmentProcess,
  workers: WorkshopWorker[],
): WorkshopWorker[] {
  return workers
    .filter((worker) => worker.active && worker.skills.includes(process))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'it', { sensitivity: 'base' }))
}

export function aggregateWorkerLoadByDay(
  assignments: WorkshopAssignment[],
  workers: WorkshopWorker[],
  date: string,
): WorkerLoadSummary[] {
  const byWorker = assignments.filter((assignment) => assignment.plannedDate === date && assignment.status !== 'sospeso')
  return workers.filter((worker) => worker.active).map((worker) => {
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
): WorkerLoadSummary[] {
  const weekDays = getWeekDays(weekStart)
  const daySet = new Set(weekDays)
  const byWorker = assignments.filter((assignment) => daySet.has(assignment.plannedDate) && assignment.status !== 'sospeso')
  return workers.filter((worker) => worker.active).map((worker) => {
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

export function getAssignmentCoverageForOutput(
  output: WorkshopOutput,
  assignments: WorkshopAssignment[],
): OutputCoverage {
  const requiredProcesses = getOutputRequiredProcesses(output)
  const activeAssignments = assignments.filter((assignment) => (
    assignment.workshopOutputId === output.id &&
    assignment.status !== 'sospeso'
  ))
  const processStatus = Object.fromEntries(
    requiredProcesses.map((process) => {
      const matching = activeAssignments.filter((assignment) => assignment.process === process)
      const expected = estimateProcessLoadPoints(output, process)
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
