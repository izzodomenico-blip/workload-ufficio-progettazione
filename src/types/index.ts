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
  createdByUserId?: string
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
  createdByUserId?: string
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
  | 'workshopAssignment'
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
  'workshopAssignment',
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
  // Lavorazioni meccaniche (opzionali per compat dati esistenti)
  defaultRequiresTurning?: boolean
  defaultRequiresMilling?: boolean
  defaultTurningWeightPercent?: number
  defaultMillingWeightPercent?: number
  typicalAssemblyCount: number
  typicalPartCount: number
  active: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

// === Componenti standard calcolati da parametri macchina ===

export type StandardComponentsMode = 'manual' | 'calculated' | 'mixed'

export const ALL_STANDARD_COMPONENTS_MODES: StandardComponentsMode[] = ['manual', 'calculated', 'mixed']

export type StandardComponentsCalculationType = 'none' | 'I_TS' | 'I_SC'

export const ALL_STANDARD_COMPONENTS_CALCULATION_TYPES: StandardComponentsCalculationType[] = [
  'none',
  'I_TS',
  'I_SC',
]

// Sottocategorie del calcolo standard. Cambiano le formule e gli standard generati.
export type StandardComponentsSubcategory =
  | 'none'
  // I.TS — Tendostrutture
  | 'TS_MONOPENDENZA'
  | 'TS_MONOPENDENZA_DOPPIO_ZERO'
  | 'TS_DOPPIA_PENDENZA'
  | 'TS_DOPPIA_PENDENZA_COLONNE_MONO'
  // I.SC — Scaffalature
  | 'SC_CANTILEVER_MONOFRONTE'
  | 'SC_CANTILEVER_BIFRONTE'

export const ALL_STANDARD_COMPONENTS_SUBCATEGORIES: StandardComponentsSubcategory[] = [
  'none',
  'TS_MONOPENDENZA',
  'TS_MONOPENDENZA_DOPPIO_ZERO',
  'TS_DOPPIA_PENDENZA',
  'TS_DOPPIA_PENDENZA_COLONNE_MONO',
  'SC_CANTILEVER_MONOFRONTE',
  'SC_CANTILEVER_BIFRONTE',
]

export const STANDARD_COMPONENTS_SUBCATEGORY_LABELS: Record<StandardComponentsSubcategory, string> = {
  none: 'Non specificata',
  TS_MONOPENDENZA: 'Monopendenza',
  TS_MONOPENDENZA_DOPPIO_ZERO: 'Monopendenza doppio zero',
  TS_DOPPIA_PENDENZA: 'Doppia pendenza',
  TS_DOPPIA_PENDENZA_COLONNE_MONO: 'Doppia pendenza colonne mono',
  SC_CANTILEVER_MONOFRONTE: 'Cantilever monofronte',
  SC_CANTILEVER_BIFRONTE: 'Cantilever bifronte',
}

export const STANDARD_COMPONENTS_SUBCATEGORIES_BY_TYPE: Record<StandardComponentsCalculationType, StandardComponentsSubcategory[]> = {
  none: [],
  I_TS: [
    'TS_MONOPENDENZA',
    'TS_MONOPENDENZA_DOPPIO_ZERO',
    'TS_DOPPIA_PENDENZA',
    'TS_DOPPIA_PENDENZA_COLONNE_MONO',
  ],
  I_SC: [
    'SC_CANTILEVER_MONOFRONTE',
    'SC_CANTILEVER_BIFRONTE',
  ],
}

export type StandardComponentsCalculationStatus =
  | 'not_configured'
  | 'missing_parameters'
  | 'ready'
  | 'calculated'
  | 'manual_override'

export const ALL_STANDARD_COMPONENTS_CALCULATION_STATUSES: StandardComponentsCalculationStatus[] = [
  'not_configured',
  'missing_parameters',
  'ready',
  'calculated',
  'manual_override',
]

export type CalculatedStandardComponentSource = 'calculated' | 'manual'

export interface CalculatedStandardComponent {
  id: string
  workshopOutputId: string
  workItemId: string
  machineTypeCode: string
  componentCode: string
  componentName: string
  description: string
  quantity: number
  process: WorkshopWorkerSkill
  readyFromDate: string
  impactScore: number
  notes: string
  source: CalculatedStandardComponentSource
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
  // Lavorazioni meccaniche (opzionali per compat dati esistenti)
  requiresTurning?: boolean
  requiresMilling?: boolean
  turningWeightPercent?: number
  millingWeightPercent?: number
  hasStandardComponents?: boolean
  standardComponentsDescription?: string
  standardComponentsQuantity?: number
  standardComponentsReadyFromDate?: string
  standardComponentsImpactScore?: number
  standardComponentsProcesses?: WorkshopWorkerSkill[]
  standardComponentsNotes?: string
  // Parametri geometrici macchina (opzionali; valorizzati per I.TS / I.SC).
  // Servono a un futuro calcolo dei componenti standard producibili in anticipo.
  machineLengthMm?: number | null
  machineWidthMm?: number | null
  machineHeightMm?: number | null
  machineSpanMm?: number | null
  machineModuleCount?: number | null
  machineBayCount?: number | null
  machineSlopePercent?: number | null
  machineNotes?: string
  // Configurazione del calcolo standard
  standardComponentsMode?: StandardComponentsMode
  standardComponentsCalculationType?: StandardComponentsCalculationType
  standardComponentsSubcategory?: StandardComponentsSubcategory
  standardComponentsCalculatedAt?: string | null
  standardComponentsCalculationStatus?: StandardComponentsCalculationStatus
  hasCommercialComponents?: boolean
  commercialComponentsDescription?: string
  commercialComponentsOrderRequired?: boolean
  commercialComponentsOrdered?: boolean
  commercialComponentsOrderedAt?: string
  commercialComponentsOrderedBy?: string
  commercialComponentsNotes?: string
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

// === Pianificazione operativa officina ===

export type WorkshopAssignmentProcess = WorkshopWorkerSkill

export type WorkshopAssignmentSourceType = 'output' | 'standard_component'

export type WorkshopAssignmentStatus =
  | 'pianificato'
  | 'in_lavorazione'
  | 'completato'
  | 'sospeso'

export const ALL_WORKSHOP_ASSIGNMENT_STATUSES: WorkshopAssignmentStatus[] = [
  'pianificato',
  'in_lavorazione',
  'completato',
  'sospeso',
]

export const WORKSHOP_ASSIGNMENT_STATUS_LABELS: Record<WorkshopAssignmentStatus, string> = {
  pianificato: 'Pianificato',
  in_lavorazione: 'In lavorazione',
  completato: 'Completato',
  sospeso: 'Sospeso',
}

export interface WorkshopAssignment {
  id: string
  workshopOutputId: string
  workItemId: string
  workerId: string
  process: WorkshopAssignmentProcess
  sourceType?: WorkshopAssignmentSourceType
  plannedDate: string
  plannedWeek: string
  loadPoints: number
  status: WorkshopAssignmentStatus
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
  workshopOutputs: WorkshopOutput[]
  workshopWorkers: WorkshopWorker[]
  workshopAssignments: WorkshopAssignment[]
  calculatedStandardComponents: CalculatedStandardComponent[]
  consuntivi: Consuntivo[]
  tubeProfiles: TubeProfile[]
}

// === Consuntivi officina (taglio laser / laser tubi / saldatura / piega) ===

export type ConsuntivoMaterial = 'ferro' | 'inox' | 'zincato' | 'corten'
export const ALL_CONSUNTIVO_MATERIALS: ConsuntivoMaterial[] = ['ferro', 'inox', 'zincato', 'corten']
export const CONSUNTIVO_MATERIAL_LABELS: Record<ConsuntivoMaterial, string> = {
  ferro: 'Ferro',
  inox: 'Inox',
  zincato: 'Zincato',
  corten: 'Corten',
}

export type ConsuntivoGas = 'ossigeno' | 'azoto'
export const ALL_CONSUNTIVO_GAS: ConsuntivoGas[] = ['ossigeno', 'azoto']

export type TubeCategory = 'tubolari' | 'tubi'
export const ALL_TUBE_CATEGORIES: TubeCategory[] = ['tubolari', 'tubi']
export const TUBE_CATEGORY_LABELS: Record<TubeCategory, string> = {
  tubolari: 'Tubolari',
  tubi: 'Tubi',
}

export interface LaserCutRow {
  id: string
  lunghezzaMm: number
  larghezzaMm: number
  spessoreMm: number
  materiale: ConsuntivoMaterial
  /** Numero di lamiere identiche: i kg (e il costo materiale) scalano con questo. */
  nPezzi: number
  tempoMin: number
  gas: ConsuntivoGas
}

export interface TubeLaserRow {
  id: string
  categoria: TubeCategory
  profileId: string
  profileLabel: string
  kgPerMeter: number
  materiale: ConsuntivoMaterial
  lunghezzaMm: number
  nPezzi: number
  tempoMin: number
}

export interface WeldingRow {
  id: string
  people: number
  hours: number
}

export interface BendingRow {
  id: string
  hours: number
}

export interface Consuntivo {
  id: string
  /** Numero commessa a testo libero (non vincolato al registro lavori). */
  commessaNumber: string
  /** Id anagrafica fornitore se selezionato dal database; '' se testo libero. */
  supplierId: string
  /** Nome fornitore (da anagrafica o testo libero). */
  supplierName: string
  date: string
  operatorName: string
  laserRows: LaserCutRow[]
  tubeRows: TubeLaserRow[]
  weldingRows: WeldingRow[]
  bendingRows: BendingRow[]
  notes: string
  createdAt: string
  updatedAt: string
  createdByUserId?: string
}

export interface TubeProfile {
  id: string
  categoria: TubeCategory
  label: string
  kgPerMeter: number
  active: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export type TubeShape = 'quadro' | 'rettangolo' | 'piccolo'

/** Config prezzi protetta — NON entra mai in AppData. Vive in meta.consuntiviConfig. */
export interface ConsuntiviPricingConfig {
  materialPricePerKg: Record<ConsuntivoMaterial, number>
  gasCostPerMin: Record<ConsuntivoGas, number>
  tubeLaserRatePerMin: number
  weldingRatePerHour: number
  bendingRatePerHour: number
  densityFactorPerMaterial: Record<ConsuntivoMaterial, number>
  tubeCoefficientPerKg: Record<TubeShape, number>
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

// === Auth / permessi (sotto-progetto B) ===
export type Role = 'amministratore' | 'progettista' | 'officina' | 'sola_lettura'
export type SectionId =
  | 'dashboard' | 'planning' | 'agenda' | 'anagrafiche' | 'disegni'
  | 'officina' | 'operai' | 'officina-planning' | 'consuntivi' | 'log' | 'utenti'

export interface Permissions {
  sections: SectionId[]
  canCreateWork: boolean
  canEditWork: boolean
  canDeleteOwnWork: boolean
  deleteAny: boolean
  manageUsers: boolean
  managePeople: boolean
  manageAbsences: boolean
  viewConsuntiviPrices: boolean
  manageBackups: boolean
  viewLog: boolean
}

export interface AuthUser {
  id: string
  username: string
  role: Role
  linkedPersonId: string
  permissions: Permissions
}
