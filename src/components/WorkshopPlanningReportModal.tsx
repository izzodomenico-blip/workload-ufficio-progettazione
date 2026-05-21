import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useData } from '../state/DataProvider'
import { WORKSHOP_ASSIGNMENT_STATUS_LABELS } from '../types'
import { formatItalianShort } from '../utils/dates'
import type { WorkerLoadLevel } from '../utils/workshopCapacity'
import {
  buildWorkshopPlanningReport,
  type PlanningReportAlert,
  type WorkshopPlanningReport,
  type WorkshopPlanningReportFilters,
} from '../utils/workshopPlanningReport'

interface Props {
  open: boolean
  onClose: () => void
  filters: WorkshopPlanningReportFilters
}

const LEVEL_LABEL: Record<WorkerLoadLevel, string> = {
  disponibile: 'Disponibile',
  normale: 'Normale',
  pieno: 'Pieno',
  sovraccarico: 'Sovraccarico',
}

const LEVEL_BADGE: Record<WorkerLoadLevel, string> = {
  disponibile: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  normale: 'bg-sky-100 text-sky-700 ring-sky-200',
  pieno: 'bg-amber-100 text-amber-700 ring-amber-200',
  sovraccarico: 'bg-red-100 text-red-700 ring-red-200',
}

const LEVEL_BAR: Record<WorkerLoadLevel, string> = {
  disponibile: 'bg-emerald-500',
  normale: 'bg-sky-500',
  pieno: 'bg-amber-500',
  sovraccarico: 'bg-red-500',
}

const ALERT_BADGE: Record<PlanningReportAlert['tone'], string> = {
  critico: 'bg-red-100 text-red-700 ring-red-200',
  attenzione: 'bg-amber-100 text-amber-700 ring-amber-200',
  info: 'bg-sky-100 text-sky-700 ring-sky-200',
}

const ALERT_LABEL: Record<PlanningReportAlert['tone'], string> = {
  critico: 'Critico',
  attenzione: 'Attenzione',
  info: 'Info',
}

const OUTPUT_LIMIT = 20
const ASSIGNMENT_LIMIT = 20

function fmtGenerated(d: Date): string {
  const date = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${date} · ${time}`
}

export function WorkshopPlanningReportModal({ open, onClose, filters }: Props) {
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

  const report = useMemo<WorkshopPlanningReport | null>(
    () => (open ? buildWorkshopPlanningReport(data, filters, new Date()) : null),
    [open, data, filters],
  )

  if (!open || !report) return null

  const outputsVisible = report.unassignedOutputs.slice(0, OUTPUT_LIMIT)
  const outputsHidden = report.unassignedOutputs.length - outputsVisible.length
  const assignmentsVisible = report.topAssignments.slice(0, ASSIGNMENT_LIMIT)

  return (
    <div className="report-print-root fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Anteprima report pianificazione officina">
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
            I punti carico non rappresentano ore: sono un indice relativo di saturazione produttiva.
            La saturazione è espressa su scala 0–10 (10 = piena).
          </p>

          <p className="mt-3 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-600">Filtri applicati:</span> {report.filtersSummary}
          </p>

          <section className="mt-6 print-keep">
            <SectionTitle>Sintesi saturazione</SectionTitle>
            <SummaryGrid report={report} />
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle meta={report.alerts.length > 0 ? String(report.alerts.length) : undefined}>
              Criticità operative
            </SectionTitle>
            <AlertsBlock alerts={report.alerts} />
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle>Carico per processo</SectionTitle>
            <ProcessTable report={report} />
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle>Distribuzione carico nel periodo</SectionTitle>
            <BreakdownTable report={report} />
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle meta={String(report.overloadedWorkers.length)}>Operai sovraccarichi</SectionTitle>
            <WorkersTable rows={report.overloadedWorkers} emptyText="Nessun operaio in sovraccarico nel periodo." />
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle meta={String(report.availableWorkers.length)}>Operai disponibili</SectionTitle>
            <WorkersTable rows={report.availableWorkers} emptyText="Nessun operaio risulta disponibile (sotto 60%)." />
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle meta={String(report.unassignedOutputs.length)}>Output non assegnati</SectionTitle>
            <UnassignedTable rows={outputsVisible} />
            {outputsHidden > 0 && (
              <p className="mt-2 text-[10px] italic text-slate-500">
                Mostrati i primi {OUTPUT_LIMIT} per data. Altri {outputsHidden} nella dashboard Pianificazione officina.
              </p>
            )}
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle meta={String(report.topAssignments.length)}>Assegnazioni principali</SectionTitle>
            <AssignmentsTable rows={assignmentsVisible} />
          </section>

          <Footer report={report} />
        </div>
      </article>
    </div>
  )
}

function Header({ report }: { report: WorkshopPlanningReport }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900">
          <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden>
            <path d="M14 44 L24 24 L32 36 L40 20 L50 44" stroke="#fb923c" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h1 className="text-[21px] font-semibold leading-tight tracking-tight text-slate-900">Report pianificazione officina</h1>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">{report.scopeLabel}</p>
        </div>
      </div>
      <div className="text-right">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          {report.periodLabel}
        </div>
        <div className="mt-1.5 text-sm font-medium text-slate-700">
          {formatItalianShort(report.periodStartISO)} → {formatItalianShort(report.periodEndISO)}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">Generato {fmtGenerated(report.generatedAt)}</div>
      </div>
    </header>
  )
}

function SummaryGrid({ report }: { report: WorkshopPlanningReport }) {
  const s = report.summary
  const tiles: Array<{ label: string; value: ReactNode; sub?: string }> = [
    { label: 'Operai considerati', value: s.workersConsidered },
    { label: 'Saturazione media', value: `${s.avgScore10.toFixed(1)}/10`, sub: `${s.saturationPercent}% del periodo` },
    { label: 'Sovraccarichi', value: s.overloaded, sub: 'oltre 100%' },
    { label: 'Disponibili', value: s.available, sub: 'sotto 60%' },
    { label: 'Punti assegnati', value: s.totalLoadPoints, sub: `su ${s.totalCapacityPoints} capacità` },
  ]
  return (
    <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 print:grid-cols-5">
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

function AlertsBlock({ alerts }: { alerts: PlanningReportAlert[] }) {
  if (alerts.length === 0) {
    return (
      <p className="mt-3 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-[12px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
        Nessuna criticità rilevante nel periodo.
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

function ProcessTable({ report }: { report: WorkshopPlanningReport }) {
  if (report.processLoad.length === 0) {
    return <EmptyRow>Nessuna assegnazione nel periodo.</EmptyRow>
  }
  const max = Math.max(1, ...report.processLoad.map((row) => row.loadPoints))
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.1em] text-slate-500">
          <tr><Th>Processo / postazione</Th><Th right>Output</Th><Th right>Operai</Th><Th right>Punti</Th><Th>Peso relativo</Th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {report.processLoad.map((row) => (
            <tr key={row.process}>
              <td className="px-2.5 py-1.5 font-medium text-slate-800">{row.label}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{row.assignmentCount}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{row.workerCount}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-slate-900">{row.loadPoints}</td>
              <td className="px-2.5 py-1.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-orange-400" style={{ width: `${(row.loadPoints / max) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BreakdownTable({ report }: { report: WorkshopPlanningReport }) {
  if (report.periodBreakdown.length === 0) return <EmptyRow>Nessun dato nel periodo.</EmptyRow>
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-5 lg:grid-cols-5">
      {report.periodBreakdown.map((bucket, i) => (
        <div key={`${bucket.label}-${i}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-slate-800">{bucket.label}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-[1px] text-[9px] font-semibold ring-1 ring-inset ${LEVEL_BADGE[bucket.level]}`}>
              {bucket.score10.toFixed(1)}/10
            </span>
          </div>
          <div className="text-[10px] text-slate-500">{bucket.sublabel}</div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${LEVEL_BAR[bucket.level]}`} style={{ width: `${Math.min(140, Math.max(0, (bucket.capacityPoints > 0 ? (bucket.loadPoints / bucket.capacityPoints) * 100 : 0)))}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-slate-500">{bucket.loadPoints} / {bucket.capacityPoints} pt</div>
        </div>
      ))}
    </div>
  )
}

function WorkersTable({ rows, emptyText }: { rows: WorkshopPlanningReport['overloadedWorkers']; emptyText: string }) {
  if (rows.length === 0) return <EmptyRow>{emptyText}</EmptyRow>
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.1em] text-slate-500">
          <tr><Th>Operaio</Th><Th>Skill</Th><Th right>Punti</Th><Th right>Saturazione</Th><Th>Livello</Th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.worker.id}>
              <td className="px-2.5 py-1.5 font-medium text-slate-800">{row.worker.displayName}</td>
              <td className="px-2.5 py-1.5 text-slate-500">{row.worker.skills.slice(0, 3).join(', ') || '—'}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{row.loadPoints} / {row.capacityPoints}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-slate-900">{row.score10.toFixed(1)}/10</td>
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

function UnassignedTable({ rows }: { rows: WorkshopPlanningReport['unassignedOutputs'] }) {
  if (rows.length === 0) return <EmptyRow>Tutti gli output del periodo sono assegnati.</EmptyRow>
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.1em] text-slate-500">
          <tr><Th>Data</Th><Th>Commessa</Th><Th>Cliente</Th><Th>Output</Th><Th>Processi mancanti</Th><Th>Stato</Th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.output.id} className="align-top">
              <td className="px-2.5 py-1.5 tabular-nums text-slate-700">{row.date ? formatItalianShort(row.date) : '—'}</td>
              <td className="px-2.5 py-1.5 font-mono font-semibold text-slate-800">{row.workItem?.code || '—'}</td>
              <td className="px-2.5 py-1.5 text-slate-700">{row.workItem?.customer || '—'}</td>
              <td className="px-2.5 py-1.5">
                <span className="font-mono font-semibold text-slate-800">{row.output.machineTypeCode}</span>
                <span className="ml-1 text-slate-600">{row.output.machineTypeName}</span>
              </td>
              <td className="px-2.5 py-1.5 text-slate-600">{row.coverage.missingProcesses.join(', ') || '—'}</td>
              <td className="px-2.5 py-1.5">
                <span className={`inline-flex items-center rounded-full px-2 py-[1px] text-[9px] font-medium ring-1 ring-inset ${row.coverage.status === 'non_assegnato' ? 'bg-slate-100 text-slate-600 ring-slate-200' : 'bg-amber-100 text-amber-700 ring-amber-200'}`}>
                  {row.coverage.status === 'non_assegnato' ? 'Non assegnato' : 'Parziale'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AssignmentsTable({ rows }: { rows: WorkshopPlanningReport['topAssignments'] }) {
  if (rows.length === 0) return <EmptyRow>Nessuna assegnazione nel periodo.</EmptyRow>
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.1em] text-slate-500">
          <tr><Th>Data</Th><Th>Operaio</Th><Th>Processo</Th><Th>Commessa</Th><Th>Output</Th><Th right>Punti</Th><Th>Stato</Th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.assignment.id}>
              <td className="px-2.5 py-1.5 tabular-nums text-slate-700">{formatItalianShort(row.assignment.plannedDate)}</td>
              <td className="px-2.5 py-1.5 font-medium text-slate-800">{row.workerName}</td>
              <td className="px-2.5 py-1.5 text-slate-600">{row.assignment.process}</td>
              <td className="px-2.5 py-1.5 font-mono text-slate-700">{row.workItemCode}</td>
              <td className="px-2.5 py-1.5 text-slate-600">{row.outputLabel}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-slate-900">{row.assignment.loadPoints}</td>
              <td className="px-2.5 py-1.5 text-slate-600">{WORKSHOP_ASSIGNMENT_STATUS_LABELS[row.assignment.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Footer({ report }: { report: WorkshopPlanningReport }) {
  return (
    <footer className="mt-8 border-t border-slate-200 pt-4 text-[10px] text-slate-400">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Workload · Officina · Report pianificazione</span>
        <span>{report.scopeLabel} · {formatItalianShort(report.periodStartISO)} → {formatItalianShort(report.periodEndISO)} · generato {fmtGenerated(report.generatedAt)}</span>
      </div>
      <p className="mt-1.5">I punti carico non rappresentano ore. Saturazione su scala 0–10 (10 = piena).</p>
    </footer>
  )
}

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
