import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useData } from '../state/DataProvider'
import type { Absence, Person, Task, WorkItem } from '../types'
import {
  computePlanningMatrix,
  getAbsencesForPersonInWeek,
  getTasksForPersonInWeek,
  type PersonWeekCell,
  type PlanningMatrix as PlanningMatrixData,
  type PlanningWeek,
} from '../utils/planning'
import { hoursAssignedInWeek } from '../utils/workload'
import type { WorkloadLevel } from '../utils/workload'
import { getTaskHealth } from '../utils/progress'
import { formatItalianShort, todayISO } from '../utils/dates'
import type { Status } from '../types'
import { HealthBadge } from './HealthBadge'

type WeekCount = 4 | 8

export function PlanningMatrix() {
  const { data } = useData()
  const [count, setCount] = useState<WeekCount>(4)
  const [selected, setSelected] = useState<{ personId: string; weekIndex: number } | null>(null)

  const matrix = useMemo<PlanningMatrixData>(
    () => computePlanningMatrix(data, new Date(), count),
    [data, count],
  )

  const selectedRow = selected ? matrix.rows.find((r) => r.person.id === selected.personId) ?? null : null
  const selectedCell = selectedRow ? selectedRow.weeks[selected!.weekIndex] : null
  const selectedWeek = selected ? matrix.weeks[selected.weekIndex] : null

  return (
    <div className="space-y-4">
      <SummaryStrip summary={matrix.summary} count={count} />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Pianificazione · prossime {count} settimane</h2>
          <p className="text-xs text-slate-500">
            Carico previsto per persona settimana per settimana. Clic su una cella per il dettaglio.
          </p>
        </div>
        <div className="inline-flex rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs">
          <button
            onClick={() => setCount(4)}
            className={`rounded px-2.5 py-1 transition ${count === 4 ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            4 sett.
          </button>
          <button
            onClick={() => setCount(8)}
            className={`rounded px-2.5 py-1 transition ${count === 8 ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            8 sett.
          </button>
        </div>
      </div>

      {matrix.rows.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-slate-400">
          Nessuna persona attiva.
        </div>
      ) : (
        <MatrixTable
          matrix={matrix}
          onCellClick={(personId, weekIndex) => setSelected({ personId, weekIndex })}
        />
      )}

      <Legend />

      {selected && selectedRow && selectedCell && selectedWeek && (
        <CellDetailDrawer
          person={selectedRow.person}
          cell={selectedCell}
          week={selectedWeek}
          tasks={data.tasks}
          absences={data.absences}
          workItems={data.workItems}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ===== Summary strip =====

function SummaryStrip({ summary, count }: { summary: PlanningMatrixData['summary']; count: number }) {
  const tiles: Array<{ label: string; value: string; tone: string; hint: string }> = [
    {
      label: 'Settimane critiche',
      value: `${summary.criticalWeeks}/${count}`,
      tone: summary.criticalWeeks > 0 ? 'red' : 'emerald',
      hint: summary.criticalWeeks > 0 ? 'da gestire o ribilanciare' : 'tutto sotto controllo',
    },
    {
      label: 'Persone sovraccariche',
      value: String(summary.overloadedPeople),
      tone: summary.overloadedPeople > 0 ? 'red' : 'emerald',
      hint: `nelle prossime ${count} settimane`,
    },
    {
      label: 'Ore pianificate',
      value: `${Math.round(summary.totalPlannedHours)}h`,
      tone: 'sky',
      hint: 'totali su tutto il team',
    },
    {
      label: 'Ore assenze',
      value: `${Math.round(summary.totalAbsenceHours)}h`,
      tone: summary.totalAbsenceHours > 0 ? 'amber' : 'slate',
      hint: 'ferie, permessi, malattie',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <SummaryTile key={t.label} {...t} />
      ))}
    </div>
  )
}

const TONE: Record<string, { bg: string; text: string }> = {
  sky: { bg: 'from-sky-500/20', text: 'text-sky-200' },
  emerald: { bg: 'from-emerald-500/20', text: 'text-emerald-200' },
  amber: { bg: 'from-amber-500/20', text: 'text-amber-200' },
  red: { bg: 'from-red-500/25', text: 'text-red-200' },
  slate: { bg: 'from-slate-500/15', text: 'text-slate-200' },
}

function SummaryTile({ label, value, tone, hint }: { label: string; value: string; tone: string; hint: string }) {
  const t = TONE[tone] ?? TONE.slate
  return (
    <div className="panel relative overflow-hidden p-4">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${t.bg} to-transparent`} aria-hidden />
      <div className="relative">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className={`mt-1.5 text-2xl font-semibold ${t.text}`}>{value}</div>
        <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>
      </div>
    </div>
  )
}

// ===== Matrix table =====

const CELL_BG: Record<WorkloadLevel, string> = {
  absent: 'bg-zinc-800/40 hover:bg-zinc-800/60',
  available: 'bg-emerald-900/20 hover:bg-emerald-900/35',
  normal: 'bg-amber-900/15 hover:bg-amber-900/30',
  full: 'bg-orange-900/25 hover:bg-orange-900/40',
  overloaded: 'bg-red-900/30 hover:bg-red-900/45',
}

const CELL_RING: Record<WorkloadLevel, string> = {
  absent: 'ring-zinc-700/40',
  available: 'ring-emerald-700/40',
  normal: 'ring-amber-600/30',
  full: 'ring-orange-600/40',
  overloaded: 'ring-red-600/50',
}

const CELL_TEXT: Record<WorkloadLevel, string> = {
  absent: 'text-zinc-300',
  available: 'text-emerald-200',
  normal: 'text-amber-200',
  full: 'text-orange-200',
  overloaded: 'text-red-200',
}

const CELL_BAR: Record<WorkloadLevel, string> = {
  absent: 'bg-zinc-500',
  available: 'bg-emerald-500',
  normal: 'bg-amber-400',
  full: 'bg-orange-500',
  overloaded: 'bg-red-500',
}

const LEVEL_LABEL: Record<WorkloadLevel, string> = {
  absent: 'Assente',
  available: 'Disponibile',
  normal: 'Normale',
  full: 'Pieno',
  overloaded: 'Sovraccarico',
}

function MatrixTable({
  matrix,
  onCellClick,
}: {
  matrix: PlanningMatrixData
  onCellClick: (personId: string, weekIndex: number) => void
}) {
  const colWidth = matrix.weeks.length <= 4 ? 'min-w-[160px]' : 'min-w-[130px]'
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-[210px] min-w-[210px] border-b border-r border-slate-800 bg-[color:var(--color-panel)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Persona
              </th>
              {matrix.weeks.map((w, i) => (
                <th
                  key={w.weekStartISO}
                  className={`${colWidth} border-b border-slate-800 px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400`}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-slate-200">{w.weekLabel}</span>
                    {i === 0 && (
                      <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-300 ring-1 ring-inset ring-sky-500/30">
                        Ora
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-slate-500">
                    {w.weekRangeLabel}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, rowIdx) => (
              <tr key={row.person.id} className={rowIdx % 2 === 0 ? '' : 'bg-slate-900/20'}>
                <td className="sticky left-0 z-10 border-b border-r border-slate-800 bg-[color:var(--color-panel)] px-4 py-3">
                  <PersonCellLabel person={row.person} />
                </td>
                {row.weeks.map((cell) => (
                  <td key={cell.weekStartISO} className="border-b border-slate-800/60 p-1.5 align-middle">
                    <MatrixCell cell={cell} onClick={() => onCellClick(row.person.id, cell.weekIndex)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PersonCellLabel({ person }: { person: Person }) {
  const initials = person.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200">
        {initials}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-100">{person.name}</div>
        <div className="truncate text-[11px] text-slate-500">
          {person.role} · {person.weeklyCapacityHours}h/sett
        </div>
      </div>
    </div>
  )
}

function MatrixCell({ cell, onClick }: { cell: PersonWeekCell; onClick: () => void }) {
  const empty = cell.taskCount === 0 && cell.absenceHours === 0
  const barWidth = cell.realCapacity > 0 ? Math.min(100, cell.loadPercent) : cell.assignedHours > 0 ? 100 : 0
  const overflow = cell.loadPercent > 100 ? Math.min(40, (cell.loadPercent - 100) / 2) : 0
  const criticalAbsence = cell.isFullyAbsent && cell.assignedHours > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative block w-full rounded-md p-2.5 text-left ring-1 ring-inset transition ${CELL_BG[cell.level]} ${CELL_RING[cell.level]} hover:ring-slate-500`}
      aria-label={`${LEVEL_LABEL[cell.level]} ${cell.loadPercent}% — ${cell.weekLabel}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {cell.isFullyAbsent ? (
            <div className={`text-base font-semibold leading-none ${CELL_TEXT.absent}`}>Assente</div>
          ) : empty ? (
            <div className="text-base font-semibold leading-none text-slate-500">—</div>
          ) : (
            <div className={`text-xl font-semibold leading-none tabular-nums ${CELL_TEXT[cell.level]}`}>
              {cell.loadPercent}%
            </div>
          )}
          {!empty && (
            <div className="mt-1 text-[11px] tabular-nums text-slate-400">
              {cell.assignedHours}h <span className="text-slate-600">/</span> {cell.realCapacity}h
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {cell.delayCount > 0 && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500/25 px-1 text-[9px] font-bold text-red-200 ring-1 ring-inset ring-red-500/40" title={`${cell.delayCount} task in ritardo`}>
              {cell.delayCount}
            </span>
          )}
          {cell.riskCount > 0 && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500/25 px-1 text-[9px] font-bold text-amber-200 ring-1 ring-inset ring-amber-500/40" title={`${cell.riskCount} task a rischio`}>
              {cell.riskCount}
            </span>
          )}
        </div>
      </div>

      {!empty && (
        <div className="mt-2">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-800/80">
            <div className={`h-full ${CELL_BAR[cell.level]}`} style={{ width: `${barWidth}%` }} />
            {overflow > 0 && (
              <div
                className="absolute top-0 h-full bg-red-400/70"
                style={{ left: '100%', width: `${overflow}%`, transform: 'translateX(-1px)' }}
                aria-hidden
              />
            )}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
        {cell.taskCount > 0 && (
          <span className="text-slate-400">
            {cell.taskCount} {cell.taskCount === 1 ? 'task' : 'task'}
          </span>
        )}
        {cell.absenceHours > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-px text-amber-200 ring-1 ring-inset ring-amber-500/30">
            <span className="h-1 w-1 rounded-full bg-amber-300" />
            {cell.absenceHours}h ass.
          </span>
        )}
        {cell.hasTasksDuringAbsence && (
          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-px text-amber-200 ring-1 ring-inset ring-amber-500/30" title="Task in giorni di assenza">
            ⚠ giorni ass.
          </span>
        )}
        {criticalAbsence && (
          <span className="inline-flex items-center gap-0.5 rounded bg-red-500/15 px-1 py-px text-red-200 ring-1 ring-inset ring-red-500/40">
            ⚠ task & assente
          </span>
        )}
      </div>
    </button>
  )
}

// ===== Legend =====

function Legend() {
  const items: Array<{ level: WorkloadLevel; label: string }> = [
    { level: 'available', label: 'Disponibile (≤60%)' },
    { level: 'normal', label: 'Normale (≤85%)' },
    { level: 'full', label: 'Pieno (≤100%)' },
    { level: 'overloaded', label: 'Sovraccarico (>100%)' },
    { level: 'absent', label: 'Assente' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
      <span>Legenda:</span>
      {items.map((i) => (
        <span key={i.level} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${CELL_BAR[i.level]}`} aria-hidden />
          <span>{i.label}</span>
        </span>
      ))}
    </div>
  )
}

// ===== Cell detail drawer =====

function CellDetailDrawer({
  person,
  cell,
  week,
  tasks,
  absences,
  workItems,
  onClose,
}: {
  person: Person
  cell: PersonWeekCell
  week: PlanningWeek
  tasks: Task[]
  absences: Absence[]
  workItems: WorkItem[]
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const weekTasks = useMemo(() => getTasksForPersonInWeek(person, tasks, week), [person, tasks, week])
  const weekAbsences = useMemo(
    () => getAbsencesForPersonInWeek(person.id, absences, week),
    [person.id, absences, week],
  )
  const workItemById = useMemo(() => new Map(workItems.map((w) => [w.id, w])), [workItems])
  const today = todayISO()

  const initials = person.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Dettaglio ${person.name} · ${week.weekLabel}`}>
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-slate-800 bg-[color:var(--color-panel)] shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-200">
              {initials}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-100">{person.name}</div>
              <div className="text-xs text-slate-400">
                {person.role} · {week.weekLabel} · {week.weekRangeLabel}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Chiudi"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4">
          <DetailSummary cell={cell} />

          {(cell.hasTasksDuringAbsence || (cell.isFullyAbsent && cell.assignedHours > 0)) && (
            <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
              <span className="font-semibold">Attenzione:</span>{' '}
              {cell.isFullyAbsent && cell.assignedHours > 0
                ? `${person.name} risulta assente tutta la settimana ma ha ${cell.assignedHours}h di task pianificate.`
                : 'Ci sono task pianificati in giorni di assenza dell’assegnatario.'}
            </div>
          )}

          <section className="mt-5">
            <SectionLabel>
              Task della settimana · <span className="text-slate-500 font-normal">{weekTasks.length}</span>
            </SectionLabel>
            {weekTasks.length === 0 ? (
              <div className="mt-2 rounded-md border border-dashed border-slate-700 px-3 py-3 text-center text-[12px] text-slate-500">
                Nessun task attivo in questa settimana.
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {weekTasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    workItem={workItemById.get(t.workItemId)}
                    week={week}
                    today={today}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="mt-5">
            <SectionLabel>
              Assenze della settimana · <span className="text-slate-500 font-normal">{weekAbsences.length}</span>
            </SectionLabel>
            {weekAbsences.length === 0 ? (
              <div className="mt-2 text-[12px] text-slate-500">Nessuna assenza pianificata in settimana.</div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {weekAbsences.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-2.5 py-1.5 text-[12px]">
                    <span className={`h-2 w-2 rounded-full ${ABSENCE_DOT[a.type] ?? 'bg-slate-400'}`} aria-hidden />
                    <span className="font-medium text-slate-200 capitalize">{a.type}</span>
                    <span className="text-slate-400">
                      {a.startDate === a.endDate
                        ? formatItalianShort(a.startDate)
                        : `${formatItalianShort(a.startDate)} → ${formatItalianShort(a.endDate)}`}
                    </span>
                    <span className="ml-auto tabular-nums text-slate-500">{a.hoursPerDay}h/g</span>
                    {a.notes && <span className="w-full text-[11px] italic text-slate-500">{a.notes}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="border-t border-slate-800 bg-slate-900/40 px-5 py-3 text-right">
          <button onClick={onClose} className="btn-ghost">Chiudi</button>
        </footer>
      </aside>
    </div>
  )
}

const ABSENCE_DOT: Record<string, string> = {
  ferie: 'bg-emerald-500',
  permesso: 'bg-sky-500',
  malattia: 'bg-red-500',
  trasferta: 'bg-violet-500',
  altro: 'bg-slate-400',
}

const STATUS_CHIP: Record<Status, string> = {
  'Da pianificare': 'bg-slate-500/10 text-slate-300 ring-slate-500/30',
  'Pianificato': 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/30',
  'In corso': 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  'In attesa': 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  'In verifica': 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
  'Completato': 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40',
  'Sospeso': 'bg-zinc-500/10 text-zinc-300 ring-zinc-500/30',
}

function StatusChip({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_CHIP[status]}`}>
      {status}
    </span>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{children}</div>
  )
}

function DetailSummary({ cell }: { cell: PersonWeekCell }) {
  const rows: Array<{ label: string; value: string; tone?: string }> = [
    { label: 'Capacità teorica', value: `${cell.theoreticalCapacity}h` },
    { label: 'Assenze', value: `${cell.absenceHours}h`, tone: cell.absenceHours > 0 ? 'amber' : undefined },
    { label: 'Capacità reale', value: `${cell.realCapacity}h` },
    { label: 'Ore assegnate', value: `${cell.assignedHours}h` },
  ]
  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Carico</div>
          <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${CELL_TEXT[cell.level]}`}>
            {cell.isFullyAbsent ? 'Assente' : `${cell.loadPercent}%`}
          </div>
          <div className="text-[11px] text-slate-400">{LEVEL_LABEL[cell.level]}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {cell.delayCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-1 text-[11px] font-medium text-red-200 ring-1 ring-inset ring-red-500/40">
              {cell.delayCount} in ritardo
            </span>
          )}
          {cell.riskCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-200 ring-1 ring-inset ring-amber-500/40">
              {cell.riskCount} a rischio
            </span>
          )}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-1.5 text-[12px]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between rounded border border-slate-800 bg-slate-900/30 px-2.5 py-1.5">
            <dt className="text-slate-500">{r.label}</dt>
            <dd className={`tabular-nums ${r.tone === 'amber' ? 'text-amber-300' : 'text-slate-200'}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function TaskRow({
  task,
  workItem,
  week,
  today,
}: {
  task: Task
  workItem: WorkItem | undefined
  week: PlanningWeek
  today: string
}) {
  const remainingInWeek = useMemo(
    () => Math.round(hoursAssignedInWeek(task, week.weekStart, week.weekEnd) * 10) / 10,
    [task, week],
  )
  const health = useMemo(() => getTaskHealth(task, today), [task, today])
  return (
    <li className="rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {workItem?.code && (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                {workItem.code}
              </span>
            )}
            <div className="truncate text-sm font-medium text-slate-100">{task.title}</div>
          </div>
          {workItem && (
            <div className="mt-0.5 truncate text-[11px] text-slate-400">
              {workItem.title}
              {workItem.customer && <> · <span className="text-slate-500">{workItem.customer}</span></>}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <HealthBadge health={health} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <StatusChip status={task.status} />
        <span>
          <span className="text-slate-500">Inizio:</span> <span className="text-slate-300">{formatItalianShort(task.startDate)}</span>
        </span>
        <span>
          <span className="text-slate-500">Scad:</span> <span className="text-slate-300">{formatItalianShort(task.dueDate)}</span>
        </span>
        <span className="ml-auto tabular-nums">
          <span className="text-slate-500">In settimana:</span> <span className="text-slate-200">{remainingInWeek}h</span>
        </span>
      </div>
    </li>
  )
}
