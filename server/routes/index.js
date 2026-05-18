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
      next(badRequest(error))
    }
  })

  router.get('/backup/status', (_req, res) => {
    res.json(getBackupStatus())
  })

  registerCollectionRoutes(router, {
    apiName: 'people',
    collection: 'people',
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

function registerCollectionRoutes(router, { apiName, collection }) {
  router.get(`/${apiName}`, (_req, res) => {
    res.json(getCollection(collection))
  })

  router.post(`/${apiName}`, (req, res, next) => {
    try {
      const saved = upsertEntity(collection, req.body)
      scheduleAutoBackup(`${collection}-created`)
      res.status(201).json(saved)
    } catch (error) {
      next(badRequest(error))
    }
  })

  router.put(`/${apiName}/:id`, (req, res, next) => {
    try {
      const current = getCollection(collection).find((item) => item.id === req.params.id)
      if (!current) {
        res.status(404).json({ error: 'Elemento non trovato.' })
        return
      }
      const saved = upsertEntity(collection, { ...current, ...req.body, id: req.params.id })
      scheduleAutoBackup(`${collection}-updated`)
      res.json(saved)
    } catch (error) {
      next(badRequest(error))
    }
  })

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

function mutationReason(req, fallback) {
  const headerReason = req.get('x-workload-mutation-reason')
  return headerReason && headerReason.trim().length > 0 ? headerReason.trim() : fallback
}

function badRequest(error) {
  const err = new Error(error instanceof Error ? error.message : 'Richiesta non valida.')
  err.statusCode = 400
  return err
}
