import type { Absence, AppData, Person, Status, Task, WorkItem } from '../types'
import { formatISODate } from '../utils/dates'
import { uid } from '../utils/format'
import {
  absenceLabel,
  describeAbsenceChange,
  describePersonChange,
  describeTaskChange,
  describeWorkItemChange,
  logEntry,
  shouldLogPersonChange,
  taskLabel,
  workItemLabel,
} from '../utils/activityLog'
import {
  appendNotification,
  createStatusChangeNotification,
} from '../utils/notifications'

export type CreateWorkItemInput = Omit<WorkItem, 'id'>
export type UpdateWorkItemInput = Partial<Omit<WorkItem, 'id'>>
export type CreateTaskInput = Omit<Task, 'id' | 'workItemId'>
export type UpdateTaskInput = Partial<Omit<Task, 'id' | 'workItemId'>>
export type UpdatePersonInput = Partial<Omit<Person, 'id'>>
export type CreateAbsenceInput = Omit<Absence, 'id'>
export type UpdateAbsenceInput = Partial<Omit<Absence, 'id'>>

function normalizeWorkItem(w: WorkItem): WorkItem {
  if (w.type === 'studio') return w
  if (w.acquisitionProbability === undefined) return w
  const next: WorkItem = { ...w }
  delete (next as Partial<WorkItem>).acquisitionProbability
  return next
}

export function createWorkItem(data: AppData, input: CreateWorkItemInput): { data: AppData; id: string } {
  const id = uid('w')
  const item = normalizeWorkItem({ ...input, id })
  const next: AppData = { ...data, workItems: [...data.workItems, item] }
  return {
    data: logEntry(next, {
      entityType: 'workItem',
      entityId: id,
      action: 'created',
      title: workItemLabel(item),
      description: `${item.type} · ${item.status}`,
      after: { status: item.status, type: item.type, dueDate: item.dueDate },
    }),
    id,
  }
}

export function updateWorkItem(data: AppData, id: string, patch: UpdateWorkItemInput): AppData {
  const before = data.workItems.find((w) => w.id === id)
  if (!before) return data
  const after = normalizeWorkItem({ ...before, ...patch })
  let next: AppData = {
    ...data,
    workItems: data.workItems.map((w) => (w.id === id ? after : w)),
  }
  const statusChanged = before.status !== after.status
  const progressChanged = before.progressPercent !== after.progressPercent
  const action = statusChanged
    ? 'status_changed'
    : progressChanged
      ? 'progress_changed'
      : 'updated'
  next = logEntry(next, {
    entityType: 'workItem',
    entityId: id,
    action,
    title: workItemLabel(after),
    description: describeWorkItemChange(before, after),
    before: { status: before.status, progressPercent: before.progressPercent },
    after: { status: after.status, progressPercent: after.progressPercent },
  })
  if (statusChanged) {
    next = appendNotification(
      next,
      createStatusChangeNotification({
        entityType: 'workItem',
        entityId: id,
        workItemId: id,
        itemTitle: after.code ? `${after.code} · ${after.title}` : after.title,
        beforeStatus: before.status,
        afterStatus: after.status,
      }),
    )
  }
  return next
}

export function deleteWorkItem(data: AppData, id: string): AppData {
  const before = data.workItems.find((w) => w.id === id)
  if (!before) return data
  const removedTaskCount = data.tasks.filter((t) => t.workItemId === id).length
  const removedWorkshopOutputCount = data.workshopOutputs.filter((output) => output.workItemId === id).length
  const next: AppData = {
    ...data,
    workItems: data.workItems.filter((w) => w.id !== id),
    tasks: data.tasks.filter((t) => t.workItemId !== id),
    workshopOutputs: data.workshopOutputs.filter((output) => output.workItemId !== id),
  }
  return logEntry(next, {
    entityType: 'workItem',
    entityId: id,
    action: 'deleted',
    title: workItemLabel(before),
    description: [
      removedTaskCount > 0 ? `${removedTaskCount} task collegati` : '',
      removedWorkshopOutputCount > 0 ? `${removedWorkshopOutputCount} output officina collegati` : '',
    ].filter(Boolean).join(' - ') || undefined,
    before: { status: before.status, type: before.type, code: before.code },
  })
}

export function setWorkItemStatus(data: AppData, id: string, status: Status): AppData {
  return updateWorkItem(data, id, { status })
}

export function convertStudioToCommessa(data: AppData, id: string, newCode?: string): AppData {
  const target = data.workItems.find((w) => w.id === id)
  if (!target || target.type !== 'studio') return data
  const nextCode = newCode && newCode.trim().length > 0 ? newCode.trim() : target.code
  const before = target
  const after = normalizeWorkItem({ ...before, type: 'commessa', code: nextCode })
  const next: AppData = {
    ...data,
    workItems: data.workItems.map((w) => (w.id === id ? after : w)),
  }
  return logEntry(next, {
    entityType: 'workItem',
    entityId: id,
    action: 'converted',
    title: workItemLabel(after),
    description: `studio convertito in commessa${before.code !== after.code ? ` · codice ${before.code || '—'} → ${after.code || '—'}` : ''}`,
    before: { type: 'studio', code: before.code },
    after: { type: 'commessa', code: after.code },
  })
}

export function createTask(data: AppData, workItemId: string, input: CreateTaskInput): { data: AppData; id: string } {
  const id = uid('t')
  const task: Task = { ...input, id, workItemId }
  const wi = data.workItems.find((w) => w.id === workItemId)
  const next: AppData = { ...data, tasks: [...data.tasks, task] }
  return {
    data: logEntry(next, {
      entityType: 'task',
      entityId: id,
      action: 'created',
      title: taskLabel(task, wi),
      description: `${task.status} · scadenza ${task.dueDate}`,
      after: { workItemId, status: task.status, dueDate: task.dueDate },
    }),
    id,
  }
}

export function updateTask(data: AppData, id: string, patch: UpdateTaskInput): AppData {
  const before = data.tasks.find((t) => t.id === id)
  if (!before) return data
  const after: Task = { ...before, ...patch }
  let next: AppData = {
    ...data,
    tasks: data.tasks.map((t) => (t.id === id ? after : t)),
  }
  const wi = data.workItems.find((w) => w.id === after.workItemId)
  const statusChanged = before.status !== after.status
  const progressChanged = before.progressPercent !== after.progressPercent
  const action = statusChanged
    ? 'status_changed'
    : progressChanged
      ? 'progress_changed'
      : 'updated'
  next = logEntry(next, {
    entityType: 'task',
    entityId: id,
    action,
    title: taskLabel(after, wi),
    description: describeTaskChange(before, after),
    before: {
      status: before.status,
      progressPercent: before.progressPercent,
      workItemId: before.workItemId,
    },
    after: {
      status: after.status,
      progressPercent: after.progressPercent,
      workItemId: after.workItemId,
    },
  })
  if (statusChanged) {
    next = appendNotification(
      next,
      createStatusChangeNotification({
        entityType: 'task',
        entityId: id,
        workItemId: after.workItemId,
        itemTitle: after.title,
        beforeStatus: before.status,
        afterStatus: after.status,
      }),
    )
  }
  return next
}

export function deleteTask(data: AppData, id: string): AppData {
  const before = data.tasks.find((t) => t.id === id)
  if (!before) return data
  const wi = data.workItems.find((w) => w.id === before.workItemId)
  const next: AppData = { ...data, tasks: data.tasks.filter((t) => t.id !== id) }
  return logEntry(next, {
    entityType: 'task',
    entityId: id,
    action: 'deleted',
    title: taskLabel(before, wi),
    before: { status: before.status, workItemId: before.workItemId },
  })
}

export function setTaskStatus(data: AppData, id: string, status: Status): AppData {
  return updateTask(data, id, { status })
}

export function updatePerson(data: AppData, id: string, patch: UpdatePersonInput): AppData {
  const before = data.people.find((p) => p.id === id)
  if (!before) return data
  const after: Person = { ...before, ...patch }
  const next: AppData = {
    ...data,
    people: data.people.map((p) => (p.id === id ? after : p)),
  }
  if (!shouldLogPersonChange(before, after)) return next
  const action = before.active !== after.active ? 'status_changed' : 'updated'
  return logEntry(next, {
    entityType: 'person',
    entityId: id,
    action,
    title: after.name,
    description: describePersonChange(before, after),
    before: {
      active: before.active,
      role: before.role,
      weeklyCapacityHours: before.weeklyCapacityHours,
    },
    after: {
      active: after.active,
      role: after.role,
      weeklyCapacityHours: after.weeklyCapacityHours,
    },
  })
}

export function updatePeople(data: AppData, nextPeople: Person[]): AppData {
  const byId = new Map(data.people.map((p) => [p.id, p]))
  let acc: AppData = { ...data, people: nextPeople }
  for (const after of nextPeople) {
    const before = byId.get(after.id)
    if (!before) continue
    if (!shouldLogPersonChange(before, after)) continue
    const action = before.active !== after.active ? 'status_changed' : 'updated'
    acc = logEntry(acc, {
      entityType: 'person',
      entityId: after.id,
      action,
      title: after.name,
      description: describePersonChange(before, after),
      before: {
        active: before.active,
        role: before.role,
        weeklyCapacityHours: before.weeklyCapacityHours,
      },
      after: {
        active: after.active,
        role: after.role,
        weeklyCapacityHours: after.weeklyCapacityHours,
      },
    })
  }
  return acc
}

export function createAbsence(data: AppData, input: CreateAbsenceInput): { data: AppData; id: string } {
  const id = uid('ab')
  const absence: Absence = { ...input, id }
  const person = data.people.find((p) => p.id === absence.personId)
  const next: AppData = { ...data, absences: [...data.absences, absence] }
  return {
    data: logEntry(next, {
      entityType: 'absence',
      entityId: id,
      action: 'created',
      title: absenceLabel(absence, person),
      description: `${absence.startDate}${absence.startDate !== absence.endDate ? ` → ${absence.endDate}` : ''} · ${absence.hoursPerDay}h/g`,
      after: { type: absence.type, startDate: absence.startDate, endDate: absence.endDate },
    }),
    id,
  }
}

export function updateAbsence(data: AppData, id: string, patch: UpdateAbsenceInput): AppData {
  const before = data.absences.find((a) => a.id === id)
  if (!before) return data
  const after: Absence = { ...before, ...patch }
  const person = data.people.find((p) => p.id === after.personId)
  const next: AppData = {
    ...data,
    absences: data.absences.map((a) => (a.id === id ? after : a)),
  }
  return logEntry(next, {
    entityType: 'absence',
    entityId: id,
    action: 'updated',
    title: absenceLabel(after, person),
    description: describeAbsenceChange(before, after),
    before: { type: before.type, startDate: before.startDate, endDate: before.endDate },
    after: { type: after.type, startDate: after.startDate, endDate: after.endDate },
  })
}

export function deleteAbsence(data: AppData, id: string): AppData {
  const before = data.absences.find((a) => a.id === id)
  if (!before) return data
  const person = data.people.find((p) => p.id === before.personId)
  const next: AppData = { ...data, absences: data.absences.filter((a) => a.id !== id) }
  return logEntry(next, {
    entityType: 'absence',
    entityId: id,
    action: 'deleted',
    title: absenceLabel(before, person),
    before: { type: before.type, startDate: before.startDate, endDate: before.endDate },
  })
}

export function getAbsencesByPerson(data: AppData, personId: string): Absence[] {
  return data.absences.filter((a) => a.personId === personId)
}

export function getAbsencesForWeek(data: AppData, weekStart: Date, weekEnd: Date): Absence[] {
  const startISO = formatISODate(weekStart)
  const endISO = formatISODate(weekEnd)
  return data.absences.filter((a) => a.startDate <= endISO && a.endDate >= startISO)
}
