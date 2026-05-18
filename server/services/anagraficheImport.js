import { XMLParser } from 'fast-xml-parser'

const VALID_TYPES = new Set(['cliente', 'fornitore', 'personale', 'altro'])

// Mappa colonna XML → campo BusinessPartner (per nome di header).
const HEADER_MAP = {
  conto: 'accountCode',
  'ragione sociale': 'name',
  'partita iva': 'vatNumber',
  'p.iva': 'vatNumber',
  piva: 'vatNumber',
  'codice fiscale': 'fiscalCode',
  cf: 'fiscalCode',
  'senza p.iva': '__skip__',
  indirizzo: 'address',
  cap: 'postalCode',
  'località': 'city',
  localita: 'city',
  prov: 'province',
  provincia: 'province',
  nazione: 'country',
  'codice sdi': 'sdiCode',
  sdi: 'sdiCode',
  telefono: 'phone',
  'cod pag': 'paymentCode',
  pagamento: 'paymentDescription',
  'banca di appoggio': 'bankName',
  banca: 'bankName',
  abi: 'abi',
  cab: 'cab',
  'banca presentazione': '__skip__',
  'cod. iva/esenzione': 'vatExemptionCode',
  'cod iva/esenzione': 'vatExemptionCode',
  'codice iva': 'vatExemptionCode',
  email: 'email',
  pec: 'pec',
  saldo: 'balance',
  esposizione: 'exposure',
  fido: 'creditLimit',
  'fuori fido': 'overCreditLimit',
  rischio: 'risk',
  // optional explicit type column
  tipo: 'type',
  type: 'type',
  active: 'active',
  attivo: 'active',
  note: 'notes',
  notes: 'notes',
}

function normalizeHeader(value) {
  if (value === undefined || value === null) return ''
  return String(value).trim().toLowerCase()
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return undefined
  const s = String(value).trim()
  if (s === '') return undefined
  // Excel sometimes uses comma as decimal separator
  const cleaned = s.replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  if (Number.isFinite(n)) return n
  const n2 = Number(s)
  return Number.isFinite(n2) ? n2 : undefined
}

function toString(value) {
  if (value === undefined || value === null) return undefined
  const s = String(value).trim()
  return s === '' ? undefined : s
}

function ensureArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

// Walk a Row element's cells into a column-indexed object.
function rowCellsToColumns(row) {
  const cells = ensureArray(row?.Cell)
  const out = {}
  let col = 0
  for (const cell of cells) {
    const idx = cell?.['@_ss:Index']
    if (idx) col = Number(idx)
    else col += 1
    const dataNode = cell?.Data
    let value
    if (dataNode === undefined || dataNode === null) value = ''
    else if (typeof dataNode === 'object') value = dataNode['#text'] ?? ''
    else value = dataNode
    out[col] = value
  }
  return out
}

function isLikelyHeaderRow(row) {
  const cols = rowCellsToColumns(row)
  return Object.values(cols).some((v) => normalizeHeader(v) === 'conto')
}

function detectColumnsMap(headerRow) {
  const cols = rowCellsToColumns(headerRow)
  const map = {}
  for (const [colStr, value] of Object.entries(cols)) {
    const key = normalizeHeader(value)
    if (!key) continue
    const field = HEADER_MAP[key]
    if (field) map[Number(colStr)] = field
  }
  return map
}

function buildRecord(row, columnsMap) {
  const cells = rowCellsToColumns(row)
  const record = { type: 'cliente', active: true }
  for (const [colStr, field] of Object.entries(columnsMap)) {
    if (field === '__skip__') continue
    const col = Number(colStr)
    const raw = cells[col]
    if (raw === undefined) continue
    switch (field) {
      case 'balance':
      case 'exposure':
      case 'creditLimit':
      case 'overCreditLimit':
      case 'risk': {
        const n = toNumber(raw)
        if (n !== undefined) record[field] = n
        break
      }
      case 'type': {
        const t = normalizeHeader(raw)
        record.type = VALID_TYPES.has(t) ? t : 'cliente'
        break
      }
      case 'active': {
        const s = String(raw).trim().toLowerCase()
        record.active = !(s === '0' || s === 'no' || s === 'false' || s === 'inattivo' || s === 'disattivato')
        break
      }
      default: {
        const s = toString(raw)
        if (s !== undefined) record[field] = s
      }
    }
  }
  return record
}

function isUsableRecord(record) {
  const hasName = typeof record.name === 'string' && record.name.trim().length > 0
  if (!hasName) return false
  const hasAnyId = !!record.accountCode || !!record.vatNumber || !!record.fiscalCode
  return hasAnyId
}

function findTable(workbook) {
  const worksheets = ensureArray(workbook?.Worksheet)
  for (const ws of worksheets) {
    if (ws?.Table) return ws.Table
  }
  return null
}

/**
 * Parse an Excel SpreadsheetML 2003 XML string. Returns:
 *  { records: BusinessPartner-like records[], totalRows, headerFound, skipped, errors }
 */
export function parseAnagraficheXml(xmlText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    trimValues: true,
    isArray: (name) => name === 'Cell' || name === 'Row' || name === 'Worksheet',
  })

  let parsed
  try {
    parsed = parser.parse(xmlText)
  } catch (err) {
    throw new Error(`XML non valido: ${err instanceof Error ? err.message : String(err)}`)
  }

  const workbook = parsed?.Workbook
  if (!workbook) throw new Error('Struttura XML non riconosciuta: manca <Workbook>.')

  const table = findTable(workbook)
  if (!table) throw new Error('Nessun <Worksheet><Table> trovato nel file XML.')

  const rows = ensureArray(table.Row)

  // Trova header row (la prima riga che contiene "Conto" in una qualsiasi cella).
  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (isLikelyHeaderRow(rows[i])) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) {
    throw new Error('Riga di intestazione non trovata (cerco una cella con valore "Conto").')
  }

  const columnsMap = detectColumnsMap(rows[headerIdx])
  if (Object.keys(columnsMap).length === 0) {
    throw new Error('Intestazione trovata ma nessuna colonna riconosciuta.')
  }

  const records = []
  const errors = []
  let skipped = 0
  let totalRows = 0
  for (let i = headerIdx + 1; i < rows.length; i++) {
    totalRows++
    try {
      const record = buildRecord(rows[i], columnsMap)
      if (!isUsableRecord(record)) {
        skipped++
        continue
      }
      records.push(record)
    } catch (err) {
      errors.push(`Riga ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    records,
    totalRows,
    headerFound: true,
    skipped,
    errors,
  }
}
