const VALID_STATUSES = new Set([
  'Da pianificare',
  'Pianificato',
  'In corso',
  'In attesa',
  'In verifica',
  'Completato',
  'Sospeso',
])

const LEGACY_STATUS_MAP = {
  Assegnato: 'Pianificato',
  'In attesa input commerciale': 'In attesa',
  'In attesa input cliente': 'In attesa',
  'In attesa scelta tecnica': 'In attesa',
  'In verifica responsabile': 'In verifica',
  'Da correggere': 'In corso',
  'Pronto per rilascio': 'In verifica',
  'Rilasciato produzione': 'Completato',
  Annullato: 'Sospeso',
}

const VALID_TYPES = new Set(['commessa', 'studio', 'interno'])
const VALID_PRIORITIES = new Set(['bassa', 'media', 'alta', 'critica'])
const VALID_ABSENCE_TYPES = new Set(['ferie', 'permesso', 'malattia', 'trasferta', 'altro'])
const VALID_BUSINESS_PARTNER_TYPES = new Set(['cliente', 'fornitore', 'personale', 'altro'])
const VALID_MACHINE_COMPLEXITIES = new Set(['bassa', 'media', 'alta', 'speciale'])
const VALID_WORKSHOP_OUTPUT_STATUSES = new Set([
  'previsto',
  'in_progettazione',
  'pronto_rilascio',
  'rilasciato_produzione',
  'ricevuto_officina',
  'sospeso',
])
const VALID_ACTIVITY_ACTIONS = new Set([
  'created',
  'updated',
  'deleted',
  'status_changed',
  'progress_changed',
  'converted',
  'exported',
  'imported',
  'reset',
])
const VALID_ACTIVITY_ENTITY_TYPES = new Set([
  'workItem',
  'task',
  'person',
  'absence',
  'machineType',
  'workshopOutput',
  'system',
])

export const EMPTY_APP_DATA = {
  people: [],
  workItems: [],
  tasks: [],
  absences: [],
  activityLog: [],
  notifications: [],
  businessPartners: [],
  machineTypes: [],
  workshopOutputs: [],
}

export function extractAppData(payload) {
  const root = asObject(payload)
  if (!root) throw new Error('Payload JSON non valido.')
  if (root.data !== undefined) return normalizeAppData(root.data)
  return normalizeAppData(root)
}

export function normalizeAppData(input) {
  const root = asObject(input)
  if (!root) throw new Error('AppData deve essere un oggetto.')
  if (!Array.isArray(root.people)) throw new Error('people deve essere un array.')
  if (!Array.isArray(root.workItems)) throw new Error('workItems deve essere un array.')
  if (!Array.isArray(root.tasks)) throw new Error('tasks deve essere un array.')
  if (root.absences !== undefined && !Array.isArray(root.absences)) {
    throw new Error('absences deve essere un array oppure assente.')
  }
  if (root.activityLog !== undefined && !Array.isArray(root.activityLog)) {
    throw new Error('activityLog deve essere un array oppure assente.')
  }
  if (root.notifications !== undefined && !Array.isArray(root.notifications)) {
    throw new Error('notifications deve essere un array oppure assente.')
  }
  if (root.businessPartners !== undefined && !Array.isArray(root.businessPartners)) {
    throw new Error('businessPartners deve essere un array oppure assente.')
  }
  if (root.machineTypes !== undefined && !Array.isArray(root.machineTypes)) {
    throw new Error('machineTypes deve essere un array oppure assente.')
  }
  if (root.workshopOutputs !== undefined && !Array.isArray(root.workshopOutputs)) {
    throw new Error('workshopOutputs deve essere un array oppure assente.')
  }

  return {
    people: root.people.map((item, index) => normalizePerson(item, index)),
    workItems: root.workItems.map((item, index) => normalizeWorkItem(item, index)),
    tasks: root.tasks.map((item, index) => normalizeTask(item, index)),
    absences: (root.absences ?? []).map((item, index) => normalizeAbsence(item, index)),
    activityLog: (root.activityLog ?? []).map(normalizeActivityLogEntry).filter(Boolean),
    notifications: (root.notifications ?? []).map(normalizeNotification).filter(Boolean),
    businessPartners: (root.businessPartners ?? []).map(normalizeBusinessPartner).filter(Boolean),
    machineTypes: (root.machineTypes ?? []).map(normalizeMachineType).filter(Boolean),
    workshopOutputs: (root.workshopOutputs ?? []).map(normalizeWorkshopOutput).filter(Boolean),
  }
}

export function countAppData(data) {
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

export function createBackupPayload(data, exportedAt = new Date()) {
  const normalized = normalizeAppData(data)
  return {
    backupInfo: {
      appName: 'workload-ufficio-progettazione',
      exportedAt: exportedAt.toISOString(),
      version: 'v1.1-sqlite-local',
      counts: countAppData(normalized),
    },
    data: normalized,
  }
}

export function timestampForFilename(date = new Date()) {
  return [
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    `${pad2(date.getHours())}-${pad2(date.getMinutes())}`,
  ].join('_')
}

function normalizePerson(item, index) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.name) || !isNumber(o.weeklyCapacityHours)) {
    throw new Error(`people[${index}] deve avere id, name e weeklyCapacityHours.`)
  }
  return {
    ...o,
    id: o.id,
    name: o.name,
    role: isString(o.role) ? o.role : '',
    weeklyCapacityHours: o.weeklyCapacityHours,
    skills: stringArray(o.skills),
    active: typeof o.active === 'boolean' ? o.active : true,
    baselineLoadPercent: isNumber(o.baselineLoadPercent)
      ? Math.max(0, Math.min(100, o.baselineLoadPercent))
      : undefined,
  }
}

function normalizeWorkItem(item, index) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.type) || !isNonEmptyString(o.title)) {
    throw new Error(`workItems[${index}] deve avere id, type e title.`)
  }
  if (!isNonEmptyString(o.status) || !isNonEmptyString(o.dueDate)) {
    throw new Error(`workItems[${index}] deve avere status e dueDate.`)
  }
  if (!VALID_TYPES.has(o.type)) throw new Error(`workItems[${index}] ha type non valido.`)
  const type = o.type
  const dueDate = o.dueDate
  const startDate = isString(o.startDate) && o.startDate ? o.startDate : dueDate
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
    acquisitionProbability: type === 'studio' && isNumber(o.acquisitionProbability) ? o.acquisitionProbability : undefined,
    blockers: stringArray(o.blockers),
  }
}

function normalizeTask(item, index) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.workItemId) || !isNonEmptyString(o.title)) {
    throw new Error(`tasks[${index}] deve avere id, workItemId e title.`)
  }
  if (!isNonEmptyString(o.assigneeId) || !isNonEmptyString(o.status) || !isNonEmptyString(o.dueDate)) {
    throw new Error(`tasks[${index}] deve avere assigneeId, status e dueDate.`)
  }
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
  }
}

function normalizeAbsence(item, index) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.personId) || !isNonEmptyString(o.type)) {
    throw new Error(`absences[${index}] deve avere id, personId e type.`)
  }
  if (!isNonEmptyString(o.startDate) || !isNonEmptyString(o.endDate) || !isNumber(o.hoursPerDay)) {
    throw new Error(`absences[${index}] deve avere startDate, endDate e hoursPerDay.`)
  }
  return {
    ...o,
    id: o.id,
    personId: o.personId,
    type: VALID_ABSENCE_TYPES.has(o.type) ? o.type : 'altro',
    startDate: o.startDate,
    endDate: o.endDate,
    hoursPerDay: o.hoursPerDay,
  }
}

function normalizeActivityLogEntry(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.timestamp)) return null
  if (!VALID_ACTIVITY_ENTITY_TYPES.has(o.entityType) || !VALID_ACTIVITY_ACTIONS.has(o.action)) return null
  if (!isNonEmptyString(o.entityId) || !isNonEmptyString(o.title)) return null
  return o
}

function normalizeBusinessPartner(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.name)) return null
  const type = VALID_BUSINESS_PARTNER_TYPES.has(o.type) ? o.type : 'cliente'
  const now = new Date().toISOString()
  return {
    ...o,
    id: o.id,
    accountCode: isString(o.accountCode) ? o.accountCode : '',
    name: o.name,
    type,
    active: typeof o.active === 'boolean' ? o.active : true,
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
}

function normalizeMachineType(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.code) || !isNonEmptyString(o.name)) return null
  const now = new Date().toISOString()
  return {
    ...o,
    id: o.id,
    code: o.code.trim().toUpperCase(),
    name: o.name.trim(),
    family: isNonEmptyString(o.family) ? o.family.trim() : 'Generico',
    description: isString(o.description) ? o.description : '',
    defaultImpactWeight: positiveNumber(o.defaultImpactWeight, 1),
    defaultComplexity: VALID_MACHINE_COMPLEXITIES.has(o.defaultComplexity) ? o.defaultComplexity : 'media',
    defaultRequiresLaser: toBoolean(o.defaultRequiresLaser, true),
    defaultRequiresTubeLaser: toBoolean(o.defaultRequiresTubeLaser, false),
    defaultRequiresBending: toBoolean(o.defaultRequiresBending, true),
    defaultRequiresWelding: toBoolean(o.defaultRequiresWelding, true),
    defaultRequiresAssembly: toBoolean(o.defaultRequiresAssembly, true),
    defaultRequiresPainting: toBoolean(o.defaultRequiresPainting, false),
    defaultRequiresTesting: toBoolean(o.defaultRequiresTesting, false),
    typicalAssemblyCount: nonNegativeInteger(o.typicalAssemblyCount, 1),
    typicalPartCount: nonNegativeInteger(o.typicalPartCount, 10),
    active: typeof o.active === 'boolean' ? o.active : true,
    notes: isString(o.notes) ? o.notes : '',
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
}

function normalizeWorkshopOutput(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.workItemId)) return null
  if (!isNonEmptyString(o.machineTypeCode) || !isNonEmptyString(o.machineTypeName)) return null
  const now = new Date().toISOString()
  return {
    ...o,
    id: o.id,
    workItemId: o.workItemId,
    machineTypeId: isString(o.machineTypeId) ? o.machineTypeId : '',
    machineTypeCode: o.machineTypeCode.trim().toUpperCase(),
    machineTypeName: o.machineTypeName.trim(),
    description: isString(o.description) ? o.description : '',
    quantity: positiveNumber(o.quantity, 1),
    complexity: VALID_MACHINE_COMPLEXITIES.has(o.complexity) ? o.complexity : 'media',
    assemblyCount: nonNegativeInteger(o.assemblyCount, 0),
    estimatedPartCount: nonNegativeInteger(o.estimatedPartCount, 0),
    requiresLaser: toBoolean(o.requiresLaser, false),
    requiresTubeLaser: toBoolean(o.requiresTubeLaser, false),
    requiresBending: toBoolean(o.requiresBending, false),
    requiresWelding: toBoolean(o.requiresWelding, false),
    requiresAssembly: toBoolean(o.requiresAssembly, false),
    requiresPainting: toBoolean(o.requiresPainting, false),
    requiresTesting: toBoolean(o.requiresTesting, false),
    plannedReleaseDate: isString(o.plannedReleaseDate) ? o.plannedReleaseDate : '',
    actualReleaseDate: isString(o.actualReleaseDate) ? o.actualReleaseDate : '',
    impactScore: isNumber(o.impactScore) ? Math.max(0, Math.round(o.impactScore * 10) / 10) : 0,
    status: VALID_WORKSHOP_OUTPUT_STATUSES.has(o.status) ? o.status : 'previsto',
    notes: isString(o.notes) ? o.notes : '',
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
}

function normalizeNotification(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.timestamp)) return null
  if (o.type !== 'status_changed') return null
  if (o.entityType !== 'workItem' && o.entityType !== 'task') return null
  if (!isNonEmptyString(o.entityId) || !isNonEmptyString(o.title)) return null
  return {
    ...o,
    read: typeof o.read === 'boolean' ? o.read : false,
    recipient: 'Domenico',
    emailSuggested: typeof o.emailSuggested === 'boolean' ? o.emailSuggested : true,
    emailSubject: isString(o.emailSubject) ? o.emailSubject : o.title,
    emailBody: isString(o.emailBody) ? o.emailBody : '',
    beforeStatus: isString(o.beforeStatus) ? mapLegacyStatus(o.beforeStatus) : undefined,
    afterStatus: isString(o.afterStatus) ? mapLegacyStatus(o.afterStatus) : undefined,
  }
}

function mapLegacyStatus(status) {
  if (VALID_STATUSES.has(status)) return status
  return LEGACY_STATUS_MAP[status] ?? 'Da pianificare'
}

function normalizePriority(value) {
  return isString(value) && VALID_PRIORITIES.has(value) ? value : 'media'
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function isString(value) {
  return typeof value === 'string'
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function numberOrZero(value) {
  return isNumber(value) ? value : 0
}

function positiveNumber(value, fallback) {
  if (!isNumber(value)) return fallback
  return value > 0 ? value : fallback
}

function nonNegativeInteger(value, fallback) {
  if (!isNumber(value)) return fallback
  return Math.max(0, Math.round(value))
}

function toBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizePercent(value) {
  if (!isNumber(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function pad2(value) {
  return String(value).padStart(2, '0')
}
