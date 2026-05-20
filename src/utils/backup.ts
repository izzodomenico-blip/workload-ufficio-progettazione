import {
  ALL_ABSENCE_TYPES,
  ALL_ACTIVITY_ACTIONS,
  ALL_ACTIVITY_ENTITY_TYPES,
  ALL_MACHINE_COMPLEXITIES,
  ALL_PRIORITIES,
  ALL_TYPES,
  ALL_WORKSHOP_OUTPUT_STATUSES,
} from '../types'
import type {
  Absence,
  AbsenceType,
  ActivityLogAction,
  ActivityLogEntityType,
  ActivityLogEntry,
  AppData,
  BusinessPartner,
  BusinessPartnerType,
  MachineComplexity,
  MachineType,
  Notification,
  NotificationEntityType,
  Person,
  Priority,
  Task,
  WorkItem,
  WorkItemType,
  WorkshopOutput,
  WorkshopOutputStatus,
} from '../types'
import { ALL_BUSINESS_PARTNER_TYPES } from '../types'
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
  businessPartners: number
  machineTypes: number
  workshopOutputs: number
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
const BUSINESS_PARTNER_TYPES = new Set<string>(ALL_BUSINESS_PARTNER_TYPES)
const MACHINE_COMPLEXITIES = new Set<string>(ALL_MACHINE_COMPLEXITIES)
const WORKSHOP_OUTPUT_STATUSES = new Set<string>(ALL_WORKSHOP_OUTPUT_STATUSES)

export function createBackupPayload(data: AppData, exportedAt: Date = new Date()): BackupPayload {
  const backupData: AppData = {
    ...data,
    people: data.people,
    workItems: data.workItems,
    tasks: data.tasks,
    absences: data.absences ?? [],
    activityLog: data.activityLog ?? [],
    notifications: data.notifications ?? [],
    businessPartners: data.businessPartners ?? [],
    machineTypes: data.machineTypes ?? [],
    workshopOutputs: data.workshopOutputs ?? [],
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
  const rawBusinessPartners = root.businessPartners
  const rawMachineTypes = root.machineTypes
  const rawWorkshopOutputs = root.workshopOutputs

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
  if (rawBusinessPartners !== undefined && !Array.isArray(rawBusinessPartners)) {
    issues.push('businessPartners deve essere un array oppure assente.')
  }
  if (rawMachineTypes !== undefined && !Array.isArray(rawMachineTypes)) {
    issues.push('machineTypes deve essere un array oppure assente.')
  }
  if (rawWorkshopOutputs !== undefined && !Array.isArray(rawWorkshopOutputs)) {
    issues.push('workshopOutputs deve essere un array oppure assente.')
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

  const machineTypes: MachineType[] = []
  if (Array.isArray(rawMachineTypes)) {
    rawMachineTypes.forEach((item, index) => {
      const machineType = normalizeMachineType(item)
      if (machineType) machineTypes.push(machineType)
      else issues.push(`machineTypes[${index}] deve avere id, code e name validi.`)
    })
  }

  const workshopOutputs: WorkshopOutput[] = []
  if (Array.isArray(rawWorkshopOutputs)) {
    rawWorkshopOutputs.forEach((item, index) => {
      const output = normalizeWorkshopOutput(item)
      if (output) workshopOutputs.push(output)
      else issues.push(`workshopOutputs[${index}] deve avere id, workItemId, machineTypeCode e machineTypeName validi.`)
    })
  }

  if (issues.length > 0) return invalid(issues)

  const activityLog = Array.isArray(rawActivityLog)
    ? rawActivityLog.map(normalizeActivityLogEntry).filter(isPresent)
    : []
  const notifications = Array.isArray(rawNotifications)
    ? rawNotifications.map(normalizeNotification).filter(isPresent)
    : []
  const businessPartners = Array.isArray(rawBusinessPartners)
    ? rawBusinessPartners.map(normalizeBusinessPartner).filter(isPresent)
    : []
  const data = {
    ...root,
    people,
    workItems,
    tasks,
    absences,
    activityLog,
    notifications,
    businessPartners,
    machineTypes,
    workshopOutputs,
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
          businessPartners: optionalNumber(counts.businessPartners),
          machineTypes: optionalNumber(counts.machineTypes),
          workshopOutputs: optionalNumber(counts.workshopOutputs),
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

function normalizeBusinessPartner(value: unknown): BusinessPartner | null {
  const o = asRecord(value)
  if (!o) return null
  if (!isNonEmptyString(o.id) || !isNonEmptyString(o.name)) return null
  const type: BusinessPartnerType = BUSINESS_PARTNER_TYPES.has(o.type as string)
    ? (o.type as BusinessPartnerType)
    : 'cliente'
  const now = new Date().toISOString()
  return {
    id: o.id,
    accountCode: isString(o.accountCode) ? o.accountCode : '',
    name: o.name,
    type,
    vatNumber: optionalString(o.vatNumber),
    fiscalCode: optionalString(o.fiscalCode),
    sdiCode: optionalString(o.sdiCode),
    address: optionalString(o.address),
    city: optionalString(o.city),
    province: optionalString(o.province),
    postalCode: optionalString(o.postalCode),
    country: optionalString(o.country),
    email: optionalString(o.email),
    pec: optionalString(o.pec),
    phone: optionalString(o.phone),
    paymentCode: optionalString(o.paymentCode),
    paymentDescription: optionalString(o.paymentDescription),
    bankName: optionalString(o.bankName),
    abi: optionalString(o.abi),
    cab: optionalString(o.cab),
    vatExemptionCode: optionalString(o.vatExemptionCode),
    balance: optionalNumber(o.balance),
    exposure: optionalNumber(o.exposure),
    creditLimit: optionalNumber(o.creditLimit),
    overCreditLimit: optionalNumber(o.overCreditLimit),
    risk: optionalNumber(o.risk),
    notes: optionalString(o.notes),
    active: typeof o.active === 'boolean' ? o.active : true,
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
}

function normalizeMachineType(value: unknown): MachineType | null {
  const o = asRecord(value)
  if (!o) return null
  if (!isNonEmptyString(o.id) || !isNonEmptyString(o.code) || !isNonEmptyString(o.name)) return null
  const now = new Date().toISOString()
  const complexity: MachineComplexity = MACHINE_COMPLEXITIES.has(o.defaultComplexity as string)
    ? (o.defaultComplexity as MachineComplexity)
    : 'media'
  return {
    id: o.id,
    code: o.code.trim().toUpperCase(),
    name: o.name.trim(),
    family: isNonEmptyString(o.family) ? o.family.trim() : 'Generico',
    description: isString(o.description) ? o.description : '',
    defaultImpactWeight: positiveNumber(o.defaultImpactWeight, 1),
    defaultComplexity: complexity,
    defaultRequiresLaser: booleanOr(o.defaultRequiresLaser, true),
    defaultRequiresTubeLaser: booleanOr(o.defaultRequiresTubeLaser, false),
    defaultRequiresBending: booleanOr(o.defaultRequiresBending, true),
    defaultRequiresWelding: booleanOr(o.defaultRequiresWelding, true),
    defaultRequiresAssembly: booleanOr(o.defaultRequiresAssembly, true),
    defaultRequiresPainting: booleanOr(o.defaultRequiresPainting, false),
    defaultRequiresTesting: booleanOr(o.defaultRequiresTesting, false),
    typicalAssemblyCount: nonNegativeInteger(o.typicalAssemblyCount, 1),
    typicalPartCount: nonNegativeInteger(o.typicalPartCount, 10),
    active: typeof o.active === 'boolean' ? o.active : true,
    notes: isString(o.notes) ? o.notes : '',
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
}

function normalizeWorkshopOutput(value: unknown): WorkshopOutput | null {
  const o = asRecord(value)
  if (!o) return null
  if (!isNonEmptyString(o.id) || !isNonEmptyString(o.workItemId)) return null
  if (!isNonEmptyString(o.machineTypeCode) || !isNonEmptyString(o.machineTypeName)) return null
  const now = new Date().toISOString()
  const complexity: MachineComplexity = MACHINE_COMPLEXITIES.has(o.complexity as string)
    ? (o.complexity as MachineComplexity)
    : 'media'
  const status: WorkshopOutputStatus = WORKSHOP_OUTPUT_STATUSES.has(o.status as string)
    ? (o.status as WorkshopOutputStatus)
    : 'previsto'
  return {
    id: o.id,
    workItemId: o.workItemId,
    machineTypeId: isString(o.machineTypeId) ? o.machineTypeId : '',
    machineTypeCode: o.machineTypeCode.trim().toUpperCase(),
    machineTypeName: o.machineTypeName.trim(),
    description: isString(o.description) ? o.description : '',
    quantity: positiveNumber(o.quantity, 1),
    complexity,
    assemblyCount: nonNegativeInteger(o.assemblyCount, 0),
    estimatedPartCount: nonNegativeInteger(o.estimatedPartCount, 0),
    requiresLaser: booleanOr(o.requiresLaser, false),
    requiresTubeLaser: booleanOr(o.requiresTubeLaser, false),
    requiresBending: booleanOr(o.requiresBending, false),
    requiresWelding: booleanOr(o.requiresWelding, false),
    requiresAssembly: booleanOr(o.requiresAssembly, false),
    requiresPainting: booleanOr(o.requiresPainting, false),
    requiresTesting: booleanOr(o.requiresTesting, false),
    plannedReleaseDate: isString(o.plannedReleaseDate) ? o.plannedReleaseDate : '',
    actualReleaseDate: isString(o.actualReleaseDate) ? o.actualReleaseDate : '',
    impactScore: isNumber(o.impactScore) ? Math.max(0, Math.round(o.impactScore * 10) / 10) : 0,
    status,
    notes: isString(o.notes) ? o.notes : '',
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
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

function countAppData(data: Pick<AppData, 'people' | 'workItems' | 'tasks' | 'absences' | 'activityLog' | 'notifications' | 'businessPartners' | 'machineTypes' | 'workshopOutputs'>): BackupCounts {
  return {
    people: data.people.length,
    workItems: data.workItems.length,
    tasks: data.tasks.length,
    absences: data.absences.length,
    activityLog: data.activityLog.length,
    notifications: data.notifications.length,
    businessPartners: data.businessPartners.length,
    machineTypes: data.machineTypes.length,
    workshopOutputs: data.workshopOutputs.length,
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

function positiveNumber(value: unknown, fallback: number): number {
  return isNumber(value) && value > 0 ? value : fallback
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return isNumber(value) ? Math.max(0, Math.round(value)) : fallback
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
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
