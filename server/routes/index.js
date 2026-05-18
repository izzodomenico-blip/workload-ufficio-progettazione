import { Router } from 'express'
import {
  deleteEntity,
  getAppData,
  getCollection,
  saveAppData,
  upsertEntity,
} from '../db.js'
import { extractAppData } from '../services/appData.js'

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
      res.json(saveAppData(data))
    } catch (error) {
      next(badRequest(error))
    }
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
      res.json(saved)
    } catch (error) {
      next(badRequest(error))
    }
  })

  router.delete(`/${apiName}/:id`, (req, res, next) => {
    try {
      deleteEntity(collection, req.params.id)
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })
}

function badRequest(error) {
  const err = new Error(error instanceof Error ? error.message : 'Richiesta non valida.')
  err.statusCode = 400
  return err
}
