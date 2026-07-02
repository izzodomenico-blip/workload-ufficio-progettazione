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
  workshopOutputs: 'workshop_outputs',
  workshopWorkers: 'workshop_workers',
  workshopAssignments: 'workshop_assignments',
  calculatedStandardComponents: 'calculated_standard_components',
  consuntivi: 'consuntivi',
  tubeProfiles: 'tube_profiles',
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
  ensureMachineTypesPresent(db)
  return normalizeAppData({
    people: readJsonRows(db, TABLES.people),
    workItems: readJsonRows(db, TABLES.workItems),
    tasks: readJsonRows(db, TABLES.tasks),
    absences: readJsonRows(db, TABLES.absences),
    activityLog: readJsonRows(db, TABLES.activityLog, 'timestamp DESC'),
    notifications: readJsonRows(db, TABLES.notifications, 'timestamp DESC'),
    businessPartners: readJsonRows(db, TABLES.businessPartners, 'name COLLATE NOCASE ASC'),
    machineTypes: readJsonRows(db, TABLES.machineTypes, 'code COLLATE NOCASE ASC'),
    workshopOutputs: readJsonRows(db, TABLES.workshopOutputs, 'planned_release_date ASC, rowid ASC'),
    workshopWorkers: readJsonRows(db, TABLES.workshopWorkers, 'display_name COLLATE NOCASE ASC'),
    workshopAssignments: readJsonRows(db, TABLES.workshopAssignments, 'planned_date ASC, rowid ASC'),
    calculatedStandardComponents: readJsonRows(db, TABLES.calculatedStandardComponents, 'rowid ASC'),
    consuntivi: readJsonRows(db, TABLES.consuntivi, 'date DESC, rowid ASC'),
    tubeProfiles: readJsonRows(db, TABLES.tubeProfiles, 'label COLLATE NOCASE ASC'),
  })
}

export function saveAppData(data, db = getDb()) {
  const normalized = normalizeAppData(data)
  const safeData = {
    ...normalized,
    machineTypes: preserveExistingMachineTypesIfEmpty(db, normalized.machineTypes),
    // Rete di sicurezza: scarta i componenti standard calcolati il cui output
    // non esiste piu. Garantisce la cancellazione a cascata anche se il client
    // invia un payload con orfani (output eliminato senza pulire i componenti).
    calculatedStandardComponents: dropOrphanCalculatedStandards(
      normalized.calculatedStandardComponents,
      normalized.workshopOutputs,
    ),
  }
  const now = new Date().toISOString()
  db.exec('BEGIN IMMEDIATE TRANSACTION;')
  try {
    replaceTable(db, TABLES.people, safeData.people, now)
    replaceTable(db, TABLES.workItems, safeData.workItems, now)
    replaceTable(db, TABLES.tasks, safeData.tasks, now)
    replaceTable(db, TABLES.absences, safeData.absences, now)
    replaceActivityLog(db, safeData.activityLog, now)
    replaceNotifications(db, safeData.notifications, now)
    replaceBusinessPartners(db, safeData.businessPartners, now)
    replaceMachineTypes(db, safeData.machineTypes, now)
    replaceWorkshopOutputs(db, safeData.workshopOutputs, now)
    replaceWorkshopWorkers(db, safeData.workshopWorkers, now)
    replaceWorkshopAssignments(db, safeData.workshopAssignments, now)
    replaceCalculatedStandardComponents(db, safeData.calculatedStandardComponents ?? [], now)
    replaceConsuntivi(db, safeData.consuntivi ?? [], now)
    replaceTubeProfiles(db, safeData.tubeProfiles ?? [], now)
    bumpDataRevision(db, now)
    db.exec('COMMIT;')
  } catch (error) {
    db.exec('ROLLBACK;')
    throw error
  }
  return safeData
}

function dropOrphanCalculatedStandards(components, workshopOutputs) {
  const list = Array.isArray(components) ? components : []
  if (list.length === 0) return list
  const outputIds = new Set((Array.isArray(workshopOutputs) ? workshopOutputs : []).map((output) => output.id))
  return list.filter((component) => outputIds.has(component.workshopOutputId))
}

export function savePeople(people, db = getDb()) {
  const normalized = normalizeAppData({ ...getAppData(db), people })
  const now = new Date().toISOString()
  db.exec('BEGIN IMMEDIATE TRANSACTION;')
  try {
    replaceTable(db, TABLES.people, normalized.people, now)
    bumpDataRevision(db, now)
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
      workshopOutputs: nextData.workshopOutputs.filter((output) => output.workItemId !== id),
      workshopAssignments: nextData.workshopAssignments.filter((assignment) => assignment.workItemId !== id),
      calculatedStandardComponents: (nextData.calculatedStandardComponents ?? []).filter((component) => component.workItemId !== id),
    }
  } else if (collection === 'workshopOutputs') {
    nextData = {
      ...nextData,
      workshopAssignments: nextData.workshopAssignments.filter((assignment) => assignment.workshopOutputId !== id),
      calculatedStandardComponents: (nextData.calculatedStandardComponents ?? []).filter((component) => component.workshopOutputId !== id),
    }
  }
  saveAppData(nextData, db)
}

export function closeDb() {
  if (!dbInstance) return
  dbInstance.close()
  dbInstance = null
}

export function getDataRevision(db = getDb()) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('dataRevision')
  const value = row ? Number(row.value) : 0
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

export function getLastMutationAt(db = getDb()) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('lastMutationAt')
  return typeof row?.value === 'string' ? row.value : null
}

const CONSUNTIVI_CONFIG_KEY = 'consuntiviConfig'

export function getConsuntiviConfig(db = getDb()) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(CONSUNTIVI_CONFIG_KEY)
  if (!row || typeof row.value !== 'string') return null
  try {
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

export function saveConsuntiviConfig(config, db = getDb()) {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(CONSUNTIVI_CONFIG_KEY, JSON.stringify(config))
  return config
}

function bumpDataRevision(db, now) {
  const nextRevision = getDataRevision(db) + 1
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('dataRevision', String(nextRevision))
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('lastMutationAt', now)
  return nextRevision
}

function readJsonRows(db, table, orderBy = 'rowid ASC') {
  const stmt = db.prepare(`SELECT data FROM ${table} ORDER BY ${orderBy}`)
  return stmt.all().map((row) => JSON.parse(row.data))
}

function ensureMachineTypesPresent(db) {
  const row = db.prepare('SELECT COUNT(*) AS count FROM machine_types').get()
  if (Number(row.count) === 0) seedDefaultMachineTypes(db)
}

function preserveExistingMachineTypesIfEmpty(db, incomingRows) {
  if (incomingRows.length > 0) return incomingRows
  const current = readJsonRows(db, TABLES.machineTypes, 'code COLLATE NOCASE ASC')
  return current.length > 0 ? normalizeAppData({ ...EMPTY_APP_DATA, machineTypes: current }).machineTypes : incomingRows
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

function replaceWorkshopOutputs(db, rows, now) {
  db.prepare('DELETE FROM workshop_outputs').run()
  const insert = db.prepare(`
    INSERT INTO workshop_outputs
      (id, work_item_id, machine_type_id, machine_type_code, status, planned_release_date, actual_release_date, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const row of rows) {
    insert.run(
      row.id,
      row.workItemId,
      row.machineTypeId || null,
      row.machineTypeCode,
      row.status,
      row.plannedReleaseDate || null,
      row.actualReleaseDate || null,
      JSON.stringify(row),
      now,
    )
  }
}

function replaceWorkshopWorkers(db, rows, now) {
  db.prepare('DELETE FROM workshop_workers').run()
  const insert = db.prepare(`
    INSERT INTO workshop_workers
      (id, employee_code, display_name, department, primary_skill, active, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const row of rows) {
    insert.run(
      row.id,
      row.employeeCode || null,
      row.displayName,
      row.department || null,
      row.primarySkill || null,
      row.active ? 1 : 0,
      JSON.stringify(row),
      now,
    )
  }
}

function replaceWorkshopAssignments(db, rows, now) {
  db.prepare('DELETE FROM workshop_assignments').run()
  const insert = db.prepare(`
    INSERT INTO workshop_assignments
      (id, workshop_output_id, work_item_id, worker_id, process, planned_date, planned_week, status, load_points, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const row of rows) {
    insert.run(
      row.id,
      row.workshopOutputId,
      row.workItemId,
      row.workerId,
      row.process,
      row.plannedDate,
      row.plannedWeek,
      row.status,
      row.loadPoints,
      JSON.stringify(row),
      now,
    )
  }
}

function replaceCalculatedStandardComponents(db, rows, now) {
  db.prepare('DELETE FROM calculated_standard_components').run()
  const insert = db.prepare(`
    INSERT INTO calculated_standard_components
      (id, workshop_output_id, work_item_id, machine_type_code, component_code, process, quantity, source, ready_from_date, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const row of rows) {
    insert.run(
      row.id,
      row.workshopOutputId,
      row.workItemId,
      row.machineTypeCode,
      row.componentCode || null,
      row.process,
      Number.isFinite(row.quantity) ? Math.max(0, Math.round(row.quantity)) : 0,
      row.source || 'manual',
      row.readyFromDate || null,
      JSON.stringify(row),
      now,
    )
  }
}

function replaceConsuntivi(db, rows, now) {
  db.prepare('DELETE FROM consuntivi').run()
  const insert = db.prepare('INSERT INTO consuntivi (id, work_item_id, date, data, updated_at) VALUES (?, ?, ?, ?, ?)')
  for (const row of rows) {
    insert.run(row.id, row.workItemId || null, row.date || null, JSON.stringify(row), now)
  }
}

function replaceTubeProfiles(db, rows, now) {
  db.prepare('DELETE FROM tube_profiles').run()
  const insert = db.prepare('INSERT INTO tube_profiles (id, categoria, label, active, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
  for (const row of rows) {
    insert.run(row.id, row.categoria || null, row.label || null, row.active ? 1 : 0, JSON.stringify(row), now)
  }
}

export function emptyAppData() {
  return structuredClone(EMPTY_APP_DATA)
}
