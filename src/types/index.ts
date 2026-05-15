export type WorkItemType = 'commessa' | 'studio' | 'interno'

export type Priority = 'bassa' | 'media' | 'alta' | 'critica'

export type Status =
  | 'Da pianificare'
  | 'Assegnato'
  | 'In corso'
  | 'In attesa input commerciale'
  | 'In attesa input cliente'
  | 'In attesa scelta tecnica'
  | 'In verifica responsabile'
  | 'Da correggere'
  | 'Pronto per rilascio'
  | 'Rilasciato produzione'
  | 'Sospeso'
  | 'Annullato'

export const ALL_STATUSES: Status[] = [
  'Da pianificare',
  'Assegnato',
  'In corso',
  'In attesa input commerciale',
  'In attesa input cliente',
  'In attesa scelta tecnica',
  'In verifica responsabile',
  'Da correggere',
  'Pronto per rilascio',
  'Rilasciato produzione',
  'Sospeso',
  'Annullato',
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

export interface AppData {
  people: Person[]
  workItems: WorkItem[]
  tasks: Task[]
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

export const CLOSED_STATUSES: Status[] = ['Rilasciato produzione', 'Annullato']

export function isOpen(status: Status): boolean {
  return !CLOSED_STATUSES.includes(status)
}
