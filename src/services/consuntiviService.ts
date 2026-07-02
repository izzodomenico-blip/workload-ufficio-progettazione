import type { AppData, Consuntivo, WorkItem } from '../types'
import { logEntry } from '../utils/activityLog'
import { uid } from '../utils/format'

export type CreateConsuntivoInput = Omit<Consuntivo, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateConsuntivoInput = Partial<Omit<Consuntivo, 'id' | 'createdAt' | 'updatedAt'>>

function nowISO(): string {
  return new Date().toISOString()
}

function label(c: Consuntivo): string {
  return `${c.workItemCode || c.workItemId} · ${c.date}`
}

export function consuntivoFromWorkItem(workItem: WorkItem, date: string, operatorName = ''): CreateConsuntivoInput {
  return {
    workItemId: workItem.id,
    workItemCode: workItem.code,
    workItemTitle: workItem.title,
    customer: workItem.customer,
    date,
    operatorName,
    laserRows: [],
    tubeRows: [],
    weldingRows: [],
    bendingRows: [],
    notes: '',
  }
}

export function createConsuntivo(data: AppData, input: CreateConsuntivoInput): { data: AppData; id: string } {
  const at = nowISO()
  const consuntivo: Consuntivo = { ...input, id: uid('cons'), createdAt: at, updatedAt: at }
  const nextData: AppData = { ...data, consuntivi: [consuntivo, ...(data.consuntivi ?? [])] }
  return {
    id: consuntivo.id,
    data: logEntry(nextData, {
      entityType: 'system',
      entityId: consuntivo.id,
      action: 'created',
      title: `Consuntivo creato: ${label(consuntivo)}`,
      description: `${consuntivo.laserRows.length} righe laser · ${consuntivo.tubeRows.length} righe tubi`,
    }),
  }
}

export function updateConsuntivo(data: AppData, id: string, patch: UpdateConsuntivoInput): AppData {
  const before = (data.consuntivi ?? []).find((c) => c.id === id)
  if (!before) return data
  const after: Consuntivo = { ...before, ...patch, id: before.id, createdAt: before.createdAt, updatedAt: nowISO() }
  const nextData: AppData = {
    ...data,
    consuntivi: (data.consuntivi ?? []).map((c) => (c.id === id ? after : c)),
  }
  return logEntry(nextData, {
    entityType: 'system',
    entityId: id,
    action: 'updated',
    title: `Consuntivo aggiornato: ${label(after)}`,
  })
}

export function deleteConsuntivo(data: AppData, id: string): AppData {
  const before = (data.consuntivi ?? []).find((c) => c.id === id)
  if (!before) return data
  const nextData: AppData = { ...data, consuntivi: (data.consuntivi ?? []).filter((c) => c.id !== id) }
  return logEntry(nextData, {
    entityType: 'system',
    entityId: id,
    action: 'deleted',
    title: `Consuntivo eliminato: ${label(before)}`,
  })
}
