import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Absence, AppData, Person, Status } from '../types'
import { freshDemoData } from '../data/demoData'
import { downloadJSON, loadFromStorage, saveToStorage } from '../storage/localStorage'
import { fetchAppData, saveAppData as saveAppDataToApi } from '../services/apiClient'
import { useToast } from './ToastProvider'
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
  const dataRef = useRef(data)
  const toast = useToast()

  useEffect(() => {
    dataRef.current = data
    saveToStorage(data)
  }, [data])

  useEffect(() => {
    let cancelled = false
    fetchAppData()
      .then((remoteData) => {
        if (cancelled) return
        dataRef.current = remoteData
        setData(remoteData)
        saveToStorage(remoteData)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Impossibile caricare i dati dal backend', err)
        toast.error('Backend non raggiungibile: uso temporaneo della cache locale.')
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  const commitData = useCallback((next: AppData) => {
    dataRef.current = next
    setData(next)
    saveToStorage(next)
    void saveAppDataToApi(next).catch((err) => {
      console.error('Salvataggio su database fallito', err)
      toast.error(`Salvataggio database fallito: ${err instanceof Error ? err.message : 'errore sconosciuto'}`)
    })
  }, [toast])

  const createWorkItem = useCallback((input: CreateWorkItemInput): string => {
    const result = svcCreateWorkItem(dataRef.current, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateWorkItem = useCallback((id: string, patch: UpdateWorkItemInput) => {
    commitData(svcUpdateWorkItem(dataRef.current, id, patch))
  }, [commitData])

  const deleteWorkItem = useCallback((id: string) => {
    commitData(svcDeleteWorkItem(dataRef.current, id))
  }, [commitData])

  const setWorkItemStatus = useCallback((id: string, status: Status) => {
    commitData(svcSetWorkItemStatus(dataRef.current, id, status))
  }, [commitData])

  const convertStudioToCommessa = useCallback((id: string, newCode?: string) => {
    commitData(svcConvertStudio(dataRef.current, id, newCode))
  }, [commitData])

  const createTask = useCallback((workItemId: string, input: CreateTaskInput): string => {
    const result = svcCreateTask(dataRef.current, workItemId, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateTask = useCallback((id: string, patch: UpdateTaskInput) => {
    commitData(svcUpdateTask(dataRef.current, id, patch))
  }, [commitData])

  const deleteTask = useCallback((id: string) => {
    commitData(svcDeleteTask(dataRef.current, id))
  }, [commitData])

  const setTaskStatus = useCallback((id: string, status: Status) => {
    commitData(svcSetTaskStatus(dataRef.current, id, status))
  }, [commitData])

  const updatePerson = useCallback((id: string, patch: UpdatePersonInput) => {
    commitData(svcUpdatePerson(dataRef.current, id, patch))
  }, [commitData])

  const updatePeople = useCallback((nextPeople: Person[]) => {
    commitData(svcUpdatePeople(dataRef.current, nextPeople))
  }, [commitData])

  const createAbsence = useCallback((input: CreateAbsenceInput): string => {
    const result = svcCreateAbsence(dataRef.current, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateAbsence = useCallback((id: string, patch: UpdateAbsenceInput) => {
    commitData(svcUpdateAbsence(dataRef.current, id, patch))
  }, [commitData])

  const deleteAbsence = useCallback((id: string) => {
    commitData(svcDeleteAbsence(dataRef.current, id))
  }, [commitData])

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

    commitData(
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
  }, [commitData])

  const exportData = useCallback((): BackupExportResult => {
    const exportedAtDate = new Date()
    const filename = getBackupFilename(exportedAtDate)
    const nextData = appendActivityLog(
      dataRef.current,
      createActivityLogEntry({
        entityType: 'system',
        entityId: 'backup',
        action: 'exported',
        title: 'Backup JSON esportato',
        description: `${dataRef.current.people.length} persone - ${dataRef.current.workItems.length} lavori - ${dataRef.current.tasks.length} task - file: ${filename}`,
      }, exportedAtDate),
    )
    const exportedAt = setLastBackupAt(exportedAtDate)
    downloadJSON(createBackupPayload(nextData, exportedAtDate), filename)
    commitData(nextData)
    return { exportedAt, filename }
  }, [commitData])

  const resetData = useCallback(() => {
    commitData(
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
  }, [commitData])

  const markNotificationAsRead = useCallback((id: string) => {
    commitData(svcMarkNotificationAsRead(dataRef.current, id))
  }, [commitData])

  const markAllNotificationsAsRead = useCallback(() => {
    commitData(svcMarkAllNotificationsAsRead(dataRef.current))
  }, [commitData])

  const clearReadNotifications = useCallback(() => {
    commitData(svcClearReadNotifications(dataRef.current))
  }, [commitData])

  const clearAllNotifications = useCallback(() => {
    commitData(svcClearAllNotifications(dataRef.current))
  }, [commitData])

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
