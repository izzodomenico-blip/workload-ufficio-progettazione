import { useMemo } from 'react'
import type { AppData, Status, WorkItem } from '../types'
import { TypeBadge } from './TypeBadge'
import { PriorityBadge } from './PriorityBadge'
import { formatItalianShort, isOverdue } from '../utils/dates'

interface KanbanColumn {
  id: string
  title: string
  statuses: Status[]
  accent: string
}

const COLUMNS: KanbanColumn[] = [
  { id: 'planned', title: 'Da pianificare', statuses: ['Da pianificare'], accent: 'bg-slate-500/40' },
  { id: 'progress', title: 'In corso', statuses: ['Assegnato', 'In corso'], accent: 'bg-sky-500/60' },
  { id: 'waiting', title: 'In attesa', statuses: ['In attesa input commerciale', 'In attesa input cliente', 'In attesa scelta tecnica'], accent: 'bg-amber-500/60' },
  { id: 'review', title: 'In verifica', statuses: ['In verifica responsabile', 'Da correggere'], accent: 'bg-violet-500/60' },
  { id: 'done', title: 'Pronto / Rilasciato', statuses: ['Pronto per rilascio', 'Rilasciato produzione'], accent: 'bg-emerald-500/60' },
  { id: 'paused', title: 'Sospeso / Annullato', statuses: ['Sospeso', 'Annullato'], accent: 'bg-zinc-500/60' },
]

interface Props {
  data: AppData
  items: WorkItem[]
  onSelect: (id: string) => void
}

export function WorkloadKanban({ data, items, onSelect }: Props) {
  const personById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people])

  const grouped = useMemo(() => {
    const map = new Map<string, WorkItem[]>()
    for (const col of COLUMNS) map.set(col.id, [])
    for (const w of items) {
      const col = COLUMNS.find((c) => c.statuses.includes(w.status))
      if (col) map.get(col.id)!.push(w)
    }
    return map
  }, [items])

  return (
    <div className="panel p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {COLUMNS.map((col) => {
          const colItems = grouped.get(col.id) ?? []
          return (
            <div key={col.id} className="flex min-h-[140px] flex-col rounded-lg border border-slate-800 bg-slate-900/40">
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${col.accent}`} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{col.title}</span>
                </div>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] tabular-nums text-slate-400">{colItems.length}</span>
              </div>
              <div className="space-y-2 p-2 scroll-thin overflow-y-auto max-h-[60vh]">
                {colItems.length === 0 && (
                  <div className="rounded-md border border-dashed border-slate-800 px-2 py-3 text-center text-[11px] text-slate-600">
                    nessun elemento
                  </div>
                )}
                {colItems.map((w) => {
                  const overdue = isOverdue(w.dueDate)
                  return (
                    <button
                      key={w.id}
                      onClick={() => onSelect(w.id)}
                      className={`block w-full rounded-md border bg-slate-900 p-2.5 text-left transition hover:border-slate-600 hover:bg-slate-800 ${
                        overdue ? 'border-red-500/40' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <TypeBadge type={w.type} />
                        <PriorityBadge priority={w.priority} />
                      </div>
                      <div className="mt-1.5 font-mono text-[11px] text-slate-400">{w.code}</div>
                      <div className="text-sm font-medium text-slate-100 leading-snug">{w.title}</div>
                      <div className="mt-1 truncate text-[11px] text-slate-500">{w.customer}</div>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <div className="flex flex-wrap gap-1">
                          {w.assigneeIds.slice(0, 3).map((id) => {
                            const p = personById.get(id)
                            return p ? (
                              <span key={id} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{p.name}</span>
                            ) : null
                          })}
                          {w.assigneeIds.length === 0 && <span className="text-[10px] text-slate-600">non assegnato</span>}
                        </div>
                        <span className={overdue ? 'text-red-300 font-medium tabular-nums' : 'text-slate-400 tabular-nums'}>
                          {overdue && '⚠ '}{formatItalianShort(w.dueDate)}
                        </span>
                      </div>
                      {w.blockers.length > 0 && (
                        <div className="mt-1.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                          ⛔ {w.blockers.length} bloccante{w.blockers.length > 1 ? 'i' : ''}
                        </div>
                      )}
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full bg-sky-500" style={{ width: `${w.progressPercent}%` }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
