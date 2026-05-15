import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppData, Person, Status } from '../types'
import { freshDemoData } from '../data/demoData'
import { downloadJSON, loadFromStorage, saveToStorage } from '../storage/localStorage'
import {
  convertStudioToCommessa as svcConvertStudio,
  createTask as svcCreateTask,
  createWorkItem as svcCreateWorkItem,
  deleteTask as svcDeleteTask,
  deleteWorkItem as svcDeleteWorkItem,
  setTaskStatus as svcSetTaskStatus,
  setWorkItemStatus as svcSetWorkItemStatus,
  updatePerson as svcUpdatePerson,
  updateTask as svcUpdateTask,
  updateWorkItem as svcUpdateWorkItem,
} from '../services/dataService'
import type {
  CreateTaskInput,
  CreateWorkItemInput,
  UpdatePersonInput,
  UpdateTaskInput,
  UpdateWorkItemInput,
} from '../services/dataService'

interface DataContextValue {
  data: AppData
  // workItems
  createWorkItem: (input: CreateWorkItemInput) => string
  updateWorkItem: (id: string, patch: UpdateWorkItemInput) => void
  deleteWorkItem: (id: string) => void
  setWorkItemStatus: (id: string, status: Status) => void
  convertStudioToCommessa: (id: string, newCode?: string) => void
  // tasks
  createTask: (workItemId: string, input: CreateTaskInput) => string
  updateTask: (id: string, patch: UpdateTaskInput) => void
  deleteTask: (id: string) => void
  setTaskStatus: (id: string, status: Status) => void
  // people
  updatePerson: (id: string, patch: UpdatePersonInput) => void
  // bulk people update (for PeopleSettingsModal batch save)
  updatePeople: (people: Person[]) => void
  // import/export/reset
  importData: (next: AppData) => void
  exportData: () => void
  resetData: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadFromStorage() ?? freshDemoData())

  useEffect(() => {
    saveToStorage(data)
  }, [data])

  const createWorkItem = useCallback((input: CreateWorkItemInput): string => {
    let createdId = ''
    setData((prev) => {
      const result = svcCreateWorkItem(prev, input)
      createdId = result.id
      return result.data
    })
    return createdId
  }, [])

  const updateWorkItem = useCallback((id: string, patch: UpdateWorkItemInput) => {
    setData((prev) => svcUpdateWorkItem(prev, id, patch))
  }, [])

  const deleteWorkItem = useCallback((id: string) => {
    setData((prev) => svcDeleteWorkItem(prev, id))
  }, [])

  const setWorkItemStatus = useCallback((id: string, status: Status) => {
    setData((prev) => svcSetWorkItemStatus(prev, id, status))
  }, [])

  const convertStudioToCommessa = useCallback((id: string, newCode?: string) => {
    setData((prev) => svcConvertStudio(prev, id, newCode))
  }, [])

  const createTask = useCallback((workItemId: string, input: CreateTaskInput): string => {
    let createdId = ''
    setData((prev) => {
      const result = svcCreateTask(prev, workItemId, input)
      createdId = result.id
      return result.data
    })
    return createdId
  }, [])

  const updateTask = useCallback((id: string, patch: UpdateTaskInput) => {
    setData((prev) => svcUpdateTask(prev, id, patch))
  }, [])

  const deleteTask = useCallback((id: string) => {
    setData((prev) => svcDeleteTask(prev, id))
  }, [])

  const setTaskStatus = useCallback((id: string, status: Status) => {
    setData((prev) => svcSetTaskStatus(prev, id, status))
  }, [])

  const updatePerson = useCallback((id: string, patch: UpdatePersonInput) => {
    setData((prev) => svcUpdatePerson(prev, id, patch))
  }, [])

  const updatePeople = useCallback((nextPeople: Person[]) => {
    setData((prev) => ({ ...prev, people: nextPeople }))
  }, [])

  const importData = useCallback((next: AppData) => {
    setData(next)
  }, [])

  const exportData = useCallback(() => {
    downloadJSON(data)
  }, [data])

  const resetData = useCallback(() => {
    setData(freshDemoData())
  }, [])

  const value = useMemo<DataContextValue>(() => ({
    data,
    createWorkItem,
    updateWorkItem,
    deleteWorkItem,
    setWorkItemStatus,
    convertStudioToCommessa,
    createTask,
    updateTask,
    deleteTask,
    setTaskStatus,
    updatePerson,
    updatePeople,
    importData,
    exportData,
    resetData,
  }), [
    data,
    createWorkItem, updateWorkItem, deleteWorkItem, setWorkItemStatus, convertStudioToCommessa,
    createTask, updateTask, deleteTask, setTaskStatus,
    updatePerson, updatePeople,
    importData, exportData, resetData,
  ])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData() richiede <DataProvider>')
  return ctx
}
