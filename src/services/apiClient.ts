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

export async function fetchAppData(): Promise<AppData> {
  const data = await request<Partial<AppData>>('/api/app-data')
  return withAppDataDefaults(data)
}

export async function saveAppData(data: AppData, options: SaveAppDataOptions = {}): Promise<AppData> {
  const saved = await request<Partial<AppData>>('/api/app-data', {
    method: 'PUT',
    headers: {
      'x-workload-mutation-kind': options.risky ? 'risky' : 'normal',
      ...(options.reason ? { 'x-workload-mutation-reason': options.reason } : {}),
    },
    body: JSON.stringify(data),
  })
  return withAppDataDefaults(saved)
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

function withAppDataDefaults(data: Partial<AppData>): AppData {
  return {
    people: Array.isArray(data.people) ? data.people : [],
    workItems: Array.isArray(data.workItems) ? data.workItems : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    absences: Array.isArray(data.absences) ? data.absences : [],
    activityLog: Array.isArray(data.activityLog) ? data.activityLog : [],
    notifications: Array.isArray(data.notifications) ? data.notifications : [],
    businessPartners: Array.isArray(data.businessPartners) ? data.businessPartners : [],
  }
}
