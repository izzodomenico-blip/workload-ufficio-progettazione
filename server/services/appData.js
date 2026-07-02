import { getDefaultMachineTypes } from './machineTypesSeed.js'

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
const VALID_WORKSHOP_WORKER_SKILLS = new Set([
  'laser_piano',
  'laser_tubo',
  'piegatrice',
  'saldatura',
  'tornitura',
  'fresatura',
  'montaggio',
  'verniciatura',
  'collaudo',
  'magazzino',
  'manutenzione',
  'altro',
])
const VALID_WORKSHOP_ASSIGNMENT_STATUSES = new Set([
  'pianificato',
  'in_lavorazione',
  'completato',
  'sospeso',
])

const DEFAULT_MACHINE_TYPES_BY_CODE = new Map(
  getDefaultMachineTypes().map((item) => [item.code.toUpperCase(), item]),
)

const PROCESS_FIELDS = [
  {
    machineFlag: 'defaultRequiresLaser',
    machineWeight: 'defaultLaserWeightPercent',
    outputFlag: 'requiresLaser',
    outputWeight: 'laserWeightPercent',
  },
  {
    machineFlag: 'defaultRequiresTubeLaser',
    machineWeight: 'defaultTubeLaserWeightPercent',
    outputFlag: 'requiresTubeLaser',
    outputWeight: 'tubeLaserWeightPercent',
  },
  {
    machineFlag: 'defaultRequiresBending',
    machineWeight: 'defaultBendingWeightPercent',
    outputFlag: 'requiresBending',
    outputWeight: 'bendingWeightPercent',
  },
  {
    machineFlag: 'defaultRequiresWelding',
    machineWeight: 'defaultWeldingWeightPercent',
    outputFlag: 'requiresWelding',
    outputWeight: 'weldingWeightPercent',
  },
  {
    machineFlag: 'defaultRequiresTurning',
    machineWeight: 'defaultTurningWeightPercent',
    outputFlag: 'requiresTurning',
    outputWeight: 'turningWeightPercent',
  },
  {
    machineFlag: 'defaultRequiresMilling',
    machineWeight: 'defaultMillingWeightPercent',
    outputFlag: 'requiresMilling',
    outputWeight: 'millingWeightPercent',
  },
  {
    machineFlag: 'defaultRequiresAssembly',
    machineWeight: 'defaultAssemblyWeightPercent',
    outputFlag: 'requiresAssembly',
    outputWeight: 'assemblyWeightPercent',
  },
  {
    machineFlag: 'defaultRequiresPainting',
    machineWeight: 'defaultPaintingWeightPercent',
    outputFlag: 'requiresPainting',
    outputWeight: 'paintingWeightPercent',
  },
  {
    machineFlag: 'defaultRequiresTesting',
    machineWeight: 'defaultTestingWeightPercent',
    outputFlag: 'requiresTesting',
    outputWeight: 'testingWeightPercent',
  },
]
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
  'workshopWorker',
  'workshopAssignment',
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
  workshopWorkers: [],
  workshopAssignments: [],
  calculatedStandardComponents: [],
}

const VALID_STANDARD_COMPONENTS_MODES = new Set(['manual', 'calculated', 'mixed'])
const VALID_STANDARD_COMPONENTS_CALCULATION_TYPES = new Set(['none', 'I_TS', 'I_SC'])
const VALID_STANDARD_COMPONENTS_CALCULATION_STATUSES = new Set([
  'not_configured',
  'missing_parameters',
  'ready',
  'calculated',
  'manual_override',
])
const VALID_STANDARD_COMPONENTS_SUBCATEGORIES = new Set([
  'none',
  'TS_MONOPENDENZA',
  'TS_MONOPENDENZA_DOPPIO_ZERO',
  'TS_DOPPIA_PENDENZA',
  'TS_DOPPIA_PENDENZA_COLONNE_MONO',
  'SC_CANTILEVER_MONOFRONTE',
  'SC_CANTILEVER_BIFRONTE',
])

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
  if (root.workshopWorkers !== undefined && !Array.isArray(root.workshopWorkers)) {
    throw new Error('workshopWorkers deve essere un array oppure assente.')
  }
  if (root.workshopAssignments !== undefined && !Array.isArray(root.workshopAssignments)) {
    throw new Error('workshopAssignments deve essere un array oppure assente.')
  }
  if (root.calculatedStandardComponents !== undefined && !Array.isArray(root.calculatedStandardComponents)) {
    throw new Error('calculatedStandardComponents deve essere un array oppure assente.')
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
    workshopWorkers: (root.workshopWorkers ?? []).map(normalizeWorkshopWorker).filter(Boolean),
    workshopAssignments: (root.workshopAssignments ?? []).map(normalizeWorkshopAssignment).filter(Boolean),
    calculatedStandardComponents: (root.calculatedStandardComponents ?? []).map(normalizeCalculatedStandardComponent).filter(Boolean),
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
    workshopWorkers: data.workshopWorkers.length,
    workshopAssignments: data.workshopAssignments.length,
    calculatedStandardComponents: (data.calculatedStandardComponents ?? []).length,
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
  const code = o.code.trim().toUpperCase()
  const defaults = DEFAULT_MACHINE_TYPES_BY_CODE.get(code)
  const processFlags = {
    defaultRequiresLaser: toBoolean(o.defaultRequiresLaser, defaults?.defaultRequiresLaser ?? true),
    defaultRequiresTubeLaser: toBoolean(o.defaultRequiresTubeLaser, defaults?.defaultRequiresTubeLaser ?? false),
    defaultRequiresBending: toBoolean(o.defaultRequiresBending, defaults?.defaultRequiresBending ?? true),
    defaultRequiresWelding: toBoolean(o.defaultRequiresWelding, defaults?.defaultRequiresWelding ?? true),
    defaultRequiresTurning: toBoolean(o.defaultRequiresTurning, defaults?.defaultRequiresTurning ?? false),
    defaultRequiresMilling: toBoolean(o.defaultRequiresMilling, defaults?.defaultRequiresMilling ?? false),
    defaultRequiresAssembly: toBoolean(o.defaultRequiresAssembly, defaults?.defaultRequiresAssembly ?? true),
    defaultRequiresPainting: toBoolean(o.defaultRequiresPainting, defaults?.defaultRequiresPainting ?? false),
    defaultRequiresTesting: toBoolean(o.defaultRequiresTesting, defaults?.defaultRequiresTesting ?? false),
  }
  return {
    ...o,
    id: o.id,
    code,
    name: o.name.trim(),
    family: isNonEmptyString(o.family) ? o.family.trim() : 'Generico',
    description: isString(o.description) ? o.description : '',
    defaultImpactWeight: positiveNumber(o.defaultImpactWeight, 1),
    defaultComplexity: VALID_MACHINE_COMPLEXITIES.has(o.defaultComplexity) ? o.defaultComplexity : 'media',
    ...processFlags,
    ...machineProcessWeights(o, defaults, processFlags),
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
  const machineTypeCode = o.machineTypeCode.trim().toUpperCase()
  const defaults = DEFAULT_MACHINE_TYPES_BY_CODE.get(machineTypeCode)
  const processFlags = {
    requiresLaser: toBoolean(o.requiresLaser, defaults?.defaultRequiresLaser ?? false),
    requiresTubeLaser: toBoolean(o.requiresTubeLaser, defaults?.defaultRequiresTubeLaser ?? false),
    requiresBending: toBoolean(o.requiresBending, defaults?.defaultRequiresBending ?? false),
    requiresWelding: toBoolean(o.requiresWelding, defaults?.defaultRequiresWelding ?? false),
    requiresTurning: toBoolean(o.requiresTurning, defaults?.defaultRequiresTurning ?? false),
    requiresMilling: toBoolean(o.requiresMilling, defaults?.defaultRequiresMilling ?? false),
    requiresAssembly: toBoolean(o.requiresAssembly, defaults?.defaultRequiresAssembly ?? false),
    requiresPainting: toBoolean(o.requiresPainting, defaults?.defaultRequiresPainting ?? false),
    requiresTesting: toBoolean(o.requiresTesting, defaults?.defaultRequiresTesting ?? false),
  }
  const hasStandardComponents = toBoolean(o.hasStandardComponents, false)
  return {
    ...o,
    id: o.id,
    workItemId: o.workItemId,
    machineTypeId: isString(o.machineTypeId) ? o.machineTypeId : '',
    machineTypeCode,
    machineTypeName: o.machineTypeName.trim(),
    description: isString(o.description) ? o.description : '',
    quantity: positiveNumber(o.quantity, 1),
    complexity: VALID_MACHINE_COMPLEXITIES.has(o.complexity) ? o.complexity : 'media',
    assemblyCount: nonNegativeInteger(o.assemblyCount, 0),
    estimatedPartCount: nonNegativeInteger(o.estimatedPartCount, 0),
    ...processFlags,
    ...outputProcessWeights(o, defaults, processFlags),
    hasStandardComponents,
    standardComponentsDescription: isString(o.standardComponentsDescription) ? o.standardComponentsDescription : '',
    standardComponentsQuantity: nonNegativeInteger(o.standardComponentsQuantity, 0),
    standardComponentsReadyFromDate: isString(o.standardComponentsReadyFromDate) ? o.standardComponentsReadyFromDate : '',
    standardComponentsImpactScore: hasStandardComponents ? positiveNumber(o.standardComponentsImpactScore, 0) : 0,
    standardComponentsProcesses: stringArray(o.standardComponentsProcesses).filter((process) => VALID_WORKSHOP_WORKER_SKILLS.has(process)),
    standardComponentsNotes: isString(o.standardComponentsNotes) ? o.standardComponentsNotes : '',
    machineLengthMm: optionalPositiveNumberOrNull(o.machineLengthMm),
    machineWidthMm: optionalPositiveNumberOrNull(o.machineWidthMm),
    machineHeightMm: optionalPositiveNumberOrNull(o.machineHeightMm),
    machineSpanMm: optionalPositiveNumberOrNull(o.machineSpanMm),
    machineModuleCount: optionalPositiveNumberOrNull(o.machineModuleCount),
    machineBayCount: optionalPositiveNumberOrNull(o.machineBayCount),
    machineSlopePercent: optionalPositiveNumberOrNull(o.machineSlopePercent),
    machineNotes: isString(o.machineNotes) ? o.machineNotes : '',
    standardComponentsMode: VALID_STANDARD_COMPONENTS_MODES.has(o.standardComponentsMode) ? o.standardComponentsMode : 'manual',
    standardComponentsCalculationType: VALID_STANDARD_COMPONENTS_CALCULATION_TYPES.has(o.standardComponentsCalculationType) ? o.standardComponentsCalculationType : 'none',
    standardComponentsSubcategory: VALID_STANDARD_COMPONENTS_SUBCATEGORIES.has(o.standardComponentsSubcategory) ? o.standardComponentsSubcategory : 'none',
    standardComponentsCalculatedAt: isString(o.standardComponentsCalculatedAt) && o.standardComponentsCalculatedAt ? o.standardComponentsCalculatedAt : null,
    standardComponentsCalculationStatus: VALID_STANDARD_COMPONENTS_CALCULATION_STATUSES.has(o.standardComponentsCalculationStatus) ? o.standardComponentsCalculationStatus : 'not_configured',
    hasCommercialComponents: toBoolean(o.hasCommercialComponents, false),
    commercialComponentsDescription: isString(o.commercialComponentsDescription) ? o.commercialComponentsDescription : '',
    commercialComponentsOrderRequired: toBoolean(o.commercialComponentsOrderRequired, false),
    commercialComponentsOrdered: toBoolean(o.commercialComponentsOrdered, false),
    commercialComponentsOrderedAt: isString(o.commercialComponentsOrderedAt) ? o.commercialComponentsOrderedAt : '',
    commercialComponentsOrderedBy: isString(o.commercialComponentsOrderedBy) ? o.commercialComponentsOrderedBy : '',
    commercialComponentsNotes: isString(o.commercialComponentsNotes) ? o.commercialComponentsNotes : '',
    plannedReleaseDate: isString(o.plannedReleaseDate) ? o.plannedReleaseDate : '',
    actualReleaseDate: isString(o.actualReleaseDate) ? o.actualReleaseDate : '',
    impactScore: isNumber(o.impactScore) ? Math.max(0, Math.round(o.impactScore * 10) / 10) : 0,
    status: VALID_WORKSHOP_OUTPUT_STATUSES.has(o.status) ? o.status : 'previsto',
    notes: isString(o.notes) ? o.notes : '',
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
}

function normalizeWorkshopWorker(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id)) return null
  const firstName = isString(o.firstName) ? o.firstName.trim() : ''
  const lastName = isString(o.lastName) ? o.lastName.trim() : ''
  const displayName = isNonEmptyString(o.displayName)
    ? o.displayName.trim()
    : [firstName, lastName].filter(Boolean).join(' ').trim()
  if (!displayName) return null
  const skills = stringArray(o.skills).filter((skill) => VALID_WORKSHOP_WORKER_SKILLS.has(skill))
  const primarySkill = isString(o.primarySkill) && VALID_WORKSHOP_WORKER_SKILLS.has(o.primarySkill)
    ? o.primarySkill
    : (skills[0] ?? '')
  const now = new Date().toISOString()
  return {
    ...o,
    id: o.id,
    employeeCode: isString(o.employeeCode) ? o.employeeCode.trim() : '',
    firstName,
    lastName,
    displayName,
    role: isString(o.role) ? o.role.trim() : '',
    department: isString(o.department) ? o.department.trim() : '',
    employmentType: isString(o.employmentType) ? o.employmentType.trim() : '',
    phone: isString(o.phone) ? o.phone.trim() : '',
    mobilePhone: isString(o.mobilePhone) ? o.mobilePhone.trim() : '',
    email: isString(o.email) ? o.email.trim() : '',
    address: isString(o.address) ? o.address.trim() : '',
    city: isString(o.city) ? o.city.trim() : '',
    province: isString(o.province) ? o.province.trim().toUpperCase() : '',
    fiscalCode: isString(o.fiscalCode) ? o.fiscalCode.trim().toUpperCase() : '',
    birthDate: isString(o.birthDate) ? o.birthDate.trim() : '',
    hireDate: isString(o.hireDate) ? o.hireDate.trim() : '',
    skills,
    primarySkill,
    dailyCapacityPoints: positiveNumber(o.dailyCapacityPoints, 100),
    weeklyCapacityPoints: positiveNumber(o.weeklyCapacityPoints, 500),
    active: typeof o.active === 'boolean' ? o.active : true,
    notes: isString(o.notes) ? o.notes : '',
    extraFields: asObject(o.extraFields) ? stringMap(o.extraFields) : undefined,
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
}

function normalizeWorkshopAssignment(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id)) return null
  if (!isNonEmptyString(o.workshopOutputId) || !isNonEmptyString(o.workItemId) || !isNonEmptyString(o.workerId)) return null
  if (!isString(o.process) || !VALID_WORKSHOP_WORKER_SKILLS.has(o.process)) return null
  if (!isNonEmptyString(o.plannedDate)) return null
  const now = new Date().toISOString()
  return {
    ...o,
    id: o.id,
    workshopOutputId: o.workshopOutputId,
    workItemId: o.workItemId,
    workerId: o.workerId,
    process: o.process,
    sourceType: o.sourceType === 'standard_component' ? 'standard_component' : 'output',
    plannedDate: o.plannedDate,
    plannedWeek: isNonEmptyString(o.plannedWeek) ? o.plannedWeek : startOfWeekISO(o.plannedDate),
    loadPoints: positiveNumber(o.loadPoints, 0.1),
    status: VALID_WORKSHOP_ASSIGNMENT_STATUSES.has(o.status) ? o.status : 'pianificato',
    notes: isString(o.notes) ? o.notes : '',
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
}

function normalizeCalculatedStandardComponent(item) {
  const o = asObject(item)
  if (!o || !isNonEmptyString(o.id) || !isNonEmptyString(o.workshopOutputId) || !isNonEmptyString(o.workItemId)) return null
  if (!isNonEmptyString(o.machineTypeCode)) return null
  const process = isString(o.process) && VALID_WORKSHOP_WORKER_SKILLS.has(o.process) ? o.process : 'altro'
  const source = o.source === 'calculated' ? 'calculated' : 'manual'
  const now = new Date().toISOString()
  return {
    id: o.id,
    workshopOutputId: o.workshopOutputId,
    workItemId: o.workItemId,
    machineTypeCode: String(o.machineTypeCode).toUpperCase(),
    componentCode: isString(o.componentCode) ? o.componentCode : '',
    componentName: isString(o.componentName) ? o.componentName : '',
    description: isString(o.description) ? o.description : '',
    quantity: isNumber(o.quantity) ? Math.max(0, Math.round(o.quantity)) : 0,
    process,
    readyFromDate: isString(o.readyFromDate) ? o.readyFromDate : '',
    impactScore: isNumber(o.impactScore) ? Math.max(0, Math.round(o.impactScore * 10) / 10) : 0,
    notes: isString(o.notes) ? o.notes : '',
    source,
    createdAt: isNonEmptyString(o.createdAt) ? o.createdAt : now,
    updatedAt: isNonEmptyString(o.updatedAt) ? o.updatedAt : now,
  }
}

function optionalPositiveNumberOrNull(value) {
  if (!isNumber(value)) return null
  if (value <= 0) return null
  return value
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

function machineProcessWeights(raw, defaults, flags) {
  const enabled = PROCESS_FIELDS.filter((process) => flags[process.machineFlag])
  const fallback = enabled.length > 0 ? Math.round(100 / enabled.length) : 0
  return Object.fromEntries(
    PROCESS_FIELDS.map((process) => {
      const value = flags[process.machineFlag]
        ? percentOr(raw[process.machineWeight], defaults?.[process.machineWeight] ?? fallback)
        : 0
      return [process.machineWeight, value]
    }),
  )
}

function outputProcessWeights(raw, defaults, flags) {
  const enabled = PROCESS_FIELDS.filter((process) => flags[process.outputFlag])
  const fallback = enabled.length > 0 ? Math.round(100 / enabled.length) : 0
  return Object.fromEntries(
    PROCESS_FIELDS.map((process) => {
      const value = flags[process.outputFlag]
        ? percentOr(raw[process.outputWeight], defaults?.[process.machineWeight] ?? fallback)
        : 0
      return [process.outputWeight, value]
    }),
  )
}

function percentOr(value, fallback) {
  if (!isNumber(value)) return Math.max(0, Math.min(100, Math.round(fallback)))
  return Math.max(0, Math.min(100, Math.round(value)))
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

function stringMap(value) {
  const o = asObject(value)
  if (!o) return {}
  return Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim().length > 0)
      .map(([k, v]) => [k, String(v).trim()]),
  )
}

function startOfWeekISO(iso) {
  const [year, month, day] = String(iso).split('-').map(Number)
  const date = new Date(year, (month || 1) - 1, day || 1)
  date.setHours(0, 0, 0, 0)
  const dow = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - dow)
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('-')
}

function pad2(value) {
  return String(value).padStart(2, '0')
}
