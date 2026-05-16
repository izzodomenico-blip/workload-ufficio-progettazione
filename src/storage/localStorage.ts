import type { ActivityLogEntry, AppData } from '../types'
import { mapLegacyStatus } from '../utils/progress'

const STORAGE_KEY = 'workload-ufficio-progettazione:v1'

function isPlainEntry(e: unknown): e is ActivityLogEntry {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.timestamp === 'string' &&
    typeof o.entityType === 'string' &&
    typeof o.entityId === 'string' &&
    typeof o.action === 'string' &&
    typeof o.title === 'string'
  )
}

export function migrateAppData(data: AppData): AppData {
  const absences = Array.isArray(data.absences) ? data.absences : []
  const rawLog = (data as AppData & { activityLog?: unknown }).activityLog
  const activityLog: ActivityLogEntry[] = Array.isArray(rawLog)
    ? (rawLog as unknown[]).filter(isPlainEntry)
    : []
  return {
    ...data,
    absences,
    activityLog,
    workItems: data.workItems.map((w) => ({
      ...w,
      status: mapLegacyStatus(w.status as string),
    })),
    tasks: data.tasks.map((t) => ({
      ...t,
      status: mapLegacyStatus(t.status as string),
    })),
  }
}

export function loadFromStorage(): AppData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AppData>
    if (!parsed.people || !parsed.workItems || !parsed.tasks) return null
    return migrateAppData(parsed as AppData)
  } catch {
    return null
  }
}

export function saveToStorage(data: AppData): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // storage full / disabled — silently ignore
  }
}

export function clearStorage(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export function downloadJSON(data: AppData, filename?: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `workload-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadTextFile(text: string, filename: string, mimeType = 'text/markdown;charset=utf-8'): void {
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function readJSONFile(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Partial<AppData>
        if (!data.people || !data.workItems || !data.tasks) {
          reject(new Error('Struttura JSON non valida: mancano people / workItems / tasks.'))
          return
        }
        resolve(migrateAppData(data as AppData))
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Impossibile leggere il file.'))
      }
    }
    reader.onerror = () => reject(new Error('Errore di lettura file.'))
    reader.readAsText(file)
  })
}
