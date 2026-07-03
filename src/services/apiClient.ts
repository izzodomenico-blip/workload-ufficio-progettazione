import type { AppData, AuthUser, ConsuntiviPricingConfig, ConsuntivoMaterial, MachineType, Role } from '../types'

export interface SaveAppDataOptions {
  risky?: boolean
  reason?: string
  dataRevision?: number | null
  /** Password admin per autorizzare modifiche a campi protetti (es. baselineLoadPercent) */
  adminPassword?: string
}

export interface AppDataResponse {
  data: AppData
  revision: number
  lastMutationAt: string | null
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

export interface BackupHealth {
  status: 'ok' | 'warn' | 'error'
  reasons: string[]
  details: {
    latestVerified: { createdAt: string; integrityOk: boolean; total: number } | null
    offsiteReceipt: { lastOffsiteAt: string; lastOffsiteOk: boolean; dest?: string } | null
  }
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
export const DATA_CONFLICT_CODES = new Set(['missing-data-revision', 'stale-data-revision'])

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

export class DataConflictError extends Error {
  readonly status: number
  readonly detail?: string
  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.name = 'DataConflictError'
    this.status = status
    this.detail = detail
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const { body } = await requestWithResponse<T>(url, options)
  return body
}

async function requestWithResponse<T>(url: string, options?: RequestInit): Promise<{ body: T; response: Response }> {
  const response = await fetch(url, {
    credentials: 'same-origin',
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
    if (response.status === 409 && detail && DATA_CONFLICT_CODES.has(detail)) {
      throw new DataConflictError(message, response.status, detail)
    }
    throw new Error(message)
  }
  const body = await response.json() as T
  return { body, response }
}

export async function fetchAppData(): Promise<AppDataResponse> {
  const { body, response } = await requestWithResponse<Partial<AppData>>('/api/app-data')
  return {
    data: withAppDataDefaults(body),
    revision: readDataRevision(response),
    lastMutationAt: response.headers.get('x-workload-last-mutation-at'),
  }
}

export async function saveAppData(data: AppData, options: SaveAppDataOptions = {}): Promise<AppDataResponse> {
  const headers: Record<string, string> = {
    'x-workload-mutation-kind': options.risky ? 'risky' : 'normal',
  }
  if (options.reason) headers['x-workload-mutation-reason'] = options.reason
  if (options.dataRevision !== undefined && options.dataRevision !== null) {
    headers['x-workload-data-revision'] = String(options.dataRevision)
  }
  if (options.adminPassword) headers['x-workload-admin-password'] = options.adminPassword
  const { body, response } = await requestWithResponse<Partial<AppData>>('/api/app-data', {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  })
  return {
    data: withAppDataDefaults(body),
    revision: readDataRevision(response),
    lastMutationAt: response.headers.get('x-workload-last-mutation-at'),
  }
}

export function fetchBackupStatus(): Promise<BackupStatus> {
  return request<BackupStatus>('/api/backup/status')
}

export function fetchBackupHealth(): Promise<BackupHealth> {
  return request<BackupHealth>('/api/backup/health')
}

export type BackupKind = 'manual' | 'auto'

export interface BackupArchive {
  id: string
  kind: BackupKind
  createdAt: string
  jsonSize: number
  dbSize: number | null
  hasDb: boolean
}

export interface BackupCountsSnapshot {
  people: number
  workItems: number
  tasks: number
  absences: number
  businessPartners: number
  machineTypes: number
  workshopOutputs: number
  workshopWorkers: number
  workshopAssignments: number
  activityLog?: number
  notifications?: number
  calculatedStandardComponents?: number
}

export interface BackupPreview {
  kind: BackupKind
  file: string
  backupInfo: { exportedAt?: string; version?: string; reason?: string; backupKind?: string } | null
  counts: BackupCountsSnapshot
}

export interface RestoreResult {
  restoredFrom: string
  kind: BackupKind
  before: BackupCountsSnapshot
  after: BackupCountsSnapshot
  safetyBackup: { jsonPath: string; dbPath: string } | null
}

export function fetchBackupArchives(): Promise<BackupArchive[]> {
  return request<BackupArchive[]>('/api/backups')
}

export function fetchBackupPreview(kind: BackupKind, file: string): Promise<BackupPreview> {
  return request<BackupPreview>(`/api/backups/preview?kind=${encodeURIComponent(kind)}&file=${encodeURIComponent(file)}`)
}

export function restoreBackup(kind: BackupKind, file: string): Promise<RestoreResult> {
  return request<RestoreResult>('/api/backups/restore', {
    method: 'POST',
    body: JSON.stringify({ kind, file }),
  })
}

export function backupDownloadUrl(kind: BackupKind, file: string): string {
  return `/api/backups/download?kind=${encodeURIComponent(kind)}&file=${encodeURIComponent(file)}`
}

export async function createMachineTypeRecord(machineType: MachineType): Promise<MachineType> {
  return request<MachineType>('/api/machine-types', {
    method: 'POST',
    body: JSON.stringify(machineType),
  })
}

export async function updateMachineTypeRecord(id: string, machineType: MachineType): Promise<MachineType> {
  return request<MachineType>(`/api/machine-types/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(machineType),
  })
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
    workshopWorkers: Array.isArray(data.workshopWorkers) ? data.workshopWorkers : [],
    workshopAssignments: Array.isArray(data.workshopAssignments) ? data.workshopAssignments : [],
    calculatedStandardComponents: Array.isArray(data.calculatedStandardComponents) ? data.calculatedStandardComponents : [],
    consuntivi: Array.isArray(data.consuntivi) ? data.consuntivi : [],
    tubeProfiles: Array.isArray(data.tubeProfiles) ? data.tubeProfiles : [],
  }
}

function readDataRevision(response: Response): number {
  const raw = response.headers.get('x-workload-data-revision')
  const value = raw ? Number(raw) : 0
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

export interface ConsuntiviSettings {
  densityFactorPerMaterial: Record<ConsuntivoMaterial, number>
}

export function fetchConsuntiviSettings(): Promise<ConsuntiviSettings> {
  return request<ConsuntiviSettings>('/api/consuntivi-settings')
}

export function fetchConsuntiviPricing(password: string): Promise<ConsuntiviPricingConfig> {
  return request<ConsuntiviPricingConfig>('/api/consuntivi-pricing', {
    headers: { 'x-workload-admin-password': password },
  })
}

export function saveConsuntiviPricing(config: ConsuntiviPricingConfig, password: string): Promise<ConsuntiviPricingConfig> {
  return request<ConsuntiviPricingConfig>('/api/consuntivi-pricing', {
    method: 'PUT',
    headers: { 'x-workload-admin-password': password },
    body: JSON.stringify(config),
  })
}

export interface SetupStatus { needsSetup: boolean }
export function fetchSetupStatus(): Promise<SetupStatus> { return request<SetupStatus>('/api/auth/setup-status') }
export function fetchMe(): Promise<{ user: AuthUser }> { return request<{ user: AuthUser }>('/api/auth/me') }
export function apiLogin(username: string, password: string): Promise<{ user: AuthUser }> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}
export function apiSetupAdmin(username: string, password: string): Promise<{ user: AuthUser }> {
  return request('/api/auth/setup-admin', { method: 'POST', body: JSON.stringify({ username, password }) })
}
export function apiLogout(): Promise<{ ok: boolean }> { return request('/api/auth/logout', { method: 'POST', body: '{}' }) }

export interface AdminUserRow { id: string; username: string; role: Role; linkedPersonId: string; active: boolean }
export function fetchUsers(): Promise<AdminUserRow[]> { return request('/api/users') }
export function createUserApi(input: { username: string; password: string; role: Role; linkedPersonId?: string }): Promise<AdminUserRow> {
  return request('/api/users', { method: 'POST', body: JSON.stringify(input) })
}
export function updateUserApi(id: string, patch: { role?: Role; active?: boolean; linkedPersonId?: string }): Promise<AdminUserRow> {
  return request(`/api/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) })
}
export function resetUserPasswordApi(id: string, newPassword: string): Promise<{ ok: boolean }> {
  return request(`/api/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) })
}
export function deleteUserApi(id: string): Promise<void> {
  return request(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' }) as unknown as Promise<void>
}
