import type { AppData, Person, Status, Task, WorkItem } from '../types'
import { uid } from '../utils/format'

export type CreateWorkItemInput = Omit<WorkItem, 'id'>
export type UpdateWorkItemInput = Partial<Omit<WorkItem, 'id'>>
export type CreateTaskInput = Omit<Task, 'id' | 'workItemId'>
export type UpdateTaskInput = Partial<Omit<Task, 'id' | 'workItemId'>>
export type UpdatePersonInput = Partial<Omit<Person, 'id'>>

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
  return {
    data: { ...data, workItems: [...data.workItems, item] },
    id,
  }
}

export function updateWorkItem(data: AppData, id: string, patch: UpdateWorkItemInput): AppData {
  return {
    ...data,
    workItems: data.workItems.map((w) => (w.id === id ? normalizeWorkItem({ ...w, ...patch }) : w)),
  }
}

export function deleteWorkItem(data: AppData, id: string): AppData {
  return {
    ...data,
    workItems: data.workItems.filter((w) => w.id !== id),
    tasks: data.tasks.filter((t) => t.workItemId !== id),
  }
}

export function setWorkItemStatus(data: AppData, id: string, status: Status): AppData {
  return updateWorkItem(data, id, { status })
}

export function convertStudioToCommessa(data: AppData, id: string, newCode?: string): AppData {
  const target = data.workItems.find((w) => w.id === id)
  if (!target || target.type !== 'studio') return data
  return updateWorkItem(data, id, {
    type: 'commessa',
    code: newCode && newCode.trim().length > 0 ? newCode.trim() : target.code,
  })
}

export function createTask(data: AppData, workItemId: string, input: CreateTaskInput): { data: AppData; id: string } {
  const id = uid('t')
  const task: Task = { ...input, id, workItemId }
  return {
    data: { ...data, tasks: [...data.tasks, task] },
    id,
  }
}

export function updateTask(data: AppData, id: string, patch: UpdateTaskInput): AppData {
  return {
    ...data,
    tasks: data.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  }
}

export function deleteTask(data: AppData, id: string): AppData {
  return { ...data, tasks: data.tasks.filter((t) => t.id !== id) }
}

export function setTaskStatus(data: AppData, id: string, status: Status): AppData {
  return updateTask(data, id, { status })
}

export function updatePerson(data: AppData, id: string, patch: UpdatePersonInput): AppData {
  return {
    ...data,
    people: data.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }
}
