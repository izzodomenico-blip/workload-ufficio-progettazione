import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Absence, AppData, BusinessPartner, MachineType, Person, Status } from '../types'
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
import {
  applyCustomerLinking as svcApplyCustomerLinking,
  applyImport as svcApplyPartnerImport,
  createBusinessPartner as svcCreatePartner,
  deleteBusinessPartner as svcDeletePartner,
  planCustomerLinking as svcPlanCustomerLinking,
  planImport as svcPlanPartnerImport,
  setBusinessPartnerActive as svcSetPartnerActive,
  updateBusinessPartner as svcUpdatePartner,
} from '../services/businessPartnersService'
import type {
  CreateBusinessPartnerInput,
  ImportPlan,
  ImportPlanRecord,
  ImportResult,
  LinkApplyResult,
  LinkPlan,
  LinkSelection,
  UpdateBusinessPartnerInput,
} from '../services/businessPartnersService'
import {
  createMachineType as svcCreateMachineType,
  setMachineTypeActive as svcSetMachineTypeActive,
  updateMachineType as svcUpdateMachineType,
} from '../services/machineTypesService'
import type {
  CreateMachineTypeInput,
  UpdateMachineTypeInput,
} from '../services/machineTypesService'

interface UpdatePeopleOptions {
  /** Password admin per autorizzare modifiche a baselineLoadPercent */
  adminPassword?: string
}

interface DataContextValue {
  data: AppData
  absences: Absence[]
  businessPartners: BusinessPartner[]
  machineTypes: MachineType[]
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
  updatePerson: (id: string, patch: UpdatePersonInput, options?: UpdatePeopleOptions) => void
  updatePeople: (people: Person[], options?: UpdatePeopleOptions) => void
  // absences
  createAbsence: (input: CreateAbsenceInput) => string
  updateAbsence: (id: string, patch: UpdateAbsenceInput) => void
  deleteAbsence: (id: string) => void
  // business partners
  createBusinessPartner: (input: CreateBusinessPartnerInput) => string
  updateBusinessPartner: (id: string, patch: UpdateBusinessPartnerInput) => void
  setBusinessPartnerActive: (id: string, active: boolean) => void
  deleteBusinessPartner: (id: string) => void
  planBusinessPartnerImport: (records: ImportPlanRecord[], filename?: string) => ImportPlan
  applyBusinessPartnerImport: (plan: ImportPlan) => ImportResult
  planCustomerLinking: () => LinkPlan
  applyCustomerLinking: (selections: LinkSelection[]) => LinkApplyResult
  // machine types
  createMachineType: (input: CreateMachineTypeInput) => string
  updateMachineType: (id: string, patch: UpdateMachineTypeInput) => void
  setMachineTypeActive: (id: string, active: boolean) => void
  // import/export
  importData: (next: AppData, options?: ImportDataOptions) => void
  exportData: () => BackupExportResult
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

interface CommitOptions {
  risky?: boolean
  reason?: string
  adminPassword?: string
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

  const commitData = useCallback((next: AppData, options: CommitOptions = {}) => {
    const previous = dataRef.current
    dataRef.current = next
    setData(next)
    saveToStorage(next)
    void saveAppDataToApi(next, options).catch((err) => {
      // Rollback dello stato locale se il backend rifiuta (es. password mancante)
      dataRef.current = previous
      setData(previous)
      saveToStorage(previous)
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
    commitData(svcDeleteWorkItem(dataRef.current, id), { risky: true, reason: 'delete-work-item' })
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

  const updatePerson = useCallback((id: string, patch: UpdatePersonInput, options?: UpdatePeopleOptions) => {
    commitData(svcUpdatePerson(dataRef.current, id, patch), { adminPassword: options?.adminPassword })
  }, [commitData])

  const updatePeople = useCallback((nextPeople: Person[], options?: UpdatePeopleOptions) => {
    commitData(svcUpdatePeople(dataRef.current, nextPeople), { adminPassword: options?.adminPassword })
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

  const createBusinessPartner = useCallback((input: CreateBusinessPartnerInput): string => {
    const result = svcCreatePartner(dataRef.current, input)
    commitData(
      appendActivityLog(
        result.data,
        createActivityLogEntry({
          entityType: 'system',
          entityId: result.id,
          action: 'created',
          title: `Anagrafica creata: ${result.partner.name}`,
          description: `${result.partner.type}${result.partner.accountCode ? ` · ${result.partner.accountCode}` : ''}`,
          after: { name: result.partner.name, type: result.partner.type, active: result.partner.active },
        }),
      ),
    )
    return result.id
  }, [commitData])

  const updateBusinessPartner = useCallback((id: string, patch: UpdateBusinessPartnerInput) => {
    const before = dataRef.current.businessPartners.find((p) => p.id === id)
    const nextData = svcUpdatePartner(dataRef.current, id, patch)
    const after = nextData.businessPartners.find((p) => p.id === id)
    if (!before || !after) {
      commitData(nextData)
      return
    }
    const changes: string[] = []
    if (before.active !== after.active) changes.push(after.active ? 'attivata' : 'disattivata')
    if (before.name !== after.name) changes.push('ragione sociale aggiornata')
    if ((before.email ?? '') !== (after.email ?? '')) changes.push('email aggiornata')
    if ((before.pec ?? '') !== (after.pec ?? '')) changes.push('PEC aggiornata')
    if ((before.vatNumber ?? '') !== (after.vatNumber ?? '')) changes.push('P.IVA aggiornata')
    if ((before.address ?? '') !== (after.address ?? '')) changes.push('indirizzo aggiornato')
    const description = changes.length === 0 ? 'modifica minore' : changes.join(' · ')
    commitData(
      appendActivityLog(
        nextData,
        createActivityLogEntry({
          entityType: 'system',
          entityId: id,
          action: before.active !== after.active
            ? (after.active ? 'updated' : 'deleted')
            : 'updated',
          title: `Anagrafica aggiornata: ${after.name}`,
          description,
          before: { active: before.active, name: before.name },
          after: { active: after.active, name: after.name },
        }),
      ),
    )
  }, [commitData])

  const setBusinessPartnerActive = useCallback((id: string, active: boolean) => {
    const before = dataRef.current.businessPartners.find((p) => p.id === id)
    if (!before) return
    const nextData = svcSetPartnerActive(dataRef.current, id, active)
    commitData(
      appendActivityLog(
        nextData,
        createActivityLogEntry({
          entityType: 'system',
          entityId: id,
          action: active ? 'updated' : 'deleted',
          title: `Anagrafica ${active ? 'riattivata' : 'disattivata'}: ${before.name}`,
        }),
      ),
    )
  }, [commitData])

  const deleteBusinessPartner = useCallback((id: string) => {
    const before = dataRef.current.businessPartners.find((p) => p.id === id)
    if (!before) return
    // soft delete = active=false
    const nextData = svcDeletePartner(dataRef.current, id)
    commitData(
      appendActivityLog(
        nextData,
        createActivityLogEntry({
          entityType: 'system',
          entityId: id,
          action: 'deleted',
          title: `Anagrafica disattivata: ${before.name}`,
          description: 'Soft delete (active=false): nessuna cancellazione fisica.',
        }),
      ),
    )
  }, [commitData])

  const planBusinessPartnerImport = useCallback(
    (records: ImportPlanRecord[], filename?: string): ImportPlan => {
      return svcPlanPartnerImport(dataRef.current, records, filename)
    },
    [],
  )

  const applyBusinessPartnerImport = useCallback((plan: ImportPlan): ImportResult => {
    const { data: nextData, result } = svcApplyPartnerImport(dataRef.current, plan)
    commitData(
      appendActivityLog(
        nextData,
        createActivityLogEntry({
          entityType: 'system',
          entityId: 'import-anagrafica',
          action: 'imported',
          title: 'Import anagrafica completato',
          description: `${result.created} nuove · ${result.updated} aggiornate · ${result.skipped} scartate${plan.filename ? ` · file: ${plan.filename}` : ''}`,
        }),
      ),
      { risky: true, reason: 'import-business-partners' },
    )
    return result
  }, [commitData])

  const planCustomerLinking = useCallback((): LinkPlan => {
    return svcPlanCustomerLinking(dataRef.current)
  }, [])

  const applyCustomerLinking = useCallback((selections: LinkSelection[]): LinkApplyResult => {
    const { data: nextData, result } = svcApplyCustomerLinking(dataRef.current, selections)
    commitData(
      appendActivityLog(
        nextData,
        createActivityLogEntry({
          entityType: 'system',
          entityId: 'auto-link-customers',
          action: 'updated',
          title: 'Collegamento automatico clienti',
          description: `${result.linked} lavori collegati ad anagrafiche${result.skipped > 0 ? ` · ${result.skipped} saltati (già collegati o anagrafica non trovata)` : ''}`,
        }),
      ),
      { risky: true, reason: 'auto-link-customers' },
    )
    return result
  }, [commitData])

  const createMachineType = useCallback((input: CreateMachineTypeInput): string => {
    const result = svcCreateMachineType(dataRef.current, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateMachineType = useCallback((id: string, patch: UpdateMachineTypeInput) => {
    commitData(svcUpdateMachineType(dataRef.current, id, patch))
  }, [commitData])

  const setMachineTypeActive = useCallback((id: string, active: boolean) => {
    commitData(svcSetMachineTypeActive(dataRef.current, id, active))
  }, [commitData])

  const importData = useCallback((next: AppData, options: ImportDataOptions = {}) => {
    const description = [
      `${next.workItems.length} lavori`,
      `${next.tasks.length} task`,
      `${next.absences.length} assenze`,
      `${next.activityLog.length} eventi storico`,
      `${next.notifications.length} notifiche`,
      `${next.machineTypes.length} tipologie disegno`,
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
      { risky: true, reason: 'import-json' },
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
        description: `${dataRef.current.people.length} persone - ${dataRef.current.workItems.length} lavori - ${dataRef.current.tasks.length} task - ${dataRef.current.machineTypes.length} tipologie disegno - file: ${filename}`,
      }, exportedAtDate),
    )
    const exportedAt = setLastBackupAt(exportedAtDate)
    downloadJSON(createBackupPayload(nextData, exportedAtDate), filename)
    commitData(nextData, { reason: 'export-json-activity-log' })
    return { exportedAt, filename }
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
    businessPartners: data.businessPartners,
    machineTypes: data.machineTypes,
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
    createBusinessPartner,
    updateBusinessPartner,
    setBusinessPartnerActive,
    deleteBusinessPartner,
    planBusinessPartnerImport,
    applyBusinessPartnerImport,
    planCustomerLinking,
    applyCustomerLinking,
    createMachineType,
    updateMachineType,
    setMachineTypeActive,
    importData,
    exportData,
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
    createBusinessPartner, updateBusinessPartner, setBusinessPartnerActive, deleteBusinessPartner,
    planBusinessPartnerImport, applyBusinessPartnerImport,
    planCustomerLinking, applyCustomerLinking,
    createMachineType, updateMachineType, setMachineTypeActive,
    importData, exportData,
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
