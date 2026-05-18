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
const VALID_ACTIVITY_ENTITY_TYPES = new Set(['workItem', 'task', 'person', 'absence', 'system'])

export const EMPTY_APP_DATA = {
  people: [],
  workItems: [],
  tasks: [],
  absences: [],
  activityLog: [],
  notifications: [],
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

  return {
    people: root.people.map((item, index) => normalizePerson(item, index)),
    workItems: root.workItems.map((item, index) => normalizeWorkItem(item, index)),
    tasks: root.tasks.map((item, index) => normalizeTask(item, index)),
    absences: (root.absences ?? []).map((item, index) => normalizeAbsence(item, index)),
    activityLog: (root.activityLog ?? []).map(normalizeActivityLogEntry).filter(Boolean),
    notifications: (root.notifications ?? []).map(normalizeNotification).filter(Boolean),
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
