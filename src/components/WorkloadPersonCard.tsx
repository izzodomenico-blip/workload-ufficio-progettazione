import { useMemo } from 'react'
import type { Person, Task } from '../types'
import { computeWorkload, LOAD_BAR_CLASS, LOAD_LABELS, LOAD_RING_CLASS, LOAD_TEXT_CLASS, topTasksForPerson } from '../utils/workload'
import { formatItalianShort, isOverdue } from '../utils/dates'

interface Props {
  person: Person
  tasks: Task[]
  onTaskClick?: (workItemId: string) => void
}

export function WorkloadPersonCard({ person, tasks, onTaskClick }: Props) {
  const load = useMemo(() => computeWorkload(person, tasks), [person, tasks])
  const top = useMemo(() => topTasksForPerson(tasks, person.id, 3), [tasks, person.id])

  const barWidth = Math.min(100, load.loadPercent)
  const overflow = load.loadPercent > 100 ? load.loadPercent - 100 : 0
  const initials = person.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className={`panel relative p-4 ring-1 ring-inset ${LOAD_RING_CLASS[load.level]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-200">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">{person.name}</div>
            <div className="truncate text-[11px] text-slate-400">{person.role}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-semibold tabular-nums ${LOAD_TEXT_CLASS[load.level]}`}>{load.loadPercent}%</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{LOAD_LABELS[load.level]}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="relative h-2 overflow-hidden rounded-full bg-slate-800">
          <div className={`h-full ${LOAD_BAR_CLASS[load.level]}`} style={{ width: `${barWidth}%` }} />
          {overflow > 0 && (
            <div
              className="absolute top-0 h-full bg-red-500/60 ring-1 ring-red-300/40"
              style={{ left: '100%', width: `${Math.min(50, overflow / 2)}%`, transform: 'translateX(-1px)' }}
              aria-hidden
            />
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
          <span><span className="text-slate-200 tabular-nums">{load.weekHours}h</span> / {load.capacityHours}h</span>
          <span>{load.taskCount} task questa settimana</span>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {top.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-700 px-3 py-2 text-[11px] text-slate-500">
            Nessun task assegnato attivo.
          </div>
        )}
        {top.map((t) => {
          const overdue = isOverdue(t.dueDate)
          return (
            <button
              key={t.id}
              onClick={() => onTaskClick?.(t.workItemId)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-2.5 py-1.5 text-left text-xs transition hover:border-slate-700 hover:bg-slate-800/60"
            >
              <span className="min-w-0 flex-1 truncate text-slate-200">{t.title}</span>
              <span className={`shrink-0 tabular-nums text-[10px] ${overdue ? 'text-red-300' : 'text-slate-400'}`}>
                {overdue && '⚠ '}{formatItalianShort(t.dueDate)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
