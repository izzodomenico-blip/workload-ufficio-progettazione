import type { AppData, MachineType } from '../types'
import { logEntry } from '../utils/activityLog'
import { uid } from '../utils/format'

export type CreateMachineTypeInput = Omit<MachineType, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateMachineTypeInput = Partial<Omit<MachineType, 'id' | 'createdAt' | 'updatedAt'>>

const PROCESS_FIELDS = [
  { flag: 'defaultRequiresLaser', weight: 'defaultLaserWeightPercent', label: 'laser' },
  { flag: 'defaultRequiresTubeLaser', weight: 'defaultTubeLaserWeightPercent', label: 'tubeLaser' },
  { flag: 'defaultRequiresBending', weight: 'defaultBendingWeightPercent', label: 'bending' },
  { flag: 'defaultRequiresWelding', weight: 'defaultWeldingWeightPercent', label: 'welding' },
  { flag: 'defaultRequiresAssembly', weight: 'defaultAssemblyWeightPercent', label: 'assembly' },
  { flag: 'defaultRequiresPainting', weight: 'defaultPaintingWeightPercent', label: 'painting' },
  { flag: 'defaultRequiresTesting', weight: 'defaultTestingWeightPercent', label: 'testing' },
] as const

function nowISO(): string {
  return new Date().toISOString()
}

function sortMachineTypes(rows: MachineType[]): MachineType[] {
  return rows.slice().sort((a, b) => a.code.localeCompare(b.code, 'it', { sensitivity: 'base' }))
}

function cleanString(value: string | undefined, fallback = ''): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function cleanNumber(value: number | undefined, fallback: number, min = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, value)
}

function cleanInteger(value: number | undefined, fallback: number): number {
  return Math.round(cleanNumber(value, fallback))
}

function cleanPercent(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, Math.round(value)))
}

function cleanProcessWeights(input: CreateMachineTypeInput) {
  const active = PROCESS_FIELDS.filter((process) => Boolean(input[process.flag]))
  const fallback = active.length > 0 ? Math.round(100 / active.length) : 0
  return Object.fromEntries(
    PROCESS_FIELDS.map((process) => [
      process.weight,
      input[process.flag] ? cleanPercent(input[process.weight], fallback) : 0,
    ]),
  ) as Pick<
    MachineType,
    | 'defaultLaserWeightPercent'
    | 'defaultTubeLaserWeightPercent'
    | 'defaultBendingWeightPercent'
    | 'defaultWeldingWeightPercent'
    | 'defaultAssemblyWeightPercent'
    | 'defaultPaintingWeightPercent'
    | 'defaultTestingWeightPercent'
  >
}

function normalizeInput(input: CreateMachineTypeInput): CreateMachineTypeInput {
  return {
    ...input,
    code: cleanString(input.code).toUpperCase(),
    name: cleanString(input.name),
    family: cleanString(input.family, 'Generico'),
    description: cleanString(input.description),
    defaultImpactWeight: cleanNumber(input.defaultImpactWeight, 1, 0.1),
    ...cleanProcessWeights(input),
    typicalAssemblyCount: cleanInteger(input.typicalAssemblyCount, 1),
    typicalPartCount: cleanInteger(input.typicalPartCount, 10),
    active: input.active !== false,
    notes: cleanString(input.notes),
  }
}

function describeChange(before: MachineType, after: MachineType): string {
  const parts: string[] = []
  if (before.code !== after.code) parts.push(`codice ${before.code} -> ${after.code}`)
  if (before.name !== after.name) parts.push('nome aggiornato')
  if (before.family !== after.family) parts.push(`famiglia ${before.family} -> ${after.family}`)
  if (before.defaultImpactWeight !== after.defaultImpactWeight) {
    parts.push(`peso ${before.defaultImpactWeight} -> ${after.defaultImpactWeight}`)
  }
  if (before.defaultComplexity !== after.defaultComplexity) {
    parts.push(`complessita ${before.defaultComplexity} -> ${after.defaultComplexity}`)
  }
  if (before.typicalAssemblyCount !== after.typicalAssemblyCount) {
    parts.push(`complessivi ${before.typicalAssemblyCount} -> ${after.typicalAssemblyCount}`)
  }
  if (before.typicalPartCount !== after.typicalPartCount) {
    parts.push(`particolari ${before.typicalPartCount} -> ${after.typicalPartCount}`)
  }
  const beforeProcesses = processKeys(before).join(',')
  const afterProcesses = processKeys(after).join(',')
  if (beforeProcesses !== afterProcesses) parts.push('processi default aggiornati')
  if (before.active !== after.active) parts.push(after.active ? 'tipologia attivata' : 'tipologia disattivata')
  if (before.notes !== after.notes) parts.push('note aggiornate')
  return parts.length > 0 ? parts.join(' - ') : 'modifica minore'
}

function processKeys(machineType: MachineType): string[] {
  return PROCESS_FIELDS
    .filter((process) => machineType[process.flag])
    .map((process) => `${process.label}:${machineType[process.weight]}%`)
}

export function createMachineType(
  data: AppData,
  input: CreateMachineTypeInput,
): { data: AppData; id: string; machineType: MachineType } {
  const at = nowISO()
  const normalized = normalizeInput(input)
  const machineType: MachineType = {
    ...normalized,
    id: uid('mt'),
    createdAt: at,
    updatedAt: at,
  }
  const nextData = {
    ...data,
    machineTypes: sortMachineTypes([...data.machineTypes, machineType]),
  }
  return {
    id: machineType.id,
    machineType,
    data: logEntry(nextData, {
      entityType: 'machineType',
      entityId: machineType.id,
      action: 'created',
      title: `Tipologia creata: ${machineType.code} - ${machineType.name}`,
      after: { code: machineType.code, active: machineType.active },
    }),
  }
}

export function updateMachineType(
  data: AppData,
  id: string,
  patch: UpdateMachineTypeInput,
): AppData {
  const before = data.machineTypes.find((item) => item.id === id)
  if (!before) return data
  const at = nowISO()
  const merged = normalizeInput({ ...before, ...patch })
  const after: MachineType = {
    ...before,
    ...merged,
    id: before.id,
    createdAt: before.createdAt,
    updatedAt: at,
  }
  const nextData = {
    ...data,
    machineTypes: sortMachineTypes(data.machineTypes.map((item) => (item.id === id ? after : item))),
  }
  return logEntry(nextData, {
    entityType: 'machineType',
    entityId: id,
    action: before.active !== after.active ? 'status_changed' : 'updated',
    title: before.active !== after.active
      ? `Tipologia ${after.active ? 'attivata' : 'disattivata'}: ${after.code} - ${after.name}`
      : `Tipologia aggiornata: ${after.code} - ${after.name}`,
    description: describeChange(before, after),
    before: { code: before.code, active: before.active, defaultImpactWeight: before.defaultImpactWeight },
    after: { code: after.code, active: after.active, defaultImpactWeight: after.defaultImpactWeight },
  })
}

export function setMachineTypeActive(data: AppData, id: string, active: boolean): AppData {
  return updateMachineType(data, id, { active })
}
