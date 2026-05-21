import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ALL_WORKSHOP_OUTPUT_STATUSES } from '../types'
import type { WorkshopOutput, WorkshopOutputStatus } from '../types'
import { useData } from '../state/DataProvider'
import { WorkItemDetailDrawer } from './WorkItemDetailDrawer'
import { WorkshopReportModal } from './WorkshopReportModal'
import { CoefficientsGuideReportModal } from './CoefficientsGuideReportModal'
import { WORKSHOP_IMPACT_EXPLANATION, type WorkshopImpactLevel } from '../utils/workshopImpact'
import {
  applyNonPeriodFilters,
  aggregate,
  buildDailyFlow,
  buildProcessLoad,
  buildTypeLoad,
  buildWeeklyLoad,
  buildWorkshopFlow,
  computeWorkshopKpis,
  detectWorkshopAlerts,
  EMPTY_WORKSHOP_FILTERS,
  inRange,
  isReleased,
  resolvePeriodRange,
  uniqueCustomers,
  uniqueFamilies,
  uniqueMachineTypeCodes,
  WORKSHOP_PROCESSES,
  WORKSHOP_STATUS_LABELS,
  type WorkshopAlert,
  type WorkshopFlowItem,
  type WorkshopLoadFilters,
  type WorkshopProcessKey,
  type WorkshopWeekLoad,
} from '../utils/workshopLoad'
import { formatItalianShort, parseISODate } from '../utils/dates'

const PERIOD_OPTIONS: Array<{ value: WorkshopLoadFilters['period']; label: string }> = [
  { value: 'current', label: 'Settimana corrente' },
  { value: 'next', label: 'Prossima settimana' },
  { value: '4w', label: 'Prossime 4 settimane' },
  { value: '8w', label: 'Prossime 8 settimane' },
  { value: 'custom', label: 'Personalizzato' },
]

const LEVEL_BADGE: Record<WorkshopImpactLevel, string> = {
  basso: 'bg-emerald-500/12 text-emerald-200 ring-emerald-500/35',
  medio: 'bg-sky-500/12 text-sky-200 ring-sky-500/35',
  alto: 'bg-amber-500/12 text-amber-200 ring-amber-500/35',
  critico: 'bg-red-500/15 text-red-100 ring-red-500/45',
}

const LEVEL_DOT: Record<WorkshopImpactLevel, string> = {
  basso: 'bg-emerald-400',
  medio: 'bg-sky-400',
  alto: 'bg-amber-400',
  critico: 'bg-red-400',
}

const STATUS_BADGE: Record<WorkshopOutputStatus, string> = {
  previsto: 'bg-slate-500/12 text-slate-200 ring-slate-500/35',
  in_progettazione: 'bg-sky-500/12 text-sky-200 ring-sky-500/35',
  pronto_rilascio: 'bg-violet-500/12 text-violet-200 ring-violet-500/35',
  rilasciato_produzione: 'bg-emerald-500/14 text-emerald-200 ring-emerald-500/40',
  ricevuto_officina: 'bg-emerald-500/20 text-emerald-100 ring-emerald-500/50',
  sospeso: 'bg-zinc-500/12 text-zinc-300 ring-zinc-500/35',
}

const PROCESS_BADGE: Record<WorkshopProcessKey, string> = {
  requiresLaser: 'bg-sky-500/12 text-sky-200 ring-sky-500/30',
  requiresTubeLaser: 'bg-cyan-500/12 text-cyan-200 ring-cyan-500/30',
  requiresBending: 'bg-indigo-500/12 text-indigo-200 ring-indigo-500/30',
  requiresWelding: 'bg-orange-500/12 text-orange-200 ring-orange-500/30',
  requiresTurning: 'bg-teal-500/12 text-teal-200 ring-teal-500/30',
  requiresMilling: 'bg-lime-500/12 text-lime-200 ring-lime-500/30',
  requiresAssembly: 'bg-violet-500/12 text-violet-200 ring-violet-500/30',
  requiresPainting: 'bg-emerald-500/12 text-emerald-200 ring-emerald-500/30',
  requiresTesting: 'bg-amber-500/12 text-amber-200 ring-amber-500/30',
}

const PROCESS_SHORT = new Map(WORKSHOP_PROCESSES.map((p) => [p.key, p.short]))
const PROCESS_LABEL = new Map(WORKSHOP_PROCESSES.map((p) => [p.key, p.label]))

export function WorkshopLoadView() {
  const { data } = useData()
  const [filters, setFilters] = useState<WorkshopLoadFilters>(EMPTY_WORKSHOP_FILTERS)
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  const today = useMemo(() => new Date(), [])

  const flow = useMemo(() => buildWorkshopFlow(data), [data])
  const baseItems = useMemo(() => applyNonPeriodFilters(flow, filters), [flow, filters])

  const { startISO, endISO } = useMemo(() => resolvePeriodRange(filters, today), [filters, today])
  const periodItems = useMemo(
    () => baseItems.filter((item) => inRange(item.workshopDate, startISO, endISO)),
    [baseItems, startISO, endISO],
  )

  const kpis = useMemo(() => computeWorkshopKpis(baseItems, periodItems, today), [baseItems, periodItems, today])
  const weeks = useMemo(() => buildWeeklyLoad(baseItems, 4, today), [baseItems, today])
  const dailyFlow = useMemo(() => buildDailyFlow(periodItems), [periodItems])
  const processLoad = useMemo(() => buildProcessLoad(periodItems), [periodItems])
  const typeLoad = useMemo(() => buildTypeLoad(periodItems), [periodItems])
  const alerts = useMemo(() => detectWorkshopAlerts(baseItems, weeks, today), [baseItems, weeks, today])
  const periodAggregate = useMemo(() => aggregate(periodItems), [periodItems])

  const customers = useMemo(() => uniqueCustomers(flow), [flow])
  const machineTypes = useMemo(() => uniqueMachineTypeCodes(flow), [flow])
  const families = useMemo(() => uniqueFamilies(flow), [flow])

  const hasOutputs = flow.length > 0

  function patch<K extends keyof WorkshopLoadFilters>(key: K, value: WorkshopLoadFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-7 w-1 rounded-full bg-gradient-to-b from-orange-400 to-orange-600" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">Carico officina</h2>
            <p className="text-[11px] text-slate-500">
              Cosa arriva in officina dopo il rilascio della progettazione · vista di analisi
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-[11px] text-slate-400 lg:block">
            Indice impatto = peso relativo, <span className="text-slate-300">non rappresenta ore officina</span>
          </div>
          <button onClick={() => setGuideOpen(true)} className="btn-ghost" title="Guida stampabile alla logica coefficienti">
            Guida coefficienti
          </button>
          {hasOutputs && (
            <button onClick={() => setReportOpen(true)} className="btn-primary" title="Anteprima report stampabile per la produzione">
              <ReportIcon /> Report produzione
            </button>
          )}
        </div>
      </header>

      {!hasOutputs ? (
        <EmptyState />
      ) : (
        <>
          <FiltersBar
            filters={filters}
            customers={customers}
            machineTypes={machineTypes}
            families={families}
            onPatch={patch}
            onReset={() => setFilters(EMPTY_WORKSHOP_FILTERS)}
          />

          <KpiGrid kpis={kpis} onWorkItem={setSelectedWorkItemId} />

          <section>
            <SectionHeader title="Prossime 4 settimane" subtitle="Carico previsto verso officina settimana per settimana" />
            <WeeklyLoadGrid weeks={weeks} />
          </section>

          {alerts.length > 0 && (
            <section>
              <SectionHeader title="Criticità per la produzione" subtitle="Segnalazioni automatiche sul periodo e sugli output" />
              <AlertsList alerts={alerts} />
            </section>
          )}

          <section>
            <SectionHeader
              title="Carico per processo"
              subtitle={`Periodo selezionato · ${formatItalianShort(startISO)} → ${formatItalianShort(endISO)}`}
            />
            <ProcessLoadGrid rows={processLoad} />
          </section>

          <section>
            <SectionHeader
              title="Carico per tipologia macchina"
              subtitle="Aggregato per tipologia nel periodo selezionato"
            />
            <TypeLoadTable rows={typeLoad} />
          </section>

          <section>
            <SectionHeader
              title="Flusso giornaliero verso officina"
              subtitle={`${periodAggregate.outputCount} output · impatto ${periodAggregate.totalImpact} nel periodo`}
            />
            <DailyFlowTable
              groups={dailyFlow}
              onWorkItem={setSelectedWorkItemId}
            />
          </section>
        </>
      )}

      <WorkItemDetailDrawer workItemId={selectedWorkItemId} onClose={() => setSelectedWorkItemId(null)} />
      <WorkshopReportModal open={reportOpen} onClose={() => setReportOpen(false)} filters={filters} />
      <CoefficientsGuideReportModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}

function ReportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  )
}

// ===== Filtri =====

function FiltersBar({
  filters,
  customers,
  machineTypes,
  families,
  onPatch,
  onReset,
}: {
  filters: WorkshopLoadFilters
  customers: string[]
  machineTypes: Array<{ code: string; name: string }>
  families: string[]
  onPatch: <K extends keyof WorkshopLoadFilters>(key: K, value: WorkshopLoadFilters[K]) => void
  onReset: () => void
}) {
  const dirty =
    filters.period !== '4w' ||
    filters.customer !== '' ||
    filters.query !== '' ||
    filters.machineTypeCode !== '' ||
    filters.family !== '' ||
    filters.status !== '' ||
    filters.personId !== '' ||
    filters.process !== ''

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onPatch('period', opt.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              filters.period === opt.value
                ? 'bg-slate-700/80 text-slate-100 ring-1 ring-inset ring-slate-600'
                : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
        {filters.period === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              className="input-base w-auto text-xs"
              value={filters.customFrom}
              onChange={(e) => onPatch('customFrom', e.target.value)}
              aria-label="Data inizio"
            />
            <span className="text-slate-500">→</span>
            <input
              type="date"
              className="input-base w-auto text-xs"
              value={filters.customTo}
              onChange={(e) => onPatch('customTo', e.target.value)}
              aria-label="Data fine"
            />
          </div>
        )}
        {dirty && (
          <button onClick={onReset} className="btn-ghost ml-auto text-xs">
            Reset filtri
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <input
          className="input-base text-sm xl:col-span-2"
          placeholder="Cerca commessa, codice, descrizione…"
          value={filters.query}
          onChange={(e) => onPatch('query', e.target.value)}
        />
        <Select value={filters.customer} onChange={(v) => onPatch('customer', v)} ariaLabel="Cliente">
          <option value="">Tutti i clienti</option>
          {customers.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={filters.machineTypeCode} onChange={(v) => onPatch('machineTypeCode', v)} ariaLabel="Tipologia">
          <option value="">Tutte le tipologie</option>
          {machineTypes.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.name}</option>)}
        </Select>
        <Select value={filters.family} onChange={(v) => onPatch('family', v)} ariaLabel="Famiglia">
          <option value="">Tutte le famiglie</option>
          {families.map((f) => <option key={f} value={f}>{f}</option>)}
        </Select>
        <Select value={filters.status} onChange={(v) => onPatch('status', v as WorkshopOutputStatus | '')} ariaLabel="Stato output">
          <option value="">Tutti gli stati</option>
          {ALL_WORKSHOP_OUTPUT_STATUSES.map((s) => <option key={s} value={s}>{WORKSHOP_STATUS_LABELS[s]}</option>)}
        </Select>
        <Select value={filters.process} onChange={(v) => onPatch('process', v as WorkshopProcessKey | '')} ariaLabel="Processo">
          <option value="">Tutti i processi</option>
          {WORKSHOP_PROCESSES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </Select>
      </div>
    </div>
  )
}

function Select({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string
  onChange: (v: string) => void
  ariaLabel: string
  children: ReactNode
}) {
  return (
    <select className="input-base text-sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
      {children}
    </select>
  )
}

// ===== KPI =====

function KpiGrid({ kpis, onWorkItem }: { kpis: ReturnType<typeof computeWorkshopKpis>; onWorkItem: (id: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Output previsti" hint="questa settimana" value={kpis.expectedThisWeek} tone="sky" />
        <Kpi label="Rilasciati" hint="questa settimana" value={kpis.releasedThisWeek} tone="emerald" />
        <Kpi label="Impatto sett. corrente" hint="indice relativo" value={kpis.impactThisWeek} tone="orange" />
        <Kpi label="Impatto prossima sett." hint="indice relativo" value={kpis.impactNextWeek} tone="violet" />
        <Kpi label="Complessivi previsti" hint="questa settimana" value={kpis.assembliesThisWeek} tone="sky" />
        <Kpi label="Particolari stimati" hint="questa settimana" value={kpis.partsThisWeek} tone="sky" />
        <Kpi label="Laser piano" hint="output questa sett." value={kpis.laserFlatThisWeek} tone="sky" />
        <Kpi label="Laser tubo" hint="output questa sett." value={kpis.laserTubeThisWeek} tone="cyan" />
        <KpiText
          label="Tipologia più impattante"
          value={kpis.topType ? kpis.topType.code : '—'}
          sub={kpis.topType ? `${kpis.topType.name} · ${kpis.topType.impact}` : 'nel periodo'}
          tone="amber"
        />
        <KpiText
          label="Commessa più impattante"
          value={kpis.topWorkItem ? (kpis.topWorkItem.code || kpis.topWorkItem.title) : '—'}
          sub={kpis.topWorkItem ? `impatto ${kpis.topWorkItem.impact}` : 'nel periodo'}
          tone="amber"
          onClick={kpis.topWorkItem ? () => onWorkItem(kpis.topWorkItem!.id) : undefined}
        />
      </div>
      <p className="text-[11px] text-slate-500">{WORKSHOP_IMPACT_EXPLANATION}</p>
    </div>
  )
}

type KpiTone = 'sky' | 'emerald' | 'orange' | 'violet' | 'cyan' | 'amber'

const KPI_TONE: Record<KpiTone, { glow: string; text: string }> = {
  sky: { glow: 'from-sky-500/25', text: 'text-sky-200' },
  emerald: { glow: 'from-emerald-500/25', text: 'text-emerald-200' },
  orange: { glow: 'from-orange-500/25', text: 'text-orange-200' },
  violet: { glow: 'from-violet-500/25', text: 'text-violet-200' },
  cyan: { glow: 'from-cyan-500/25', text: 'text-cyan-200' },
  amber: { glow: 'from-amber-500/25', text: 'text-amber-200' },
}

function Kpi({ label, hint, value, tone }: { label: string; hint?: string; value: number; tone: KpiTone }) {
  const t = KPI_TONE[tone]
  return (
    <div className="panel relative overflow-hidden p-4">
      <div className={`pointer-events-none absolute inset-x-0 -top-2 h-20 bg-gradient-to-b ${t.glow} to-transparent`} aria-hidden />
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div>
        <div className={`mt-1.5 text-[22px] font-semibold tabular-nums ${t.text}`}>{value}</div>
        {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
      </div>
    </div>
  )
}

function KpiText({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string
  value: string
  sub?: string
  tone: KpiTone
  onClick?: () => void
}) {
  const t = KPI_TONE[tone]
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`panel relative overflow-hidden p-4 text-left ${onClick ? 'cursor-pointer transition hover:border-slate-700' : ''}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 -top-2 h-20 bg-gradient-to-b ${t.glow} to-transparent`} aria-hidden />
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div>
        <div className={`mt-1.5 truncate text-base font-semibold ${t.text}`}>{value}</div>
        {sub && <div className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</div>}
      </div>
    </Wrapper>
  )
}

// ===== Prossime 4 settimane =====

function WeeklyLoadGrid({ weeks }: { weeks: WorkshopWeekLoad[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {weeks.map((w) => (
        <div key={w.weekStartISO} className="panel p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">{w.label}</span>
              {w.isCurrent && (
                <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-300 ring-1 ring-inset ring-sky-500/30">
                  Ora
                </span>
              )}
            </div>
            <LevelBadge level={w.level} />
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">{w.rangeLabel}</div>

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums text-slate-100">{w.aggregate.totalImpact}</span>
            <span className="text-[11px] text-slate-500">impatto · {w.aggregate.outputCount} output</span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
            <Stat label="Complessivi" value={w.aggregate.totalAssemblies} />
            <Stat label="Particolari" value={w.aggregate.totalParts} />
            <Stat label="Laser piano" value={w.aggregate.laserFlat} />
            <Stat label="Laser tubo" value={w.aggregate.laserTube} />
            <Stat label="Commesse" value={w.aggregate.workItemCount} />
          </dl>
        </div>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between rounded border border-slate-800/70 bg-slate-900/30 px-2 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="tabular-nums text-slate-200">{value}</dd>
    </div>
  )
}

// ===== Criticità =====

const ALERT_STYLE: Record<WorkshopAlert['tone'], { box: string; icon: string }> = {
  critico: { box: 'border-red-500/40 bg-red-500/8', icon: 'text-red-300' },
  attenzione: { box: 'border-amber-500/40 bg-amber-500/8', icon: 'text-amber-300' },
  info: { box: 'border-sky-500/35 bg-sky-500/6', icon: 'text-sky-300' },
}

function AlertsList({ alerts }: { alerts: WorkshopAlert[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {alerts.map((a) => {
        const style = ALERT_STYLE[a.tone]
        return (
          <div key={a.id} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${style.box}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`mt-0.5 shrink-0 ${style.icon}`} aria-hidden>
              <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-100">{a.title}</div>
              <div className="mt-0.5 text-[12px] text-slate-400">{a.detail}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ===== Carico per processo =====

function ProcessLoadGrid({ rows }: { rows: ReturnType<typeof buildProcessLoad> }) {
  const maxImpact = Math.max(1, ...rows.map((r) => r.totalImpact))
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => (
        <div key={row.key} className="panel p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-100">{row.label}</span>
            <span className="text-[11px] tabular-nums text-slate-400">{row.outputCount} output</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold tabular-nums text-slate-100">{row.totalImpact}</span>
            <span className="text-[11px] text-slate-500">impatto</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-gradient-to-r from-sky-500 to-sky-400" style={{ width: `${(row.totalImpact / maxImpact) * 100}%` }} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
            <Stat label="Qtà" value={row.totalQuantity} />
            <Stat label="Part." value={row.totalParts} />
            <Stat label="Comm." value={row.workItemCount} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== Carico per tipologia =====

function TypeLoadTable({ rows }: { rows: ReturnType<typeof buildTypeLoad> }) {
  if (rows.length === 0) {
    return <EmptyHint>Nessuna tipologia con output nel periodo selezionato.</EmptyHint>
  }
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="table-head border-b border-slate-800">
              <th className="px-3 py-2.5 font-semibold">Tipologia</th>
              <th className="px-3 py-2.5 text-right font-semibold">Output</th>
              <th className="px-3 py-2.5 text-right font-semibold">Quantità</th>
              <th className="px-3 py-2.5 text-right font-semibold">Complessivi</th>
              <th className="px-3 py-2.5 text-right font-semibold">Particolari</th>
              <th className="px-3 py-2.5 text-right font-semibold">Commesse</th>
              <th className="px-3 py-2.5 text-right font-semibold">Impatto</th>
              <th className="px-3 py-2.5 font-semibold">Livello</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rows.map((row) => (
              <tr key={row.code} className="transition hover:bg-slate-800/30">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-100">{row.code}</span>
                    <span className="text-slate-300">{row.name}</span>
                  </div>
                  {row.family && <div className="mt-0.5 text-[10px] text-slate-500">{row.family}</div>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{row.outputCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{row.totalQuantity}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{row.totalAssemblies}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{row.totalParts}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{row.workItemCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-100">{row.totalImpact}</td>
                <td className="px-3 py-2.5"><LevelBadge level={row.level} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ===== Flusso giornaliero =====

function DailyFlowTable({
  groups,
  onWorkItem,
}: {
  groups: ReturnType<typeof buildDailyFlow>
  onWorkItem: (id: string) => void
}) {
  if (groups.length === 0) {
    return <EmptyHint>Nessun output con data di arrivo nel periodo selezionato.</EmptyHint>
  }
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.dateISO} className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 bg-[color:var(--color-surface-1)]/60 px-3 py-2">
            <span className="section-label">{formatDayLabel(group.dateISO)}</span>
            <span className="text-[11px] tabular-nums text-slate-400">{group.items.length} output · impatto {group.totalImpact}</span>
          </div>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="table-head border-b border-slate-800">
                  <th className="px-3 py-2 font-semibold">Commessa</th>
                  <th className="px-3 py-2 font-semibold">Cliente</th>
                  <th className="px-3 py-2 font-semibold">Tipologia · output</th>
                  <th className="px-3 py-2 font-semibold">Progettista</th>
                  <th className="px-3 py-2 text-right font-semibold">Qtà</th>
                  <th className="px-3 py-2 text-right font-semibold">Compl.</th>
                  <th className="px-3 py-2 text-right font-semibold">Part.</th>
                  <th className="px-3 py-2 font-semibold">Processi</th>
                  <th className="px-3 py-2 text-right font-semibold">Impatto</th>
                  <th className="px-3 py-2 font-semibold">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {group.items.map((item) => (
                  <FlowRow key={item.output.id} item={item} onWorkItem={onWorkItem} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function FlowRow({ item, onWorkItem }: { item: WorkshopFlowItem; onWorkItem: (id: string) => void }) {
  const w = item.workItem
  return (
    <tr
      className={`group transition ${w ? 'cursor-pointer hover:bg-sky-500/5' : ''}`}
      onClick={w ? () => onWorkItem(w.id) : undefined}
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-medium text-slate-200 group-hover:text-sky-300">{w?.code || '—'}</span>
          {item.workshopDateSource === 'workItem' || item.workshopDateSource === 'none' ? (
            <span title="Data dedotta dal lavoro, non impostata sull'output" className="text-amber-300/80">~</span>
          ) : null}
        </div>
        <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-slate-500">{w?.title || 'Lavoro non trovato'}</div>
      </td>
      <td className="px-3 py-2.5 text-slate-300">{item.customerName}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-semibold text-slate-200">{item.output.machineTypeCode}</span>
          <span className="text-slate-300">{item.output.machineTypeName}</span>
        </div>
        {item.output.description && (
          <div className="mt-0.5 max-w-[260px] truncate text-[11px] text-slate-500">{item.output.description}</div>
        )}
      </td>
      <td className="px-3 py-2.5 text-[12px] text-slate-300">
        {item.assignees.length > 0 ? item.assignees.join(', ') : '—'}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{item.output.quantity}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{item.output.assemblyCount}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{item.output.estimatedPartCount}</td>
      <td className="px-3 py-2.5">
        <ProcessBadges processes={item.processes} output={item.output} />
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <span className="tabular-nums font-semibold text-slate-100">{item.output.impactScore}</span>
          <LevelDot level={item.level} />
        </div>
      </td>
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <StatusBadge status={item.output.status} released={isReleased(item.output)} />
      </td>
    </tr>
  )
}

// ===== Badge =====

function LevelBadge({ level }: { level: WorkshopImpactLevel }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${LEVEL_BADGE[level]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[level]}`} aria-hidden />
      {level}
    </span>
  )
}

function LevelDot({ level }: { level: WorkshopImpactLevel }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${LEVEL_DOT[level]}`} title={`Livello ${level}`} aria-hidden />
}

function StatusBadge({ status, released }: { status: WorkshopOutputStatus; released: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium ring-1 ring-inset ${STATUS_BADGE[status]}`}>
      {released && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
      {WORKSHOP_STATUS_LABELS[status]}
    </span>
  )
}

function ProcessBadges({ processes, output }: { processes: WorkshopProcessKey[]; output?: WorkshopOutput }) {
  if (processes.length === 0) return <span className="text-[11px] text-slate-600">—</span>
  return (
    <div className="flex max-w-[220px] flex-wrap gap-1">
      {processes.map((p) => (
        <span key={p} className={`chip-sm ${PROCESS_BADGE[p]}`} title={PROCESS_LABEL.get(p)}>
          {PROCESS_SHORT.get(p)}{output ? ` ${processWeightPercent(output, p)}%` : ''}
        </span>
      ))}
    </div>
  )
}

function processWeightPercent(output: WorkshopOutput, processKey: WorkshopProcessKey): number {
  const process = WORKSHOP_PROCESSES.find((item) => item.key === processKey)
  if (!process) return 0
  const value = output[process.weight]
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
}

// ===== Shared bits =====

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <span className="mt-1 h-6 w-1 rounded-full bg-gradient-to-b from-orange-400 to-orange-600" aria-hidden />
      <div>
        <h3 className="text-base font-semibold tracking-tight text-slate-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
      </div>
    </div>
  )
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="panel px-3 py-8 text-center text-[12px] text-slate-500">{children}</div>
  )
}

function EmptyState() {
  return (
    <div className="panel p-12 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800/60 ring-1 ring-inset ring-slate-700">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            <path d="M9 13h6M9 17h4" />
          </svg>
        </div>
        <div className="text-sm font-medium text-slate-300">Nessun output verso officina</div>
        <p className="text-[12px] text-slate-500">
          Gli output si compilano nella commessa (sezione "Output verso officina" nel Nuovo lavoro / Modifica lavoro).
          Una volta inseriti, qui vedrai il carico previsto in officina.
        </p>
      </div>
    </div>
  )
}

const DOW = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

function formatDayLabel(iso: string): string {
  const d = parseISODate(iso)
  const todayStr = new Date().toISOString().slice(0, 10)
  const prefix = iso === todayStr ? 'Oggi · ' : ''
  return `${prefix}${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}
