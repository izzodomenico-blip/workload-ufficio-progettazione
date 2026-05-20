import type {
  AppData,
  MachineType,
  Person,
  WorkItem,
  WorkshopOutput,
  WorkshopOutputStatus,
} from '../types'
import {
  addDays,
  endOfWeek,
  formatISODate,
  isoWeekNumber,
  startOfWeek,
  todayISO,
} from './dates'
import { calculateWorkshopImpact, getWorkshopImpactLevel, type WorkshopImpactLevel } from './workshopImpact'

// ===== Processi =====

export type WorkshopProcessKey =
  | 'requiresLaser'
  | 'requiresTubeLaser'
  | 'requiresBending'
  | 'requiresWelding'
  | 'requiresAssembly'
  | 'requiresPainting'
  | 'requiresTesting'
export type WorkshopProcessWeightKey =
  | 'laserWeightPercent'
  | 'tubeLaserWeightPercent'
  | 'bendingWeightPercent'
  | 'weldingWeightPercent'
  | 'assemblyWeightPercent'
  | 'paintingWeightPercent'
  | 'testingWeightPercent'

export const WORKSHOP_PROCESSES: Array<{ key: WorkshopProcessKey; weight: WorkshopProcessWeightKey; label: string; short: string }> = [
  { key: 'requiresLaser', weight: 'laserWeightPercent', label: 'Laser piano', short: 'Laser' },
  { key: 'requiresTubeLaser', weight: 'tubeLaserWeightPercent', label: 'Laser tubo', short: 'Tubo' },
  { key: 'requiresBending', weight: 'bendingWeightPercent', label: 'Piega', short: 'Piega' },
  { key: 'requiresWelding', weight: 'weldingWeightPercent', label: 'Saldatura', short: 'Saldat.' },
  { key: 'requiresAssembly', weight: 'assemblyWeightPercent', label: 'Montaggio', short: 'Mont.' },
  { key: 'requiresPainting', weight: 'paintingWeightPercent', label: 'Verniciatura', short: 'Vern.' },
  { key: 'requiresTesting', weight: 'testingWeightPercent', label: 'Collaudo', short: 'Coll.' },
]

export const WORKSHOP_STATUS_LABELS: Record<WorkshopOutputStatus, string> = {
  previsto: 'Previsto',
  in_progettazione: 'In progettazione',
  pronto_rilascio: 'Pronto rilascio',
  rilasciato_produzione: 'Rilasciato',
  ricevuto_officina: 'Ricevuto officina',
  sospeso: 'Sospeso',
}

const RELEASED_STATUSES: WorkshopOutputStatus[] = ['rilasciato_produzione', 'ricevuto_officina']

// ===== Data arrivo officina =====

export type WorkshopDateSource = 'actual' | 'planned' | 'workItem' | 'none'

export function resolveWorkshopDate(
  output: Pick<WorkshopOutput, 'actualReleaseDate' | 'plannedReleaseDate'>,
  workItem?: Pick<WorkItem, 'plannedProductionReleaseDate' | 'dueDate'>,
): { date: string; source: WorkshopDateSource } {
  if (output.actualReleaseDate) return { date: output.actualReleaseDate, source: 'actual' }
  if (output.plannedReleaseDate) return { date: output.plannedReleaseDate, source: 'planned' }
  if (workItem?.plannedProductionReleaseDate) return { date: workItem.plannedProductionReleaseDate, source: 'workItem' }
  if (workItem?.dueDate) return { date: workItem.dueDate, source: 'workItem' }
  return { date: '', source: 'none' }
}

// ===== Flow item arricchito =====

export interface WorkshopFlowItem {
  output: WorkshopOutput
  workItem?: WorkItem
  machineType?: MachineType
  workshopDate: string
  workshopDateSource: WorkshopDateSource
  level: WorkshopImpactLevel
  customerName: string
  assignees: string[]
  processes: WorkshopProcessKey[]
}

export function buildWorkshopFlow(data: AppData): WorkshopFlowItem[] {
  const workItemById = new Map(data.workItems.map((w) => [w.id, w]))
  const machineTypeById = new Map(data.machineTypes.map((m) => [m.id, m]))
  const machineTypeByCode = new Map(data.machineTypes.map((m) => [m.code.toUpperCase(), m]))
  const personById = new Map<string, Person>(data.people.map((p) => [p.id, p]))

  return data.workshopOutputs.map((output) => {
    const workItem = workItemById.get(output.workItemId)
    const machineType =
      machineTypeById.get(output.machineTypeId) ??
      machineTypeByCode.get(output.machineTypeCode.toUpperCase())
    const { date, source } = resolveWorkshopDate(output, workItem)
    const effectiveOutput: WorkshopOutput = {
      ...output,
      impactScore: calculateWorkshopImpact(output, machineType),
    }
    const assignees = workItem
      ? workItem.assigneeIds.map((id) => personById.get(id)?.name).filter((n): n is string => Boolean(n))
      : []
    if (workItem && assignees.length === 0) {
      const owner = personById.get(workItem.ownerId)
      if (owner) assignees.push(owner.name)
    }
    return {
      output: effectiveOutput,
      workItem,
      machineType,
      workshopDate: date,
      workshopDateSource: source,
      level: getWorkshopImpactLevel(effectiveOutput.impactScore),
      customerName: workItem?.customerPartnerName || workItem?.customer || '—',
      assignees,
      processes: WORKSHOP_PROCESSES.filter((p) => effectiveOutput[p.key]).map((p) => p.key),
    }
  })
}

export function isReleased(output: WorkshopOutput): boolean {
  return RELEASED_STATUSES.includes(output.status) || Boolean(output.actualReleaseDate)
}

// ===== Filtri =====

export type WorkshopPeriodPreset = 'current' | 'next' | '4w' | '8w' | 'custom'

export interface WorkshopLoadFilters {
  period: WorkshopPeriodPreset
  customFrom: string
  customTo: string
  customer: string
  query: string
  machineTypeCode: string
  family: string
  status: WorkshopOutputStatus | ''
  personId: string
  process: WorkshopProcessKey | ''
}

export const EMPTY_WORKSHOP_FILTERS: WorkshopLoadFilters = {
  period: '4w',
  customFrom: '',
  customTo: '',
  customer: '',
  query: '',
  machineTypeCode: '',
  family: '',
  status: '',
  personId: '',
  process: '',
}

export function resolvePeriodRange(
  filters: WorkshopLoadFilters,
  today: Date = new Date(),
): { startISO: string; endISO: string } {
  switch (filters.period) {
    case 'current':
      return { startISO: formatISODate(startOfWeek(today)), endISO: formatISODate(endOfWeek(today)) }
    case 'next': {
      const ref = addDays(today, 7)
      return { startISO: formatISODate(startOfWeek(ref)), endISO: formatISODate(endOfWeek(ref)) }
    }
    case '8w':
      return { startISO: formatISODate(startOfWeek(today)), endISO: formatISODate(endOfWeek(addDays(today, 49))) }
    case 'custom':
      return {
        startISO: filters.customFrom || formatISODate(startOfWeek(today)),
        endISO: filters.customTo || formatISODate(endOfWeek(addDays(today, 21))),
      }
    case '4w':
    default:
      return { startISO: formatISODate(startOfWeek(today)), endISO: formatISODate(endOfWeek(addDays(today, 21))) }
  }
}

/** Applica solo i filtri NON temporali (cliente, tipologia, stato, ecc.). */
export function applyNonPeriodFilters(items: WorkshopFlowItem[], filters: WorkshopLoadFilters): WorkshopFlowItem[] {
  const q = filters.query.trim().toLowerCase()
  return items.filter((item) => {
    if (filters.customer && item.customerName !== filters.customer) return false
    if (filters.machineTypeCode && item.output.machineTypeCode.toUpperCase() !== filters.machineTypeCode.toUpperCase()) return false
    if (filters.family && item.machineType?.family !== filters.family) return false
    if (filters.status && item.output.status !== filters.status) return false
    if (filters.process && !item.output[filters.process]) return false
    if (filters.personId) {
      const w = item.workItem
      if (!w) return false
      if (w.ownerId !== filters.personId && !w.assigneeIds.includes(filters.personId)) return false
    }
    if (q) {
      const hay = `${item.output.machineTypeCode} ${item.output.machineTypeName} ${item.output.description} ${item.workItem?.code ?? ''} ${item.workItem?.title ?? ''} ${item.customerName}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function inRange(dateISO: string, startISO: string, endISO: string): boolean {
  if (!dateISO) return false
  return dateISO >= startISO && dateISO <= endISO
}

// ===== Aggregazione generica =====

export interface WorkshopAggregate {
  outputCount: number
  totalQuantity: number
  totalAssemblies: number
  totalParts: number
  totalImpact: number
  laserFlat: number
  laserTube: number
  workItemCount: number
}

export function aggregate(items: WorkshopFlowItem[]): WorkshopAggregate {
  const workItemIds = new Set<string>()
  let totalQuantity = 0
  let totalAssemblies = 0
  let totalParts = 0
  let totalImpact = 0
  let laserFlat = 0
  let laserTube = 0
  for (const item of items) {
    totalQuantity += item.output.quantity
    totalAssemblies += item.output.assemblyCount
    totalParts += item.output.estimatedPartCount
    totalImpact += item.output.impactScore
    if (item.output.requiresLaser) laserFlat++
    if (item.output.requiresTubeLaser) laserTube++
    if (item.workItem) workItemIds.add(item.workItem.id)
  }
  return {
    outputCount: items.length,
    totalQuantity: round1(totalQuantity),
    totalAssemblies,
    totalParts,
    totalImpact: round1(totalImpact),
    laserFlat,
    laserTube,
    workItemCount: workItemIds.size,
  }
}

// ===== Livelli aggregati =====

export function getAggregatedWorkshopImpactLevel(score: number): WorkshopImpactLevel {
  if (score <= 20) return 'basso'
  if (score <= 50) return 'medio'
  if (score <= 90) return 'alto'
  return 'critico'
}

// ===== Vista per settimana (prossime N settimane) =====

export interface WorkshopWeekLoad {
  index: number
  weekIso: number
  weekStartISO: string
  weekEndISO: string
  label: string
  rangeLabel: string
  isCurrent: boolean
  items: WorkshopFlowItem[]
  aggregate: WorkshopAggregate
  level: WorkshopImpactLevel
}

const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

function shortRange(ws: Date, we: Date): string {
  if (ws.getMonth() === we.getMonth()) return `${ws.getDate()}-${we.getDate()} ${MONTHS_SHORT[ws.getMonth()]}`
  return `${ws.getDate()} ${MONTHS_SHORT[ws.getMonth()]} – ${we.getDate()} ${MONTHS_SHORT[we.getMonth()]}`
}

export function buildWeeklyLoad(
  items: WorkshopFlowItem[],
  count = 4,
  today: Date = new Date(),
): WorkshopWeekLoad[] {
  const todayStr = formatISODate(today)
  const weeks: WorkshopWeekLoad[] = []
  for (let i = 0; i < count; i++) {
    const ref = addDays(today, i * 7)
    const ws = startOfWeek(ref)
    const we = endOfWeek(ref)
    const startISO = formatISODate(ws)
    const endISO = formatISODate(we)
    const weekItems = items.filter((item) => inRange(item.workshopDate, startISO, endISO))
    const agg = aggregate(weekItems)
    weeks.push({
      index: i,
      weekIso: isoWeekNumber(ws),
      weekStartISO: startISO,
      weekEndISO: endISO,
      label: `S${isoWeekNumber(ws)}`,
      rangeLabel: shortRange(ws, we),
      isCurrent: todayStr >= startISO && todayStr <= endISO,
      items: weekItems,
      aggregate: agg,
      level: getAggregatedWorkshopImpactLevel(agg.totalImpact),
    })
  }
  return weeks
}

// ===== Vista per giorno =====

export interface WorkshopDayGroup {
  dateISO: string
  items: WorkshopFlowItem[]
  totalImpact: number
}

export function buildDailyFlow(items: WorkshopFlowItem[]): WorkshopDayGroup[] {
  const map = new Map<string, WorkshopFlowItem[]>()
  for (const item of items) {
    if (!item.workshopDate) continue
    const arr = map.get(item.workshopDate) ?? []
    arr.push(item)
    map.set(item.workshopDate, arr)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateISO, dayItems]) => ({
      dateISO,
      items: dayItems.slice().sort((a, b) => b.output.impactScore - a.output.impactScore),
      totalImpact: round1(dayItems.reduce((s, it) => s + it.output.impactScore, 0)),
    }))
}

// ===== Vista per processo =====

export interface WorkshopProcessLoad {
  key: WorkshopProcessKey
  label: string
  outputCount: number
  totalQuantity: number
  totalParts: number
  totalImpact: number
  workItemCount: number
}

export function buildProcessLoad(items: WorkshopFlowItem[]): WorkshopProcessLoad[] {
  return WORKSHOP_PROCESSES.map((process) => {
    const matching = items.filter((item) => item.output[process.key])
    const workItemIds = new Set<string>()
    let totalQuantity = 0
    let totalParts = 0
    let totalImpact = 0
    for (const item of matching) {
      totalQuantity += item.output.quantity
      totalParts += item.output.estimatedPartCount
      totalImpact += processImpact(item.output, process)
      if (item.workItem) workItemIds.add(item.workItem.id)
    }
    return {
      key: process.key,
      label: process.label,
      outputCount: matching.length,
      totalQuantity: round1(totalQuantity),
      totalParts,
      totalImpact: round1(totalImpact),
      workItemCount: workItemIds.size,
    }
  })
}

export function processImpact(output: WorkshopOutput, process: { key: WorkshopProcessKey; weight: WorkshopProcessWeightKey }): number {
  if (!output[process.key]) return 0
  const weight = Number.isFinite(output[process.weight]) ? output[process.weight] : 100
  return output.impactScore * Math.max(0, Math.min(100, weight)) / 100
}

// ===== Vista per tipologia macchina =====

export interface WorkshopTypeLoad {
  code: string
  name: string
  family?: string
  outputCount: number
  totalQuantity: number
  totalAssemblies: number
  totalParts: number
  totalImpact: number
  workItemCount: number
  level: WorkshopImpactLevel
}

export function buildTypeLoad(items: WorkshopFlowItem[]): WorkshopTypeLoad[] {
  const map = new Map<string, WorkshopFlowItem[]>()
  for (const item of items) {
    const code = item.output.machineTypeCode.toUpperCase()
    const arr = map.get(code) ?? []
    arr.push(item)
    map.set(code, arr)
  }
  const rows: WorkshopTypeLoad[] = []
  for (const [code, typeItems] of map.entries()) {
    const agg = aggregate(typeItems)
    rows.push({
      code,
      name: typeItems[0]?.output.machineTypeName ?? code,
      family: typeItems[0]?.machineType?.family,
      outputCount: agg.outputCount,
      totalQuantity: agg.totalQuantity,
      totalAssemblies: agg.totalAssemblies,
      totalParts: agg.totalParts,
      totalImpact: agg.totalImpact,
      workItemCount: agg.workItemCount,
      level: getAggregatedWorkshopImpactLevel(agg.totalImpact),
    })
  }
  return rows.sort((a, b) => b.totalImpact - a.totalImpact)
}

// ===== KPI =====

export interface WorkshopKpis {
  expectedThisWeek: number
  releasedThisWeek: number
  impactThisWeek: number
  impactNextWeek: number
  assembliesThisWeek: number
  partsThisWeek: number
  laserFlatThisWeek: number
  laserTubeThisWeek: number
  topType: { code: string; name: string; impact: number } | null
  topWorkItem: { id: string; code: string; title: string; impact: number } | null
}

export function computeWorkshopKpis(
  baseItems: WorkshopFlowItem[],
  periodItems: WorkshopFlowItem[],
  today: Date = new Date(),
): WorkshopKpis {
  const curStart = formatISODate(startOfWeek(today))
  const curEnd = formatISODate(endOfWeek(today))
  const nextRef = addDays(today, 7)
  const nextStart = formatISODate(startOfWeek(nextRef))
  const nextEnd = formatISODate(endOfWeek(nextRef))

  const currentWeek = baseItems.filter((item) => inRange(item.workshopDate, curStart, curEnd))
  const nextWeek = baseItems.filter((item) => inRange(item.workshopDate, nextStart, nextEnd))

  const curAgg = aggregate(currentWeek)
  const nextAgg = aggregate(nextWeek)

  // Tipologia più impattante nel periodo selezionato
  const typeLoad = buildTypeLoad(periodItems)
  const topType = typeLoad.length > 0 && typeLoad[0].totalImpact > 0
    ? { code: typeLoad[0].code, name: typeLoad[0].name, impact: typeLoad[0].totalImpact }
    : null

  // Commessa più impattante nel periodo selezionato
  const byWorkItem = new Map<string, { item: WorkItem; impact: number }>()
  for (const it of periodItems) {
    if (!it.workItem) continue
    const cur = byWorkItem.get(it.workItem.id)
    if (cur) cur.impact += it.output.impactScore
    else byWorkItem.set(it.workItem.id, { item: it.workItem, impact: it.output.impactScore })
  }
  let topWorkItem: WorkshopKpis['topWorkItem'] = null
  for (const { item, impact } of byWorkItem.values()) {
    if (!topWorkItem || impact > topWorkItem.impact) {
      topWorkItem = { id: item.id, code: item.code, title: item.title, impact: round1(impact) }
    }
  }

  return {
    expectedThisWeek: currentWeek.length,
    releasedThisWeek: currentWeek.filter((item) => isReleased(item.output)).length,
    impactThisWeek: curAgg.totalImpact,
    impactNextWeek: nextAgg.totalImpact,
    assembliesThisWeek: curAgg.totalAssemblies,
    partsThisWeek: curAgg.totalParts,
    laserFlatThisWeek: curAgg.laserFlat,
    laserTubeThisWeek: curAgg.laserTube,
    topType,
    topWorkItem,
  }
}

// ===== Criticità =====

export type WorkshopAlertTone = 'critico' | 'attenzione' | 'info'

export interface WorkshopAlert {
  id: string
  tone: WorkshopAlertTone
  title: string
  detail: string
}

export function detectWorkshopAlerts(
  baseItems: WorkshopFlowItem[],
  weeks: WorkshopWeekLoad[],
  today: Date = new Date(),
): WorkshopAlert[] {
  const alerts: WorkshopAlert[] = []
  const todayStr = formatISODate(today)

  // 1. Settimane con impatto critico
  const criticalWeeks = weeks.filter((w) => w.level === 'critico')
  for (const w of criticalWeeks) {
    alerts.push({
      id: `crit-week-${w.weekStartISO}`,
      tone: 'critico',
      title: `Settimana ${w.label} con impatto critico`,
      detail: `Indice ${w.aggregate.totalImpact} su ${w.aggregate.outputCount} output (${w.rangeLabel}).`,
    })
  }

  // 2 + 3. Per settimana: tanti output alta/speciale complessità o tanti particolari
  for (const w of weeks) {
    const hardOutputs = w.items.filter((it) => it.output.complexity === 'alta' || it.output.complexity === 'speciale')
    if (hardOutputs.length >= 3) {
      alerts.push({
        id: `hard-${w.weekStartISO}`,
        tone: 'attenzione',
        title: `${hardOutputs.length} output ad alta/speciale complessità in ${w.label}`,
        detail: `Concentrati nella stessa settimana (${w.rangeLabel}).`,
      })
    }
    if (w.aggregate.totalParts >= 400) {
      alerts.push({
        id: `parts-${w.weekStartISO}`,
        tone: 'attenzione',
        title: `Molti particolari stimati in ${w.label}`,
        detail: `${w.aggregate.totalParts} particolari previsti nella settimana (${w.rangeLabel}).`,
      })
    }
    if (w.aggregate.laserTube >= 3) {
      alerts.push({
        id: `tube-${w.weekStartISO}`,
        tone: 'info',
        title: `${w.aggregate.laserTube} output con laser tubo in ${w.label}`,
        detail: `Possibile collo di bottiglia sul laser tubo (${w.rangeLabel}).`,
      })
    }
    const weldingCount = w.items.filter((it) => it.output.requiresWelding).length
    if (weldingCount >= 4) {
      alerts.push({
        id: `weld-${w.weekStartISO}`,
        tone: 'info',
        title: `${weldingCount} output con saldatura/carpenteria in ${w.label}`,
        detail: `Verificare capacità saldatura nella settimana (${w.rangeLabel}).`,
      })
    }
  }

  // 4. Output senza data rilascio prevista (né effettiva né pianificata sull'output)
  const missingDate = baseItems.filter(
    (it) => it.workshopDateSource === 'workItem' || it.workshopDateSource === 'none',
  )
  if (missingDate.length > 0) {
    alerts.push({
      id: 'missing-date',
      tone: 'attenzione',
      title: `${missingDate.length} output senza data di rilascio impostata`,
      detail: 'La data arrivo officina è dedotta dal lavoro. Imposta il rilascio previsto sull’output per maggiore precisione.',
    })
  }

  // 5. Output ancora "previsto" ma con data passata
  const overduePlanned = baseItems.filter(
    (it) => it.output.status === 'previsto' && it.workshopDate && it.workshopDate < todayStr,
  )
  if (overduePlanned.length > 0) {
    alerts.push({
      id: 'overdue-planned',
      tone: 'critico',
      title: `${overduePlanned.length} output ancora "previsto" con data passata`,
      detail: 'Aggiorna lo stato o la data di rilascio: la progettazione risulta in ritardo verso l’officina.',
    })
  }

  // 6. Output sospesi
  const suspended = baseItems.filter((it) => it.output.status === 'sospeso')
  if (suspended.length > 0) {
    alerts.push({
      id: 'suspended',
      tone: 'info',
      title: `${suspended.length} output sospesi`,
      detail: 'Output messi in pausa: non rientrano nel carico previsto finché non riprendono.',
    })
  }

  const order: Record<WorkshopAlertTone, number> = { critico: 0, attenzione: 1, info: 2 }
  return alerts.sort((a, b) => order[a.tone] - order[b.tone])
}

// ===== Helpers per filtri UI =====

export function uniqueCustomers(items: WorkshopFlowItem[]): string[] {
  return Array.from(new Set(items.map((it) => it.customerName).filter((c) => c && c !== '—'))).sort((a, b) =>
    a.localeCompare(b, 'it', { sensitivity: 'base' }),
  )
}

export function uniqueMachineTypeCodes(items: WorkshopFlowItem[]): Array<{ code: string; name: string }> {
  const map = new Map<string, string>()
  for (const it of items) {
    const code = it.output.machineTypeCode.toUpperCase()
    if (!map.has(code)) map.set(code, it.output.machineTypeName)
  }
  return Array.from(map.entries())
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code, 'it', { sensitivity: 'base' }))
}

export function uniqueFamilies(items: WorkshopFlowItem[]): string[] {
  return Array.from(
    new Set(items.map((it) => it.machineType?.family).filter((f): f is string => Boolean(f))),
  ).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }))
}

export { todayISO }

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
