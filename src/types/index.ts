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

export interface Person {
  id: string
  name: string
  role: string
  weeklyCapacityHours: number
  skills: string[]
  active: boolean
  notes?: string
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

export interface AppData {
  people: Person[]
  workItems: WorkItem[]
  tasks: Task[]
  absences: Absence[]
}

export interface Filters {
  personId: string
  customer: string
  type: WorkItemType | ''
  priority: Priority | ''
  status: Status | ''
  search: string
}

export const EMPTY_FILTERS: Filters = {
  personId: '',
  customer: '',
  type: '',
  priority: '',
  status: '',
  search: '',
}

/** Stati terminali: non contano come lavori/task “aperti” in dashboard e KPI. */
export const CLOSED_STATUSES: Status[] = ['Completato', 'Sospeso']

export function isOpen(status: Status): boolean {
  return !CLOSED_STATUSES.includes(status)
}
