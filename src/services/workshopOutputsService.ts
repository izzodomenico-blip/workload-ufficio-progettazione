import type {
  AppData,
  CalculatedStandardComponent,
  MachineType,
  StandardComponentsMode,
  StandardComponentsSubcategory,
  WorkshopOutput,
  WorkshopOutputStatus,
  WorkshopWorkerSkill,
} from '../types'
import { ALL_STANDARD_COMPONENTS_SUBCATEGORIES } from '../types'
import { logEntry, workItemLabel } from '../utils/activityLog'
import { uid } from '../utils/format'
import { calculateWorkshopImpact } from '../utils/workshopImpact'
import {
  calculateStandardComponentsPreview,
  getStandardCalculationType,
  validateStandardParameters,
} from '../utils/standardComponentsCalculator'

const STANDARD_COMPONENT_PROCESS_SET = new Set<WorkshopWorkerSkill>([
  'laser_piano',
  'laser_tubo',
  'piegatrice',
  'saldatura',
  'tornitura',
  'fresatura',
  'montaggio',
  'verniciatura',
  'collaudo',
  'altro',
])

export type WorkshopOutputDraft =
  Omit<WorkshopOutput, 'id' | 'workItemId' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<WorkshopOutput, 'id' | 'workItemId' | 'createdAt' | 'updatedAt'>>

export type CreateWorkshopOutputInput = Omit<WorkshopOutputDraft, 'id' | 'workItemId' | 'createdAt' | 'updatedAt'>
export type UpdateWorkshopOutputInput = Partial<CreateWorkshopOutputInput>

const PROCESS_FIELDS = [
  { flag: 'requiresLaser', weight: 'laserWeightPercent', key: 'laser' },
  { flag: 'requiresTubeLaser', weight: 'tubeLaserWeightPercent', key: 'tube' },
  { flag: 'requiresBending', weight: 'bendingWeightPercent', key: 'bend' },
  { flag: 'requiresWelding', weight: 'weldingWeightPercent', key: 'weld' },
  { flag: 'requiresTurning', weight: 'turningWeightPercent', key: 'turn' },
  { flag: 'requiresMilling', weight: 'millingWeightPercent', key: 'mill' },
  { flag: 'requiresAssembly', weight: 'assemblyWeightPercent', key: 'assembly' },
  { flag: 'requiresPainting', weight: 'paintingWeightPercent', key: 'painting' },
  { flag: 'requiresTesting', weight: 'testingWeightPercent', key: 'testing' },
] as const

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
    requiresTurning: Boolean(draft.requiresTurning),
    requiresMilling: Boolean(draft.requiresMilling),
    requiresAssembly: Boolean(draft.requiresAssembly),
    requiresPainting: Boolean(draft.requiresPainting),
    requiresTesting: Boolean(draft.requiresTesting),
    ...cleanProcessWeights(draft),
    hasStandardComponents: Boolean(draft.hasStandardComponents),
    standardComponentsDescription: cleanString(draft.standardComponentsDescription),
    standardComponentsQuantity: cleanInteger(draft.standardComponentsQuantity ?? 0, 0),
    standardComponentsReadyFromDate: cleanString(draft.standardComponentsReadyFromDate) || existing?.standardComponentsReadyFromDate || draft.createdAt?.slice(0, 10) || at.slice(0, 10),
    standardComponentsImpactScore: cleanNumber(draft.standardComponentsImpactScore ?? Math.round((draft.impactScore || 0) * 2.5) / 10, 0, 0),
    standardComponentsProcesses: cleanStandardProcesses(draft.standardComponentsProcesses),
    standardComponentsNotes: cleanString(draft.standardComponentsNotes),
    machineLengthMm: cleanOptionalPositiveNumber(draft.machineLengthMm),
    machineWidthMm: cleanOptionalPositiveNumber(draft.machineWidthMm),
    machineHeightMm: cleanOptionalPositiveNumber(draft.machineHeightMm),
    machineSpanMm: cleanOptionalPositiveNumber(draft.machineSpanMm),
    machineModuleCount: cleanOptionalPositiveNumber(draft.machineModuleCount),
    machineBayCount: cleanOptionalPositiveNumber(draft.machineBayCount),
    machineSlopePercent: cleanOptionalPositiveNumber(draft.machineSlopePercent),
    machineNotes: cleanString(draft.machineNotes),
    standardComponentsMode: cleanStandardComponentsMode(draft.standardComponentsMode),
    standardComponentsCalculationType: 'none',
    standardComponentsSubcategory: cleanStandardComponentsSubcategory(draft.standardComponentsSubcategory),
    standardComponentsCalculatedAt: cleanString(draft.standardComponentsCalculatedAt ?? '') || null,
    standardComponentsCalculationStatus: 'not_configured',
    hasCommercialComponents: Boolean(draft.hasCommercialComponents),
    commercialComponentsDescription: cleanString(draft.commercialComponentsDescription),
    commercialComponentsOrderRequired: Boolean(draft.commercialComponentsOrderRequired),
    commercialComponentsOrdered: Boolean(draft.commercialComponentsOrdered),
    commercialComponentsOrderedAt: cleanString(draft.commercialComponentsOrderedAt),
    commercialComponentsOrderedBy: cleanString(draft.commercialComponentsOrderedBy),
    commercialComponentsNotes: cleanString(draft.commercialComponentsNotes),
    plannedReleaseDate: draft.plannedReleaseDate ?? '',
    actualReleaseDate: draft.actualReleaseDate ?? '',
    impactScore: 0,
    status: draft.status,
    notes: draft.notes.trim(),
    createdAt: existing?.createdAt ?? draft.createdAt ?? at,
    updatedAt: at,
  }
  const calculated = calculateWorkshopImpact(base, machineTypeFor(data, base))
  const standardImpact = base.hasStandardComponents
    ? cleanNumber(draft.standardComponentsImpactScore ?? Math.round(calculated * 2.5) / 10, Math.round(calculated * 2.5) / 10, 0)
    : 0
  const calculationType = getStandardCalculationType(base.machineTypeCode)
  const validation = validateStandardParameters({
    machineTypeCode: base.machineTypeCode,
    machineLengthMm: base.machineLengthMm,
    machineWidthMm: base.machineWidthMm,
    machineHeightMm: base.machineHeightMm,
    machineSpanMm: base.machineSpanMm,
    machineModuleCount: base.machineModuleCount,
    machineBayCount: base.machineBayCount,
    machineSlopePercent: base.machineSlopePercent,
  })
  return {
    ...base,
    standardComponentsImpactScore: standardImpact,
    impactScore: calculated,
    standardComponentsCalculationType: calculationType,
    standardComponentsCalculationStatus: validation.status,
  }
}

function cleanString(value: string | undefined | null): string {
  return value?.trim() ?? ''
}

function cleanNumber(value: number, fallback: number, min: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, value)
}

function cleanInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.round(value))
}

function cleanPercent(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, Math.round(value ?? fallback)))
}

function cleanProcessWeights(draft: WorkshopOutputDraft) {
  const active = PROCESS_FIELDS.filter((process) => Boolean(draft[process.flag]))
  const fallback = active.length > 0 ? Math.round(100 / active.length) : 0
  return Object.fromEntries(
    PROCESS_FIELDS.map((process) => [
      process.weight,
      draft[process.flag] ? cleanPercent(draft[process.weight], fallback) : 0,
    ]),
  ) as Pick<
    WorkshopOutput,
    | 'laserWeightPercent'
    | 'tubeLaserWeightPercent'
    | 'bendingWeightPercent'
    | 'weldingWeightPercent'
    | 'turningWeightPercent'
    | 'millingWeightPercent'
    | 'assemblyWeightPercent'
    | 'paintingWeightPercent'
    | 'testingWeightPercent'
  >
}

function cleanStandardProcesses(value: WorkshopOutputDraft['standardComponentsProcesses']): WorkshopWorkerSkill[] {
  return Array.from(new Set((value ?? []).filter((process): process is WorkshopWorkerSkill => STANDARD_COMPONENT_PROCESS_SET.has(process))))
}

const STANDARD_MODES = new Set<StandardComponentsMode>(['manual', 'calculated', 'mixed'])

function cleanStandardComponentsMode(value: StandardComponentsMode | undefined): StandardComponentsMode {
  if (value && STANDARD_MODES.has(value)) return value
  return 'manual'
}

const STANDARD_SUBCATEGORIES = new Set<StandardComponentsSubcategory>(ALL_STANDARD_COMPONENTS_SUBCATEGORIES)

function cleanStandardComponentsSubcategory(value: StandardComponentsSubcategory | undefined): StandardComponentsSubcategory {
  if (value && STANDARD_SUBCATEGORIES.has(value)) return value
  return 'none'
}

function cleanOptionalPositiveNumber(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

const PARAMETER_FIELDS = [
  'machineLengthMm',
  'machineWidthMm',
  'machineHeightMm',
  'machineSpanMm',
  'machineModuleCount',
  'machineBayCount',
  'machineSlopePercent',
] as const

export function parametersChanged(before: WorkshopOutput, after: WorkshopOutput): boolean {
  for (const field of PARAMETER_FIELDS) {
    if ((before[field] ?? null) !== (after[field] ?? null)) return true
  }
  if ((before.machineNotes ?? '') !== (after.machineNotes ?? '')) return true
  return false
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
  if (before.hasStandardComponents !== after.hasStandardComponents) parts.push('componenti standard aggiornati')
  if (parametersChanged(before, after)) parts.push('parametri macchina aggiornati')
  if ((before.standardComponentsCalculationStatus ?? 'not_configured') !== (after.standardComponentsCalculationStatus ?? 'not_configured')) {
    parts.push(`stato calcolo standard ${before.standardComponentsCalculationStatus ?? '—'} -> ${after.standardComponentsCalculationStatus ?? '—'}`)
  }
  if (before.hasCommercialComponents !== after.hasCommercialComponents || before.commercialComponentsOrdered !== after.commercialComponentsOrdered) parts.push('componenti commerciali aggiornati')
  if (processKey(before) !== processKey(after)) parts.push('processi aggiornati')
  return parts.length > 0 ? parts.join(' - ') : 'modifica minore'
}

function processKey(output: WorkshopOutput): string {
  return PROCESS_FIELDS
    .filter((process) => output[process.flag])
    .map((process) => `${process.key}:${output[process.weight]}%`)
    .join(',')
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
  const nextData = regenerateCalculatedStandardsForOutput({
    ...data,
    workshopOutputs: sortOutputs([...data.workshopOutputs, output]),
  }, output)
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
  const nextData = regenerateCalculatedStandardsForOutput({
    ...data,
    workshopOutputs: sortOutputs(data.workshopOutputs.map((output) => (output.id === id ? after : output))),
  }, after)
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
    calculatedStandardComponents: (data.calculatedStandardComponents ?? []).filter((c) => c.workshopOutputId !== id),
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

  let merged: AppData = {
    ...nextData,
    workshopOutputs: sortOutputs([...nextData.workshopOutputs, ...nextOutputs]),
  }
  // Rimuove i componenti calcolati per output non piu presenti, rigenera per i nuovi/aggiornati.
  merged = {
    ...merged,
    calculatedStandardComponents: (merged.calculatedStandardComponents ?? []).filter(
      (component) => component.workItemId !== workItemId || keptIds.has(component.workshopOutputId),
    ),
  }
  for (const output of nextOutputs) {
    merged = regenerateCalculatedStandardsForOutput(merged, output)
  }
  return merged
}

// ===== Componenti standard calcolati =====

function nowOrFallback(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : new Date().toISOString()
}

export function regenerateCalculatedStandardsForOutput(
  data: AppData,
  output: WorkshopOutput,
): AppData {
  const existing = (data.calculatedStandardComponents ?? []).filter(
    (component) => component.workshopOutputId !== output.id,
  )
  const preview = calculateStandardComponentsPreview({
    machineTypeCode: output.machineTypeCode,
    machineLengthMm: output.machineLengthMm,
    machineWidthMm: output.machineWidthMm,
    machineHeightMm: output.machineHeightMm,
    machineSpanMm: output.machineSpanMm,
    machineModuleCount: output.machineModuleCount,
    machineBayCount: output.machineBayCount,
    machineSlopePercent: output.machineSlopePercent,
    standardComponentsSubcategory: output.standardComponentsSubcategory,
  })
  if (preview.status !== 'ready' || preview.components.length === 0) {
    return { ...data, calculatedStandardComponents: existing }
  }
  const at = new Date().toISOString()
  const created = preview.components.map((component, index) => ({
    ...component,
    id: uid(`csc_${output.id.replace(/^wo_?/, '')}_${index}`),
    workshopOutputId: output.id,
    workItemId: output.workItemId,
    machineTypeCode: output.machineTypeCode,
    readyFromDate: output.standardComponentsReadyFromDate || at.slice(0, 10),
    createdAt: nowOrFallback(component.createdAt),
    updatedAt: at,
  })) satisfies CalculatedStandardComponent[]
  return { ...data, calculatedStandardComponents: [...existing, ...created] }
}
