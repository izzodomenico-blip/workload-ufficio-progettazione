import {
  ALL_ABSENCE_TYPES,
  ALL_ACTIVITY_ACTIONS,
  ALL_ACTIVITY_ENTITY_TYPES,
  ALL_PRIORITIES,
  ALL_TYPES,
} from '../types'
import type {
  Absence,
  AbsenceType,
  ActivityLogAction,
  ActivityLogEntityType,
  ActivityLogEntry,
  AppData,
  Notification,
  NotificationEntityType,
  Person,
  Priority,
  Task,
  WorkItem,
  WorkItemType,
} from '../types'
import { mapLegacyStatus } from './progress'

export const BACKUP_APP_NAME = 'workload-ufficio-progettazione'
export const BACKUP_VERSION = 'v1.1-sqlite-local'
export const LAST_BACKUP_STORAGE_KEY = 'workload-ufficio-progettazione:lastBackupAt'

export interface BackupCounts {
  people: number
  workItems: number
  tasks: number
  absences: number
  activityLog: number
  notifications: number
}

export interface BackupInfo {
  appName: typeof BACKUP_APP_NAME
  exportedAt: string
  version: typeof BACKUP_VERSION
  counts: BackupCounts
}

export interface BackupPayload {
  backupInfo: BackupInfo
  data: AppData
}

export interface BackupMetadata {
  appName?: string
  exportedAt?: string
  version?: string
  counts?: Partial<BackupCounts>
}

export interface BackupSummary {
  source: 'backup' | 'legacy'
  exportedAt?: string
  version?: string
  counts: BackupCounts
}

export type BackupValidationResult =
  | {
      ok: true
      data: AppData
      backupInfo?: BackupMetadata
      summary: BackupSummary
    }
  | {
      ok: false
      error: string
      issues: string[]
    }

const PRIORITIES = new Set<string>(ALL_PRIORITIES)
const WORK_ITEM_TYPES = new Set<string>(ALL_TYPES)
const ABSENCE_TYPES = new Set<string>(ALL_ABSENCE_TYPES)
const ACTIVITY_ACTIONS = new Set<string>(ALL_ACTIVITY_ACTIONS)
const ACTIVITY_ENTITY_TYPES = new Set<string>(ALL_ACTIVITY_ENTITY_TYPES)

export function createBackupPayload(data: AppData, exportedAt: Date = new Date()): BackupPayload {
  const backupData: AppData = {
    ...data,
    people: data.people,
    workItems: data.workItems,
    tasks: data.tasks,
    absences: data.absences ?? [],
    activityLog: data.activityLog ?? [],
    notifications: data.notifications ?? [],
  }

  return {
    backupInfo: {
      appName: BACKUP_APP_NAME,
      exportedAt: exportedAt.toISOString(),
      version: BACKUP_VERSION,
      counts: countAppData(backupData),
    },
    data: backupData,
  }
}

export function getBackupFilename(today: Date = new Date()): string {
  const yyyy = today.getFullYear()
  const mm = pad2(today.getMonth() + 1)
  const dd = pad2(today.getDate())
  const hh = pad2(today.getHours())
  const mi = pad2(today.getMinutes())
  return `backup_workload_ufficio_${yyyy}-${mm}-${dd}_${hh}-${mi}.json`
}

export function validateBackupPayload(payload: unknown): BackupValidationResult {
  const source = getPayloadSource(payload)
  if (!source) {
    return invalid(['Il file JSON non contiene un oggetto dati valido.'])
  }

  const root = asRecord(source.data)
  if (!root) {
    return invalid(['La sezione dati del backup non e un oggetto JSON valido.'])
  }

  const issues: string[] = []
  const rawPeople = root.people
  const rawWorkItems = root.workItems
  const rawTasks = root.tasks
  const rawAbsences = root.absences
  const rawActivityLog = root.activityLog
  const rawNotifications = root.notifications

  if (!Array.isArray(rawPeople)) issues.push('people deve essere un array.')
  if (!Array.isArray(rawWorkItems)) issues.push('workItems deve essere un array.')
  if (!Array.isArray(rawTasks)) issues.push('tasks deve essere un array.')
  if (rawAbsences !== undefined && !Array.isArray(rawAbsences)) issues.push('absences deve essere un array oppure assente.')
  if (rawActivityLog !== undefined && !Array.isArray(rawActivityLog)) {
    issues.push('activityLog deve essere un array oppure assente.')
  }
  if (rawNotifications !== undefined && !Array.isArray(rawNotifications)) {
    issues.push('notifications deve essere un array oppure assente.')
  }

  const people: Person[] = []
  if (Array.isArray(rawPeople)) {
    rawPeople.forEach((item, index) => {
      const person = normalizePerson(item)
      if (person) people.push(person)
      else issues.push(`people[${index}] deve avere id, name e weeklyCapacityHours numerico.`)
    })
  }

  const workItems: WorkItem[] = []
  if (Array.isArray(rawWorkItems)) {
    rawWorkItems.forEach((item, index) => {
      const workItem = normalizeWorkItem(item)
      if (workItem) workItems.push(workItem)
      else issues.push(`workItems[${index}] deve avere id, type, title, status e dueDate validi.`)
    })
  }

  const tasks: Task[] = []
  if (Array.isArray(rawTasks)) {
    rawTasks.forEach((item, index) => {
      const task = normalizeTask(item)
      if (task) tasks.push(task)
      else issues.push(`tasks[${index}] deve avere id, workItemId, title, assigneeId, status e dueDate validi.`)
    })
  }

  const absences: Absence[] = []
  if (Array.isArray(rawAbsences)) {
    rawAbsences.forEach((item, index) => {
      const absence = normalizeAbsence(item)
      if (absence) absences.push(absence)
      else issues.push(`absences[${index}] deve avere id, personId, type, startDate, endDate e hoursPerDay numerico.`)
    })
  }

  if (issues.length > 0) return invalid(issues)

  const activityLog = Array.isArray(rawActivityLog)
    ? rawActivityLog.map(normalizeActivityLogEntry).filter(isPresent)
    : []
  const notifications = Array.isArray(rawNotifications)
    ? rawNotifications.map(normalizeNotification).filter(isPresent)
    : []

  const data = {
    ...root,
    people,
    workItems,
    tasks,
    absences,
    activityLog,
    notifications,
  } as AppData
  const summary = {
    source: source.kind,
    exportedAt: source.backupInfo?.exportedAt,
    version: source.backupInfo?.version,
    counts: countAppData(data),
  } satisfies BackupSummary

  return {
    ok: true,
    data,
    backupInfo: source.backupInfo,
    summary,
  }
}

export function extractAppDataFromBackup(payload: unknown): AppData {
  const result = validateBackupPayload(payload)
  if (!result.ok) throw new Error(result.error)
  return result.data
}

export function getBackupSummary(payload: unknown): BackupSummary | null {
  const result = validateBackupPayload(payload)
  return result.ok ? result.summary : null
}

export function getLastBackupAt(): string | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(LAST_BACKUP_STORAGE_KEY)
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : value
}

export function setLastBackupAt(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LAST_BACKUP_STORAGE_KEY, iso)
  }
  return iso
}

function getPayloadSource(payload: unknown): { kind: 'backup' | 'legacy'; data: unknown; backupInfo?: BackupMetadata } | null {
  const root = asRecord(payload)
  if (!root) return null

  if ('data' in root) {
    return {
      kind: 'backup',
      data: root.data,
      backupInfo: normalizeBackupInfo(root.backupInfo),
    }
  }

  return {
    kind: 'legacy',
    data: root,
    backupInfo: undefined,
  }
}

function normalizeBackupInfo(value: unknown): BackupMetadata | undefined {
  const info = asRecord(value)
  if (!info) return undefined
  const counts = asRecord(info.counts)
  return {
    appName: optionalString(info.appName),
    exportedAt: optionalString(info.exportedAt),
    version: optionalString(info.version),
    counts: counts
      ? {
          people: optionalNumber(counts.people),
          workItems: optionalNumber(counts.workItems),
          tasks: optionalNumber(counts.tasks),
          absences: optionalNumber(counts.absences),
          activityLog: optionalNumber(counts.activityLog),
          notifications: optionalNumber(counts.notifications),
        }
      : undefined,
  }
}

function normalizePerson(value: unknown): Person | null {
  const o = asRecord(value)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.name) || !isNumber(o.weeklyCapacityHours)) return null
  return {
    ...o,
    id: o.id,
    name: o.name,
    role: isString(o.role) ? o.role : '',
    weeklyCapacityHours: o.weeklyCapacityHours,
    skills: stringArray(o.skills),
    active: typeof o.active === 'boolean' ? o.active : true,
    notes: optionalString(o.notes),
  } as Person
}

function normalizeWorkItem(value: unknown): WorkItem | null {
  const o = asRecord(value)
  if (!o) return null
  if (!isNonEmptyString(o.id) || !isNonEmptyString(o.type) || !isNonEmptyString(o.title)) return null
  if (!isNonEmptyString(o.status) || !isNonEmptyString(o.dueDate)) return null
  if (!WORK_ITEM_TYPES.has(o.type)) return null

  const type = o.type as WorkItemType
  const dueDate = o.dueDate
  const startDate = isString(o.startDate) && o.startDate ? o.startDate : dueDate
  const acquisitionProbability = optionalNumber(o.acquisitionProbability)

  return {
    ...o,
    id: o.id,
    type,
    code: isString(o.code) ? o.code : '',
    customer: isString(o.customer) ? o.customer : '',
    title: o.title,
    description: isString(o.description) ? o.description : '',
    priority: normalizePriority(o.priority),
    status: mapLegacyStatus(o.status),
    ownerId: isString(o.ownerId) ? o.ownerId : '',
    assigneeIds: stringArray(o.assigneeIds),
    startDate,
    dueDate,
    estimatedHours: numberOrZero(o.estimatedHours),
    loggedHours: numberOrZero(o.loggedHours),
    progressPercent: normalizePercent(o.progressPercent),
    acquisitionProbability: type === 'studio' ? acquisitionProbability : undefined,
    blockers: stringArray(o.blockers),
    notes: optionalString(o.notes),
    technicalPhase: optionalString(o.technicalPhase) as WorkItem['technicalPhase'],
    customerRequestDate: optionalString(o.customerRequestDate),
    plannedProductionReleaseDate: optionalString(o.plannedProductionReleaseDate),
    actualProductionReleaseDate: optionalString(o.actualProductionReleaseDate),
    workFolderLink: optionalString(o.workFolderLink),
    offerReference: optionalString(o.offerReference),
    commercialPriority: normalizeOptionalPriority(o.commercialPriority),
    managerNotes: optionalString(o.managerNotes),
  } as WorkItem
}

function normalizeTask(value: unknown): Task | null {
  const o = asRecord(value)
  if (!o) return null
  if (!isNonEmptyString(o.id) || !isNonEmptyString(o.workItemId) || !isNonEmptyString(o.title)) return null
  if (!isNonEmptyString(o.assigneeId) || !isNonEmptyString(o.status) || !isNonEmptyString(o.dueDate)) return null
  const dueDate = o.dueDate
  const startDate = isString(o.startDate) && o.startDate ? o.startDate : dueDate

  return {
    ...o,
    id: o.id,
    workItemId: o.workItemId,
    title: o.title,
    assigneeId: o.assigneeId,
    status: mapLegacyStatus(o.status),
    startDate,
    dueDate,
    estimatedHours: numberOrZero(o.estimatedHours),
    loggedHours: numberOrZero(o.loggedHours),
    progressPercent: normalizePercent(o.progressPercent),
    blockers: stringArray(o.blockers),
    notes: optionalString(o.notes),
  } as Task
}

function normalizeAbsence(value: unknown): Absence | null {
  const o = asRecord(value)
  if (!o) return null
  if (!isNonEmptyString(o.id) || !isNonEmptyString(o.personId) || !isNonEmptyString(o.type)) return null
  if (!isNonEmptyString(o.startDate) || !isNonEmptyString(o.endDate) || !isNumber(o.hoursPerDay)) return null
  const type = ABSENCE_TYPES.has(o.type) ? (o.type as AbsenceType) : 'altro'
  return {
    ...o,
    id: o.id,
    personId: o.personId,
    type,
    startDate: o.startDate,
    endDate: o.endDate,
    hoursPerDay: o.hoursPerDay,
    notes: optionalString(o.notes),
  } as Absence
}

function normalizeActivityLogEntry(value: unknown): ActivityLogEntry | null {
  const o = asRecord(value)
  if (!o) return null
  if (!isNonEmptyString(o.id) || !isNonEmptyString(o.timestamp) || !isNonEmptyString(o.entityType)) return null
  if (!isNonEmptyString(o.entityId) || !isNonEmptyString(o.action) || !isNonEmptyString(o.title)) return null
  if (!ACTIVITY_ACTIONS.has(o.action) || !ACTIVITY_ENTITY_TYPES.has(o.entityType)) return null
  return {
    ...o,
    id: o.id,
    timestamp: o.timestamp,
    entityType: o.entityType as ActivityLogEntityType,
    entityId: o.entityId,
    action: o.action as ActivityLogAction,
    title: o.title,
    description: optionalString(o.description),
    before: o.before as ActivityLogEntry['before'],
    after: o.after as ActivityLogEntry['after'],
  } as ActivityLogEntry
}

function normalizeNotification(value: unknown): Notification | null {
  const o = asRecord(value)
  if (!o) return null
  if (!isNonEmptyString(o.id) || !isNonEmptyString(o.timestamp) || o.type !== 'status_changed') return null
  if (!isNonEmptyString(o.entityType) || !isNonEmptyString(o.entityId) || !isNonEmptyString(o.title)) return null
  if (!isNonEmptyString(o.emailSubject) || !isNonEmptyString(o.emailBody)) return null
  if (o.entityType !== 'workItem' && o.entityType !== 'task') return null

  return {
    ...o,
    id: o.id,
    timestamp: o.timestamp,
    type: 'status_changed',
    entityType: o.entityType as NotificationEntityType,
    entityId: o.entityId,
    workItemId: optionalString(o.workItemId),
    title: o.title,
    message: isString(o.message) ? o.message : o.title,
    read: typeof o.read === 'boolean' ? o.read : false,
    recipient: 'Domenico',
    emailSuggested: typeof o.emailSuggested === 'boolean' ? o.emailSuggested : true,
    emailSubject: o.emailSubject,
    emailBody: o.emailBody,
    beforeStatus: isString(o.beforeStatus) ? mapLegacyStatus(o.beforeStatus) : undefined,
    afterStatus: isString(o.afterStatus) ? mapLegacyStatus(o.afterStatus) : undefined,
  } as Notification
}

function countAppData(data: Pick<AppData, 'people' | 'workItems' | 'tasks' | 'absences' | 'activityLog' | 'notifications'>): BackupCounts {
  return {
    people: data.people.length,
    workItems: data.workItems.length,
    tasks: data.tasks.length,
    absences: data.absences.length,
    activityLog: data.activityLog.length,
    notifications: data.notifications.length,
  }
}

function invalid(issues: string[]): BackupValidationResult {
  const firstIssues = issues.slice(0, 4).join(' ')
  const suffix = issues.length > 4 ? ` Altri errori: ${issues.length - 4}.` : ''
  return {
    ok: false,
    error: `${firstIssues}${suffix}` || 'Backup JSON non valido.',
    issues,
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return isNumber(value) ? value : undefined
}

function numberOrZero(value: unknown): number {
  return isNumber(value) ? value : 0
}

function normalizePercent(value: unknown): number {
  if (!isNumber(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function normalizePriority(value: unknown): Priority {
  return typeof value === 'string' && PRIORITIES.has(value) ? (value as Priority) : 'media'
}

function normalizeOptionalPriority(value: unknown): Priority | undefined {
  return typeof value === 'string' && PRIORITIES.has(value) ? (value as Priority) : undefined
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
