import type {
  AppData,
  WorkshopAssignment,
  WorkshopAssignmentProcess,
  WorkshopAssignmentSourceType,
  WorkshopAssignmentStatus,
} from '../types'
import { logEntry } from '../utils/activityLog'
import { uid } from '../utils/format'
import { getAssignmentPlannedWeek } from '../utils/workshopCapacity'

export type CreateWorkshopAssignmentInput = Omit<WorkshopAssignment, 'id' | 'createdAt' | 'updatedAt' | 'plannedWeek'>
export type UpdateWorkshopAssignmentInput = Partial<CreateWorkshopAssignmentInput>
export type WorkshopAssignmentDraft = Omit<WorkshopAssignment, 'id' | 'createdAt' | 'updatedAt' | 'plannedWeek'> & {
  id?: string
  plannedWeek?: string
}

function nowISO(): string {
  return new Date().toISOString()
}

function cleanString(value: string | undefined | null): string {
  return value?.trim() ?? ''
}

function cleanLoadPoints(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.1
  return Math.max(0.1, Math.round(value * 10) / 10)
}

function sortAssignments(rows: WorkshopAssignment[]): WorkshopAssignment[] {
  return rows.slice().sort((a, b) => (
    a.plannedDate.localeCompare(b.plannedDate) ||
    a.process.localeCompare(b.process) ||
    a.createdAt.localeCompare(b.createdAt)
  ))
}

function normalizeDraft(input: WorkshopAssignmentDraft | CreateWorkshopAssignmentInput): CreateWorkshopAssignmentInput & { plannedWeek: string } {
  const plannedDate = cleanString(input.plannedDate)
  const sourceType: WorkshopAssignmentSourceType = input.sourceType === 'standard_component' ? 'standard_component' : 'output'
  return {
    workshopOutputId: cleanString(input.workshopOutputId),
    workItemId: cleanString(input.workItemId),
    workerId: cleanString(input.workerId),
    process: input.process,
    sourceType,
    plannedDate,
    plannedWeek: plannedDate ? getAssignmentPlannedWeek(plannedDate) : '',
    loadPoints: cleanLoadPoints(input.loadPoints),
    status: input.status || 'pianificato',
    notes: cleanString(input.notes),
  }
}

function titleForStatus(status: WorkshopAssignmentStatus): string {
  if (status === 'completato') return 'Assegnazione officina completata'
  if (status === 'sospeso') return 'Assegnazione officina sospesa'
  return 'Assegnazione officina aggiornata'
}

function processLabel(process: WorkshopAssignmentProcess): string {
  return process.replaceAll('_', ' ')
}

export function createWorkshopAssignment(
  data: AppData,
  input: CreateWorkshopAssignmentInput,
): { data: AppData; id: string; assignment: WorkshopAssignment } {
  const at = nowISO()
  const normalized = normalizeDraft(input)
  const assignment: WorkshopAssignment = {
    ...normalized,
    id: uid('wa'),
    createdAt: at,
    updatedAt: at,
  }
  const nextData = {
    ...data,
    workshopAssignments: sortAssignments([...data.workshopAssignments, assignment]),
  }
  return {
    id: assignment.id,
    assignment,
    data: logEntry(nextData, {
      entityType: 'workshopAssignment',
      entityId: assignment.id,
      action: 'created',
      title: `Assegnazione officina creata: ${processLabel(assignment.process)}`,
      description: `${assignment.loadPoints} punti - ${assignment.plannedDate}`,
      after: { ...assignment },
    }),
  }
}

export function updateWorkshopAssignment(
  data: AppData,
  id: string,
  patch: UpdateWorkshopAssignmentInput,
): AppData {
  const before = data.workshopAssignments.find((assignment) => assignment.id === id)
  if (!before) return data
  const at = nowISO()
  const normalized = normalizeDraft({ ...before, ...patch })
  const after: WorkshopAssignment = {
    ...before,
    ...normalized,
    id: before.id,
    createdAt: before.createdAt,
    updatedAt: at,
  }
  const nextData = {
    ...data,
    workshopAssignments: sortAssignments(data.workshopAssignments.map((assignment) => assignment.id === id ? after : assignment)),
  }
  return logEntry(nextData, {
    entityType: 'workshopAssignment',
    entityId: id,
    action: before.status !== after.status ? 'status_changed' : 'updated',
    title: before.status !== after.status ? titleForStatus(after.status) : `Assegnazione officina modificata: ${processLabel(after.process)}`,
    description: describeChange(before, after),
    before: { status: before.status, workerId: before.workerId, loadPoints: before.loadPoints },
    after: { status: after.status, workerId: after.workerId, loadPoints: after.loadPoints },
  })
}

export function deleteWorkshopAssignment(data: AppData, id: string): AppData {
  const before = data.workshopAssignments.find((assignment) => assignment.id === id)
  if (!before) return data
  const nextData = {
    ...data,
    workshopAssignments: data.workshopAssignments.filter((assignment) => assignment.id !== id),
  }
  return logEntry(nextData, {
    entityType: 'workshopAssignment',
    entityId: id,
    action: 'deleted',
    title: `Assegnazione officina eliminata: ${processLabel(before.process)}`,
    description: `${before.loadPoints} punti - ${before.plannedDate}`,
    before: { ...before },
  })
}

export function setWorkshopAssignmentStatus(
  data: AppData,
  id: string,
  status: WorkshopAssignmentStatus,
): AppData {
  return updateWorkshopAssignment(data, id, { status })
}

export function replaceWorkshopAssignmentsForOutput(
  data: AppData,
  workshopOutputId: string,
  drafts: WorkshopAssignmentDraft[],
  sourceType: WorkshopAssignmentSourceType = 'output',
): AppData {
  const existing = data.workshopAssignments.filter((assignment) => (
    assignment.workshopOutputId === workshopOutputId &&
    (assignment.sourceType ?? 'output') === sourceType
  ))
  const existingById = new Map(existing.map((assignment) => [assignment.id, assignment]))
  const at = nowISO()
  const nextForOutput = drafts
    .filter((draft) => draft.workerId && draft.plannedDate && draft.loadPoints > 0)
    .map((draft) => {
      const current = draft.id ? existingById.get(draft.id) : undefined
      const normalized = normalizeDraft({ ...draft, sourceType })
      return {
        ...normalized,
        id: current?.id ?? uid('wa'),
        createdAt: current?.createdAt ?? at,
        updatedAt: at,
      } satisfies WorkshopAssignment
    })
  const nextData = {
    ...data,
    workshopAssignments: sortAssignments([
      ...data.workshopAssignments.filter((assignment) => assignment.workshopOutputId !== workshopOutputId),
      ...data.workshopAssignments.filter((assignment) => (
        assignment.workshopOutputId === workshopOutputId &&
        (assignment.sourceType ?? 'output') !== sourceType
      )),
      ...nextForOutput,
    ]),
  }
  const created = nextForOutput.filter((assignment) => !existingById.has(assignment.id)).length
  const updated = nextForOutput.length - created
  const deleted = existing.length - nextForOutput.filter((assignment) => existingById.has(assignment.id)).length
  return logEntry(nextData, {
    entityType: 'workshopAssignment',
    entityId: workshopOutputId,
    action: created > 0 ? 'created' : deleted > 0 ? 'deleted' : 'updated',
    title: sourceType === 'standard_component' ? 'Assegnazioni standard anticipabili salvate' : 'Assegnazioni officina salvate',
    description: `${created} create - ${updated} aggiornate - ${Math.max(0, deleted)} eliminate`,
    after: { workshopOutputId, created, updated, deleted: Math.max(0, deleted) },
  })
}

export function createAssignmentsForOutput(
  data: AppData,
  workshopOutputId: string,
  assignments: WorkshopAssignmentDraft[],
): AppData {
  return replaceWorkshopAssignmentsForOutput(data, workshopOutputId, assignments)
}

function describeChange(before: WorkshopAssignment, after: WorkshopAssignment): string {
  const parts: string[] = []
  if (before.workerId !== after.workerId) parts.push('operaio aggiornato')
  if (before.process !== after.process) parts.push('processo aggiornato')
  if (before.plannedDate !== after.plannedDate) parts.push(`data ${before.plannedDate} -> ${after.plannedDate}`)
  if (before.loadPoints !== after.loadPoints) parts.push(`punti ${before.loadPoints} -> ${after.loadPoints}`)
  if (before.status !== after.status) parts.push(`stato ${before.status} -> ${after.status}`)
  if (before.notes !== after.notes) parts.push('note aggiornate')
  return parts.length > 0 ? parts.join(' - ') : 'modifica minore'
}
