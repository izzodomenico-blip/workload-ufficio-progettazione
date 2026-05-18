import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Absence, AppData, Person, Status } from '../types'
import { freshDemoData } from '../data/demoData'
import { downloadJSON, loadFromStorage, saveToStorage } from '../storage/localStorage'
import {
  createBackupPayload,
  getBackupFilename,
  setLastBackupAt,
} from '../utils/backup'
import {
  convertStudioToCommessa as svcConvertStudio,
  createAbsence as svcCreateAbsence,
  createTask as svcCreateTask,
  createWorkItem as svcCreateWorkItem,
  deleteAbsence as svcDeleteAbsence,
  deleteTask as svcDeleteTask,
  deleteWorkItem as svcDeleteWorkItem,
  setTaskStatus as svcSetTaskStatus,
  setWorkItemStatus as svcSetWorkItemStatus,
  updateAbsence as svcUpdateAbsence,
  updatePeople as svcUpdatePeople,
  updatePerson as svcUpdatePerson,
  updateTask as svcUpdateTask,
  updateWorkItem as svcUpdateWorkItem,
} from '../services/dataService'
import { appendActivityLog, createActivityLogEntry } from '../utils/activityLog'
import {
  clearAllNotifications as svcClearAllNotifications,
  clearReadNotifications as svcClearReadNotifications,
  markAllNotificationsAsRead as svcMarkAllNotificationsAsRead,
  markNotificationAsRead as svcMarkNotificationAsRead,
} from '../utils/notifications'
import type {
  CreateAbsenceInput,
  CreateTaskInput,
  CreateWorkItemInput,
  UpdateAbsenceInput,
  UpdatePersonInput,
  UpdateTaskInput,
  UpdateWorkItemInput,
} from '../services/dataService'

interface DataContextValue {
  data: AppData
  absences: Absence[]
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
  updatePeople: (people: Person[]) => void
  // absences
  createAbsence: (input: CreateAbsenceInput) => string
  updateAbsence: (id: string, patch: UpdateAbsenceInput) => void
  deleteAbsence: (id: string) => void
  // import/export/reset
  importData: (next: AppData, options?: ImportDataOptions) => void
  exportData: () => BackupExportResult
  resetData: () => void
  // notifications
  markNotificationAsRead: (id: string) => void
  markAllNotificationsAsRead: () => void
  clearReadNotifications: () => void
  clearAllNotifications: () => void
}

interface ImportDataOptions {
  fileName?: string
  exportedAt?: string
  version?: string
}

interface BackupExportResult {
  exportedAt: string
  filename: string
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
    setData((prev) => svcUpdatePeople(prev, nextPeople))
  }, [])

  const createAbsence = useCallback((input: CreateAbsenceInput): string => {
    let createdId = ''
    setData((prev) => {
      const result = svcCreateAbsence(prev, input)
      createdId = result.id
      return result.data
    })
    return createdId
  }, [])

  const updateAbsence = useCallback((id: string, patch: UpdateAbsenceInput) => {
    setData((prev) => svcUpdateAbsence(prev, id, patch))
  }, [])

  const deleteAbsence = useCallback((id: string) => {
    setData((prev) => svcDeleteAbsence(prev, id))
  }, [])

  const importData = useCallback((next: AppData, options: ImportDataOptions = {}) => {
    const description = [
      `${next.workItems.length} lavori`,
      `${next.tasks.length} task`,
      `${next.absences.length} assenze`,
      `${next.activityLog.length} eventi storico`,
      `${next.notifications.length} notifiche`,
      options.fileName ? `file: ${options.fileName}` : '',
      options.exportedAt ? `esportato: ${options.exportedAt}` : '',
      options.version ? `versione: ${options.version}` : '',
    ].filter(Boolean).join(' - ')

    setData(
      appendActivityLog(
        next,
        createActivityLogEntry({
          entityType: 'system',
          entityId: 'import',
          action: 'imported',
          title: 'Backup JSON importato',
          description,
        }),
      ),
    )
  }, [])

  const exportData = useCallback((): BackupExportResult => {
    const exportedAtDate = new Date()
    const filename = getBackupFilename(exportedAtDate)
    const nextData = appendActivityLog(
      data,
      createActivityLogEntry({
        entityType: 'system',
        entityId: 'backup',
        action: 'exported',
        title: 'Backup JSON esportato',
        description: `${data.people.length} persone - ${data.workItems.length} lavori - ${data.tasks.length} task - file: ${filename}`,
      }, exportedAtDate),
    )
    const exportedAt = setLastBackupAt(exportedAtDate)
    downloadJSON(createBackupPayload(nextData, exportedAtDate), filename)
    setData(nextData)
    return { exportedAt, filename }
  }, [data])

  const resetData = useCallback(() => {
    setData(
      appendActivityLog(
        freshDemoData(),
        createActivityLogEntry({
          entityType: 'system',
          entityId: 'reset',
          action: 'reset',
          title: 'Reset dati demo',
          description: 'Tutti i dati sono stati ripristinati ai valori demo iniziali',
        }),
      ),
    )
  }, [])

  const markNotificationAsRead = useCallback((id: string) => {
    setData((prev) => svcMarkNotificationAsRead(prev, id))
  }, [])

  const markAllNotificationsAsRead = useCallback(() => {
    setData((prev) => svcMarkAllNotificationsAsRead(prev))
  }, [])

  const clearReadNotifications = useCallback(() => {
    setData((prev) => svcClearReadNotifications(prev))
  }, [])

  const clearAllNotifications = useCallback(() => {
    setData((prev) => svcClearAllNotifications(prev))
  }, [])

  const value = useMemo<DataContextValue>(() => ({
    data,
    absences: data.absences,
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
    createAbsence,
    updateAbsence,
    deleteAbsence,
    importData,
    exportData,
    resetData,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    clearReadNotifications,
    clearAllNotifications,
  }), [
    data,
    createWorkItem, updateWorkItem, deleteWorkItem, setWorkItemStatus, convertStudioToCommessa,
    createTask, updateTask, deleteTask, setTaskStatus,
    updatePerson, updatePeople,
    createAbsence, updateAbsence, deleteAbsence,
    importData, exportData, resetData,
    markNotificationAsRead, markAllNotificationsAsRead,
    clearReadNotifications, clearAllNotifications,
  ])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData() richiede <DataProvider>')
  return ctx
}
