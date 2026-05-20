import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useData } from '../state/DataProvider'
import { formatItalianShort } from '../utils/dates'
import type { WorkshopImpactLevel } from '../utils/workshopImpact'
import {
  WORKSHOP_PROCESSES,
  WORKSHOP_STATUS_LABELS,
  type WorkshopAlert,
  type WorkshopFlowItem,
  type WorkshopLoadFilters,
  type WorkshopProcessKey,
} from '../utils/workshopLoad'
import {
  buildWorkshopReport,
  formatReportRange,
  WORKSHOP_REPORT_FLOW_LIMIT,
  WORKSHOP_REPORT_IMPACT_NOTE,
  type WorkshopReportModel,
} from '../utils/workshopReport'
import type { WorkshopOutputStatus } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  filters: WorkshopLoadFilters
}

const LEVEL_LABEL: Record<WorkshopImpactLevel, string> = {
  basso: 'Basso',
  medio: 'Medio',
  alto: 'Alto',
  critico: 'Critico',
}

const LEVEL_BADGE: Record<WorkshopImpactLevel, string> = {
  basso: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  medio: 'bg-sky-100 text-sky-700 ring-sky-200',
  alto: 'bg-amber-100 text-amber-700 ring-amber-200',
  critico: 'bg-red-100 text-red-700 ring-red-200',
}

const STATUS_BADGE: Record<WorkshopOutputStatus, string> = {
  previsto: 'bg-slate-100 text-slate-600 ring-slate-200',
  in_progettazione: 'bg-sky-100 text-sky-700 ring-sky-200',
  pronto_rilascio: 'bg-violet-100 text-violet-700 ring-violet-200',
  rilasciato_produzione: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  ricevuto_officina: 'bg-emerald-200 text-emerald-800 ring-emerald-300',
  sospeso: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
}

const ALERT_BADGE: Record<WorkshopAlert['tone'], string> = {
  critico: 'bg-red-100 text-red-700 ring-red-200',
  attenzione: 'bg-amber-100 text-amber-700 ring-amber-200',
  info: 'bg-sky-100 text-sky-700 ring-sky-200',
}

const ALERT_LABEL: Record<WorkshopAlert['tone'], string> = {
  critico: 'Critico',
  attenzione: 'Attenzione',
  info: 'Info',
}

const PROCESS_SHORT = new Map(WORKSHOP_PROCESSES.map((p) => [p.key, p.short]))
const PROCESS_LABEL = new Map(WORKSHOP_PROCESSES.map((p) => [p.key, p.label]))

function fmtGenerated(d: Date): string {
  const date = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${date} · ${time}`
}

export function WorkshopReportModal({ open, onClose, filters }: Props) {
  const { data } = useData()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const report = useMemo<WorkshopReportModel | null>(() => {
    if (!open) return null
    return buildWorkshopReport(data, filters, new Date())
  }, [open, data, filters])

  if (!open || !report) return null

  const flowVisible = report.flowRows.slice(0, WORKSHOP_REPORT_FLOW_LIMIT)
  const flowHidden = report.flowTotalCount - flowVisible.length

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Anteprima report flusso officina">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm print:hidden" onClick={onClose} aria-hidden />

      <div className="relative z-20 mx-auto flex max-w-[230mm] items-center justify-between gap-3 px-4 pt-4 print:hidden">
        <span className="hidden items-center gap-1.5 rounded-full bg-orange-500/15 px-2.5 py-1 text-[11px] font-medium text-orange-200 ring-1 ring-inset ring-orange-500/30 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-300" />
          Anteprima · pronta per stampa o PDF
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Chiudi</button>
          <button type="button" onClick={() => window.print()} className="btn-primary">
            <PrinterIcon /> Stampa · Salva PDF
          </button>
        </div>
      </div>

      <article className="report-print-area relative z-10 mx-auto my-6 max-w-[210mm] bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200 print:m-0 print:max-w-none print:shadow-none print:ring-0">
        <div className="px-9 pt-8 pb-9 print:px-0 print:pt-2 print:pb-0">
          <Header report={report} />

          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-600 print-keep">
            {WORKSHOP_REPORT_IMPACT_NOTE}
          </p>

          <p className="mt-3 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-600">Filtri applicati:</span> {report.filtersSummary}
          </p>

          <section className="mt-6 print-keep">
            <SectionTitle>Sintesi</SectionTitle>
            <SummaryGrid report={report} />
            <p className={`mt-3 rounded-lg px-3.5 py-2.5 text-[12px] font-medium ${
              report.criticalitySentence.startsWith('Nessuna')
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
            }`}>
              {report.criticalitySentence}
            </p>
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle meta={`${report.flowTotalCount} output`}>Flusso previsto verso officina</SectionTitle>
            <FlowTable rows={flowVisible} />
            {flowHidden > 0 && (
              <p className="mt-2 text-[10px] italic text-slate-500">
                Mostrate le prime {WORKSHOP_REPORT_FLOW_LIMIT} righe ordinate per data. Per il dettaglio completo
                ({flowHidden} in più) consultare la dashboard Carico officina.
              </p>
            )}
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle>Carico per processo</SectionTitle>
            <ProcessTable report={report} />
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle meta="prime 8 per impatto">Carico per tipologia</SectionTitle>
            <TypeTable report={report} />
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle>Distribuzione prossime 4 settimane</SectionTitle>
            <WeeksGrid report={report} />
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle meta={report.alerts.length > 0 ? `${report.alerts.length}` : undefined}>
              Criticità / attenzioni per la produzione
            </SectionTitle>
            <AlertsBlock alerts={report.alerts} />
          </section>

          <Footer report={report} />
        </div>
      </article>
    </div>
  )
}

// ===== Header =====

function Header({ report }: { report: WorkshopReportModel }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900">
          <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden>
            <path d="M14 44 L24 24 L32 36 L40 20 L50 44" stroke="#38bdf8" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h1 className="text-[21px] font-semibold leading-tight tracking-tight text-slate-900">
            Report flusso progettazione → officina
          </h1>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Ufficio Progettazione Meccanica
          </p>
        </div>
      </div>
      <div className="text-right">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          {report.periodLabel}
        </div>
        <div className="mt-1.5 text-sm font-medium text-slate-700">
          {formatReportRange(report.periodStartISO, report.periodEndISO)}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          Generato {fmtGenerated(report.generatedAt)}
        </div>
      </div>
    </header>
  )
}

// ===== Sintesi =====

function SummaryGrid({ report }: { report: WorkshopReportModel }) {
  const s = report.summary
  const tiles: Array<{ label: string; value: ReactNode; sub?: string }> = [
    { label: 'Output previsti', value: s.expectedCount, sub: 'nel periodo' },
    { label: 'Già rilasciati', value: s.releasedCount, sub: 'verso produzione' },
    { label: 'Indice impatto', value: s.totalImpact, sub: 'relativo, non ore' },
    { label: 'Complessivi', value: s.totalAssemblies },
    { label: 'Particolari', value: s.totalParts, sub: 'stimati' },
    { label: 'Commesse', value: s.workItemCount, sub: 'coinvolte' },
  ]
  return (
    <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 print:grid-cols-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Livello complessivo</div>
        <div className="mt-1.5">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ring-inset ${LEVEL_BADGE[s.level]}`}>
            {LEVEL_LABEL[s.level]}
          </span>
        </div>
      </div>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{t.label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{t.value}</div>
          {t.sub && <div className="text-[10px] text-slate-400">{t.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// ===== Flusso =====

function FlowTable({ rows }: { rows: WorkshopFlowItem[] }) {
  if (rows.length === 0) {
    return <EmptyRow>Nessun output con data di arrivo nel periodo selezionato.</EmptyRow>
  }
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.1em] text-slate-500">
          <tr>
            <Th>Data</Th>
            <Th>Commessa</Th>
            <Th>Cliente</Th>
            <Th>Output</Th>
            <Th right>Q.tà</Th>
            <Th right>Compl.</Th>
            <Th right>Part.</Th>
            <Th>Processi</Th>
            <Th right>Impatto</Th>
            <Th>Stato</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((item) => (
            <tr key={item.output.id} className="align-top">
              <td className="px-2.5 py-1.5 tabular-nums text-slate-700">{item.workshopDate ? formatItalianShort(item.workshopDate) : '—'}</td>
              <td className="px-2.5 py-1.5">
                <div className="font-mono font-semibold text-slate-800">{item.workItem?.code || '—'}</div>
                <div className="max-w-[140px] truncate text-[10px] text-slate-500">{item.workItem?.title || ''}</div>
              </td>
              <td className="px-2.5 py-1.5 text-slate-700">{item.customerName}</td>
              <td className="px-2.5 py-1.5">
                <div className="font-mono font-semibold text-slate-800">{item.output.machineTypeCode}</div>
                <div className="max-w-[150px] truncate text-[10px] text-slate-500">{item.output.machineTypeName}</div>
              </td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{item.output.quantity}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{item.output.assemblyCount}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{item.output.estimatedPartCount}</td>
              <td className="px-2.5 py-1.5">
                <ProcessBadges processes={item.processes} />
              </td>
              <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-slate-900">{item.output.impactScore}</td>
              <td className="px-2.5 py-1.5">
                <span className={`inline-flex items-center rounded-full px-2 py-[1px] text-[9px] font-medium ring-1 ring-inset ${STATUS_BADGE[item.output.status]}`}>
                  {WORKSHOP_STATUS_LABELS[item.output.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ===== Processo =====

function ProcessTable({ report }: { report: WorkshopReportModel }) {
  if (report.processLoad.length === 0) {
    return <EmptyRow>Nessun processo coinvolto nel periodo selezionato.</EmptyRow>
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 print:grid-cols-4">
      {report.processLoad.map((row) => (
        <div key={row.key} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="text-[12px] font-semibold text-slate-800">{row.label}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{row.totalImpact}</div>
          <div className="text-[10px] text-slate-500">impatto · {row.outputCount} output</div>
          <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
            <span>{row.totalParts} part.</span>
            <span>{row.workItemCount} comm.</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== Tipologia =====

function TypeTable({ report }: { report: WorkshopReportModel }) {
  if (report.typeLoad.length === 0) {
    return <EmptyRow>Nessuna tipologia con output nel periodo selezionato.</EmptyRow>
  }
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.1em] text-slate-500">
          <tr>
            <Th>Tipologia</Th>
            <Th right>Q.tà</Th>
            <Th right>Output</Th>
            <Th right>Compl.</Th>
            <Th right>Part.</Th>
            <Th right>Impatto</Th>
            <Th>Livello</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {report.typeLoad.map((row) => (
            <tr key={row.code}>
              <td className="px-2.5 py-1.5">
                <span className="font-mono font-semibold text-slate-800">{row.code}</span>
                <span className="ml-1.5 text-slate-600">{row.name}</span>
              </td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{row.totalQuantity}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{row.outputCount}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{row.totalAssemblies}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{row.totalParts}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-slate-900">{row.totalImpact}</td>
              <td className="px-2.5 py-1.5">
                <span className={`inline-flex items-center rounded-full px-2 py-[1px] text-[9px] font-semibold ring-1 ring-inset ${LEVEL_BADGE[row.level]}`}>
                  {LEVEL_LABEL[row.level]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ===== Settimane =====

function WeeksGrid({ report }: { report: WorkshopReportModel }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2.5 print:grid-cols-4 lg:grid-cols-4">
      {report.weeks.map((w) => (
        <div key={w.weekStartISO} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-slate-800">{w.label}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-[1px] text-[9px] font-semibold ring-1 ring-inset ${LEVEL_BADGE[w.level]}`}>
              {LEVEL_LABEL[w.level]}
            </span>
          </div>
          <div className="text-[10px] text-slate-500">{w.rangeLabel}</div>
          <div className="mt-1.5 text-lg font-semibold tabular-nums text-slate-900">{w.aggregate.totalImpact}</div>
          <div className="text-[10px] text-slate-500">impatto · {w.aggregate.outputCount} output</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-slate-600">
            <span>Compl. {w.aggregate.totalAssemblies}</span>
            <span>Part. {w.aggregate.totalParts}</span>
            <span>Laser {w.aggregate.laserFlat}</span>
            <span>Tubo {w.aggregate.laserTube}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== Criticità =====

function AlertsBlock({ alerts }: { alerts: WorkshopAlert[] }) {
  if (alerts.length === 0) {
    return (
      <p className="mt-3 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-[12px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
        Nessuna criticità rilevante.
      </p>
    )
  }
  return (
    <ul className="mt-3 space-y-1.5">
      {alerts.map((a) => (
        <li key={a.id} className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-[1px] text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset ${ALERT_BADGE[a.tone]}`}>
            {ALERT_LABEL[a.tone]}
          </span>
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-slate-800">{a.title}</div>
            <div className="text-[10px] text-slate-500">{a.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ===== Footer =====

function Footer({ report }: { report: WorkshopReportModel }) {
  return (
    <footer className="mt-8 border-t border-slate-200 pt-4 text-[10px] text-slate-400">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Workload · Ufficio Progettazione Meccanica · Report flusso officina</span>
        <span>Periodo {formatReportRange(report.periodStartISO, report.periodEndISO)} · generato {fmtGenerated(report.generatedAt)}</span>
      </div>
      <p className="mt-1.5">{WORKSHOP_REPORT_IMPACT_NOTE}</p>
    </footer>
  )
}

// ===== Bits =====

function SectionTitle({ children, meta }: { children: ReactNode; meta?: string }) {
  return (
    <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
      <span className="h-3 w-1 rounded-sm bg-orange-400" aria-hidden />
      <span>{children}</span>
      {meta !== undefined && <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">· {meta}</span>}
    </h2>
  )
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={`px-2.5 py-1.5 font-semibold ${right ? 'text-right' : ''}`}>{children}</th>
}

function ProcessBadges({ processes }: { processes: WorkshopProcessKey[] }) {
  if (processes.length === 0) return <span className="text-slate-400">—</span>
  return (
    <div className="flex max-w-[150px] flex-wrap gap-0.5">
      {processes.map((p) => (
        <span key={p} className="inline-flex items-center rounded bg-slate-100 px-1.5 py-[1px] text-[9px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200" title={PROCESS_LABEL.get(p)}>
          {PROCESS_SHORT.get(p)}
        </span>
      ))}
    </div>
  )
}

function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center text-[11px] text-slate-500">
      {children}
    </div>
  )
}

function PrinterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
    </svg>
  )
}
