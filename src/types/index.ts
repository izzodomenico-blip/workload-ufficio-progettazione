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

export type ActivityLogEntityType = 'workItem' | 'task' | 'person' | 'absence' | 'machineType' | 'system'

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
  typicalAssemblyCount: number
  typicalPartCount: number
  active: boolean
  notes: string
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
