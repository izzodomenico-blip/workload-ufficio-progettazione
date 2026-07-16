import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Absence, AppData, BusinessPartner, Consuntivo, ConsuntiviClosure, MachineType, Person, Status, TubeProfile, WorkshopAssignment, WorkshopAssignmentSourceType, WorkshopAssignmentStatus, WorkshopOutput, WorkshopWorker } from '../types'
import { freshDemoData } from '../data/demoData'
import { downloadJSON, loadFromStorage, saveToStorage } from '../storage/localStorage'
import {
  createMachineTypeRecord,
  DataConflictError,
  fetchAppData,
  saveAppData as saveAppDataToApi,
  updateMachineTypeRecord,
} from '../services/apiClient'
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
import {
  createWorkshopOutput as svcCreateWorkshopOutput,
  deleteWorkshopOutput as svcDeleteWorkshopOutput,
  replaceWorkshopOutputsForWorkItem as svcReplaceWorkshopOutputsForWorkItem,
  updateWorkshopOutput as svcUpdateWorkshopOutput,
} from '../services/workshopOutputsService'
import type {
  CreateWorkshopOutputInput,
  UpdateWorkshopOutputInput,
  WorkshopOutputDraft,
} from '../services/workshopOutputsService'
import {
  applyWorkshopWorkerImport as svcApplyWorkshopWorkerImport,
  createWorkshopWorker as svcCreateWorkshopWorker,
  setWorkshopWorkerActive as svcSetWorkshopWorkerActive,
  updateWorkshopWorker as svcUpdateWorkshopWorker,
} from '../services/workshopWorkersService'
import type {
  CreateWorkshopWorkerInput,
  UpdateWorkshopWorkerInput,
  WorkshopWorkerImportResult,
} from '../services/workshopWorkersService'
import type { WorkshopWorkerImportPlan } from '../utils/workshopWorkersImport'
import {
  createWorkshopAssignment as svcCreateWorkshopAssignment,
  deleteWorkshopAssignment as svcDeleteWorkshopAssignment,
  replaceWorkshopAssignmentsForOutput as svcReplaceWorkshopAssignmentsForOutput,
  setWorkshopAssignmentStatus as svcSetWorkshopAssignmentStatus,
  updateWorkshopAssignment as svcUpdateWorkshopAssignment,
} from '../services/workshopAssignmentsService'
import type {
  CreateWorkshopAssignmentInput,
  UpdateWorkshopAssignmentInput,
  WorkshopAssignmentDraft,
} from '../services/workshopAssignmentsService'
import {
  createConsuntivo as svcCreateConsuntivo,
  deleteConsuntivo as svcDeleteConsuntivo,
  updateConsuntivo as svcUpdateConsuntivo,
} from '../services/consuntiviService'
import type { CreateConsuntivoInput, UpdateConsuntivoInput } from '../services/consuntiviService'
import {
  createTubeProfile as svcCreateTubeProfile,
  deleteTubeProfile as svcDeleteTubeProfile,
  updateTubeProfile as svcUpdateTubeProfile,
} from '../services/tubeProfilesService'
import type { CreateTubeProfileInput, UpdateTubeProfileInput } from '../services/tubeProfilesService'
import {
  pendingCommercialOutputsForOutput,
  pendingCommercialOutputsForWorkItem,
} from '../utils/commercialComponents'
import type { CommercialClosureResolution } from '../utils/commercialComponents'

interface UpdatePeopleOptions {
  /** Password admin per autorizzare modifiche a baselineLoadPercent */
  adminPassword?: string
}

interface DataContextValue {
  data: AppData
  absences: Absence[]
  businessPartners: BusinessPartner[]
  machineTypes: MachineType[]
  workshopOutputs: WorkshopOutput[]
  workshopWorkers: WorkshopWorker[]
  workshopAssignments: WorkshopAssignment[]
  consuntivi: Consuntivo[]
  consuntiviClosures: ConsuntiviClosure[]
  tubeProfiles: TubeProfile[]
  // workItems
  createWorkItem: (input: CreateWorkItemInput) => string
  updateWorkItem: (id: string, patch: UpdateWorkItemInput) => void
  createWorkItemWithWorkshopOutputs: (input: CreateWorkItemInput, outputs: WorkshopOutputDraft[]) => string
  updateWorkItemWithWorkshopOutputs: (id: string, patch: UpdateWorkItemInput, outputs: WorkshopOutputDraft[]) => void
  deleteWorkItem: (id: string) => void
  setWorkItemStatus: (id: string, status: Status) => void
  setWorkItemStatusAfterCommercialCheck: (id: string, status: Status, resolution: CommercialClosureResolution) => void
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
  // workshop outputs
  createWorkshopOutput: (workItemId: string, input: CreateWorkshopOutputInput) => string
  updateWorkshopOutput: (id: string, patch: UpdateWorkshopOutputInput) => void
  updateWorkshopOutputAfterCommercialCheck: (id: string, patch: UpdateWorkshopOutputInput, resolution: CommercialClosureResolution) => void
  deleteWorkshopOutput: (id: string) => void
  replaceWorkshopOutputsForWorkItem: (workItemId: string, outputs: WorkshopOutputDraft[]) => void
  // workshop workers
  createWorkshopWorker: (input: CreateWorkshopWorkerInput) => string
  updateWorkshopWorker: (id: string, patch: UpdateWorkshopWorkerInput) => void
  setWorkshopWorkerActive: (id: string, active: boolean) => void
  applyWorkshopWorkerImport: (plan: WorkshopWorkerImportPlan) => WorkshopWorkerImportResult
  // workshop assignments
  createWorkshopAssignment: (input: CreateWorkshopAssignmentInput) => string
  updateWorkshopAssignment: (id: string, patch: UpdateWorkshopAssignmentInput) => void
  deleteWorkshopAssignment: (id: string) => void
  setWorkshopAssignmentStatus: (id: string, status: WorkshopAssignmentStatus) => void
  replaceWorkshopAssignmentsForOutput: (workshopOutputId: string, assignments: WorkshopAssignmentDraft[], sourceType?: WorkshopAssignmentSourceType) => void
  // consuntivi
  createConsuntivo: (input: CreateConsuntivoInput) => string
  updateConsuntivo: (id: string, patch: UpdateConsuntivoInput) => void
  deleteConsuntivo: (id: string) => void
  // tube profiles
  createTubeProfile: (input: CreateTubeProfileInput) => string
  updateTubeProfile: (id: string, patch: UpdateTubeProfileInput) => void
  deleteTubeProfile: (id: string) => void
  // import/export
  importData: (next: AppData, options?: ImportDataOptions) => void
  exportData: () => BackupExportResult
  /** Ricarica lo stato condiviso dal server (es. dopo un ripristino backup). */
  reloadFromServer: () => Promise<void>
  /** Alias di reloadFromServer: ricarica l'albero dati dal server (es. dopo chiusura/riapertura commessa). */
  refreshAppData: () => Promise<void>
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
  const serverReadyRef = useRef(false)
  const serverRevisionRef = useRef<number | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  // Numero di salvataggi ottimistici ancora in coda/in volo. Serve a NON
  // sovrascrivere lo stato locale con la risposta di un salvataggio "vecchio"
  // quando l'utente ha gia' fatto modifiche successive (vedi commitData).
  const pendingCommitsRef = useRef(0)
  const toast = useToast()

  const applyRemoteData = useCallback((remoteData: AppData, revision: number) => {
    serverReadyRef.current = true
    serverRevisionRef.current = revision
    dataRef.current = remoteData
    setData(remoteData)
    saveToStorage(remoteData)
  }, [])

  const restoreLocalData = useCallback((snapshot: AppData) => {
    dataRef.current = snapshot
    setData(snapshot)
    saveToStorage(snapshot)
  }, [])

  useEffect(() => {
    dataRef.current = data
    saveToStorage(data)
  }, [data])

  useEffect(() => {
    let cancelled = false
    fetchAppData()
      .then((response) => {
        if (cancelled) return
        const remoteData = response.data
        applyRemoteData(remoteData, response.revision)
      })
      .catch((err) => {
        if (cancelled) return
        serverReadyRef.current = false
        serverRevisionRef.current = null
        console.error('Impossibile caricare i dati dal backend', err)
        toast.error('Backend condiviso non raggiungibile: salvataggio bloccato finche non viene ricaricato dal server.')
      })
    return () => {
      cancelled = true
    }
  }, [applyRemoteData, restoreLocalData, toast])

  const commitData = useCallback((next: AppData, options: CommitOptions = {}) => {
    if (!serverReadyRef.current || serverRevisionRef.current === null) {
      toast.error('Salvataggio bloccato: i dati condivisi del server non sono ancora caricati. Ricarica la pagina dal link del server.')
      return
    }
    const previous = dataRef.current
    dataRef.current = next
    setData(next)
    saveToStorage(next)
    pendingCommitsRef.current += 1
    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        const currentRevision = serverRevisionRef.current
        if (currentRevision === null) throw new Error('Revisione dati server non disponibile.')
        const response = await saveAppDataToApi(next, {
          ...options,
          dataRevision: currentRevision,
        })
        // La revisione condivisa va sempre aggiornata, anche se nel frattempo
        // sono arrivate altre modifiche.
        serverReadyRef.current = true
        serverRevisionRef.current = response.revision
        // Adotta lo snapshot normalizzato dal server SOLO se questo e' l'ultimo
        // salvataggio in coda: altrimenti sovrascriverebbe le modifiche
        // ottimistiche piu' recenti con una risposta ormai stantia, facendo
        // "tornare indietro" i campi appena modificati alla riapertura.
        if (pendingCommitsRef.current <= 1) {
          dataRef.current = response.data
          setData(response.data)
          saveToStorage(response.data)
        }
      })
      .catch(async (err) => {
        if (err instanceof DataConflictError) {
          // Ricarica dal server solo se non ci sono modifiche locali piu'
          // recenti in attesa: in caso contrario il salvataggio successivo
          // riconcilia da solo e una ricarica perderebbe quelle modifiche.
          if (pendingCommitsRef.current <= 1) {
            try {
              const response = await fetchAppData()
              applyRemoteData(response.data, response.revision)
            } catch (reloadError) {
              serverReadyRef.current = false
              serverRevisionRef.current = null
              console.error('Ricarica dati condivisi fallita dopo conflitto', reloadError)
            }
          }
          console.warn('Salvataggio rifiutato per revisione dati non aggiornata', err)
          toast.error('Salvataggio bloccato: i dati condivisi erano cambiati. Ho ricaricato il database server, ripeti la modifica se serve.')
          return
        }
        if (err instanceof Error && /permess|Riservato|amministratore/i.test(err.message)) {
          if (pendingCommitsRef.current <= 1) {
            dataRef.current = previous; setData(previous); saveToStorage(previous)
          }
          toast.error(`Operazione non consentita: ${err.message}`)
          return
        }
        // Rollback dello stato locale se il backend rifiuta (es. password mancante),
        // ma solo se nessuna modifica successiva ha gia' superato questo salvataggio.
        if (pendingCommitsRef.current <= 1) {
          dataRef.current = previous
          setData(previous)
          saveToStorage(previous)
        }
        console.error('Salvataggio su database fallito', err)
        toast.error(`Salvataggio database fallito: ${err instanceof Error ? err.message : 'errore sconosciuto'}`)
      })
      .finally(() => {
        pendingCommitsRef.current = Math.max(0, pendingCommitsRef.current - 1)
      })
  }, [applyRemoteData, restoreLocalData, toast])

  const createWorkItem = useCallback((input: CreateWorkItemInput): string => {
    const result = svcCreateWorkItem(dataRef.current, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateWorkItem = useCallback((id: string, patch: UpdateWorkItemInput) => {
    commitData(svcUpdateWorkItem(dataRef.current, id, patch))
  }, [commitData])

  const createWorkItemWithWorkshopOutputs = useCallback((input: CreateWorkItemInput, outputs: WorkshopOutputDraft[]): string => {
    const result = svcCreateWorkItem(dataRef.current, input)
    const nextData = input.type === 'commessa' && outputs.length > 0
      ? svcReplaceWorkshopOutputsForWorkItem(result.data, result.id, outputs)
      : result.data
    commitData(nextData)
    return result.id
  }, [commitData])

  const updateWorkItemWithWorkshopOutputs = useCallback((id: string, patch: UpdateWorkItemInput, outputs: WorkshopOutputDraft[]) => {
    const nextData = svcUpdateWorkItem(dataRef.current, id, patch)
    commitData(
      patch.type === 'commessa'
        ? svcReplaceWorkshopOutputsForWorkItem(nextData, id, outputs)
        : nextData,
    )
  }, [commitData])

  const deleteWorkItem = useCallback((id: string) => {
    commitData(svcDeleteWorkItem(dataRef.current, id), { risky: true, reason: 'delete-work-item' })
  }, [commitData])

  const setWorkItemStatus = useCallback((id: string, status: Status) => {
    commitData(svcSetWorkItemStatus(dataRef.current, id, status))
  }, [commitData])

  const setWorkItemStatusAfterCommercialCheck = useCallback((id: string, status: Status, resolution: CommercialClosureResolution) => {
    const current = dataRef.current
    const pendingOutputs = pendingCommercialOutputsForWorkItem(current, id)
    const resolvedData = resolveCommercialClosure(current, pendingOutputs, resolution, 'chiusura commessa')
    commitData(svcSetWorkItemStatus(resolvedData, id, status))
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
    const previous = dataRef.current
    dataRef.current = result.data
    setData(result.data)
    saveToStorage(result.data)
    void persistMachineTypeChange(
      () => createMachineTypeRecord(result.machineType),
      previous,
      restoreLocalData,
      applyRemoteData,
      toast,
    )
    return result.id
  }, [applyRemoteData, restoreLocalData, toast])

  const updateMachineType = useCallback((id: string, patch: UpdateMachineTypeInput) => {
    const previous = dataRef.current
    const nextData = svcUpdateMachineType(dataRef.current, id, patch)
    const machineType = nextData.machineTypes.find((item) => item.id === id)
    if (!machineType) return
    dataRef.current = nextData
    setData(nextData)
    saveToStorage(nextData)
    void persistMachineTypeChange(
      () => updateMachineTypeRecord(id, machineType),
      previous,
      restoreLocalData,
      applyRemoteData,
      toast,
    )
  }, [applyRemoteData, toast])

  const setMachineTypeActive = useCallback((id: string, active: boolean) => {
    const previous = dataRef.current
    const nextData = svcSetMachineTypeActive(dataRef.current, id, active)
    const machineType = nextData.machineTypes.find((item) => item.id === id)
    if (!machineType) return
    dataRef.current = nextData
    setData(nextData)
    saveToStorage(nextData)
    void persistMachineTypeChange(
      () => updateMachineTypeRecord(id, machineType),
      previous,
      restoreLocalData,
      applyRemoteData,
      toast,
    )
  }, [applyRemoteData, toast])

  const createWorkshopOutput = useCallback((workItemId: string, input: CreateWorkshopOutputInput): string => {
    const result = svcCreateWorkshopOutput(dataRef.current, workItemId, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateWorkshopOutput = useCallback((id: string, patch: UpdateWorkshopOutputInput) => {
    commitData(svcUpdateWorkshopOutput(dataRef.current, id, patch))
  }, [commitData])

  const updateWorkshopOutputAfterCommercialCheck = useCallback((id: string, patch: UpdateWorkshopOutputInput, resolution: CommercialClosureResolution) => {
    const current = dataRef.current
    const pendingOutputs = pendingCommercialOutputsForOutput(current, id)
    const resolvedData = resolveCommercialClosure(current, pendingOutputs, resolution, 'chiusura output officina')
    const target = current.workshopOutputs.find((output) => output.id === id)
    const today = new Date().toISOString().slice(0, 10)
    const resolvedPatch: UpdateWorkshopOutputInput = resolution === 'confirm_ordered' && target
      ? {
          ...patch,
          commercialComponentsOrdered: true,
          commercialComponentsOrderedAt: patch.commercialComponentsOrderedAt || target.commercialComponentsOrderedAt || today,
          commercialComponentsOrderedBy: patch.commercialComponentsOrderedBy || target.commercialComponentsOrderedBy || 'utente locale',
        }
      : patch
    commitData(svcUpdateWorkshopOutput(resolvedData, id, resolvedPatch))
  }, [commitData])

  const deleteWorkshopOutput = useCallback((id: string) => {
    commitData(svcDeleteWorkshopOutput(dataRef.current, id))
  }, [commitData])

  const replaceWorkshopOutputsForWorkItem = useCallback((workItemId: string, outputs: WorkshopOutputDraft[]) => {
    commitData(svcReplaceWorkshopOutputsForWorkItem(dataRef.current, workItemId, outputs))
  }, [commitData])

  const createWorkshopWorker = useCallback((input: CreateWorkshopWorkerInput): string => {
    const result = svcCreateWorkshopWorker(dataRef.current, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateWorkshopWorker = useCallback((id: string, patch: UpdateWorkshopWorkerInput) => {
    commitData(svcUpdateWorkshopWorker(dataRef.current, id, patch))
  }, [commitData])

  const setWorkshopWorkerActive = useCallback((id: string, active: boolean) => {
    commitData(svcSetWorkshopWorkerActive(dataRef.current, id, active))
  }, [commitData])

  const applyWorkshopWorkerImport = useCallback((plan: WorkshopWorkerImportPlan): WorkshopWorkerImportResult => {
    const { data: nextData, result } = svcApplyWorkshopWorkerImport(dataRef.current, plan)
    commitData(nextData, { risky: true, reason: 'import-workshop-workers' })
    return result
  }, [commitData])

  const createWorkshopAssignment = useCallback((input: CreateWorkshopAssignmentInput): string => {
    const result = svcCreateWorkshopAssignment(dataRef.current, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateWorkshopAssignment = useCallback((id: string, patch: UpdateWorkshopAssignmentInput) => {
    commitData(svcUpdateWorkshopAssignment(dataRef.current, id, patch))
  }, [commitData])

  const deleteWorkshopAssignment = useCallback((id: string) => {
    commitData(svcDeleteWorkshopAssignment(dataRef.current, id))
  }, [commitData])

  const setWorkshopAssignmentStatus = useCallback((id: string, status: WorkshopAssignmentStatus) => {
    commitData(svcSetWorkshopAssignmentStatus(dataRef.current, id, status))
  }, [commitData])

  const replaceWorkshopAssignmentsForOutput = useCallback((workshopOutputId: string, assignments: WorkshopAssignmentDraft[], sourceType: WorkshopAssignmentSourceType = 'output') => {
    commitData(svcReplaceWorkshopAssignmentsForOutput(dataRef.current, workshopOutputId, assignments, sourceType))
  }, [commitData])

  const createConsuntivo = useCallback((input: CreateConsuntivoInput): string => {
    const result = svcCreateConsuntivo(dataRef.current, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateConsuntivo = useCallback((id: string, patch: UpdateConsuntivoInput) => {
    commitData(svcUpdateConsuntivo(dataRef.current, id, patch))
  }, [commitData])

  const deleteConsuntivo = useCallback((id: string) => {
    commitData(svcDeleteConsuntivo(dataRef.current, id), { risky: true })
  }, [commitData])

  const createTubeProfile = useCallback((input: CreateTubeProfileInput): string => {
    const result = svcCreateTubeProfile(dataRef.current, input)
    commitData(result.data)
    return result.id
  }, [commitData])

  const updateTubeProfile = useCallback((id: string, patch: UpdateTubeProfileInput) => {
    commitData(svcUpdateTubeProfile(dataRef.current, id, patch))
  }, [commitData])

  const deleteTubeProfile = useCallback((id: string) => {
    commitData(svcDeleteTubeProfile(dataRef.current, id), { risky: true })
  }, [commitData])

  const importData = useCallback((next: AppData, options: ImportDataOptions = {}) => {
    const safeNext = mergeImportWithSharedCollections(next, dataRef.current)
    const description = [
      `${safeNext.workItems.length} lavori`,
      `${safeNext.tasks.length} task`,
      `${safeNext.absences.length} assenze`,
      `${safeNext.activityLog.length} eventi storico`,
      `${safeNext.notifications.length} notifiche`,
      `${safeNext.machineTypes.length} tipologie disegno`,
      `${safeNext.workshopOutputs.length} output officina`,
      `${safeNext.workshopWorkers.length} operai officina`,
      `${safeNext.workshopAssignments.length} assegnazioni officina`,
      `${(safeNext.calculatedStandardComponents ?? []).length} componenti standard calcolati`,
      options.fileName ? `file: ${options.fileName}` : '',
      options.exportedAt ? `esportato: ${options.exportedAt}` : '',
      options.version ? `versione: ${options.version}` : '',
    ].filter(Boolean).join(' - ')

    commitData(
      appendActivityLog(
        safeNext,
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
        description: `${dataRef.current.people.length} persone - ${dataRef.current.workItems.length} lavori - ${dataRef.current.tasks.length} task - ${dataRef.current.machineTypes.length} tipologie disegno - ${dataRef.current.workshopOutputs.length} output officina - ${dataRef.current.workshopWorkers.length} operai officina - ${dataRef.current.workshopAssignments.length} assegnazioni officina - file: ${filename}`,
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

  const reloadFromServer = useCallback(async () => {
    const response = await fetchAppData()
    applyRemoteData(response.data, response.revision)
  }, [applyRemoteData])

  const value = useMemo<DataContextValue>(() => ({
    data,
    absences: data.absences,
    businessPartners: data.businessPartners,
    machineTypes: data.machineTypes,
    workshopOutputs: data.workshopOutputs,
    workshopWorkers: data.workshopWorkers,
    workshopAssignments: data.workshopAssignments,
    consuntivi: data.consuntivi ?? [],
    consuntiviClosures: data.consuntiviClosures ?? [],
    tubeProfiles: data.tubeProfiles ?? [],
    createWorkItem,
    updateWorkItem,
    createWorkItemWithWorkshopOutputs,
    updateWorkItemWithWorkshopOutputs,
    deleteWorkItem,
    setWorkItemStatus,
    setWorkItemStatusAfterCommercialCheck,
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
    createWorkshopOutput,
    updateWorkshopOutput,
    updateWorkshopOutputAfterCommercialCheck,
    deleteWorkshopOutput,
    replaceWorkshopOutputsForWorkItem,
    createWorkshopWorker,
    updateWorkshopWorker,
    setWorkshopWorkerActive,
    applyWorkshopWorkerImport,
    createWorkshopAssignment,
    updateWorkshopAssignment,
    deleteWorkshopAssignment,
    setWorkshopAssignmentStatus,
    replaceWorkshopAssignmentsForOutput,
    createConsuntivo,
    updateConsuntivo,
    deleteConsuntivo,
    createTubeProfile,
    updateTubeProfile,
    deleteTubeProfile,
    importData,
    exportData,
    reloadFromServer,
    refreshAppData: reloadFromServer,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    clearReadNotifications,
    clearAllNotifications,
  }), [
    data,
    createWorkItem, updateWorkItem, createWorkItemWithWorkshopOutputs, updateWorkItemWithWorkshopOutputs,
    deleteWorkItem, setWorkItemStatus, setWorkItemStatusAfterCommercialCheck, convertStudioToCommessa,
    createTask, updateTask, deleteTask, setTaskStatus,
    updatePerson, updatePeople,
    createAbsence, updateAbsence, deleteAbsence,
    createBusinessPartner, updateBusinessPartner, setBusinessPartnerActive, deleteBusinessPartner,
    planBusinessPartnerImport, applyBusinessPartnerImport,
    planCustomerLinking, applyCustomerLinking,
    createMachineType, updateMachineType, setMachineTypeActive,
    createWorkshopOutput, updateWorkshopOutput, updateWorkshopOutputAfterCommercialCheck, deleteWorkshopOutput, replaceWorkshopOutputsForWorkItem,
    createWorkshopWorker, updateWorkshopWorker, setWorkshopWorkerActive, applyWorkshopWorkerImport,
    createWorkshopAssignment, updateWorkshopAssignment, deleteWorkshopAssignment, setWorkshopAssignmentStatus, replaceWorkshopAssignmentsForOutput,
    createConsuntivo, updateConsuntivo, deleteConsuntivo,
    createTubeProfile, updateTubeProfile, deleteTubeProfile,
    importData, exportData, reloadFromServer,
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

function mergeImportWithSharedCollections(next: AppData, current: AppData): AppData {
  const importedWorkItemIds = new Set(next.workItems.map((item) => item.id))
  const currentCalculated = current.calculatedStandardComponents ?? []
  const nextCalculated = next.calculatedStandardComponents ?? []
  return {
    ...next,
    businessPartners: next.businessPartners.length > 0 ? next.businessPartners : current.businessPartners,
    machineTypes: next.machineTypes.length > 0 ? next.machineTypes : current.machineTypes,
    workshopWorkers: next.workshopWorkers.length > 0 ? next.workshopWorkers : current.workshopWorkers,
    workshopAssignments: next.workshopAssignments.length > 0
      ? next.workshopAssignments
      : current.workshopAssignments.filter((assignment) => importedWorkItemIds.has(assignment.workItemId)),
    workshopOutputs: next.workshopOutputs.length > 0
      ? next.workshopOutputs
      : current.workshopOutputs.filter((output) => importedWorkItemIds.has(output.workItemId)),
    calculatedStandardComponents: nextCalculated.length > 0
      ? nextCalculated
      : currentCalculated.filter((component) => importedWorkItemIds.has(component.workItemId)),
  }
}

function resolveCommercialClosure(
  data: AppData,
  pendingOutputs: WorkshopOutput[],
  resolution: CommercialClosureResolution,
  scopeLabel: string,
): AppData {
  if (pendingOutputs.length === 0) return data
  const pendingIds = new Set(pendingOutputs.map((output) => output.id))
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date()

  if (resolution === 'confirm_ordered') {
    const nextData: AppData = {
      ...data,
      workshopOutputs: data.workshopOutputs.map((output) => (
        pendingIds.has(output.id)
          ? {
              ...output,
              commercialComponentsOrdered: true,
              commercialComponentsOrderedAt: output.commercialComponentsOrderedAt || today,
              commercialComponentsOrderedBy: output.commercialComponentsOrderedBy || 'utente locale',
              updatedAt: now.toISOString(),
            }
          : output
      )),
    }
    return appendActivityLog(
      nextData,
      createActivityLogEntry({
        entityType: 'system',
        entityId: 'commercial-components',
        action: 'updated',
        title: 'Componenti commerciali confermati',
        description: `${scopeLabel}: ${pendingOutputs.length} output segnati come ordinati/verificati.`,
        after: {
          outputIds: pendingOutputs.map((output) => output.id),
          orderedAt: today,
          orderedBy: 'utente locale',
        },
      }, now),
    )
  }

  return appendActivityLog(
    data,
    createActivityLogEntry({
      entityType: 'system',
      entityId: 'commercial-components-warning',
      action: 'updated',
      title: 'Chiusura eseguita con componenti commerciali non confermati',
      description: `${scopeLabel}: ${pendingOutputs.length} output con ordine commerciale ancora da confermare.`,
      before: {
        outputIds: pendingOutputs.map((output) => output.id),
      },
    }, now),
  )
}

async function persistMachineTypeChange(
  saveRecord: () => Promise<MachineType>,
  previous: AppData,
  restoreLocalData: (snapshot: AppData) => void,
  applyRemoteData: (remoteData: AppData, revision: number) => void,
  toast: ReturnType<typeof useToast>,
) {
  let recordSaved = false
  try {
    await saveRecord()
    recordSaved = true
    const response = await fetchAppData()
    applyRemoteData(response.data, response.revision)
  } catch (err) {
    if (recordSaved) {
      console.error('Tipologia salvata, ma ricarica dati condivisi fallita', err)
      toast.error('Tipologia salvata nel database, ma ricarica non riuscita: aggiorna la pagina.')
      return
    }
    restoreLocalData(previous)
    console.error('Salvataggio tipologia disegno fallito', err)
    toast.error(`Salvataggio tipologia fallito: ${err instanceof Error ? err.message : 'errore sconosciuto'}`)
  }
}
