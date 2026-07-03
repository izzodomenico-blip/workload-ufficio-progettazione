// Crea una copia COERENTE del database SQLite (include il contenuto del WAL),
// funziona anche mentre il server è acceso. Uso:
//   node snapshot-db.mjs <sorgente.db> <destinazione.db>
import { DatabaseSync } from 'node:sqlite'

const [, , src, dst] = process.argv
if (!src || !dst) {
  console.error('Uso: node snapshot-db.mjs <sorgente.db> <destinazione.db>')
  process.exit(1)
}

const db = new DatabaseSync(src)
try {
  // VACUUM INTO vuole una stringa fra apici SINGOLI (gli apici doppi in SQLite
  // sono identificatori). Raddoppio eventuali apici singoli nel percorso.
  db.exec("VACUUM INTO '" + dst.replace(/'/g, "''") + "'")
  console.log('Snapshot creato: ' + dst)
} finally {
  db.close()
}
