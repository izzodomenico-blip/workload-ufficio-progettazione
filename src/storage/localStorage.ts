import type { AppData } from '../types'
import { extractAppDataFromBackup, validateBackupPayload } from '../utils/backup'

const STORAGE_KEY = 'workload-ufficio-progettazione:v1'

export function migrateAppData(data: AppData): AppData {
  return extractAppDataFromBackup(data)
}

export function loadFromStorage(): AppData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    const result = validateBackupPayload(parsed)
    return result.ok ? result.data : null
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

export function downloadJSON(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
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

export function readJSONFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)) as unknown)
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Impossibile leggere il file.'))
      }
    }
    reader.onerror = () => reject(new Error('Errore di lettura file.'))
    reader.readAsText(file)
  })
}
