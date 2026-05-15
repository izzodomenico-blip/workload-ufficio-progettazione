import type { Person, Task, WorkItem } from '../types'

export type ValidationErrors<T extends string> = Partial<Record<T, string>>
export type ValidationResult<T extends string> =
  | { ok: true }
  | { ok: false; errors: ValidationErrors<T> }

export type WorkItemField =
  | 'title' | 'type' | 'status' | 'dueDate'
  | 'code' | 'customer' | 'startDate'
  | 'estimatedHours' | 'loggedHours' | 'progressPercent'
  | 'acquisitionProbability'

export function validateWorkItem(
  input: Partial<Omit<WorkItem, 'id'>>,
): ValidationResult<WorkItemField> {
  const errors: ValidationErrors<WorkItemField> = {}

  if (!input.title || !input.title.trim()) errors.title = 'Inserisci un titolo'
  if (!input.type) errors.type = 'Seleziona un tipo'
  if (!input.status) errors.status = 'Seleziona uno stato'
  if (!input.dueDate) errors.dueDate = 'La data di scadenza è obbligatoria'

  if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
    errors.dueDate = 'La scadenza deve essere uguale o successiva all’inizio'
  }
  if (typeof input.estimatedHours === 'number' && input.estimatedHours < 0) {
    errors.estimatedHours = 'Le ore stimate non possono essere negative'
  }
  if (typeof input.loggedHours === 'number' && input.loggedHours < 0) {
    errors.loggedHours = 'Le ore consuntivate non possono essere negative'
  }
  if (typeof input.progressPercent === 'number' && (input.progressPercent < 0 || input.progressPercent > 100)) {
    errors.progressPercent = 'L’avanzamento deve essere tra 0 e 100'
  }
  if (input.type === 'studio' && typeof input.acquisitionProbability === 'number') {
    if (input.acquisitionProbability < 0 || input.acquisitionProbability > 100) {
      errors.acquisitionProbability = 'La probabilità deve essere tra 0 e 100'
    }
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors }
}

export type TaskField =
  | 'title' | 'assigneeId' | 'dueDate'
  | 'startDate' | 'estimatedHours' | 'loggedHours' | 'progressPercent' | 'status'

export function validateTask(
  input: Partial<Omit<Task, 'id' | 'workItemId'>>,
): ValidationResult<TaskField> {
  const errors: ValidationErrors<TaskField> = {}

  if (!input.title || !input.title.trim()) errors.title = 'Inserisci un titolo'
  if (!input.assigneeId) errors.assigneeId = 'Seleziona un assegnatario'
  if (!input.dueDate) errors.dueDate = 'La data di scadenza è obbligatoria'
  if (!input.status) errors.status = 'Seleziona uno stato'

  if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
    errors.dueDate = 'La scadenza deve essere uguale o successiva all’inizio'
  }
  if (typeof input.estimatedHours === 'number' && input.estimatedHours < 0) {
    errors.estimatedHours = 'Le ore stimate non possono essere negative'
  }
  if (typeof input.loggedHours === 'number' && input.loggedHours < 0) {
    errors.loggedHours = 'Le ore consuntivate non possono essere negative'
  }
  if (typeof input.progressPercent === 'number' && (input.progressPercent < 0 || input.progressPercent > 100)) {
    errors.progressPercent = 'L’avanzamento deve essere tra 0 e 100'
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors }
}

export type PersonField = 'name' | 'role' | 'weeklyCapacityHours'

export function validatePerson(input: Partial<Omit<Person, 'id'>>): ValidationResult<PersonField> {
  const errors: ValidationErrors<PersonField> = {}

  if (!input.name || !input.name.trim()) errors.name = 'Il nome è obbligatorio'
  if (!input.role || !input.role.trim()) errors.role = 'Il ruolo è obbligatorio'
  if (typeof input.weeklyCapacityHours !== 'number' || input.weeklyCapacityHours < 0 || input.weeklyCapacityHours > 80) {
    errors.weeklyCapacityHours = 'La capacità deve essere tra 0 e 80 ore'
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors }
}
