import { DB_PATH } from './db.js'
import { createManualBackup } from './backupService.js'

const backup = createManualBackup('manual-script')

console.log(`Backup JSON creato: ${backup.jsonPath}`)
console.log(`Backup database creato: ${backup.dbPath}`)
console.log(`Database sorgente: ${DB_PATH}`)
