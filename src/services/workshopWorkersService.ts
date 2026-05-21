import type { AppData, WorkshopWorker, WorkshopWorkerSkill } from '../types'
import { logEntry } from '../utils/activityLog'
import { uid } from '../utils/format'
import type { WorkshopWorkerImportPlan } from '../utils/workshopWorkersImport'

export type CreateWorkshopWorkerInput = Omit<WorkshopWorker, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateWorkshopWorkerInput = Partial<CreateWorkshopWorkerInput>

export interface WorkshopWorkerImportResult {
  created: number
  updated: number
  skipped: number
}

function nowISO(): string {
  return new Date().toISOString()
}

function cleanString(value: string | undefined | null): string {
  return value?.trim() ?? ''
}

function cleanCapacity(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}

function normalizeSkills(skills: WorkshopWorkerSkill[] | undefined): WorkshopWorkerSkill[] {
  return Array.from(new Set(skills ?? []))
}

function normalizeInput(input: CreateWorkshopWorkerInput): CreateWorkshopWorkerInput {
  const firstName = cleanString(input.firstName)
  const lastName = cleanString(input.lastName)
  const displayName = cleanString(input.displayName) || [firstName, lastName].filter(Boolean).join(' ')
  const skills = normalizeSkills(input.skills)
  const primarySkill = input.primarySkill && skills.includes(input.primarySkill) ? input.primarySkill : (skills[0] ?? '')
  return {
    employeeCode: cleanString(input.employeeCode),
    firstName,
    lastName,
    displayName,
    role: cleanString(input.role),
    department: cleanString(input.department),
    employmentType: cleanString(input.employmentType),
    phone: cleanString(input.phone),
    mobilePhone: cleanString(input.mobilePhone),
    email: cleanString(input.email),
    address: cleanString(input.address),
    city: cleanString(input.city),
    province: cleanString(input.province).toUpperCase(),
    fiscalCode: cleanString(input.fiscalCode).toUpperCase(),
    birthDate: cleanString(input.birthDate),
    hireDate: cleanString(input.hireDate),
    skills,
    primarySkill,
    dailyCapacityPoints: cleanCapacity(input.dailyCapacityPoints, 100),
    weeklyCapacityPoints: cleanCapacity(input.weeklyCapacityPoints, 500),
    active: input.active !== false,
    notes: cleanString(input.notes),
    extraFields: input.extraFields,
  }
}

function sortWorkers(rows: WorkshopWorker[]): WorkshopWorker[] {
  return rows.slice().sort((a, b) => a.displayName.localeCompare(b.displayName, 'it', { sensitivity: 'base' }))
}

function describeChange(before: WorkshopWorker, after: WorkshopWorker): string {
  const parts: string[] = []
  if (before.displayName !== after.displayName) parts.push('nominativo aggiornato')
  if (before.role !== after.role) parts.push('mansione aggiornata')
  if (before.department !== after.department) parts.push('reparto aggiornato')
  if (before.phone !== after.phone || before.mobilePhone !== after.mobilePhone) parts.push('contatti aggiornati')
  if (before.email !== after.email) parts.push('email aggiornata')
  if (before.skills.join(',') !== after.skills.join(',')) parts.push('skill aggiornate')
  if (before.dailyCapacityPoints !== after.dailyCapacityPoints || before.weeklyCapacityPoints !== after.weeklyCapacityPoints) {
    parts.push('capacita aggiornata')
  }
  if (before.active !== after.active) parts.push(after.active ? 'operaio riattivato' : 'operaio disattivato')
  return parts.length > 0 ? parts.join(' - ') : 'modifica minore'
}

export function createWorkshopWorker(
  data: AppData,
  input: CreateWorkshopWorkerInput,
): { data: AppData; id: string; worker: WorkshopWorker } {
  const at = nowISO()
  const normalized = normalizeInput(input)
  const worker: WorkshopWorker = {
    ...normalized,
    id: uid('ww'),
    createdAt: at,
    updatedAt: at,
  }
  const nextData = {
    ...data,
    workshopWorkers: sortWorkers([...data.workshopWorkers, worker]),
  }
  return {
    id: worker.id,
    worker,
    data: logEntry(nextData, {
      entityType: 'workshopWorker',
      entityId: worker.id,
      action: 'created',
      title: `Operaio officina creato: ${worker.displayName}`,
      after: { displayName: worker.displayName, active: worker.active, skills: worker.skills },
    }),
  }
}

export function updateWorkshopWorker(
  data: AppData,
  id: string,
  patch: UpdateWorkshopWorkerInput,
): AppData {
  const before = data.workshopWorkers.find((item) => item.id === id)
  if (!before) return data
  const at = nowISO()
  const after: WorkshopWorker = {
    ...before,
    ...normalizeInput({ ...before, ...patch }),
    id: before.id,
    createdAt: before.createdAt,
    updatedAt: at,
  }
  const nextData = {
    ...data,
    workshopWorkers: sortWorkers(data.workshopWorkers.map((item) => (item.id === id ? after : item))),
  }
  return logEntry(nextData, {
    entityType: 'workshopWorker',
    entityId: id,
    action: before.active !== after.active ? 'status_changed' : 'updated',
    title: before.active !== after.active
      ? `Operaio officina ${after.active ? 'riattivato' : 'disattivato'}: ${after.displayName}`
      : `Operaio officina aggiornato: ${after.displayName}`,
    description: describeChange(before, after),
    before: { displayName: before.displayName, active: before.active, skills: before.skills },
    after: { displayName: after.displayName, active: after.active, skills: after.skills },
  })
}

export function setWorkshopWorkerActive(data: AppData, id: string, active: boolean): AppData {
  return updateWorkshopWorker(data, id, { active })
}

export function applyWorkshopWorkerImport(
  data: AppData,
  plan: WorkshopWorkerImportPlan,
): { data: AppData; result: WorkshopWorkerImportResult } {
  const at = nowISO()
  const next = new Map<string, WorkshopWorker>()
  data.workshopWorkers.forEach((worker) => next.set(worker.id, worker))
  let created = 0
  let updated = 0

  for (const item of plan.items) {
    if (item.decision === 'skip') continue
    if (item.decision === 'update' && item.matchedId) {
      const current = next.get(item.matchedId)
      if (!current) continue
      const normalized = normalizeInput({ ...current, ...item.worker })
      next.set(item.matchedId, {
        ...current,
        ...normalized,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: at,
      })
      updated++
      continue
    }
    if (item.decision === 'create') {
      const normalized = normalizeInput(item.worker)
      const id = uid('ww')
      next.set(id, {
        ...normalized,
        id,
        createdAt: at,
        updatedAt: at,
      })
      created++
    }
  }

  const result = { created, updated, skipped: plan.toSkip }
  const nextData = {
    ...data,
    workshopWorkers: sortWorkers(Array.from(next.values())),
  }
  return {
    result,
    data: logEntry(nextData, {
      entityType: 'system',
      entityId: 'import-workshop-workers',
      action: 'imported',
      title: 'Import elenco dipendenti completato',
      description: `${result.created} nuovi, ${result.updated} aggiornati, ${result.skipped} scartati${plan.fileName ? ` - file: ${plan.fileName}` : ''}`,
    }),
  }
}
