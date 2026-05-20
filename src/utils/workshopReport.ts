import type { AppData } from '../types'
import { formatItalianShort } from './dates'
import type { WorkshopImpactLevel } from './workshopImpact'
import {
  aggregate,
  applyNonPeriodFilters,
  buildProcessLoad,
  buildTypeLoad,
  buildWeeklyLoad,
  buildWorkshopFlow,
  detectWorkshopAlerts,
  getAggregatedWorkshopImpactLevel,
  inRange,
  isReleased,
  resolvePeriodRange,
  WORKSHOP_PROCESSES,
  WORKSHOP_STATUS_LABELS,
  type WorkshopAlert,
  type WorkshopFlowItem,
  type WorkshopLoadFilters,
  type WorkshopProcessLoad,
  type WorkshopTypeLoad,
  type WorkshopWeekLoad,
} from './workshopLoad'

const PERIOD_LABEL: Record<WorkshopLoadFilters['period'], string> = {
  current: 'settimana corrente',
  next: 'prossima settimana',
  '4w': 'prossime 4 settimane',
  '8w': 'prossime 8 settimane',
  custom: 'periodo personalizzato',
}

export const WORKSHOP_REPORT_IMPACT_NOTE =
  "L'indice di impatto non rappresenta ore preventive o consuntive. È un indicatore relativo basato su tipologia, quantità, complessità, complessivi, particolari e processi coinvolti."

export const WORKSHOP_REPORT_FLOW_LIMIT = 25

export interface WorkshopReportSummary {
  expectedCount: number
  releasedCount: number
  totalImpact: number
  level: WorkshopImpactLevel
  totalAssemblies: number
  totalParts: number
  workItemCount: number
}

export interface WorkshopReportModel {
  generatedAt: Date
  periodStartISO: string
  periodEndISO: string
  periodLabel: string
  filtersSummary: string
  summary: WorkshopReportSummary
  criticalitySentence: string
  flowRows: WorkshopFlowItem[]
  flowTotalCount: number
  processLoad: WorkshopProcessLoad[]
  typeLoad: WorkshopTypeLoad[]
  weeks: WorkshopWeekLoad[]
  alerts: WorkshopAlert[]
}

export function buildWorkshopReport(
  data: AppData,
  filters: WorkshopLoadFilters,
  today: Date = new Date(),
): WorkshopReportModel {
  const flow = buildWorkshopFlow(data)
  const baseItems = applyNonPeriodFilters(flow, filters)
  const { startISO, endISO } = resolvePeriodRange(filters, today)
  const periodItems = baseItems.filter((item) => inRange(item.workshopDate, startISO, endISO))

  const agg = aggregate(periodItems)
  const summary: WorkshopReportSummary = {
    expectedCount: periodItems.length,
    releasedCount: periodItems.filter((item) => isReleased(item.output)).length,
    totalImpact: agg.totalImpact,
    level: getAggregatedWorkshopImpactLevel(agg.totalImpact),
    totalAssemblies: agg.totalAssemblies,
    totalParts: agg.totalParts,
    workItemCount: agg.workItemCount,
  }

  const flowRows = periodItems
    .slice()
    .sort((a, b) => {
      const dateCompare = (a.workshopDate || '9999-99-99').localeCompare(b.workshopDate || '9999-99-99')
      if (dateCompare !== 0) return dateCompare
      return b.output.impactScore - a.output.impactScore
    })

  const weeks = buildWeeklyLoad(baseItems, 4, today)
  const processLoad = buildProcessLoad(periodItems).filter((row) => row.outputCount > 0)
  const typeLoad = buildTypeLoad(periodItems).slice(0, 8)
  const alerts = detectWorkshopAlerts(baseItems, weeks, today).slice(0, 8)

  return {
    generatedAt: today,
    periodStartISO: startISO,
    periodEndISO: endISO,
    periodLabel: PERIOD_LABEL[filters.period],
    filtersSummary: buildFiltersSummary(data, filters),
    summary,
    criticalitySentence: buildCriticalitySentence(weeks),
    flowRows,
    flowTotalCount: periodItems.length,
    processLoad,
    typeLoad,
    weeks,
    alerts,
  }
}

function buildCriticalitySentence(weeks: WorkshopWeekLoad[]): string {
  const themes: string[] = []
  if (weeks.some((w) => w.level === 'critico')) themes.push('impatto critico')
  if (weeks.some((w) => w.aggregate.laserTube >= 3)) themes.push('laser tubo')
  if (weeks.some((w) => w.items.filter((it) => it.output.requiresWelding).length >= 4)) themes.push('saldatura')
  if (weeks.some((w) => w.aggregate.totalParts >= 400)) themes.push('alto numero di particolari')

  if (themes.length === 0) return 'Nessuna criticità rilevante nel periodo selezionato.'
  return `Nel periodo selezionato risultano criticità di carico legate a ${themes.join(' / ')}.`
}

function buildFiltersSummary(data: AppData, filters: WorkshopLoadFilters): string {
  const parts: string[] = []
  if (filters.customer) parts.push(`cliente "${filters.customer}"`)
  if (filters.query.trim()) parts.push(`ricerca "${filters.query.trim()}"`)
  if (filters.machineTypeCode) parts.push(`tipologia ${filters.machineTypeCode.toUpperCase()}`)
  if (filters.family) parts.push(`famiglia ${filters.family}`)
  if (filters.status) parts.push(`stato ${WORKSHOP_STATUS_LABELS[filters.status]}`)
  if (filters.personId) {
    const person = data.people.find((p) => p.id === filters.personId)
    parts.push(`progettista ${person?.name ?? filters.personId}`)
  }
  if (filters.process) {
    const process = WORKSHOP_PROCESSES.find((p) => p.key === filters.process)
    parts.push(`processo ${process?.label ?? filters.process}`)
  }

  const periodText = PERIOD_LABEL[filters.period]
  if (parts.length === 0) return `${capitalize(periodText)}, nessun altro filtro.`
  return `${capitalize(periodText)}, ${parts.join(', ')}.`
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1)
}

export function formatReportRange(startISO: string, endISO: string): string {
  return `${formatItalianShort(startISO)} → ${formatItalianShort(endISO)}`
}
