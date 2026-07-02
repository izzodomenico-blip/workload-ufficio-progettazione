import type { AppData, TubeProfile } from '../types'
import { logEntry } from '../utils/activityLog'
import { uid } from '../utils/format'

export type CreateTubeProfileInput = Omit<TubeProfile, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateTubeProfileInput = Partial<Omit<TubeProfile, 'id' | 'createdAt' | 'updatedAt'>>

function nowISO(): string {
  return new Date().toISOString()
}

export function createTubeProfile(data: AppData, input: CreateTubeProfileInput): { data: AppData; id: string } {
  const at = nowISO()
  const profile: TubeProfile = { ...input, id: uid('tp'), createdAt: at, updatedAt: at }
  const nextData: AppData = { ...data, tubeProfiles: [...(data.tubeProfiles ?? []), profile] }
  return {
    id: profile.id,
    data: logEntry(nextData, {
      entityType: 'system',
      entityId: profile.id,
      action: 'created',
      title: `Profilo tubo creato: ${profile.label}`,
    }),
  }
}

export function updateTubeProfile(data: AppData, id: string, patch: UpdateTubeProfileInput): AppData {
  const before = (data.tubeProfiles ?? []).find((p) => p.id === id)
  if (!before) return data
  const after: TubeProfile = { ...before, ...patch, id: before.id, createdAt: before.createdAt, updatedAt: nowISO() }
  return logEntry({
    ...data,
    tubeProfiles: (data.tubeProfiles ?? []).map((p) => (p.id === id ? after : p)),
  }, {
    entityType: 'system',
    entityId: id,
    action: 'updated',
    title: `Profilo tubo aggiornato: ${after.label}`,
  })
}

export function deleteTubeProfile(data: AppData, id: string): AppData {
  const before = (data.tubeProfiles ?? []).find((p) => p.id === id)
  if (!before) return data
  return logEntry({
    ...data,
    tubeProfiles: (data.tubeProfiles ?? []).filter((p) => p.id !== id),
  }, {
    entityType: 'system',
    entityId: id,
    action: 'deleted',
    title: `Profilo tubo eliminato: ${before.label}`,
  })
}
