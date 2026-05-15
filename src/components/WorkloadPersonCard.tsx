import { useMemo } from 'react'
import type { Absence, Person, Task } from '../types'
import { computeWorkload, LOAD_BAR_CLASS, LOAD_LABELS, LOAD_RING_CLASS, LOAD_TEXT_CLASS, topTasksForPerson } from '../utils/workload'
import { countActiveTaskHealth } from '../utils/progress'
import { formatItalianShort, isOverdue } from '../utils/dates'

interface Props {
  person: Person
  tasks: Task[]
  absences: Absence[]
  onTaskClick?: (workItemId: string) => void
}

export function WorkloadPersonCard({ person, tasks, absences, onTaskClick }: Props) {
  const load = useMemo(() => computeWorkload(person, tasks, absences), [person, tasks, absences])
  const top = useMemo(() => topTasksForPerson(tasks, person.id, 3), [tasks, person.id])
  const healthCounts = useMemo(
    () => countActiveTaskHealth(tasks, person.id, () => false),
    [tasks, person.id],
  )

  const ringClass = load.hasTasksDuringAbsence
    ? 'ring-amber-500/40'
    : LOAD_RING_CLASS[load.level]

  const initials = person.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()

  // Critical: capacità zero con task assegnati
  const criticalAbsence = load.isFullyAbsent && load.weekHours > 0
  const halfCapacity = !load.isFullyAbsent && load.absenceHours > 0 && load.realCapacityHours < load.capacityHours / 2

  const barWidth = load.realCapacityHours > 0 ? Math.min(100, load.loadPercent) : (load.weekHours > 0 ? 100 : 0)
  const overflow = load.loadPercent > 100 ? load.loadPercent - 100 : 0

  return (
    <div className={`panel relative p-4 ring-1 ring-inset ${ringClass}`}>
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
          {load.isFullyAbsent ? (
            <>
              <div className={`text-lg font-semibold tabular-nums ${LOAD_TEXT_CLASS.absent}`}>—</div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">assente</div>
            </>
          ) : (
            <>
              <div className={`text-lg font-semibold tabular-nums ${LOAD_TEXT_CLASS[load.level]}`}>{load.loadPercent}%</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{LOAD_LABELS[load.level]}</div>
            </>
          )}
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
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-slate-400">
          <span>Capacità: <span className="text-slate-200">{load.capacityHours}h</span></span>
          <span>Assegnate: <span className="text-slate-200">{load.weekHours}h</span></span>
          <span>
            Assenze:{' '}
            {load.absenceHours > 0
              ? <span className="text-amber-300">{load.absenceHours}h</span>
              : <span className="text-slate-500">0h</span>}
          </span>
          <span>
            Reali:{' '}
            <span className={load.isFullyAbsent ? 'text-zinc-400' : halfCapacity ? 'text-amber-300' : 'text-slate-200'}>
              {load.realCapacityHours}h
            </span>
          </span>
        </div>
      </div>

      {(load.absenceHours > 0 || load.hasTasksDuringAbsence) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {load.absenceHours > 0 && (
            <span className="chip bg-amber-500/15 text-amber-200 ring-amber-500/40">
              Assenza: {load.absenceHours}h
            </span>
          )}
          {halfCapacity && !load.isFullyAbsent && (
            <span className="chip bg-orange-500/15 text-orange-200 ring-orange-500/40">
              Capacità ridotta
            </span>
          )}
          {load.hasTasksDuringAbsence && (
            <span className="chip bg-amber-500/15 text-amber-200 ring-amber-500/40" title="Almeno un task aperto cade in giorni di assenza dell’assegnatario">
              ⚠ Task in giorni di assenza
            </span>
          )}
          {criticalAbsence && (
            <span className="chip bg-red-500/15 text-red-200 ring-red-500/40">
              ⚠ Task assegnati con capacità zero
            </span>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-slate-800 pt-2">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Salute task</div>
        <div className="flex flex-wrap gap-1">
          <HealthCount label="OK" value={healthCounts.ok} tone="emerald" />
          <HealthCount label="A rischio" value={healthCounts['a rischio']} tone="amber" />
          <HealthCount label="In ritardo" value={healthCounts['in ritardo']} tone="red" />
          <HealthCount label="In attesa" value={healthCounts['in attesa']} tone="sky" />
          <HealthCount label="Sospesi" value={healthCounts.sospeso} tone="zinc" />
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

const COUNT_TONES = {
  emerald: { on: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40', off: 'bg-slate-800/40 text-slate-500 ring-slate-700/60' },
  amber: { on: 'bg-amber-500/15 text-amber-200 ring-amber-500/40', off: 'bg-slate-800/40 text-slate-500 ring-slate-700/60' },
  red: { on: 'bg-red-500/15 text-red-200 ring-red-500/40', off: 'bg-slate-800/40 text-slate-500 ring-slate-700/60' },
  sky: { on: 'bg-sky-500/15 text-sky-200 ring-sky-500/40', off: 'bg-slate-800/40 text-slate-500 ring-slate-700/60' },
  zinc: { on: 'bg-zinc-500/15 text-zinc-200 ring-zinc-500/40', off: 'bg-slate-800/40 text-slate-500 ring-slate-700/60' },
} as const

function HealthCount({ label, value, tone }: { label: string; value: number; tone: keyof typeof COUNT_TONES }) {
  const cls = value > 0 ? COUNT_TONES[tone].on : COUNT_TONES[tone].off
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${cls}`}>
      {label} <span className="tabular-nums">{value}</span>
    </span>
  )
}
