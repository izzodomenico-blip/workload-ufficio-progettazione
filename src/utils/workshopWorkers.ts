import type { WorkshopWorker } from '../types'

export type WorkshopWorkerSortMode = 'lastName' | 'firstName'

export function workshopWorkerLastName(worker: Pick<WorkshopWorker, 'lastName' | 'displayName'>): string {
  const explicit = worker.lastName?.trim()
  if (explicit) return explicit
  const parts = worker.displayName.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : worker.displayName.trim()
}

export function workshopWorkerFirstName(worker: Pick<WorkshopWorker, 'firstName' | 'displayName'>): string {
  const explicit = worker.firstName?.trim()
  if (explicit) return explicit
  const parts = worker.displayName.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? parts.slice(0, -1).join(' ') : worker.displayName.trim()
}

export function compareWorkshopWorkers(
  a: WorkshopWorker,
  b: WorkshopWorker,
  mode: WorkshopWorkerSortMode = 'lastName',
): number {
  const left = mode === 'lastName'
    ? `${workshopWorkerLastName(a)} ${workshopWorkerFirstName(a)} ${a.displayName}`
    : `${workshopWorkerFirstName(a)} ${workshopWorkerLastName(a)} ${a.displayName}`
  const right = mode === 'lastName'
    ? `${workshopWorkerLastName(b)} ${workshopWorkerFirstName(b)} ${b.displayName}`
    : `${workshopWorkerFirstName(b)} ${workshopWorkerLastName(b)} ${b.displayName}`
  return left.localeCompare(right, 'it', { sensitivity: 'base' })
}

export function sortWorkshopWorkers(
  workers: WorkshopWorker[],
  mode: WorkshopWorkerSortMode = 'lastName',
): WorkshopWorker[] {
  return workers.slice().sort((a, b) => compareWorkshopWorkers(a, b, mode))
}
