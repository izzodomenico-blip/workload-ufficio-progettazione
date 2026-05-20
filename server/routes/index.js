import { Router } from 'express'
import {
  deleteEntity,
  getAppData,
  getCollection,
  saveAppData,
  upsertEntity,
} from '../db.js'
import { extractAppData } from '../services/appData.js'
import {
  createPreMutationBackup,
  getBackupStatus,
  recordAutomaticBackupActivity,
  scheduleAutoBackup,
} from '../backupService.js'
import { parseAnagraficheXml } from '../services/anagraficheImport.js'
import {
  getAdminStatus,
  hasBaselineChanges,
  setAdminPassword,
  verifyAdminPassword,
} from '../services/adminAuth.js'

const ADMIN_PASSWORD_HEADER = 'x-workload-admin-password'

export function createApiRouter() {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'workload-ufficio-progettazione', storage: 'sqlite' })
  })

  router.get('/app-data', (_req, res) => {
    res.json(getAppData())
  })

  router.put('/app-data', (req, res, next) => {
    try {
      const data = extractAppData(req.body)
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
      const reason = mutationReason(req, 'put-app-data')
      const isNormalCommit = req.get('x-workload-mutation-kind') === 'normal'
      if (isNormalCommit) {
        const saved = saveAppData(data)
        scheduleAutoBackup(reason)
        res.json(saved)
        return
      }
      const backup = createPreMutationBackup(reason)
      const saved = saveAppData(data)
      if (backup) recordAutomaticBackupActivity(backup.reason, new Date(backup.createdAt))
      res.json(saved)
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
    apiName: 'machine-types',
    collection: 'machineTypes',
    allowDelete: false,
  })
  registerCollectionRoutes(router, {
    apiName: 'workshop-outputs',
    collection: 'workshopOutputs',
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

function badRequest(error) {
  const err = new Error(error instanceof Error ? error.message : 'Richiesta non valida.')
  err.statusCode = 400
  return err
}
