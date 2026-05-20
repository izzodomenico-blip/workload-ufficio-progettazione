import type { AppData, MachineType, WorkshopOutput, WorkshopOutputStatus } from '../types'
import { logEntry, workItemLabel } from '../utils/activityLog'
import { uid } from '../utils/format'
import { calculateWorkshopImpact } from '../utils/workshopImpact'

export type WorkshopOutputDraft =
  Omit<WorkshopOutput, 'id' | 'workItemId' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<WorkshopOutput, 'id' | 'workItemId' | 'createdAt' | 'updatedAt'>>

export type CreateWorkshopOutputInput = Omit<WorkshopOutputDraft, 'id' | 'workItemId' | 'createdAt' | 'updatedAt'>
export type UpdateWorkshopOutputInput = Partial<CreateWorkshopOutputInput>

function nowISO(): string {
  return new Date().toISOString()
}

function machineTypeFor(data: AppData, output: Pick<WorkshopOutput, 'machineTypeId' | 'machineTypeCode'>): MachineType | undefined {
  return data.machineTypes.find((item) => (
    item.id === output.machineTypeId ||
    item.code.toUpperCase() === output.machineTypeCode.toUpperCase()
  ))
}

function normalizeDraft(
  data: AppData,
  workItemId: string,
  draft: WorkshopOutputDraft,
  existing?: WorkshopOutput,
): WorkshopOutput {
  const at = nowISO()
  const base: WorkshopOutput = {
    id: existing?.id ?? (draft.id && !draft.id.startsWith('tmp_') ? draft.id : uid('wo')),
    workItemId,
    machineTypeId: draft.machineTypeId?.trim() ?? '',
    machineTypeCode: draft.machineTypeCode.trim().toUpperCase(),
    machineTypeName: draft.machineTypeName.trim(),
    description: draft.description.trim(),
    quantity: cleanNumber(draft.quantity, 1, 0.1),
    complexity: draft.complexity,
    assemblyCount: cleanInteger(draft.assemblyCount, 0),
    estimatedPartCount: cleanInteger(draft.estimatedPartCount, 0),
    requiresLaser: Boolean(draft.requiresLaser),
    requiresTubeLaser: Boolean(draft.requiresTubeLaser),
    requiresBending: Boolean(draft.requiresBending),
    requiresWelding: Boolean(draft.requiresWelding),
    requiresAssembly: Boolean(draft.requiresAssembly),
    requiresPainting: Boolean(draft.requiresPainting),
    requiresTesting: Boolean(draft.requiresTesting),
    plannedReleaseDate: draft.plannedReleaseDate ?? '',
    actualReleaseDate: draft.actualReleaseDate ?? '',
    impactScore: 0,
    status: draft.status,
    notes: draft.notes.trim(),
    createdAt: existing?.createdAt ?? draft.createdAt ?? at,
    updatedAt: at,
  }
  return {
    ...base,
    impactScore: calculateWorkshopImpact(base, machineTypeFor(data, base)),
  }
}

function cleanNumber(value: number, fallback: number, min: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, value)
}

function cleanInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.round(value))
}

function sortOutputs(outputs: WorkshopOutput[]): WorkshopOutput[] {
  return outputs.slice().sort((a, b) => {
    const dateCompare = (a.plannedReleaseDate || '9999-99-99').localeCompare(b.plannedReleaseDate || '9999-99-99')
    if (dateCompare !== 0) return dateCompare
    return a.machineTypeCode.localeCompare(b.machineTypeCode, 'it', { sensitivity: 'base' })
  })
}

function outputLabel(output: WorkshopOutput): string {
  return `${output.machineTypeCode} - ${output.machineTypeName}`
}

function describeOutput(output: WorkshopOutput): string {
  return `qta ${output.quantity} - impatto ${output.impactScore} - stato ${statusLabel(output.status)}`
}

function describeChange(before: WorkshopOutput, after: WorkshopOutput): string {
  const parts: string[] = []
  if (before.machineTypeCode !== after.machineTypeCode) parts.push(`tipologia ${before.machineTypeCode} -> ${after.machineTypeCode}`)
  if (before.quantity !== after.quantity) parts.push(`qta ${before.quantity} -> ${after.quantity}`)
  if (before.complexity !== after.complexity) parts.push(`complessita ${before.complexity} -> ${after.complexity}`)
  if (before.assemblyCount !== after.assemblyCount) parts.push(`complessivi ${before.assemblyCount} -> ${after.assemblyCount}`)
  if (before.estimatedPartCount !== after.estimatedPartCount) parts.push(`particolari ${before.estimatedPartCount} -> ${after.estimatedPartCount}`)
  if (before.plannedReleaseDate !== after.plannedReleaseDate) parts.push('rilascio previsto aggiornato')
  if (before.actualReleaseDate !== after.actualReleaseDate) parts.push('rilascio effettivo aggiornato')
  if (before.status !== after.status) parts.push(`stato ${statusLabel(before.status)} -> ${statusLabel(after.status)}`)
  if (before.impactScore !== after.impactScore) parts.push(`impatto ${before.impactScore} -> ${after.impactScore}`)
  if (processKey(before) !== processKey(after)) parts.push('processi aggiornati')
  return parts.length > 0 ? parts.join(' - ') : 'modifica minore'
}

function processKey(output: WorkshopOutput): string {
  return [
    output.requiresLaser ? 'laser' : '',
    output.requiresTubeLaser ? 'tube' : '',
    output.requiresBending ? 'bend' : '',
    output.requiresWelding ? 'weld' : '',
    output.requiresAssembly ? 'assembly' : '',
    output.requiresPainting ? 'painting' : '',
    output.requiresTesting ? 'testing' : '',
  ].filter(Boolean).join(',')
}

function isSameOutput(before: WorkshopOutput, after: WorkshopOutput): boolean {
  return JSON.stringify({
    ...before,
    updatedAt: '',
    createdAt: '',
  }) === JSON.stringify({
    ...after,
    updatedAt: '',
    createdAt: '',
  })
}

function statusLabel(status: WorkshopOutputStatus): string {
  return status.replaceAll('_', ' ')
}

export function createWorkshopOutput(
  data: AppData,
  workItemId: string,
  input: CreateWorkshopOutputInput,
): { data: AppData; id: string; output: WorkshopOutput } {
  const output = normalizeDraft(data, workItemId, input)
  const workItem = data.workItems.find((item) => item.id === workItemId)
  const nextData = {
    ...data,
    workshopOutputs: sortOutputs([...data.workshopOutputs, output]),
  }
  return {
    id: output.id,
    output,
    data: logEntry(nextData, {
      entityType: 'workshopOutput',
      entityId: output.id,
      action: 'created',
      title: `Output officina creato: ${outputLabel(output)}`,
      description: `${workItem ? workItemLabel(workItem) : workItemId} - ${describeOutput(output)}`,
      after: { workItemId, status: output.status, impactScore: output.impactScore },
    }),
  }
}

export function updateWorkshopOutput(
  data: AppData,
  id: string,
  patch: UpdateWorkshopOutputInput,
): AppData {
  const before = data.workshopOutputs.find((output) => output.id === id)
  if (!before) return data
  const after = normalizeDraft(data, before.workItemId, { ...before, ...patch }, before)
  const nextData = {
    ...data,
    workshopOutputs: sortOutputs(data.workshopOutputs.map((output) => (output.id === id ? after : output))),
  }
  if (isSameOutput(before, after)) return nextData
  return logEntry(nextData, {
    entityType: 'workshopOutput',
    entityId: id,
    action: before.status !== after.status ? 'status_changed' : 'updated',
    title: after.status === 'rilasciato_produzione' && before.status !== after.status
      ? `Output officina rilasciato in produzione: ${outputLabel(after)}`
      : `Output officina modificato: ${outputLabel(after)}`,
    description: describeChange(before, after),
    before: { workItemId: before.workItemId, status: before.status, impactScore: before.impactScore },
    after: { workItemId: after.workItemId, status: after.status, impactScore: after.impactScore },
  })
}

export function deleteWorkshopOutput(data: AppData, id: string): AppData {
  const before = data.workshopOutputs.find((output) => output.id === id)
  if (!before) return data
  const nextData = {
    ...data,
    workshopOutputs: data.workshopOutputs.filter((output) => output.id !== id),
  }
  return logEntry(nextData, {
    entityType: 'workshopOutput',
    entityId: id,
    action: 'deleted',
    title: `Output officina eliminato: ${outputLabel(before)}`,
    description: describeOutput(before),
    before: { workItemId: before.workItemId, status: before.status, impactScore: before.impactScore },
  })
}

export function replaceWorkshopOutputsForWorkItem(
  data: AppData,
  workItemId: string,
  drafts: WorkshopOutputDraft[],
): AppData {
  const existing = data.workshopOutputs.filter((output) => output.workItemId === workItemId)
  const existingById = new Map(existing.map((output) => [output.id, output]))
  let nextData: AppData = {
    ...data,
    workshopOutputs: data.workshopOutputs.filter((output) => output.workItemId !== workItemId),
  }

  const keptIds = new Set<string>()
  const nextOutputs: WorkshopOutput[] = []
  for (const draft of drafts) {
    const before = draft.id ? existingById.get(draft.id) : undefined
    const after = normalizeDraft(data, workItemId, draft, before)
    keptIds.add(after.id)
    nextOutputs.push(after)
    if (!before) {
      nextData = logEntry(nextData, {
        entityType: 'workshopOutput',
        entityId: after.id,
        action: 'created',
        title: `Output officina creato: ${outputLabel(after)}`,
        description: describeOutput(after),
        after: { workItemId, status: after.status, impactScore: after.impactScore },
      })
    } else if (!isSameOutput(before, after)) {
      nextData = logEntry(nextData, {
        entityType: 'workshopOutput',
        entityId: after.id,
        action: before.status !== after.status ? 'status_changed' : 'updated',
        title: after.status === 'rilasciato_produzione' && before.status !== after.status
          ? `Output officina rilasciato in produzione: ${outputLabel(after)}`
          : `Output officina modificato: ${outputLabel(after)}`,
        description: describeChange(before, after),
        before: { workItemId, status: before.status, impactScore: before.impactScore },
        after: { workItemId, status: after.status, impactScore: after.impactScore },
      })
    }
  }

  for (const before of existing) {
    if (keptIds.has(before.id)) continue
    nextData = logEntry(nextData, {
      entityType: 'workshopOutput',
      entityId: before.id,
      action: 'deleted',
      title: `Output officina eliminato: ${outputLabel(before)}`,
      description: describeOutput(before),
      before: { workItemId, status: before.status, impactScore: before.impactScore },
    })
  }

  return {
    ...nextData,
    workshopOutputs: sortOutputs([...nextData.workshopOutputs, ...nextOutputs]),
  }
}

