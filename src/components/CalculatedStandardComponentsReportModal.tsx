import { useEffect, useMemo } from 'react'
import { useData } from '../state/DataProvider'
import { formatItalianShort } from '../utils/dates'
import { WORKSHOP_WORKER_SKILL_LABELS } from '../types'
import type { CalculatedStandardComponent, WorkItem, WorkshopOutput } from '../types'

interface Props {
  open: boolean
  onClose: () => void
}

interface GroupedRow {
  workItem?: WorkItem
  output?: WorkshopOutput
  components: CalculatedStandardComponent[]
}

function fmtGenerated(d: Date): string {
  const date = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${date} · ${time}`
}

export function CalculatedStandardComponentsReportModal({ open, onClose }: Props) {
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

  const components = data.calculatedStandardComponents ?? []
  const workItemById = useMemo(() => new Map(data.workItems.map((wi) => [wi.id, wi])), [data.workItems])
  const outputById = useMemo(() => new Map(data.workshopOutputs.map((o) => [o.id, o])), [data.workshopOutputs])

  const grouped = useMemo<GroupedRow[]>(() => {
    const byOutput = new Map<string, CalculatedStandardComponent[]>()
    for (const component of components) {
      const list = byOutput.get(component.workshopOutputId) ?? []
      list.push(component)
      byOutput.set(component.workshopOutputId, list)
    }
    const out: GroupedRow[] = []
    for (const [outputId, comps] of byOutput) {
      const output = outputById.get(outputId)
      const workItem = output ? workItemById.get(output.workItemId) : workItemById.get(comps[0].workItemId)
      out.push({
        output,
        workItem,
        components: comps.slice().sort((a, b) => a.componentCode.localeCompare(b.componentCode, 'it', { sensitivity: 'base' })),
      })
    }
    return out.sort((a, b) => (a.workItem?.code ?? '').localeCompare(b.workItem?.code ?? '', 'it'))
  }, [components, outputById, workItemById])

  const aggregated = useMemo(() => {
    const map = new Map<string, { code: string; name: string; quantity: number }>()
    for (const component of components) {
      const current = map.get(component.componentCode) ?? { code: component.componentCode, name: component.componentName, quantity: 0 }
      current.quantity += component.quantity
      map.set(component.componentCode, current)
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code, 'it', { sensitivity: 'base' }))
  }, [components])

  if (!open) return null

  const generatedAt = new Date()
  const totalQty = components.reduce((sum, c) => sum + c.quantity, 0)

  return (
    <div className="report-print-root fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Anteprima report componenti standard calcolati">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm print:hidden" onClick={onClose} aria-hidden />

      <div className="relative z-20 mx-auto flex max-w-[230mm] items-center justify-between gap-3 px-4 pt-4 print:hidden">
        <span className="hidden items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-200 ring-1 ring-inset ring-amber-500/30 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
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
              <h1 className="text-[21px] font-semibold leading-tight tracking-tight text-slate-900">Report componenti standard calcolati</h1>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">Particolari STS / ITS producibili in anticipo per commessa</p>
            </div>
            <div className="text-right text-[11px] text-slate-500">Generato {fmtGenerated(generatedAt)}</div>
          </header>

          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-800 print-keep">
            I componenti elencati sono derivati dai parametri dimensionali di output I.TS / I.SC con sottocategoria configurata.
            Possono essere lanciati in produzione prima del rilascio completo del progetto.
          </p>

          <section className="mt-6 grid grid-cols-3 gap-3 print-keep print:grid-cols-3">
            <ReportTile label="Righe totali" value={String(components.length)} />
            <ReportTile label="Codici distinti" value={String(aggregated.length)} />
            <ReportTile label="Pezzi totali" value={String(totalQty)} />
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle meta={String(aggregated.length)}>Aggregato per codice</SectionTitle>
            {aggregated.length === 0 ? (
              <p className="mt-2 text-[11px] italic text-slate-500">Nessun componente standard calcolato.</p>
            ) : (
              <table className="mt-3 w-full text-[11px]">
                <thead className="border-b border-slate-300 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-2">Codice</th>
                    <th className="py-1.5 pr-2">Nome</th>
                    <th className="py-1.5 pr-2 text-right">Q.ta totale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {aggregated.map((row) => (
                    <tr key={row.code}>
                      <td className="py-1.5 pr-2 font-mono text-[10px] text-slate-800">{row.code}</td>
                      <td className="py-1.5 pr-2 text-slate-800">{row.name}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums font-semibold text-slate-900">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="mt-7 print-keep">
            <SectionTitle meta={String(grouped.length)}>Dettaglio per commessa / output</SectionTitle>
            {grouped.length === 0 ? (
              <p className="mt-2 text-[11px] italic text-slate-500">Nessun gruppo da mostrare.</p>
            ) : (
              <div className="mt-3 space-y-5">
                {grouped.map((group) => (
                  <div key={(group.output?.id ?? group.workItem?.id) ?? Math.random()} className="rounded-lg border border-slate-200">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Commessa</span>
                        <span className="font-mono text-[12px] font-semibold text-slate-900">{group.workItem?.code ?? '-'}</span>
                        <span className="text-[11px] text-slate-600">{group.workItem?.customer ?? '-'}</span>
                      </div>
                      <div className="text-[11px] text-slate-700">
                        {group.output ? `${group.output.machineTypeCode} - ${group.output.machineTypeName}` : '—'}
                        {group.output?.standardComponentsReadyFromDate && (
                          <span className="ml-2 text-[10px] text-slate-500">producibile da {formatItalianShort(group.output.standardComponentsReadyFromDate)}</span>
                        )}
                      </div>
                    </div>
                    <table className="w-full text-[11px]">
                      <thead className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-1.5">Codice</th>
                          <th className="px-3 py-1.5">Nome</th>
                          <th className="px-3 py-1.5 text-right">Q.ta</th>
                          <th className="px-3 py-1.5">Processo</th>
                          <th className="px-3 py-1.5">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {group.components.map((component) => (
                          <tr key={component.id}>
                            <td className="px-3 py-1.5 font-mono text-[10px] text-slate-800">{component.componentCode}</td>
                            <td className="px-3 py-1.5 text-slate-800">{component.componentName}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900">{component.quantity}</td>
                            <td className="px-3 py-1.5 text-slate-700">{WORKSHOP_WORKER_SKILL_LABELS[component.process] ?? component.process}</td>
                            <td className="px-3 py-1.5 text-[10px] text-slate-500">{component.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </section>

          <footer className="mt-8 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
            Report generato dall'app Flowrlink. Le quantita sono calcolate dai parametri dimensionali degli output.
          </footer>
        </div>
      </article>
    </div>
  )
}

function ReportTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-amber-900">{value}</div>
      {sub && <div className="text-[10px] text-amber-700/70">{sub}</div>}
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
