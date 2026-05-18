import { DB_PATH, getAppData, getDb, savePeople } from './db.js'
import { repairRequiredOfficePeople } from './services/officePeople.js'

const db = getDb()
const appData = getAppData(db)
const { people, changes } = repairRequiredOfficePeople(appData.people)

if (changes.length === 0) {
  console.log(`Persone ufficio tecnico gia corrette: ${DB_PATH}`)
  process.exit(0)
}

savePeople(people, db)

console.log(`Database riparato senza toccare lavori, task, assenze, storico o notifiche: ${DB_PATH}`)
for (const change of changes) {
  const label = change.action === 'added' ? 'aggiunta' : 'aggiornata/riattivata'
  console.log(`- ${change.name} (${change.id}): ${label}`)
}
