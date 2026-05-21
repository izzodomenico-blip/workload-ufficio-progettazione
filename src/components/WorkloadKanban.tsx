import { useMemo, useState } from 'react'
import type { AppData, Status, WorkItem, WorkshopOutput } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { TypeBadge } from './TypeBadge'
import { PriorityBadge } from './PriorityBadge'
import { StatusSelect } from './StatusSelect'
import { formatItalianShort, isOverdue } from '../utils/dates'
import { pendingCommercialOutputsForWorkItem, WORK_ITEM_CLOSING_STATUSES } from '../utils/commercialComponents'
import type { CommercialClosureResolution } from '../utils/commercialComponents'
import { CommercialComponentsConfirmModal } from './CommercialComponentsConfirmModal'

interface KanbanColumn {
  id: string
  title: string
  statuses: Status[]
  accent: string
}

const COLUMNS: KanbanColumn[] = [
  { id: 'todo', title: 'Da pianificare', statuses: ['Da pianificare'], accent: 'bg-slate-500/40' },
  { id: 'planned', title: 'Pianificato', statuses: ['Pianificato'], accent: 'bg-indigo-500/60' },
  { id: 'progress', title: 'In corso', statuses: ['In corso'], accent: 'bg-sky-500/60' },
  { id: 'waiting', title: 'In attesa', statuses: ['In attesa'], accent: 'bg-amber-500/60' },
  { id: 'review', title: 'In verifica', statuses: ['In verifica'], accent: 'bg-violet-500/60' },
  { id: 'done', title: 'Completato / Sospeso', statuses: ['Completato', 'Sospeso'], accent: 'bg-emerald-500/60' },
]

interface Props {
  data: AppData
  items: WorkItem[]
  onSelect: (id: string) => void
}

export function WorkloadKanban({ data, items, onSelect }: Props) {
  const { setWorkItemStatus, setWorkItemStatusAfterCommercialCheck } = useData()
  const toast = useToast()
  const [commercialCheck, setCommercialCheck] = useState<{
    item: WorkItem
    status: Status
    pendingOutputs: WorkshopOutput[]
  } | null>(null)
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

  function handleStatusChange(item: WorkItem, status: Status) {
    const pendingOutputs = WORK_ITEM_CLOSING_STATUSES.has(status)
      ? pendingCommercialOutputsForWorkItem(data, item.id)
      : []
    if (pendingOutputs.length > 0) {
      setCommercialCheck({ item, status, pendingOutputs })
      return
    }
    setWorkItemStatus(item.id, status)
    toast.info(`${item.code || item.title}: ${status}`)
  }

  function resolveCommercialCheck(resolution: CommercialClosureResolution) {
    if (!commercialCheck) return
    setWorkItemStatusAfterCommercialCheck(commercialCheck.item.id, commercialCheck.status, resolution)
    toast.info(`${commercialCheck.item.code || commercialCheck.item.title}: ${commercialCheck.status}`)
    setCommercialCheck(null)
  }

  return (
    <>
    <div className="panel p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {COLUMNS.map((col) => {
          const colItems = grouped.get(col.id) ?? []
          return (
            <div key={col.id} className="flex min-h-[160px] flex-col rounded-lg border border-slate-800 bg-[color:var(--color-surface-1)]/60">
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${col.accent}`} />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">{col.title}</span>
                </div>
                <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] tabular-nums text-slate-300 ring-1 ring-inset ring-slate-700/60">{colItems.length}</span>
              </div>
              <div className="space-y-2 p-2 scroll-thin overflow-y-auto max-h-[60vh]">
                {colItems.length === 0 && (
                  <div className="rounded-md border border-dashed border-slate-800 px-3 py-4 text-center text-[11px] text-slate-600">
                    Nessun elemento
                  </div>
                )}
                {colItems.map((w) => {
                  const overdue = isOverdue(w.dueDate)
                  return (
                    <div
                      key={w.id}
                      onClick={() => onSelect(w.id)}
                      className={`group block w-full cursor-pointer rounded-md border bg-slate-900/80 p-2.5 text-left transition hover:border-sky-500/40 hover:bg-slate-800 ${
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
                      {(w.technicalPhase || (w.commercialPriority && (w.commercialPriority === 'alta' || w.commercialPriority === 'critica'))) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
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
                        </div>
                      )}
                      {w.plannedProductionReleaseDate && (
                        <div
                          className={`mt-1 text-[10px] ${w.actualProductionReleaseDate ? 'text-emerald-300/80' : 'text-sky-300/80'}`}
                          title="Rilascio produzione"
                        >
                          {w.actualProductionReleaseDate ? '✓ ' : '→ '}
                          rilascio {formatItalianShort(w.actualProductionReleaseDate ?? w.plannedProductionReleaseDate)}
                        </div>
                      )}
                      <div className="mt-2">
                        <StatusSelect
                          value={w.status}
                          onChange={(s) => handleStatusChange(w, s)}
                        />
                      </div>
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
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
    <CommercialComponentsConfirmModal
      open={Boolean(commercialCheck)}
      pendingOutputs={commercialCheck?.pendingOutputs ?? []}
      targetLabel={commercialCheck ? `${commercialCheck.item.code || commercialCheck.item.title} -> ${commercialCheck.status}` : ''}
      onCancel={() => setCommercialCheck(null)}
      onResolve={resolveCommercialCheck}
    />
    </>
  )
}
