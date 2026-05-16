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
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Lavori aperti</h3>
          <p className="text-[11px] text-slate-500">{items.length} risultati con i filtri correnti</p>
        </div>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/40 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-semibold">Tipo</th>
              <th className="px-3 py-2 font-semibold">Codice</th>
              <th className="px-3 py-2 font-semibold">Cliente</th>
              <th className="px-3 py-2 font-semibold">Titolo</th>
              <th className="px-3 py-2 font-semibold">Priorità</th>
              <th className="px-3 py-2 font-semibold">Stato</th>
              <th className="px-3 py-2 font-semibold">Owner</th>
              <th className="px-3 py-2 font-semibold">Assegnati</th>
              <th className="px-3 py-2 font-semibold">Scadenza</th>
              <th className="px-3 py-2 font-semibold">Avanz.</th>
              <th className="px-3 py-2 font-semibold">Salute</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
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
                  className="cursor-pointer transition hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2.5"><TypeBadge type={w.type} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-200">{w.code}</span>
                      {w.blockers.length > 0 && (
                        <span title={w.blockers.join('\n')} className="text-amber-300" aria-label="bloccato">⛔</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{w.customer}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-100">{w.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {w.technicalPhase && (
                        <span className="inline-flex items-center rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-200 ring-1 ring-inset ring-indigo-500/30">
                          {w.technicalPhase}
                        </span>
                      )}
                      {w.commercialPriority && (w.commercialPriority === 'alta' || w.commercialPriority === 'critica') && (
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ring-1 ring-inset ${
                            w.commercialPriority === 'critica'
                              ? 'bg-red-500/15 text-red-200 ring-red-500/40'
                              : 'bg-orange-500/15 text-orange-200 ring-orange-500/30'
                          }`}
                          title="Priorità commerciale"
                        >
                          comm. {w.commercialPriority}
                        </span>
                      )}
                      {w.type === 'studio' && typeof w.acquisitionProbability === 'number' && (
                        <span className="text-[10px] text-violet-300/80">prob. acquisizione {w.acquisitionProbability}%</span>
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
                          <span key={id} className="rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[11px] text-slate-300">
                            {p.name}
                          </span>
                        )
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className={`text-xs ${overdue ? 'text-red-300 font-medium' : 'text-slate-300'}`}>
                      {formatItalianShort(w.dueDate)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {overdue ? `${Math.abs(days)} gg di ritardo` : days >= 0 ? `tra ${days} gg` : ''}
                    </div>
                    {w.plannedProductionReleaseDate && (
                      <div
                        className={`mt-0.5 text-[10px] ${w.actualProductionReleaseDate ? 'text-emerald-300/80' : 'text-sky-300/80'}`}
                        title="Rilascio produzione"
                      >
                        {w.actualProductionReleaseDate ? '✓ ' : '→ '}
                        rilascio {formatItalianShort(w.actualProductionReleaseDate ?? w.plannedProductionReleaseDate)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 w-[170px]">
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full bg-sky-500" style={{ width: `${w.progressPercent}%` }} />
                      <div
                        className="absolute top-0 h-full w-px bg-amber-300"
                        style={{ left: `${expected}%` }}
                        title={`Atteso ${expected}%`}
                        aria-hidden
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums">
                      <span className="text-slate-400">Reale {w.progressPercent}%</span>
                      <span className={`${diff < -20 ? 'text-amber-300' : 'text-slate-500'}`}>Atteso {expected}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><HealthBadge health={health} /></td>
                </tr>
              )
            })}
            {items.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-sm text-slate-500">Nessun lavoro corrisponde ai filtri.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
