import type { AppData, WorkItem } from '../types'
import { isOpen } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { TypeBadge } from './TypeBadge'
import { PriorityBadge } from './PriorityBadge'
import { StatusSelect } from './StatusSelect'
import { formatItalianShort, isOverdue, daysUntil } from '../utils/dates'

interface Props {
  data: AppData
  items: WorkItem[]
  onSelect: (id: string) => void
}

export function WorkItemsTable({ data, items, onSelect }: Props) {
  const { setWorkItemStatus } = useData()
  const toast = useToast()
  const personById = new Map(data.people.map((p) => [p.id, p]))

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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {items.map((w) => {
              const overdue = isOpen(w.status) && isOverdue(w.dueDate)
              const days = daysUntil(w.dueDate)
              const owner = personById.get(w.ownerId)
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
                    {w.type === 'studio' && typeof w.acquisitionProbability === 'number' && (
                      <div className="text-[10px] text-violet-300/80">prob. acquisizione {w.acquisitionProbability}%</div>
                    )}
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
                  </td>
                  <td className="px-3 py-2.5 w-[140px]">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full bg-sky-500" style={{ width: `${w.progressPercent}%` }} />
                      </div>
                      <span className="w-9 text-right text-[11px] tabular-nums text-slate-400">{w.progressPercent}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
            {items.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">Nessun lavoro corrisponde ai filtri.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
