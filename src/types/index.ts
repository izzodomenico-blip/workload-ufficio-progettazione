export type WorkItemType = 'commessa' | 'studio' | 'interno'

export type Priority = 'bassa' | 'media' | 'alta' | 'critica'

export type Status =
  | 'Da pianificare'
  | 'Pianificato'
  | 'In corso'
  | 'In attesa'
  | 'In verifica'
  | 'Completato'
  | 'Sospeso'

export const ALL_STATUSES: Status[] = [
  'Da pianificare',
  'Pianificato',
  'In corso',
  'In attesa',
  'In verifica',
  'Completato',
  'Sospeso',
]

export const ALL_PRIORITIES: Priority[] = ['bassa', 'media', 'alta', 'critica']

export const ALL_TYPES: WorkItemType[] = ['commessa', 'studio', 'interno']

export const TECHNICAL_PHASES = [
  'Studio fattibilità',
  'Layout',
  'Progettazione 3D',
  'Dettagli costruttivi',
  'Distinte / commerciali',
  'Verifica responsabile',
  'Rilascio produzione',
  'Documentazione cliente',
  'Completato',
] as const

export type TechnicalPhase = (typeof TECHNICAL_PHASES)[number]

export interface Person {
  id: string
  name: string
  role: string
  weeklyCapacityHours: number
  skills: string[]
  active: boolean
  notes?: string
  /**
   * Carico base non dichiarato come task/lavoro (es. supervisione, riunioni tecniche,
   * gestione clienti). Espresso in % della capacità reale settimanale (0–100).
   * Si scala proporzionalmente alle assenze. Campo protetto da password lato backend.
   */
  baselineLoadPercent?: number
}

export interface WorkItem {
  id: string
  type: WorkItemType
  code: string
  customer: string
  title: string
  description: string
  priority: Priority
  status: Status
  ownerId: string
  assigneeIds: string[]
  startDate: string
  dueDate: string
  estimatedHours: number
  loggedHours: number
  progressPercent: number
  acquisitionProbability?: number
  blockers: string[]
  notes?: string
  // Dettagli tecnici e operativi (v0.9, tutti opzionali per compat dati legacy)
  technicalPhase?: TechnicalPhase
  customerRequestDate?: string
  plannedProductionReleaseDate?: string
  actualProductionReleaseDate?: string
  workFolderLink?: string
  offerReference?: string
  commercialPriority?: Priority
  managerNotes?: string
  // Collegamento opzionale all'anagrafica clienti (v1.2). `customer` resta come
  // stringa libera per WorkItem creati prima dell'introduzione delle anagrafiche
  // o per clienti non ancora censiti.
  customerPartnerId?: string
  customerPartnerName?: string
}

export interface Task {
  id: string
  workItemId: string
  title: string
  assigneeId: string
  status: Status
  startDate: string
  dueDate: string
  estimatedHours: number
  loggedHours: number
  progressPercent: number
  blockers: string[]
  notes?: string
}

export type AbsenceType = 'ferie' | 'permesso' | 'malattia' | 'trasferta' | 'altro'

export const ALL_ABSENCE_TYPES: AbsenceType[] = ['ferie', 'permesso', 'malattia', 'trasferta', 'altro']

export interface Absence {
  id: string
  personId: string
  type: AbsenceType
  startDate: string
  endDate: string
  hoursPerDay: number
  notes?: string
}

export type ActivityLogAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'status_changed'
  | 'progress_changed'
  | 'converted'
  | 'exported'
  | 'imported'
  | 'reset'

export type ActivityLogEntityType =
  | 'workItem'
  | 'task'
  | 'person'
  | 'absence'
  | 'machineType'
  | 'workshopOutput'
  | 'workshopWorker'
  | 'system'

export interface ActivityLogEntry {
  id: string
  timestamp: string
  entityType: ActivityLogEntityType
  entityId: string
  action: ActivityLogAction
  title: string
  description?: string
  before?: Record<string, unknown> | string | number | boolean | null
  after?: Record<string, unknown> | string | number | boolean | null
}

export const ALL_ACTIVITY_ACTIONS: ActivityLogAction[] = [
  'created',
  'updated',
  'deleted',
  'status_changed',
  'progress_changed',
  'converted',
  'exported',
  'imported',
  'reset',
]

export const ALL_ACTIVITY_ENTITY_TYPES: ActivityLogEntityType[] = [
  'workItem',
  'task',
  'person',
  'absence',
  'machineType',
  'workshopOutput',
  'workshopWorker',
  'system',
]

// === Notifiche interne (v0.10) ===
// Generate quando cambia stato a un WorkItem o Task.
// Pensate per essere mostrate nel centro notifiche e per generare un mailto.
// L'invio email automatico richiederà un backend dedicato — qui sono solo interne.
export type NotificationType = 'status_changed'
export type NotificationEntityType = 'workItem' | 'task'
export type NotificationRecipient = 'Domenico'

export interface Notification {
  id: string
  timestamp: string
  type: NotificationType
  entityType: NotificationEntityType
  entityId: string
  workItemId?: string
  title: string
  message: string
  read: boolean
  recipient: NotificationRecipient
  emailSuggested: boolean
  emailSubject: string
  emailBody: string
  // Snapshot di stato per audit / display nel centro notifiche
  beforeStatus?: Status
  afterStatus?: Status
}

// === Anagrafiche clienti / fornitori / personale (v1.2) ===

export type BusinessPartnerType = 'cliente' | 'fornitore' | 'personale' | 'altro'

export const ALL_BUSINESS_PARTNER_TYPES: BusinessPartnerType[] = ['cliente', 'fornitore', 'personale', 'altro']

export interface BusinessPartner {
  id: string
  accountCode: string
  name: string
  type: BusinessPartnerType
  vatNumber?: string
  fiscalCode?: string
  sdiCode?: string
  address?: string
  city?: string
  province?: string
  postalCode?: string
  country?: string
  email?: string
  pec?: string
  phone?: string
  paymentCode?: string
  paymentDescription?: string
  bankName?: string
  abi?: string
  cab?: string
  vatExemptionCode?: string
  balance?: number
  exposure?: number
  creditLimit?: number
  overCreditLimit?: number
  risk?: number
  notes?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

// === Libreria Registro Disegni / tipologie macchina ===

export type MachineComplexity = 'bassa' | 'media' | 'alta' | 'speciale'

export const ALL_MACHINE_COMPLEXITIES: MachineComplexity[] = ['bassa', 'media', 'alta', 'speciale']

export const MACHINE_TYPE_FAMILIES = [
  'Rulliere',
  'Trasportatori',
  'Tendostrutture / Strutture',
  'Manipolazione',
  'Sollevamento',
  'Ripari / Sicurezza',
  'Standard',
  'Attrezzature',
  'Impianti',
  'Generico',
] as const

export interface MachineType {
  id: string
  code: string
  name: string
  family: string
  description: string
  defaultImpactWeight: number
  defaultComplexity: MachineComplexity
  defaultRequiresLaser: boolean
  defaultRequiresTubeLaser: boolean
  defaultRequiresBending: boolean
  defaultRequiresWelding: boolean
  defaultRequiresAssembly: boolean
  defaultRequiresPainting: boolean
  defaultRequiresTesting: boolean
  defaultLaserWeightPercent: number
  defaultTubeLaserWeightPercent: number
  defaultBendingWeightPercent: number
  defaultWeldingWeightPercent: number
  defaultAssemblyWeightPercent: number
  defaultPaintingWeightPercent: number
  defaultTestingWeightPercent: number
  typicalAssemblyCount: number
  typicalPartCount: number
  active: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

// === Output verso officina ===

export type WorkshopOutputStatus =
  | 'previsto'
  | 'in_progettazione'
  | 'pronto_rilascio'
  | 'rilasciato_produzione'
  | 'ricevuto_officina'
  | 'sospeso'

export const ALL_WORKSHOP_OUTPUT_STATUSES: WorkshopOutputStatus[] = [
  'previsto',
  'in_progettazione',
  'pronto_rilascio',
  'rilasciato_produzione',
  'ricevuto_officina',
  'sospeso',
]

export interface WorkshopOutput {
  id: string
  workItemId: string
  machineTypeId: string
  machineTypeCode: string
  machineTypeName: string
  description: string
  quantity: number
  complexity: MachineComplexity
  assemblyCount: number
  estimatedPartCount: number
  requiresLaser: boolean
  requiresTubeLaser: boolean
  requiresBending: boolean
  requiresWelding: boolean
  requiresAssembly: boolean
  requiresPainting: boolean
  requiresTesting: boolean
  laserWeightPercent: number
  tubeLaserWeightPercent: number
  bendingWeightPercent: number
  weldingWeightPercent: number
  assemblyWeightPercent: number
  paintingWeightPercent: number
  testingWeightPercent: number
  plannedReleaseDate: string
  actualReleaseDate: string
  impactScore: number
  status: WorkshopOutputStatus
  notes: string
  createdAt: string
  updatedAt: string
}

// === Operai / dipendenti officina ===

export type WorkshopWorkerSkill =
  | 'laser_piano'
  | 'laser_tubo'
  | 'piegatrice'
  | 'saldatura'
  | 'tornitura'
  | 'fresatura'
  | 'montaggio'
  | 'verniciatura'
  | 'collaudo'
  | 'magazzino'
  | 'manutenzione'
  | 'altro'

export const ALL_WORKSHOP_WORKER_SKILLS: WorkshopWorkerSkill[] = [
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
]

export const WORKSHOP_WORKER_SKILL_LABELS: Record<WorkshopWorkerSkill, string> = {
  laser_piano: 'Laser piano',
  laser_tubo: 'Laser tubi',
  piegatrice: 'Piegatrice',
  saldatura: 'Saldatore',
  tornitura: 'Tornitura',
  fresatura: 'Fresatura',
  montaggio: 'Montatore',
  verniciatura: 'Verniciatura / Trattamento',
  collaudo: 'Collaudo',
  magazzino: 'Magazzino',
  manutenzione: 'Manutenzione',
  altro: 'Altro',
}

export interface WorkshopWorker {
  id: string
  employeeCode: string
  firstName: string
  lastName: string
  displayName: string
  role: string
  department: string
  employmentType: string
  phone: string
  mobilePhone: string
  email: string
  address: string
  city: string
  province: string
  fiscalCode: string
  birthDate: string
  hireDate: string
  skills: WorkshopWorkerSkill[]
  primarySkill: WorkshopWorkerSkill | ''
  dailyCapacityPoints: number
  weeklyCapacityPoints: number
  active: boolean
  notes: string
  extraFields?: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface AppData {
  people: Person[]
  workItems: WorkItem[]
  tasks: Task[]
  absences: Absence[]
  activityLog: ActivityLogEntry[]
  notifications: Notification[]
  businessPartners: BusinessPartner[]
  machineTypes: MachineType[]
  workshopOutputs: WorkshopOutput[]
  workshopWorkers: WorkshopWorker[]
}

export interface Filters {
  personId: string
  customer: string
  type: WorkItemType | ''
  priority: Priority | ''
  status: Status | ''
  search: string
  technicalPhase: TechnicalPhase | ''
  commercialPriority: Priority | ''
}

export const EMPTY_FILTERS: Filters = {
  personId: '',
  customer: '',
  type: '',
  priority: '',
  status: '',
  search: '',
  technicalPhase: '',
  commercialPriority: '',
}

/** Stati terminali: non contano come lavori/task “aperti” in dashboard e KPI. */
export const CLOSED_STATUSES: Status[] = ['Completato', 'Sospeso']

export function isOpen(status: Status): boolean {
  return !CLOSED_STATUSES.includes(status)
}
