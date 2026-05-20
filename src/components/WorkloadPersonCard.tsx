import { useMemo } from 'react'
import type { Absence, Person, Task, WorkItem } from '../types'
import {
  computeWorkload,
  LOAD_BAR_CLASS,
  LOAD_LABELS,
  LOAD_RING_CLASS,
  LOAD_TEXT_CLASS,
  getWorkloadActivitiesForPerson,
  topWorkloadActivitiesForPerson,
  type WorkloadActivity,
} from '../utils/workload'
import { getTaskHealth, getWorkItemHealth, type HealthStatus } from '../utils/progress'
import { formatItalianShort, isOverdue } from '../utils/dates'

interface Props {
  person: Person
  tasks: Task[]
  workItems: WorkItem[]
  absences: Absence[]
  onTaskClick?: (workItemId: string) => void
  onPersonClick?: (personId: string) => void
}

export function WorkloadPersonCard({ person, tasks, workItems, absences, onTaskClick, onPersonClick }: Props) {
  const load = useMemo(
    () => computeWorkload(person, tasks, absences, new Date(), workItems),
    [person, tasks, workItems, absences],
  )
  const top = useMemo(
    () => topWorkloadActivitiesForPerson(tasks, workItems, person, 3),
    [tasks, workItems, person],
  )
  const healthCounts = useMemo(
    () => countWorkloadHealth(getWorkloadActivitiesForPerson(person, tasks, workItems)),
    [person, tasks, workItems],
  )

  const ringClass = load.hasTasksDuringAbsence ? 'ring-amber-500/40' : LOAD_RING_CLASS[load.level]

  const initials = person.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()

  const criticalAbsence = load.isFullyAbsent && load.weekHours > 0
  const halfCapacity = !load.isFullyAbsent && load.absenceHours > 0 && load.realCapacityHours < load.capacityHours / 2

  const barWidth = load.realCapacityHours > 0 ? Math.min(100, load.loadPercent) : (load.weekHours > 0 ? 100 : 0)
  const overflow = load.loadPercent > 100 ? load.loadPercent - 100 : 0

  return (
    <div className={`panel relative p-4 ring-1 ring-inset transition hover:border-slate-700 ${ringClass}`}>
      <div className="flex items-start justify-between gap-3">
        {onPersonClick ? (
          <button
            type="button"
            onClick={() => onPersonClick(person.id)}
            className="group flex min-w-0 items-center gap-3 rounded-md text-left transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
            title={`Apri agenda di ${person.name}`}
          >
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-800 to-slate-900 text-sm font-semibold text-slate-100 ring-1 ring-slate-700 transition group-hover:ring-sky-500/50">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100 group-hover:text-sky-300">{person.name}</div>
              <div className="truncate text-[11px] text-slate-500">{person.role}</div>
            </div>
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-800 to-slate-900 text-sm font-semibold text-slate-100 ring-1 ring-slate-700">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100">{person.name}</div>
              <div className="truncate text-[11px] text-slate-500">{person.role}</div>
            </div>
          </div>
        )}
        <div className="text-right">
          {load.isFullyAbsent ? (
            <>
              <div className={`text-2xl font-semibold leading-none tabular-nums ${LOAD_TEXT_CLASS.absent}`}>—</div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">assente</div>
            </>
          ) : (
            <>
              <div className={`text-2xl font-semibold leading-none tabular-nums ${LOAD_TEXT_CLASS[load.level]}`}>
                {load.loadPercent}<span className="text-sm font-medium opacity-80">%</span>
              </div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">{LOAD_LABELS[load.level]}</div>
            </>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="relative h-2 overflow-hidden rounded-full bg-slate-800/70 ring-1 ring-inset ring-slate-800">
          <div className={`h-full ${LOAD_BAR_CLASS[load.level]} transition-[width] duration-500`} style={{ width: `${barWidth}%` }} />
          {overflow > 0 && (
            <div
              className="absolute top-0 h-full bg-red-500/70 ring-1 ring-red-300/40"
              style={{ left: '100%', width: `${Math.min(50, overflow / 2)}%`, transform: 'translateX(-1px)' }}
              aria-hidden
            />
          )}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] tabular-nums">
          <Metric label="Cap." value={`${load.capacityHours}h`} />
          <Metric label="Assegn." value={`${load.weekHours}h`} />
          <Metric
            label="Assenze"
            value={`${load.absenceHours}h`}
            highlight={load.absenceHours > 0 ? 'amber' : 'muted'}
          />
          <Metric
            label="Reali"
            value={`${load.realCapacityHours}h`}
            highlight={load.isFullyAbsent ? 'muted' : halfCapacity ? 'amber' : 'normal'}
          />
        </div>
      </div>

      {(load.absenceHours > 0 || load.hasTasksDuringAbsence) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {load.absenceHours > 0 && (
            <span className="chip-sm bg-amber-500/12 text-amber-200 ring-amber-500/40">
              Assenza: {load.absenceHours}h
            </span>
          )}
          {halfCapacity && !load.isFullyAbsent && (
            <span className="chip-sm bg-orange-500/12 text-orange-200 ring-orange-500/40">
              Capacità ridotta
            </span>
          )}
          {load.hasTasksDuringAbsence && (
            <span className="chip-sm bg-amber-500/12 text-amber-200 ring-amber-500/40" title="Almeno una attività aperta cade in giorni di assenza dell'assegnatario">
              Attività in giorni di assenza
            </span>
          )}
          {criticalAbsence && (
            <span className="chip-sm bg-red-500/12 text-red-200 ring-red-500/40">
              Capacità zero ma attività assegnate
            </span>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-slate-800/70 pt-2.5">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Salute attività</div>
        <div className="flex flex-wrap gap-1">
          <HealthCount label="OK" value={healthCounts.ok} tone="emerald" />
          <HealthCount label="Rischio" value={healthCounts['a rischio']} tone="amber" />
          <HealthCount label="Ritardo" value={healthCounts['in ritardo']} tone="red" />
          <HealthCount label="Attesa" value={healthCounts['in attesa']} tone="sky" />
          <HealthCount label="Sospesi" value={healthCounts.sospeso} tone="zinc" />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {top.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-700/70 bg-slate-900/30 px-3 py-2.5 text-center text-[11px] text-slate-500">
            Nessuna attività assegnata attiva.
          </div>
        )}
        {top.map((activity) => {
          const overdue = isOverdue(activity.dueDate)
          return (
            <button
              key={`${activity.kind}-${activity.id}`}
              onClick={() => onTaskClick?.(activity.workItemId)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-800/80 bg-slate-900/40 px-2.5 py-1.5 text-left text-xs transition hover:border-sky-500/40 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
            >
              <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
                activity.kind === 'task'
                  ? 'bg-sky-500/15 text-sky-200 ring-sky-500/30'
                  : 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30'
              }`}>
                {activity.kind === 'task' ? 'Task' : 'Lavoro'}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-200">
                {activity.kind === 'workItem' && activity.workItem?.code ? `${activity.workItem.code} · ` : ''}
                {activity.title}
              </span>
              <span className={`shrink-0 tabular-nums text-[10px] ${overdue ? 'text-red-300 font-medium' : 'text-slate-400'}`}>
                {overdue && '! '}{formatItalianShort(activity.dueDate)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  highlight = 'normal',
}: { label: string; value: string; highlight?: 'normal' | 'muted' | 'amber' }) {
  const valueCls =
    highlight === 'amber' ? 'text-amber-300' : highlight === 'muted' ? 'text-slate-500' : 'text-slate-200'
  return (
    <div className="rounded-md border border-slate-800/80 bg-slate-900/30 px-1.5 py-1 text-center">
      <div className="text-[9px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-[11px] font-semibold tabular-nums ${valueCls}`}>{value}</div>
    </div>
  )
}

const COUNT_TONES = {
  emerald: { on: 'bg-emerald-500/12 text-emerald-200 ring-emerald-500/40', off: 'bg-slate-800/30 text-slate-600 ring-slate-700/60' },
  amber: { on: 'bg-amber-500/12 text-amber-200 ring-amber-500/40', off: 'bg-slate-800/30 text-slate-600 ring-slate-700/60' },
  red: { on: 'bg-red-500/12 text-red-200 ring-red-500/40', off: 'bg-slate-800/30 text-slate-600 ring-slate-700/60' },
  sky: { on: 'bg-sky-500/12 text-sky-200 ring-sky-500/40', off: 'bg-slate-800/30 text-slate-600 ring-slate-700/60' },
  zinc: { on: 'bg-zinc-500/12 text-zinc-200 ring-zinc-500/40', off: 'bg-slate-800/30 text-slate-600 ring-slate-700/60' },
} as const

function countWorkloadHealth(activities: WorkloadActivity[]): Record<'ok' | 'a rischio' | 'in ritardo' | 'in attesa' | 'sospeso', number> {
  const counts = { ok: 0, 'a rischio': 0, 'in ritardo': 0, 'in attesa': 0, sospeso: 0 }
  for (const activity of activities) {
    const health: HealthStatus = activity.kind === 'task' && activity.task
      ? getTaskHealth(activity.task)
      : activity.workItem
        ? getWorkItemHealth(activity.workItem, [])
        : 'ok'
    if (health === 'completato') continue
    if (health in counts) counts[health as keyof typeof counts]++
  }
  return counts
}

function HealthCount({ label, value, tone }: { label: string; value: number; tone: keyof typeof COUNT_TONES }) {
  const cls = value > 0 ? COUNT_TONES[tone].on : COUNT_TONES[tone].off
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${cls}`}>
      {label} <span className="tabular-nums">{value}</span>
    </span>
  )
}
