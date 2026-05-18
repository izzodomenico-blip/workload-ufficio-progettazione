import fs from 'node:fs'
import path from 'node:path'
import { DB_PATH, ROOT_DIR, getAppData, getDb } from './db.js'
import { createBackupPayload, timestampForFilename } from './services/appData.js'

const db = getDb()
const backupsDir = path.join(ROOT_DIR, 'backups')
fs.mkdirSync(backupsDir, { recursive: true })

const stamp = timestampForFilename(new Date())
const jsonPath = path.join(backupsDir, `backup_workload_ufficio_${stamp}.json`)
const dbPath = path.join(backupsDir, `backup_workload_db_${stamp}.db`)

const appData = getAppData(db)
fs.writeFileSync(jsonPath, JSON.stringify(createBackupPayload(appData), null, 2), 'utf8')

const escapedDbPath = dbPath.replaceAll("'", "''")
db.exec(`VACUUM INTO '${escapedDbPath}';`)

console.log(`Backup JSON creato: ${jsonPath}`)
console.log(`Backup database creato: ${dbPath}`)
console.log(`Database sorgente: ${DB_PATH}`)
