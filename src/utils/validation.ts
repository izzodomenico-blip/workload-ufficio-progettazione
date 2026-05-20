import type { Absence, BusinessPartner, Person, Task, WorkItem } from '../types'
import { ALL_BUSINESS_PARTNER_TYPES } from '../types'

export type ValidationErrors<T extends string> = Partial<Record<T, string>>
export type ValidationResult<T extends string> =
  | { ok: true }
  | { ok: false; errors: ValidationErrors<T> }

export type WorkItemField =
  | 'title' | 'type' | 'status' | 'dueDate'
  | 'code' | 'customer' | 'startDate'
  | 'estimatedHours' | 'progressPercent'
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
  | 'startDate' | 'estimatedHours' | 'progressPercent' | 'status'

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
  if (typeof input.progressPercent === 'number' && (input.progressPercent < 0 || input.progressPercent > 100)) {
    errors.progressPercent = 'L’avanzamento deve essere tra 0 e 100'
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors }
}

export type PersonField = 'name' | 'role' | 'weeklyCapacityHours' | 'baselineLoadPercent'

export function validatePerson(input: Partial<Omit<Person, 'id'>>): ValidationResult<PersonField> {
  const errors: ValidationErrors<PersonField> = {}

  if (!input.name || !input.name.trim()) errors.name = 'Il nome è obbligatorio'
  if (!input.role || !input.role.trim()) errors.role = 'Il ruolo è obbligatorio'
  if (typeof input.weeklyCapacityHours !== 'number' || input.weeklyCapacityHours < 0 || input.weeklyCapacityHours > 80) {
    errors.weeklyCapacityHours = 'La capacità deve essere tra 0 e 80 ore'
  }
  if (input.baselineLoadPercent !== undefined && input.baselineLoadPercent !== null) {
    if (typeof input.baselineLoadPercent !== 'number' || input.baselineLoadPercent < 0 || input.baselineLoadPercent > 100) {
      errors.baselineLoadPercent = 'Il carico base deve essere tra 0 e 100'
    }
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors }
}

export type AbsenceField = 'personId' | 'type' | 'startDate' | 'endDate' | 'hoursPerDay'

export function validateAbsence(input: Partial<Omit<Absence, 'id'>>): ValidationResult<AbsenceField> {
  const errors: ValidationErrors<AbsenceField> = {}

  if (!input.personId) errors.personId = 'Seleziona la persona'
  if (!input.type) errors.type = 'Seleziona il tipo di assenza'
  if (!input.startDate) errors.startDate = 'Data di inizio obbligatoria'
  if (!input.endDate) errors.endDate = 'Data di fine obbligatoria'
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    errors.endDate = 'La fine deve essere uguale o successiva all’inizio'
  }
  if (typeof input.hoursPerDay !== 'number' || input.hoursPerDay <= 0 || input.hoursPerDay > 8) {
    errors.hoursPerDay = 'Le ore al giorno devono essere tra 1 e 8'
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors }
}

export type BusinessPartnerField =
  | 'accountCode' | 'name' | 'type'
  | 'vatNumber' | 'fiscalCode' | 'email' | 'pec'
  | 'balance' | 'exposure' | 'creditLimit' | 'overCreditLimit' | 'risk'

export function validateBusinessPartner(
  input: Partial<Omit<BusinessPartner, 'id' | 'createdAt' | 'updatedAt'>>,
): ValidationResult<BusinessPartnerField> {
  const errors: ValidationErrors<BusinessPartnerField> = {}

  if (!input.name || !input.name.trim()) {
    errors.name = 'La ragione sociale è obbligatoria'
  }
  if (!input.type || !ALL_BUSINESS_PARTNER_TYPES.includes(input.type)) {
    errors.type = 'Seleziona un tipo valido'
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'Email non valida'
  }
  if (input.pec && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.pec.trim())) {
    errors.pec = 'PEC non valida'
  }
  if (input.vatNumber && !/^[A-Za-z0-9]{4,20}$/.test(input.vatNumber.trim())) {
    errors.vatNumber = 'P.IVA non valida (4–20 caratteri alfanumerici)'
  }
  for (const field of ['balance', 'exposure', 'creditLimit', 'overCreditLimit', 'risk'] as const) {
    const v = input[field]
    if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
      errors[field] = 'Valore numerico richiesto'
    }
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors }
}
