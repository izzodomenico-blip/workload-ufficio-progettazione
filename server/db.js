import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMPTY_APP_DATA, normalizeAppData } from './services/appData.js'
import { seedDefaultMachineTypes } from './services/machineTypesSeed.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const ROOT_DIR = path.resolve(__dirname, '..')
export const DATA_DIR = process.env.WORKLOAD_DATA_DIR
  ? path.resolve(process.env.WORKLOAD_DATA_DIR)
  : path.join(ROOT_DIR, 'data')
export const DB_PATH = process.env.WORKLOAD_DB_PATH
  ? path.resolve(process.env.WORKLOAD_DB_PATH)
  : path.join(DATA_DIR, 'workload.db')

const TABLES = {
  people: 'people',
  workItems: 'work_items',
  tasks: 'tasks',
  absences: 'absences',
  activityLog: 'activity_log',
  notifications: 'notifications',
  businessPartners: 'business_partners',
  machineTypes: 'machine_types',
}

let dbInstance = null

export function getDb() {
  if (dbInstance) return dbInstance
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  runMigrations(db)
  seedDefaultMachineTypes(db)
  dbInstance = db
  return db
}

export function runMigrations(db = getDb()) {
  const migrationsDir = path.join(__dirname, 'migrations')
  const files = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  for (const file of files) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
  }
  // schemaVersion riflette il numero di migrazioni applicate.
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schemaVersion', String(files.length))
}

export function isDatabaseEmpty(db = getDb()) {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM people) AS people,
      (SELECT COUNT(*) FROM work_items) AS workItems,
      (SELECT COUNT(*) FROM tasks) AS tasks
  `).get()
  return Number(row.people) === 0 && Number(row.workItems) === 0 && Number(row.tasks) === 0
}

export function getAppData(db = getDb()) {
  return {
    people: readJsonRows(db, TABLES.people),
    workItems: readJsonRows(db, TABLES.workItems),
    tasks: readJsonRows(db, TABLES.tasks),
    absences: readJsonRows(db, TABLES.absences),
    activityLog: readJsonRows(db, TABLES.activityLog, 'timestamp DESC'),
    notifications: readJsonRows(db, TABLES.notifications, 'timestamp DESC'),
    businessPartners: readJsonRows(db, TABLES.businessPartners, 'name COLLATE NOCASE ASC'),
    machineTypes: readJsonRows(db, TABLES.machineTypes, 'code COLLATE NOCASE ASC'),
  }
}

export function saveAppData(data, db = getDb()) {
  const normalized = normalizeAppData(data)
  const now = new Date().toISOString()
  db.exec('BEGIN IMMEDIATE TRANSACTION;')
  try {
    replaceTable(db, TABLES.people, normalized.people, now)
    replaceTable(db, TABLES.workItems, normalized.workItems, now)
    replaceTable(db, TABLES.tasks, normalized.tasks, now)
    replaceTable(db, TABLES.absences, normalized.absences, now)
    replaceActivityLog(db, normalized.activityLog, now)
    replaceNotifications(db, normalized.notifications, now)
    replaceBusinessPartners(db, normalized.businessPartners, now)
    replaceMachineTypes(db, normalized.machineTypes, now)
    db.exec('COMMIT;')
  } catch (error) {
    db.exec('ROLLBACK;')
    throw error
  }
  return normalized
}

export function savePeople(people, db = getDb()) {
  const normalized = normalizeAppData({ ...getAppData(db), people })
  const now = new Date().toISOString()
  db.exec('BEGIN IMMEDIATE TRANSACTION;')
  try {
    replaceTable(db, TABLES.people, normalized.people, now)
    db.exec('COMMIT;')
  } catch (error) {
    db.exec('ROLLBACK;')
    throw error
  }
  return normalized.people
}

export function getCollection(name, db = getDb()) {
  const appData = getAppData(db)
  if (!(name in appData)) throw new Error(`Collezione non supportata: ${name}`)
  return appData[name]
}

export function upsertEntity(collection, entity, db = getDb()) {
  if (!entity || typeof entity !== 'object' || typeof entity.id !== 'string') {
    throw new Error('Entità non valida: manca id.')
  }
  const appData = getAppData(db)
  const rows = appData[collection]
  if (!Array.isArray(rows)) throw new Error(`Collezione non supportata: ${collection}`)
  const index = rows.findIndex((item) => item.id === entity.id)
  const nextRows = index >= 0
    ? rows.map((item) => (item.id === entity.id ? { ...item, ...entity, id: item.id } : item))
    : [...rows, entity]
  saveAppData({ ...appData, [collection]: nextRows }, db)
  return nextRows.find((item) => item.id === entity.id)
}

export function deleteEntity(collection, id, db = getDb()) {
  const appData = getAppData(db)
  const rows = appData[collection]
  if (!Array.isArray(rows)) throw new Error(`Collezione non supportata: ${collection}`)
  let nextData = { ...appData, [collection]: rows.filter((item) => item.id !== id) }
  if (collection === 'workItems') {
    nextData = {
      ...nextData,
      tasks: nextData.tasks.filter((task) => task.workItemId !== id),
    }
  }
  saveAppData(nextData, db)
}

export function closeDb() {
  if (!dbInstance) return
  dbInstance.close()
  dbInstance = null
}

function readJsonRows(db, table, orderBy = 'rowid ASC') {
  const stmt = db.prepare(`SELECT data FROM ${table} ORDER BY ${orderBy}`)
  return stmt.all().map((row) => JSON.parse(row.data))
}

function replaceTable(db, table, rows, now) {
  db.prepare(`DELETE FROM ${table}`).run()
  const insert = db.prepare(`INSERT INTO ${table} (id, data, updated_at) VALUES (?, ?, ?)`)
  for (const row of rows) {
    insert.run(row.id, JSON.stringify(row), now)
  }
}

function replaceActivityLog(db, rows, now) {
  db.prepare('DELETE FROM activity_log').run()
  const insert = db.prepare('INSERT INTO activity_log (id, timestamp, data, updated_at) VALUES (?, ?, ?, ?)')
  for (const row of rows) {
    insert.run(row.id, row.timestamp, JSON.stringify(row), now)
  }
}

function replaceNotifications(db, rows, now) {
  db.prepare('DELETE FROM notifications').run()
  const insert = db.prepare('INSERT INTO notifications (id, timestamp, read, data, updated_at) VALUES (?, ?, ?, ?, ?)')
  for (const row of rows) {
    insert.run(row.id, row.timestamp, row.read ? 1 : 0, JSON.stringify(row), now)
  }
}

function replaceBusinessPartners(db, rows, now) {
  db.prepare('DELETE FROM business_partners').run()
  const insert = db.prepare(`
    INSERT INTO business_partners
      (id, account_code, name, type, vat_number, fiscal_code, email, pec, city, active, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const row of rows) {
    insert.run(
      row.id,
      row.accountCode ?? null,
      row.name,
      row.type,
      row.vatNumber ?? null,
      row.fiscalCode ?? null,
      row.email ?? null,
      row.pec ?? null,
      row.city ?? null,
      row.active ? 1 : 0,
      JSON.stringify(row),
      now,
    )
  }
}

function replaceMachineTypes(db, rows, now) {
  db.prepare('DELETE FROM machine_types').run()
  const insert = db.prepare(`
    INSERT INTO machine_types
      (id, code, name, family, active, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  for (const row of rows) {
    insert.run(
      row.id,
      row.code,
      row.name,
      row.family,
      row.active ? 1 : 0,
      JSON.stringify(row),
      now,
    )
  }
}

export function emptyAppData() {
  return structuredClone(EMPTY_APP_DATA)
}
