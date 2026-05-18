import type { AppData } from '../types'

export interface SaveAppDataOptions {
  risky?: boolean
  reason?: string
}

export interface BackupStatus {
  lastAutoBackupAt: string | null
  lastManualBackupAt: string | null
  autoBackupCount: number
  backupDirectory: string
  autoBackupEnabled: boolean
  pendingAutoBackupAt?: string | null
  lastAutoBackupError?: string | null
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export function fetchAppData(): Promise<AppData> {
  return request<AppData>('/api/app-data')
}

export function saveAppData(data: AppData, options: SaveAppDataOptions = {}): Promise<AppData> {
  return request<AppData>('/api/app-data', {
    method: 'PUT',
    headers: {
      'x-workload-mutation-kind': options.risky ? 'risky' : 'normal',
      ...(options.reason ? { 'x-workload-mutation-reason': options.reason } : {}),
    },
    body: JSON.stringify(data),
  })
}

export function fetchBackupStatus(): Promise<BackupStatus> {
  return request<BackupStatus>('/api/backup/status')
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string; detail?: string }
    return body.detail || body.error || `Errore API ${response.status}`
  } catch {
    return `Errore API ${response.status}`
  }
}
