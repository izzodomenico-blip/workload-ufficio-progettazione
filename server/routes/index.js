import { Router } from 'express'
import {
  deleteEntity,
  getAppData,
  getCollection,
  getConsuntiviConfig,
  getDataRevision,
  getLastMutationAt,
  saveAppData,
  saveConsuntiviConfig,
  upsertEntity,
} from '../db.js'
import { EMPTY_APP_DATA, normalizeAppData } from '../services/appData.js'
import {
  createPreMutationBackup,
  getBackupStatus,
  listBackupArchives,
  readBackupPreview,
  recordAutomaticBackupActivity,
  resolveBackupFile,
  restoreFromBackup,
  scheduleAutoBackup,
} from '../backupService.js'
import { parseAnagraficheXml } from '../services/anagraficheImport.js'
import {
  getAdminStatus,
  hasBaselineChanges,
  setAdminPassword,
  verifyAdminPassword,
} from '../services/adminAuth.js'
import { DEFAULT_CONSUNTIVI_CONFIG, normalizeConsuntiviConfig } from '../services/consuntiviConfig.js'

const ADMIN_PASSWORD_HEADER = 'x-workload-admin-password'
const DATA_REVISION_HEADER = 'x-workload-data-revision'
const LAST_MUTATION_HEADER = 'x-workload-last-mutation-at'

const APP_DATA_COLLECTIONS = [
  'people',
  'workItems',
  'tasks',
  'absences',
  'activityLog',
  'notifications',
  'businessPartners',
  'machineTypes',
  'workshopOutputs',
  'workshopWorkers',
  'workshopAssignments',
  'calculatedStandardComponents',
  'consuntivi',
  'tubeProfiles',
]
const PRESERVE_IF_EMPTY_COLLECTIONS = new Set(['businessPartners', 'machineTypes', 'workshopOutputs', 'workshopWorkers', 'workshopAssignments'])

/**
 * Estrae l'AppData da un payload PUT /app-data preservando le collezioni
 * eventualmente ASSENTI dal payload con i valori già presenti nel DB.
 *
 * Rete di sicurezza anti perdita dati: un payload parziale (es. un frontend che
 * per un bug non invia `machineTypes`) NON deve mai svuotare la tabella
 * corrispondente. Le collezioni esplicitamente presenti come array (anche se
 * vuote) vengono invece usate così come arrivano, così resta possibile svuotarle
 * intenzionalmente.
 */
function extractAppDataPreservingExisting(body, options = {}) {
  const root = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const rawSource = root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : root
  const raw = rawSource && typeof rawSource === 'object' && !Array.isArray(rawSource) ? rawSource : {}
  const current = getAppData()
  const merged = {}
  for (const key of APP_DATA_COLLECTIONS) {
    if (!Array.isArray(raw[key])) {
      merged[key] = current[key]
      continue
    }
    if (
      options.preserveEmptySharedCollections &&
      raw[key].length === 0 &&
      PRESERVE_IF_EMPTY_COLLECTIONS.has(key) &&
      current[key]?.length > 0
    ) {
      merged[key] = current[key]
      continue
    }
    merged[key] = raw[key]
  }
  return normalizeAppData(merged)
}

export function createApiRouter() {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'workload-ufficio-progettazione', storage: 'sqlite' })
  })

  router.get('/app-data', (_req, res) => {
    sendAppData(res, getAppData())
  })

  router.put('/app-data', (req, res, next) => {
    try {
      // NB: il salvataggio NON viene piu rifiutato per revisione disallineata.
      // L'integrita e garantita dalla rete di sicurezza extractAppDataPreservingExisting
      // (le collezioni assenti dal payload non vengono mai azzerate) + dal fatto che il
      // frontend ricarica i dati dal server prima di poter salvare. Gli header di revisione
      // restano informativi. Questo evita il blocco "errore di salvataggio" per tutti gli
      // utenti in caso di disallineamento di revisione (multi-scheda, endpoint dedicati, ecc.).
      const reason = mutationReason(req, 'put-app-data')
      const data = extractAppDataPreservingExisting(req.body, {
        preserveEmptySharedCollections: reason.startsWith('import-'),
      })
      const currentPeople = getCollection('people')
      if (hasBaselineChanges(currentPeople, data.people)) {
        const provided = req.get(ADMIN_PASSWORD_HEADER)
        if (!verifyAdminPassword(provided)) {
          const err = new Error('Carico base protetto: password admin richiesta o errata.')
          err.statusCode = 403
          err.detail = 'baseline-load-protected'
          throw err
        }
      }
      const isNormalCommit = req.get('x-workload-mutation-kind') === 'normal'
      if (isNormalCommit) {
        const saved = saveAppData(data)
        scheduleAutoBackup(reason)
        sendAppData(res, saved)
        return
      }
      const backup = createPreMutationBackup(reason)
      const saved = saveAppData(data)
      if (backup) recordAutomaticBackupActivity(backup.reason, new Date(backup.createdAt))
      sendAppData(res, saved)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })

  router.get('/admin/status', (_req, res) => {
    const status = getAdminStatus()
    res.json({ protected: status.protected })
  })

  router.post('/admin/verify-password', (req, res, next) => {
    try {
      const body = req.body ?? {}
      const ok = verifyAdminPassword(typeof body.password === 'string' ? body.password : undefined)
      res.json({ ok, protected: getAdminStatus().protected })
    } catch (error) {
      next(error)
    }
  })

  router.post('/admin/set-password', (req, res, next) => {
    try {
      const body = req.body ?? {}
      const result = setAdminPassword({
        currentPassword: typeof body.currentPassword === 'string' ? body.currentPassword : undefined,
        newPassword: typeof body.newPassword === 'string' ? body.newPassword : '',
      })
      res.json(result)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })

  router.get('/backup/status', (_req, res) => {
    res.json(getBackupStatus())
  })

  // === Gestione / ripristino backup ===
  router.get('/backups', (_req, res, next) => {
    try {
      res.set('cache-control', 'no-store')
      res.json(listBackupArchives())
    } catch (error) {
      next(error)
    }
  })

  router.get('/backups/preview', (req, res, next) => {
    try {
      const preview = readBackupPreview(String(req.query.kind || ''), String(req.query.file || ''))
      res.json(preview)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })

  router.get('/backups/download', (req, res, next) => {
    try {
      const full = resolveBackupFile(String(req.query.kind || ''), String(req.query.file || ''))
      if (!full) {
        res.status(404).json({ error: 'Backup non trovato.' })
        return
      }
      res.download(full)
    } catch (error) {
      next(error)
    }
  })

  router.post('/backups/restore', (req, res, next) => {
    try {
      const body = req.body ?? {}
      const result = restoreFromBackup(String(body.kind || ''), String(body.file || ''))
      sendDataRevisionHeaders(res)
      res.json(result)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })

  registerMachineTypeRoutes(router)

  registerCollectionRoutes(router, {
    apiName: 'people',
    collection: 'people',
    guard: peopleBaselineGuard,
  })
  registerCollectionRoutes(router, {
    apiName: 'work-items',
    collection: 'workItems',
  })
  registerCollectionRoutes(router, {
    apiName: 'tasks',
    collection: 'tasks',
  })
  registerCollectionRoutes(router, {
    apiName: 'absences',
    collection: 'absences',
  })
  registerCollectionRoutes(router, {
    apiName: 'business-partners',
    collection: 'businessPartners',
  })
  registerCollectionRoutes(router, {
    apiName: 'workshop-outputs',
    collection: 'workshopOutputs',
  })
  registerCollectionRoutes(router, {
    apiName: 'workshop-workers',
    collection: 'workshopWorkers',
  })
  registerCollectionRoutes(router, {
    apiName: 'workshop-assignments',
    collection: 'workshopAssignments',
  })
  registerCollectionRoutes(router, {
    apiName: 'consuntivi',
    collection: 'consuntivi',
  })
  registerCollectionRoutes(router, {
    apiName: 'tube-profiles',
    collection: 'tubeProfiles',
  })

  // Config prezzi: densità pubblica (serve al calcolo kg lato operaio), prezzi protetti.
  router.get('/consuntivi-settings', (_req, res) => {
    const cfg = getConsuntiviConfig() ?? DEFAULT_CONSUNTIVI_CONFIG
    res.set('cache-control', 'no-store')
    res.json({ densityFactorPerMaterial: cfg.densityFactorPerMaterial })
  })

  router.get('/consuntivi-pricing', (req, res, next) => {
    try {
      requireAdminPassword(req)
      res.set('cache-control', 'no-store')
      res.json(getConsuntiviConfig() ?? DEFAULT_CONSUNTIVI_CONFIG)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })

  router.put('/consuntivi-pricing', (req, res, next) => {
    try {
      requireAdminPassword(req)
      const cfg = normalizeConsuntiviConfig(req.body)
      saveConsuntiviConfig(cfg)
      scheduleAutoBackup('consuntivi-pricing-updated')
      res.json(cfg)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })

  router.put('/business-partners/:id/activate', (req, res, next) => {
    try {
      const current = getCollection('businessPartners').find((p) => p.id === req.params.id)
      if (!current) {
        res.status(404).json({ error: 'Anagrafica non trovata.' })
        return
      }
      const saved = upsertEntity('businessPartners', { ...current, active: true, updatedAt: new Date().toISOString() })
      scheduleAutoBackup('business-partner-activated')
      res.json(saved)
    } catch (error) {
      next(badRequest(error))
    }
  })

  router.put('/business-partners/:id/deactivate', (req, res, next) => {
    try {
      const current = getCollection('businessPartners').find((p) => p.id === req.params.id)
      if (!current) {
        res.status(404).json({ error: 'Anagrafica non trovata.' })
        return
      }
      const saved = upsertEntity('businessPartners', { ...current, active: false, updatedAt: new Date().toISOString() })
      scheduleAutoBackup('business-partner-deactivated')
      res.json(saved)
    } catch (error) {
      next(badRequest(error))
    }
  })

  router.post('/business-partners/parse-xml', (req, res, next) => {
    try {
      const body = req.body ?? {}
      const xml = typeof body.xml === 'string' ? body.xml : null
      if (!xml || xml.trim().length === 0) {
        const err = new Error('Body deve contenere il campo "xml" con il contenuto del file.')
        err.statusCode = 400
        throw err
      }
      const result = parseAnagraficheXml(xml)
      res.json({
        filename: typeof body.filename === 'string' ? body.filename : undefined,
        totalRows: result.totalRows,
        headerFound: result.headerFound,
        skipped: result.skipped,
        recordsRead: result.records.length,
        errors: result.errors,
        records: result.records,
      })
    } catch (error) {
      next(badRequest(error))
    }
  })

  router.get('/activity-log', (_req, res) => {
    res.json(getAppData().activityLog)
  })

  router.get('/notifications', (_req, res) => {
    res.json(getAppData().notifications)
  })

  router.put('/notifications/:id/read', (req, res, next) => {
    try {
      const appData = getAppData()
      let updated = null
      const notifications = appData.notifications.map((notification) => {
        if (notification.id !== req.params.id) return notification
        updated = { ...notification, read: true }
        return updated
      })
      if (!updated) {
        res.status(404).json({ error: 'Notifica non trovata.' })
        return
      }
      saveAppData({ ...appData, notifications })
      scheduleAutoBackup('notification-read')
      res.json(updated)
    } catch (error) {
      next(error)
    }
  })

  router.put('/notifications/read-all', (_req, res, next) => {
    try {
      const appData = getAppData()
      const notifications = appData.notifications.map((notification) => ({ ...notification, read: true }))
      saveAppData({ ...appData, notifications })
      scheduleAutoBackup('notifications-read-all')
      res.json({ ok: true, count: notifications.length })
    } catch (error) {
      next(error)
    }
  })

  router.use((error, _req, res, _next) => {
    const status = error.statusCode || 500
    res.status(status).json({
      error: status >= 500 ? 'Errore server.' : error.message,
      detail: status >= 500 ? undefined : error.detail,
    })
  })

  return router
}

function registerCollectionRoutes(router, { apiName, collection, guard, allowDelete = true }) {
  router.get(`/${apiName}`, (_req, res) => {
    res.json(getCollection(collection))
  })

  router.post(`/${apiName}`, (req, res, next) => {
    try {
      if (guard) guard({ req, current: null, incoming: req.body })
      const saved = upsertEntity(collection, req.body)
      scheduleAutoBackup(`${collection}-created`)
      res.status(201).json(saved)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })

  router.put(`/${apiName}/:id`, (req, res, next) => {
    try {
      const current = getCollection(collection).find((item) => item.id === req.params.id)
      if (!current) {
        res.status(404).json({ error: 'Elemento non trovato.' })
        return
      }
      const incoming = { ...current, ...req.body, id: req.params.id }
      if (guard) guard({ req, current, incoming })
      const saved = upsertEntity(collection, incoming)
      scheduleAutoBackup(`${collection}-updated`)
      res.json(saved)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })

  if (allowDelete) {
    router.delete(`/${apiName}/:id`, (req, res, next) => {
      try {
        if (collection === 'workItems') createPreMutationBackup('delete-work-item')
        deleteEntity(collection, req.params.id)
        if (collection !== 'workItems') scheduleAutoBackup(`${collection}-deleted`)
        res.status(204).end()
      } catch (error) {
        next(error)
      }
    })
  }
}

function registerMachineTypeRoutes(router) {
  router.get('/machine-types', (_req, res) => {
    res.set('cache-control', 'no-store')
    res.json(getCollection('machineTypes'))
  })

  router.post('/machine-types', (req, res, next) => {
    try {
      const appData = getAppData()
      const incoming = normalizeMachineTypeEntity(req.body)
      ensureUniqueMachineTypeCode(appData.machineTypes, incoming)
      const nextData = appendServerActivityLog({
        ...appData,
        machineTypes: sortMachineTypes([...appData.machineTypes, incoming]),
      }, {
        entityType: 'machineType',
        entityId: incoming.id,
        action: 'created',
        title: `Tipologia creata: ${incoming.code} - ${incoming.name}`,
        after: { code: incoming.code, active: incoming.active },
      })
      const saved = saveAppData(nextData)
      scheduleAutoBackup('machine-type-created')
      sendDataRevisionHeaders(res)
      res.status(201).json(saved.machineTypes.find((item) => item.id === incoming.id) ?? incoming)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })

  router.put('/machine-types/:id', (req, res, next) => {
    try {
      const appData = getAppData()
      const before = appData.machineTypes.find((item) => item.id === req.params.id)
      if (!before) {
        res.status(404).json({ error: 'Tipologia disegno non trovata.' })
        return
      }
      const incoming = normalizeMachineTypeEntity({ ...before, ...req.body, id: req.params.id })
      ensureUniqueMachineTypeCode(appData.machineTypes, incoming)
      const nextData = appendServerActivityLog({
        ...appData,
        machineTypes: sortMachineTypes(appData.machineTypes.map((item) => (item.id === req.params.id ? incoming : item))),
      }, {
        entityType: 'machineType',
        entityId: incoming.id,
        action: before.active !== incoming.active ? 'status_changed' : 'updated',
        title: before.active !== incoming.active
          ? `Tipologia ${incoming.active ? 'attivata' : 'disattivata'}: ${incoming.code} - ${incoming.name}`
          : `Tipologia aggiornata: ${incoming.code} - ${incoming.name}`,
        description: describeMachineTypeChange(before, incoming),
        before: { code: before.code, active: before.active, defaultImpactWeight: before.defaultImpactWeight },
        after: { code: incoming.code, active: incoming.active, defaultImpactWeight: incoming.defaultImpactWeight },
      })
      const saved = saveAppData(nextData)
      scheduleAutoBackup('machine-type-updated')
      sendDataRevisionHeaders(res)
      res.json(saved.machineTypes.find((item) => item.id === incoming.id) ?? incoming)
    } catch (error) {
      next(error.statusCode ? error : badRequest(error))
    }
  })
}

function normalizeMachineTypeEntity(entity) {
  const normalized = normalizeAppData({ ...EMPTY_APP_DATA, machineTypes: [entity] }).machineTypes[0]
  if (!normalized) {
    const err = new Error('Tipologia disegno non valida.')
    err.statusCode = 400
    throw err
  }
  return normalized
}

function ensureUniqueMachineTypeCode(machineTypes, incoming) {
  const duplicate = machineTypes.find((item) => (
    item.id !== incoming.id &&
    item.code.trim().toUpperCase() === incoming.code.trim().toUpperCase()
  ))
  if (!duplicate) return
  const err = new Error(`Esiste gia una tipologia con codice ${incoming.code}.`)
  err.statusCode = 409
  err.detail = 'duplicate-machine-type-code'
  throw err
}

function sortMachineTypes(rows) {
  return rows.slice().sort((a, b) => a.code.localeCompare(b.code, 'it', { sensitivity: 'base' }))
}

function appendServerActivityLog(data, entry) {
  const timestamp = new Date().toISOString()
  const nextLog = [{
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    ...entry,
  }, ...data.activityLog]
  if (nextLog.length > 1000) nextLog.length = 1000
  return { ...data, activityLog: nextLog }
}

function describeMachineTypeChange(before, after) {
  const parts = []
  if (before.code !== after.code) parts.push(`codice ${before.code} -> ${after.code}`)
  if (before.name !== after.name) parts.push('nome aggiornato')
  if (before.family !== after.family) parts.push(`famiglia ${before.family} -> ${after.family}`)
  if (before.defaultImpactWeight !== after.defaultImpactWeight) parts.push(`peso ${before.defaultImpactWeight} -> ${after.defaultImpactWeight}`)
  if (before.defaultComplexity !== after.defaultComplexity) parts.push(`complessita ${before.defaultComplexity} -> ${after.defaultComplexity}`)
  if (before.typicalAssemblyCount !== after.typicalAssemblyCount) parts.push(`complessivi ${before.typicalAssemblyCount} -> ${after.typicalAssemblyCount}`)
  if (before.typicalPartCount !== after.typicalPartCount) parts.push(`particolari ${before.typicalPartCount} -> ${after.typicalPartCount}`)
  if (machineTypeProcessKey(before) !== machineTypeProcessKey(after)) parts.push('processi default aggiornati')
  if (before.active !== after.active) parts.push(after.active ? 'tipologia attivata' : 'tipologia disattivata')
  if (before.notes !== after.notes) parts.push('note aggiornate')
  return parts.length > 0 ? parts.join(' - ') : 'modifica minore'
}

function machineTypeProcessKey(machineType) {
  return [
    machineType.defaultRequiresLaser ? `laser:${machineType.defaultLaserWeightPercent}%` : '',
    machineType.defaultRequiresTubeLaser ? `tube:${machineType.defaultTubeLaserWeightPercent}%` : '',
    machineType.defaultRequiresBending ? `bend:${machineType.defaultBendingWeightPercent}%` : '',
    machineType.defaultRequiresWelding ? `weld:${machineType.defaultWeldingWeightPercent}%` : '',
    machineType.defaultRequiresAssembly ? `assembly:${machineType.defaultAssemblyWeightPercent}%` : '',
    machineType.defaultRequiresPainting ? `painting:${machineType.defaultPaintingWeightPercent}%` : '',
    machineType.defaultRequiresTesting ? `testing:${machineType.defaultTestingWeightPercent}%` : '',
  ].filter(Boolean).join(',')
}

function requireAdminPassword(req) {
  const provided = req.get(ADMIN_PASSWORD_HEADER)
  if (!verifyAdminPassword(provided)) {
    const err = new Error('Configurazione prezzi protetta: password admin richiesta o errata.')
    err.statusCode = 403
    err.detail = 'consuntivi-pricing-protected'
    throw err
  }
}

function peopleBaselineGuard({ req, current, incoming }) {
  const before = normalizeBaseline(current?.baselineLoadPercent)
  const after = normalizeBaseline(incoming?.baselineLoadPercent)
  if (before === after) return
  const provided = req.get(ADMIN_PASSWORD_HEADER)
  if (!verifyAdminPassword(provided)) {
    const err = new Error('Carico base protetto: password admin richiesta o errata.')
    err.statusCode = 403
    err.detail = 'baseline-load-protected'
    throw err
  }
}

function normalizeBaseline(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 100) return 100
  return v
}

function mutationReason(req, fallback) {
  const headerReason = req.get('x-workload-mutation-reason')
  return headerReason && headerReason.trim().length > 0 ? headerReason.trim() : fallback
}

function sendAppData(res, data) {
  sendDataRevisionHeaders(res)
  res.json(data)
}

function sendDataRevisionHeaders(res) {
  const lastMutationAt = getLastMutationAt()
  res.set(DATA_REVISION_HEADER, String(getDataRevision()))
  if (lastMutationAt) res.set(LAST_MUTATION_HEADER, lastMutationAt)
  res.set('cache-control', 'no-store')
}

function badRequest(error) {
  const err = new Error(error instanceof Error ? error.message : 'Richiesta non valida.')
  err.statusCode = 400
  return err
}
