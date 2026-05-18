import { DB_PATH, getDb, isDatabaseEmpty, saveAppData } from './db.js'
import { freshSeedData } from './services/seedData.js'

const db = getDb()

if (!isDatabaseEmpty(db) && process.argv.includes('--force') === false) {
  console.log(`Database già popolato, seed non eseguito: ${DB_PATH}`)
  console.log('Usa npm run db:seed -- --force per sostituire i dati con il demo.')
  process.exit(0)
}

saveAppData(freshSeedData(), db)
console.log(`Database demo creato: ${DB_PATH}`)
