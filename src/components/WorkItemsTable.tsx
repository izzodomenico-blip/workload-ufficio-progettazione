import { useMemo } from 'react'
import type { AppData, WorkItem } from '../types'
import { isOpen } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { TypeBadge } from './TypeBadge'
import { PriorityBadge } from './PriorityBadge'
import { StatusSelect } from './StatusSelect'
import { HealthBadge } from './HealthBadge'
import { formatItalianShort, isOverdue, daysUntil } from '../utils/dates'
import { calculateExpectedProgress, getWorkItemHealth } from '../utils/progress'

interface Props {
  data: AppData
  items: WorkItem[]
  onSelect: (id: string) => void
}

export function WorkItemsTable({ data, items, onSelect }: Props) {
  const { setWorkItemStatus } = useData()
  const toast = useToast()
  const personById = new Map(data.people.map((p) => [p.id, p]))
  const tasksByItem = useMemo(() => {
    const m = new Map<string, typeof data.tasks>()
    for (const t of data.tasks) {
      const arr = m.get(t.workItemId) ?? []
      arr.push(t)
      m.set(t.workItemId, arr)
    }
    return m
  }, [data.tasks])

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-800 bg-[color:var(--color-surface-1)]/60 px-4 py-2.5">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Lavori aperti</h3>
          <p className="text-[11px] text-slate-500">
            {items.length} {items.length === 1 ? 'risultato' : 'risultati'} con i filtri correnti
          </p>
        </div>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="table-head border-b border-slate-800">
              <Th>Tipo</Th>
              <Th>Codice</Th>
              <Th>Cliente</Th>
              <Th>Titolo</Th>
              <Th>Priorità</Th>
              <Th>Stato</Th>
              <Th>Owner</Th>
              <Th>Assegnati</Th>
              <Th>Scadenza</Th>
              <Th>Avanz.</Th>
              <Th>Salute</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {items.map((w) => {
              const overdue = isOpen(w.status) && isOverdue(w.dueDate)
              const days = daysUntil(w.dueDate)
              const owner = personById.get(w.ownerId)
              const itemTasks = tasksByItem.get(w.id) ?? []
              const expected = calculateExpectedProgress(w.startDate, w.dueDate)
              const health = getWorkItemHealth(w, itemTasks)
              const diff = w.progressPercent - expected
              return (
                <tr
                  key={w.id}
                  onClick={() => onSelect(w.id)}
                  className="table-row group"
                >
                  <td className="px-3 py-2.5"><TypeBadge type={w.type} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-slate-200">{w.code}</span>
                      {w.blockers.length > 0 && (
                        <span title={w.blockers.join('\n')} className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-[10px] text-amber-300 ring-1 ring-inset ring-amber-500/40" aria-label="bloccato">!</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{w.customer}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-100 group-hover:text-sky-300 transition">{w.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {w.technicalPhase && (
                        <span className="chip-sm bg-indigo-500/12 text-indigo-200 ring-indigo-500/35">
                          {w.technicalPhase}
                        </span>
                      )}
                      {w.commercialPriority && (w.commercialPriority === 'alta' || w.commercialPriority === 'critica') && (
                        <span
                          className={`chip-sm capitalize ${
                            w.commercialPriority === 'critica'
                              ? 'bg-red-500/15 text-red-200 ring-red-500/40'
                              : 'bg-orange-500/12 text-orange-200 ring-orange-500/30'
                          }`}
                          title="Priorità commerciale"
                        >
                          comm. {w.commercialPriority}
                        </span>
                      )}
                      {w.type === 'studio' && typeof w.acquisitionProbability === 'number' && (
                        <span className="text-[10px] text-violet-300/80">prob. {w.acquisitionProbability}%</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><PriorityBadge priority={w.priority} /></td>
                  <td className="px-3 py-2.5">
                    <StatusSelect
                      value={w.status}
                      onChange={(s) => { setWorkItemStatus(w.id, s); toast.info(`${w.code || w.title}: ${s}`) }}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{owner?.name ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {w.assigneeIds.length === 0 && <span className="text-xs text-slate-500">—</span>}
                      {w.assigneeIds.map((id) => {
                        const p = personById.get(id)
                        if (!p) return null
                        return (
                          <span key={id} className="rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[11px] text-slate-300 ring-1 ring-inset ring-slate-700/70">
                            {p.name}
                          </span>
                        )
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className={`text-xs ${overdue ? 'text-red-300 font-semibold' : 'text-slate-200'}`}>
                      {formatItalianShort(w.dueDate)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {overdue ? `${Math.abs(days)} gg di ritardo` : days >= 0 ? `tra ${days} gg` : ''}
                    </div>
                    {w.plannedProductionReleaseDate && (
                      <div
                        className={`mt-0.5 text-[10px] ${w.actualProductionReleaseDate ? 'text-emerald-300/85' : 'text-sky-300/85'}`}
                        title="Rilascio produzione"
                      >
                        {w.actualProductionReleaseDate ? '✓ ' : '→ '}
                        rilascio {formatItalianShort(w.actualProductionReleaseDate ?? w.plannedProductionReleaseDate)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 w-[180px]">
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-800/80 ring-1 ring-inset ring-slate-800">
                      <div className="h-full bg-gradient-to-r from-sky-500 to-sky-400" style={{ width: `${w.progressPercent}%` }} />
                      <div
                        className="absolute top-0 h-full w-px bg-amber-300/90"
                        style={{ left: `${expected}%` }}
                        title={`Atteso ${expected}%`}
                        aria-hidden
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums">
                      <span className="text-slate-300">Reale <span className="font-semibold">{w.progressPercent}%</span></span>
                      <span className={`${diff < -20 ? 'text-amber-300' : 'text-slate-500'}`}>Att. {expected}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><HealthBadge health={health} /></td>
                </tr>
              )
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-14 text-center">
                  <EmptyTable />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2.5 font-semibold">{children}</th>
}

function EmptyTable() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/60 ring-1 ring-inset ring-slate-700">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
      <div className="text-sm font-medium text-slate-300">Nessun lavoro corrisponde ai filtri</div>
      <p className="text-[12px] text-slate-500">Modifica i filtri o esegui un reset per vedere tutti i lavori.</p>
    </div>
  )
}
