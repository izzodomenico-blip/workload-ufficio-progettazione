import type { WorkBook } from 'xlsx'
import {
  ALL_WORKSHOP_WORKER_SKILLS,
  WORKSHOP_WORKER_SKILL_LABELS,
} from '../types'
import type { WorkshopWorker, WorkshopWorkerSkill } from '../types'

export type WorkshopWorkerImportField =
  | 'employeeCode'
  | 'firstName'
  | 'lastName'
  | 'displayName'
  | 'role'
  | 'department'
  | 'employmentType'
  | 'phone'
  | 'mobilePhone'
  | 'email'
  | 'address'
  | 'city'
  | 'province'
  | 'fiscalCode'
  | 'birthDate'
  | 'hireDate'
  | 'notes'
  | 'extraFields'

export interface RecognizedColumn {
  header: string
  field: WorkshopWorkerImportField
  label: string
}

export interface WorkshopWorkerImportRecord {
  decision: 'create' | 'update' | 'skip'
  matchedBy?: 'employeeCode' | 'fiscalCode' | 'displayName+phone'
  matchedId?: string
  reason?: string
  worker: Omit<WorkshopWorker, 'id' | 'createdAt' | 'updatedAt'>
  rowNumber: number
}

export interface WorkshopWorkerImportPlan {
  fileName: string
  sheetName: string
  headers: string[]
  recognizedColumns: RecognizedColumn[]
  unrecognizedColumns: string[]
  totalRows: number
  recordsRead: number
  toCreate: number
  toUpdate: number
  toSkip: number
  possibleDuplicates: number
  errors: string[]
  items: WorkshopWorkerImportRecord[]
}

type Row = unknown[]
type XlsxModule = typeof import('xlsx')

const FIELD_LABELS: Record<WorkshopWorkerImportField, string> = {
  employeeCode: 'Codice / matricola',
  firstName: 'Nome',
  lastName: 'Cognome',
  displayName: 'Nominativo',
  role: 'Mansione / qualifica',
  department: 'Reparto',
  employmentType: 'Tipo contratto',
  phone: 'Telefono',
  mobilePhone: 'Cellulare',
  email: 'Email',
  address: 'Indirizzo',
  city: 'Citta',
  province: 'Provincia',
  fiscalCode: 'Codice fiscale',
  birthDate: 'Data nascita',
  hireDate: 'Data assunzione',
  notes: 'Note',
  extraFields: 'Dettagli extra',
}

const SKILL_SET = new Set<string>(ALL_WORKSHOP_WORKER_SKILLS)

export async function parseWorkshopWorkersExcel(
  file: File,
  existingWorkers: WorkshopWorker[],
): Promise<WorkshopWorkerImportPlan> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const candidate = findBestSheet(workbook, XLSX)
  if (!candidate) {
    return emptyPlan(file.name, 'Nessun foglio leggibile nel file Excel.')
  }

  const rows = candidate.rows
  const headers = candidate.headers
  const columnMap = headers.map((header) => ({ header, field: recognizeHeader(header) }))
  const recognizedColumns = columnMap
    .filter((column): column is { header: string; field: WorkshopWorkerImportField } => Boolean(column.field))
    .map((column) => ({ ...column, label: FIELD_LABELS[column.field] }))
  const unrecognizedColumns = columnMap
    .filter((column) => !column.field && column.header.trim())
    .map((column) => column.header)
  const matcher = buildMatcher(existingWorkers)
  const seenKeys = new Set<string>()
  const items: WorkshopWorkerImportRecord[] = []
  const errors: string[] = []
  let possibleDuplicates = 0

  rows.slice(candidate.headerIndex + 1).forEach((row, offset) => {
    const rowNumber = candidate.headerIndex + offset + 2
    if (rowIsEmpty(row)) return
    const worker = rowToWorker(row, headers, columnMap)
    if (!worker.displayName && !worker.firstName && !worker.lastName) {
      items.push({
        decision: 'skip',
        reason: 'Manca nome/cognome o nominativo.',
        rowNumber,
        worker,
      })
      return
    }
    const key = dedupeKey(worker)
    if (key && seenKeys.has(key)) {
      possibleDuplicates++
      items.push({
        decision: 'skip',
        reason: 'Possibile duplicato nello stesso file.',
        rowNumber,
        worker,
      })
      return
    }
    if (key) seenKeys.add(key)

    const match = findMatch(worker, matcher)
    if (match) {
      items.push({
        decision: 'update',
        matchedBy: match.by,
        matchedId: match.worker.id,
        rowNumber,
        worker,
      })
    } else {
      items.push({
        decision: 'create',
        rowNumber,
        worker,
      })
    }
  })

  if (recognizedColumns.length === 0) {
    errors.push('Nessuna colonna riconosciuta: controlla che il file abbia intestazioni tipo Nome, Mansione, Cellulare, Email.')
  }

  return {
    fileName: file.name,
    sheetName: candidate.sheetName,
    headers,
    recognizedColumns,
    unrecognizedColumns,
    totalRows: Math.max(0, rows.length - candidate.headerIndex - 1),
    recordsRead: items.filter((item) => item.decision !== 'skip').length,
    toCreate: items.filter((item) => item.decision === 'create').length,
    toUpdate: items.filter((item) => item.decision === 'update').length,
    toSkip: items.filter((item) => item.decision === 'skip').length,
    possibleDuplicates,
    errors,
    items,
  }
}

function emptyPlan(fileName: string, error: string): WorkshopWorkerImportPlan {
  return {
    fileName,
    sheetName: '',
    headers: [],
    recognizedColumns: [],
    unrecognizedColumns: [],
    totalRows: 0,
    recordsRead: 0,
    toCreate: 0,
    toUpdate: 0,
    toSkip: 0,
    possibleDuplicates: 0,
    errors: [error],
    items: [],
  }
}

function findBestSheet(workbook: WorkBook, xlsx: XlsxModule): { sheetName: string; rows: Row[]; headerIndex: number; headers: string[] } | null {
  let best: { sheetName: string; rows: Row[]; headerIndex: number; headers: string[]; score: number } | null = null
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = xlsx.utils.sheet_to_json<Row>(sheet, { header: 1, raw: true, defval: '' })
    if (rows.length === 0) continue
    rows.slice(0, 15).forEach((row, headerIndex) => {
      const headers = row.map(cellToString)
      const score = headers.reduce((sum, header) => sum + (recognizeHeader(header) ? 1 : 0), 0)
      if (score >= 2 && (!best || score > best.score)) {
        best = { sheetName, rows, headerIndex, headers, score }
      }
    })
  }
  return best
}

function rowToWorker(
  row: Row,
  headers: string[],
  columnMap: Array<{ header: string; field: WorkshopWorkerImportField | null }>,
): Omit<WorkshopWorker, 'id' | 'createdAt' | 'updatedAt'> {
  const values: Partial<Record<WorkshopWorkerImportField, string>> = {}
  const extraFields: Record<string, string> = {}
  columnMap.forEach((column, index) => {
    const value = cellToString(row[index])
    if (!value) return
    if (!column.field) {
      if (headers[index]) extraFields[headers[index]] = value
      return
    }
    if (column.field === 'extraFields') {
      extraFields[column.header] = value
      return
    }
    if (column.field === 'birthDate' && normalizeHeader(column.header).includes('luogo')) {
      extraFields[column.header] = value
    }
    if (column.field === 'role') {
      const headerKey = normalizeHeader(column.header)
      if (!values.role || headerKey.includes('mansioni')) values.role = value
      return
    }
    if (!values[column.field]) values[column.field] = value
  })

  const displaySource = values.displayName || [values.firstName, values.lastName].filter(Boolean).join(' ')
  const split = splitName(displaySource)
  const firstName = values.firstName || split.firstName
  const lastName = values.lastName || split.lastName
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || displaySource
  const birthDate = values.birthDate ? extractDate(values.birthDate) : ''
  const cityParts = splitCityProvince(values.city ?? '')
  const skillSource = `${values.role ?? ''} ${values.department ?? ''}`
  const skills = mapSkills(skillSource)

  return {
    employeeCode: values.employeeCode ?? '',
    firstName,
    lastName,
    displayName,
    role: values.role ?? '',
    department: values.department ?? '',
    employmentType: values.employmentType ?? '',
    phone: values.phone ?? '',
    mobilePhone: values.mobilePhone ?? '',
    email: values.email ?? '',
    address: values.address ?? '',
    city: cityParts.city,
    province: values.province ?? cityParts.province,
    fiscalCode: (values.fiscalCode ?? '').toUpperCase(),
    birthDate,
    hireDate: values.hireDate ? extractDate(values.hireDate) : '',
    skills,
    primarySkill: skills[0] ?? '',
    dailyCapacityPoints: 100,
    weeklyCapacityPoints: 500,
    active: true,
    notes: values.notes ?? '',
    extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
  }
}

function recognizeHeader(header: string): WorkshopWorkerImportField | null {
  const h = normalizeHeader(header)
  if (!h) return null
  if (['n', 'numero'].includes(h)) return 'extraFields'
  if (h === 'nome') return 'displayName'
  if (h === 'cognome') return 'lastName'
  if (h === 'nominativo' || h === 'dipendente' || h === 'nomecognome' || h === 'cognomenome') return 'displayName'
  if (h.includes('matricolainps') || h.includes('matricolainail')) return 'extraFields'
  if (h.includes('matricola') || h === 'codice' || h === 'codicedipendente') return 'employeeCode'
  if (h.includes('codicefiscale') || h === 'codfiscale') return 'fiscalCode'
  if (h.includes('luogoedatanascita') || h.includes('datanascita')) return 'birthDate'
  if (h.includes('dataassunzione') || h === 'dataas' || h === 'dataass') return 'hireDate'
  if (h.includes('mansioni') || h === 'mansione' || h === 'qualifica') return 'role'
  if (h.includes('reparto') || h.includes('areaaziendale')) return 'department'
  if (h.includes('tipocontratto') || h.includes('contratto')) return 'employmentType'
  if (h === 'telefono' || h === 'tel') return 'phone'
  if (h.includes('cellulare') || h.includes('mobile')) return 'mobilePhone'
  if (h === 'email' || h === 'mail') return 'email'
  if (h.includes('indirizzo')) return 'address'
  if (h === 'citta' || h === 'comune') return 'city'
  if (h === 'provincia' || h === 'prov') return 'province'
  if (h === 'note' || h === 'annotazioni') return 'notes'
  if (['cap', 'sesso', 'cittadinanza', 'liv', 'livello', 'titolodistudio', 'categoriaprotetta'].includes(h)) return 'extraFields'
  return null
}

function mapSkills(text: string): WorkshopWorkerSkill[] {
  const source = normalizeHeader(text)
  const skills: WorkshopWorkerSkill[] = []
  function add(skill: WorkshopWorkerSkill) {
    if (SKILL_SET.has(skill) && !skills.includes(skill)) skills.push(skill)
  }
  if (source.includes('lasertubo') || source.includes('tubi')) add('laser_tubo')
  if (source.includes('laser')) add('laser_piano')
  if (source.includes('piega') || source.includes('piegatrice')) add('piegatrice')
  if (source.includes('sald')) add('saldatura')
  if (source.includes('torn')) add('tornitura')
  if (source.includes('fres')) add('fresatura')
  if (source.includes('mont')) add('montaggio')
  if (source.includes('vern')) add('verniciatura')
  if (source.includes('collaud')) add('collaudo')
  if (source.includes('magazz')) add('magazzino')
  if (source.includes('manut')) add('manutenzione')
  if (skills.length === 0) skills.push('altro')
  return skills
}

export function skillLabel(skill: WorkshopWorkerSkill): string {
  return WORKSHOP_WORKER_SKILL_LABELS[skill]
}

function buildMatcher(workers: WorkshopWorker[]) {
  const byEmployeeCode = new Map<string, WorkshopWorker>()
  const byFiscalCode = new Map<string, WorkshopWorker>()
  const byNamePhone = new Map<string, WorkshopWorker>()
  workers.forEach((worker) => {
    if (worker.employeeCode) byEmployeeCode.set(worker.employeeCode.trim().toUpperCase(), worker)
    if (worker.fiscalCode) byFiscalCode.set(worker.fiscalCode.trim().toUpperCase(), worker)
    const namePhone = namePhoneKey(worker)
    if (namePhone) byNamePhone.set(namePhone, worker)
  })
  return { byEmployeeCode, byFiscalCode, byNamePhone }
}

function findMatch(
  worker: Omit<WorkshopWorker, 'id' | 'createdAt' | 'updatedAt'>,
  matcher: ReturnType<typeof buildMatcher>,
): { by: WorkshopWorkerImportRecord['matchedBy']; worker: WorkshopWorker } | null {
  if (worker.employeeCode) {
    const match = matcher.byEmployeeCode.get(worker.employeeCode.trim().toUpperCase())
    if (match) return { by: 'employeeCode', worker: match }
  }
  if (worker.fiscalCode) {
    const match = matcher.byFiscalCode.get(worker.fiscalCode.trim().toUpperCase())
    if (match) return { by: 'fiscalCode', worker: match }
  }
  const key = namePhoneKey(worker)
  if (key) {
    const match = matcher.byNamePhone.get(key)
    if (match) return { by: 'displayName+phone', worker: match }
  }
  return null
}

function dedupeKey(worker: Omit<WorkshopWorker, 'id' | 'createdAt' | 'updatedAt'>): string {
  if (worker.employeeCode) return `code:${worker.employeeCode.trim().toUpperCase()}`
  if (worker.fiscalCode) return `cf:${worker.fiscalCode.trim().toUpperCase()}`
  return namePhoneKey(worker)
}

function namePhoneKey(worker: Pick<WorkshopWorker, 'displayName' | 'phone' | 'mobilePhone'>): string {
  const phone = normalizePhone(worker.mobilePhone || worker.phone)
  if (!worker.displayName || !phone) return ''
  return `${normalizeText(worker.displayName)}|${phone}`
}

function splitName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  const lastName = parts[0]
  const firstName = parts.slice(1).join(' ')
  return { firstName, lastName }
}

function splitCityProvince(value: string): { city: string; province: string } {
  const match = value.match(/^(.*?)[\s,]*\(([A-Z]{2})\)\s*$/i)
  if (!match) return { city: value.trim(), province: '' }
  return { city: match[1].trim(), province: match[2].toUpperCase() }
}

function extractDate(value: string): string {
  const matches = value.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/g)
  const raw = matches?.at(-1)
  if (!raw) return value.trim()
  const [dRaw, mRaw, yRaw] = raw.split(/[\/.-]/)
  const year = yRaw.length === 2 ? Number(`20${yRaw}`) : Number(yRaw)
  const month = Number(mRaw)
  const day = Number(dRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return value.trim()
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function rowIsEmpty(row: Row): boolean {
  return row.every((cell) => cellToString(cell).length === 0)
}

function cellToString(value: unknown): string {
  if (value instanceof Date) return `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}`
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '')
}
