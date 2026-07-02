import { useEffect, useMemo } from 'react'
import { useData } from '../state/DataProvider'
import { formatItalianShort } from '../utils/dates'
import {
  STANDARD_CALCULATION_STATUS_LABELS,
  STANDARD_CALCULATION_TYPE_LABELS,
  getStandardCalculationType,
  isStandardCalculationSupported,
  validateStandardParameters,
} from '../utils/standardComponentsCalculator'
import type { WorkItem, WorkshopOutput } from '../types'

interface Props {
  open: boolean
  onClose: () => void
}

interface ReportRow {
  output: WorkshopOutput
  workItem?: WorkItem
  calculationType: ReturnType<typeof getStandardCalculationType>
  validation: ReturnType<typeof validateStandardParameters>
}

function fmtGenerated(d: Date): string {
  const date = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${date} · ${time}`
}

export function StandardParametersReportModal({ open, onClose }: Props) {
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

  const rows = useMemo<ReportRow[]>(() => {
    if (!open) return []
    const workItemById = new Map(data.workItems.map((wi) => [wi.id, wi]))
    return data.workshopOutputs
      .filter((output) => isStandardCalculationSupported(output.machineTypeCode))
      .map((output) => ({
        output,
        workItem: workItemById.get(output.workItemId),
        calculationType: getStandardCalculationType(output.machineTypeCode),
        validation: validateStandardParameters({
          machineTypeCode: output.machineTypeCode,
          machineLengthMm: output.machineLengthMm,
          machineWidthMm: output.machineWidthMm,
          machineHeightMm: output.machineHeightMm,
          machineSpanMm: output.machineSpanMm,
          machineModuleCount: output.machineModuleCount,
          machineBayCount: output.machineBayCount,
          machineSlopePercent: output.machineSlopePercent,
        }),
      }))
      .sort((a, b) => (a.workItem?.code ?? '').localeCompare(b.workItem?.code ?? '', 'it'))
  }, [open, data])

  if (!open) return null

  const calculated = data.calculatedStandardComponents ?? []
  const generatedAt = new Date()
  const ready = rows.filter((row) => row.validation.status === 'ready').length
  const missing = rows.filter((row) => row.validation.status === 'missing_parameters').length

  return (
    <div className="report-print-root fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Anteprima report componenti standard da parametri">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm print:hidden" onClick={onClose} aria-hidden />

      <div className="relative z-20 mx-auto flex max-w-[230mm] items-center justify-between gap-3 px-4 pt-4 print:hidden">
        <span className="hidden items-center gap-1.5 rounded-full bg-orange-500/15 px-2.5 py-1 text-[11px] font-medium text-orange-200 ring-1 ring-inset ring-orange-500/30 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-300" />
          Anteprima · pronta per stampa o PDF
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Chiudi</button>
          <button type="button" onClick={() => window.print()} className="btn-primary">
            Stampa · Salva PDF
          </button>
        </div>
      </div>

      <article className="report-print-area relative z-10 mx-auto my-6 max-w-[210mm] bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200 print:m-0 print:max-w-none print:shadow-none print:ring-0">
        <div className="px-9 pt-8 pb-9 print:px-0 print:pt-2 print:pb-0">
          <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
            <div>
              <h1 className="text-[21px] font-semibold leading-tight tracking-tight text-slate-900">Report componenti standard da parametri</h1>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">Output I.TS / I.SC con parametri raccolti</p>
            </div>
            <div className="text-right text-[11px] text-slate-500">Generato {fmtGenerated(generatedAt)}</div>
          </header>

          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-600 print-keep">
            I dati non rappresentano ore. Servono a identificare componenti standard potenzialmente anticipabili.
            Formula di calcolo non ancora configurata. I parametri sono stati raccolti per predisporre il calcolo dei componenti standard.
          </p>

          <section className="mt-6 grid grid-cols-3 gap-3 print-keep print:grid-cols-3">
            <ReportTile label="Output coinvolti" value={String(rows.length)} />
            <ReportTile label="Parametri completi" value={String(ready)} sub="formula da configurare" />
            <ReportTile label="Parametri mancanti" value={String(missing)} />
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle>Output con parametri</SectionTitle>
            <table className="mt-3 w-full text-[11px]">
              <thead className="border-b border-slate-300 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1.5 pr-2">Commessa</th>
                  <th className="py-1.5 pr-2">Cliente</th>
                  <th className="py-1.5 pr-2">Tipo</th>
                  <th className="py-1.5 pr-2">Output</th>
                  <th className="py-1.5 pr-2 text-right">Lung.</th>
                  <th className="py-1.5 pr-2 text-right">Larg.</th>
                  <th className="py-1.5 pr-2 text-right">Alt.</th>
                  <th className="py-1.5 pr-2">Stato parametri</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <tr key={row.output.id} className="align-top">
                    <td className="py-1.5 pr-2 font-mono text-[10px] text-slate-700">{row.workItem?.code ?? '-'}</td>
                    <td className="py-1.5 pr-2 text-slate-700">{row.workItem?.customer ?? '-'}</td>
                    <td className="py-1.5 pr-2 text-slate-700">{STANDARD_CALCULATION_TYPE_LABELS[row.calculationType]}</td>
                    <td className="py-1.5 pr-2">
                      <div className="font-medium text-slate-900">{row.output.machineTypeCode} – {row.output.machineTypeName}</div>
                      <div className="text-[10px] text-slate-500">{row.output.description || '-'}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-700">{row.output.machineLengthMm ?? '—'}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-700">{row.output.machineWidthMm ?? '—'}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-700">{row.output.machineHeightMm ?? '—'}</td>
                    <td className="py-1.5 pr-2">
                      <span className="text-[10px] font-medium text-slate-700">{STANDARD_CALCULATION_STATUS_LABELS[row.validation.status]}</span>
                      {row.validation.missing.length > 0 && (
                        <div className="text-[10px] text-amber-700">Mancano: {row.validation.missing.map((m) => m.label).join(', ')}</div>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-[11px] italic text-slate-500">Nessun output I.TS o I.SC presente.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle meta={String(calculated.length)}>Componenti standard già calcolati</SectionTitle>
            {calculated.length === 0 ? (
              <p className="mt-2 text-[11px] italic text-slate-500">
                Formula di calcolo non ancora configurata. I parametri sono stati raccolti per predisporre il calcolo dei componenti standard.
              </p>
            ) : (
              <table className="mt-3 w-full text-[11px]">
                <thead className="border-b border-slate-300 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-2">Codice</th>
                    <th className="py-1.5 pr-2">Nome</th>
                    <th className="py-1.5 pr-2">Processo</th>
                    <th className="py-1.5 pr-2 text-right">Qta</th>
                    <th className="py-1.5 pr-2">Origine</th>
                    <th className="py-1.5 pr-2">Producibile da</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {calculated.map((component) => (
                    <tr key={component.id}>
                      <td className="py-1.5 pr-2 font-mono text-[10px] text-slate-700">{component.componentCode || '-'}</td>
                      <td className="py-1.5 pr-2 text-slate-800">{component.componentName || '-'}</td>
                      <td className="py-1.5 pr-2 text-slate-700">{component.process}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-800">{component.quantity}</td>
                      <td className="py-1.5 pr-2 text-slate-700">{component.source === 'calculated' ? 'Calcolato' : 'Manuale'}</td>
                      <td className="py-1.5 pr-2 text-slate-700">{component.readyFromDate ? formatItalianShort(component.readyFromDate) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <footer className="mt-8 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
            Report generato dall'app Workload Ufficio Progettazione. I parametri sono stati raccolti per predisporre il calcolo automatico dei componenti standard.
          </footer>
        </div>
      </article>
    </div>
  )
}

function ReportTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  )
}

function SectionTitle({ children, meta }: { children: React.ReactNode; meta?: string }) {
  return (
    <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-700">
      {children}
      {meta && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{meta}</span>}
    </h2>
  )
}
