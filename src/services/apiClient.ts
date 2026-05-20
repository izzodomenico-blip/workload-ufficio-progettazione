import type { AppData } from '../types'

export interface SaveAppDataOptions {
  risky?: boolean
  reason?: string
  /** Password admin per autorizzare modifiche a campi protetti (es. baselineLoadPercent) */
  adminPassword?: string
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

export interface AdminStatus {
  protected: boolean
}

export interface AdminVerifyResult {
  ok: boolean
  protected: boolean
}

export interface AdminSetPasswordInput {
  currentPassword?: string
  newPassword: string
}

export interface AdminSetPasswordResult {
  protected: boolean
}

export const ADMIN_BASELINE_PROTECTED_CODE = 'baseline-load-protected'

export class AdminProtectedError extends Error {
  readonly status: number
  readonly detail?: string
  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.name = 'AdminProtectedError'
    this.status = status
    this.detail = detail
  }
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
    let detail: string | undefined
    let message = `Errore API ${response.status}`
    try {
      const body = await response.json() as { error?: string; detail?: string }
      detail = body.detail
      message = body.error || message
    } catch {
      // ignore
    }
    if (response.status === 403 && detail === ADMIN_BASELINE_PROTECTED_CODE) {
      throw new AdminProtectedError(message, response.status, detail)
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export async function fetchAppData(): Promise<AppData> {
  const data = await request<Partial<AppData>>('/api/app-data')
  return withAppDataDefaults(data)
}

export async function saveAppData(data: AppData, options: SaveAppDataOptions = {}): Promise<AppData> {
  const headers: Record<string, string> = {
    'x-workload-mutation-kind': options.risky ? 'risky' : 'normal',
  }
  if (options.reason) headers['x-workload-mutation-reason'] = options.reason
  if (options.adminPassword) headers['x-workload-admin-password'] = options.adminPassword
  const saved = await request<Partial<AppData>>('/api/app-data', {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  })
  return withAppDataDefaults(saved)
}

export function fetchBackupStatus(): Promise<BackupStatus> {
  return request<BackupStatus>('/api/backup/status')
}

export function fetchAdminStatus(): Promise<AdminStatus> {
  return request<AdminStatus>('/api/admin/status')
}

export function verifyAdminPassword(password: string): Promise<AdminVerifyResult> {
  return request<AdminVerifyResult>('/api/admin/verify-password', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export function setAdminPassword(input: AdminSetPasswordInput): Promise<AdminSetPasswordResult> {
  return request<AdminSetPasswordResult>('/api/admin/set-password', {
    method: 'POST',
    body: JSON.stringify(input),
  })
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
    machineTypes: Array.isArray(data.machineTypes) ? data.machineTypes : [],
    workshopOutputs: Array.isArray(data.workshopOutputs) ? data.workshopOutputs : [],
  }
}
