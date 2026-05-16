import { useEffect, useMemo, useState } from 'react'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import type { Absence, Person, Status, Task } from '../types'
import {
  getPersonAgenda,
  type PersonAgenda,
  type TimelineEvent,
  type WeekAgenda,
  type WeekAgendaTask,
} from '../utils/personAgenda'
import { computeWorkload, type WorkloadLevel, LOAD_LABELS, LOAD_TEXT_CLASS, LOAD_BAR_CLASS } from '../utils/workload'
import { formatItalianShort, parseISODate } from '../utils/dates'
import { HealthBadge } from './HealthBadge'
import { StatusSelect } from './StatusSelect'
import { TypeBadge } from './TypeBadge'
import { WorkItemDetailDrawer } from './WorkItemDetailDrawer'
import { TaskFormModal } from './TaskFormModal'

interface Props {
  initialPersonId?: string | null
}

export function PersonAgendaView({ initialPersonId }: Props) {
  const { data } = useData()
  const activePeople = useMemo(() => data.people.filter((p) => p.active), [data.people])

  const [selectedId, setSelectedId] = useState<string | null>(
    initialPersonId ?? activePeople[0]?.id ?? null,
  )

  // Sync external initialPersonId changes (jump from dashboard)
  useEffect(() => {
    if (initialPersonId && initialPersonId !== selectedId) {
      setSelectedId(initialPersonId)
    }
  }, [initialPersonId])

  // If selection no longer valid, reset
  useEffect(() => {
    if (selectedId && !activePeople.some((p) => p.id === selectedId)) {
      setSelectedId(activePeople[0]?.id ?? null)
    }
  }, [activePeople, selectedId])

  const agenda = useMemo(
    () => (selectedId ? getPersonAgenda(data, selectedId, new Date()) : null),
    [data, selectedId],
  )

  const [drawerWorkItemId, setDrawerWorkItemId] = useState<string | null>(null)
  const [taskFormState, setTaskFormState] = useState<{ open: boolean; task: Task | null; workItemId: string }>({
    open: false,
    task: null,
    workItemId: '',
  })

  function handleOpenWorkItem(workItemId: string) {
    setDrawerWorkItemId(workItemId)
  }
  function handleEditTask(task: Task) {
    setTaskFormState({ open: true, task, workItemId: task.workItemId })
  }
  function handleCloseTaskForm() {
    setTaskFormState({ open: false, task: null, workItemId: '' })
  }

  if (activePeople.length === 0) {
    return (
      <div className="panel p-8 text-center text-sm text-slate-400">
        Nessuna persona attiva. Aggiungi membri al team dalla sezione "Persone".
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-12 gap-4">
        <aside className="col-span-12 md:col-span-4 lg:col-span-3">
          <PeopleSidebar
            people={activePeople}
            tasks={data.tasks}
            absences={data.absences}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>
        <main className="col-span-12 md:col-span-8 lg:col-span-9">
          {agenda ? (
            <PersonAgendaContent
              agenda={agenda}
              onOpenWorkItem={handleOpenWorkItem}
              onEditTask={handleEditTask}
            />
          ) : (
            <div className="panel p-8 text-center text-sm text-slate-400">Seleziona una persona dalla lista.</div>
          )}
        </main>
      </div>

      <WorkItemDetailDrawer workItemId={drawerWorkItemId} onClose={() => setDrawerWorkItemId(null)} />

      <TaskFormModal
        open={taskFormState.open}
        onClose={handleCloseTaskForm}
        mode="edit"
        workItemId={taskFormState.workItemId}
        task={taskFormState.task ?? undefined}
      />
    </>
  )
}

// ===== People sidebar =====

const SIDEBAR_LEVEL_DOT: Record<WorkloadLevel, string> = {
  absent: 'bg-zinc-400',
  available: 'bg-emerald-500',
  normal: 'bg-amber-400',
  full: 'bg-orange-500',
  overloaded: 'bg-red-500',
}

function PeopleSidebar({
  people,
  tasks,
  absences,
  selectedId,
  onSelect,
}: {
  people: Person[]
  tasks: Task[]
  absences: Absence[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="panel sticky top-[64px] max-h-[calc(100vh-90px)] overflow-y-auto scroll-thin p-2">
      <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Persone attive · {people.length}
      </div>
      <ul className="space-y-1">
        {people.map((p) => {
          const w = computeWorkload(p, tasks, absences)
          return (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p.id)}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition ${
                  selectedId === p.id ? 'bg-slate-800/80 ring-1 ring-inset ring-sky-500/40' : 'hover:bg-slate-800/50'
                }`}
              >
                <Avatar name={p.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-100">{p.name}</div>
                  <div className="truncate text-[11px] text-slate-500">{p.role}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${SIDEBAR_LEVEL_DOT[w.level]}`} aria-hidden />
                    <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full ${LOAD_BAR_CLASS[w.level]}`}
                        style={{
                          width: `${w.realCapacityHours > 0 ? Math.min(100, w.loadPercent) : w.weekHours > 0 ? 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className={`text-[10px] tabular-nums ${LOAD_TEXT_CLASS[w.level]}`}>
                      {w.isFullyAbsent ? 'ass.' : `${w.loadPercent}%`}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200">
      {initials}
    </div>
  )
}

// ===== Agenda content =====

function PersonAgendaContent({
  agenda,
  onOpenWorkItem,
  onEditTask,
}: {
  agenda: PersonAgenda
  onOpenWorkItem: (workItemId: string) => void
  onEditTask: (task: Task) => void
}) {
  return (
    <div className="space-y-4">
      <PersonHeaderCard agenda={agenda} />
      <PersonKpiStrip agenda={agenda} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <WeekTasksSection
          title="Settimana corrente"
          subtitle={`S${agenda.currentWeek.weekIso} · ${formatItalianShort(agenda.currentWeek.weekStartISO)} → ${formatItalianShort(agenda.currentWeek.weekEndISO)}`}
          week={agenda.currentWeek}
          accent="sky"
          onOpenWorkItem={onOpenWorkItem}
          onEditTask={onEditTask}
        />
        <WeekTasksSection
          title="Prossima settimana"
          subtitle={`S${agenda.nextWeek.weekIso} · ${formatItalianShort(agenda.nextWeek.weekStartISO)} → ${formatItalianShort(agenda.nextWeek.weekEndISO)}`}
          week={agenda.nextWeek}
          accent="violet"
          onOpenWorkItem={onOpenWorkItem}
          onEditTask={onEditTask}
        />
      </div>
      <AbsencesSection agenda={agenda} />
      <TimelineSection events={agenda.timeline} onOpenWorkItem={onOpenWorkItem} />
    </div>
  )
}

// ===== Header card =====

function PersonHeaderCard({ agenda }: { agenda: PersonAgenda }) {
  const { person, currentWeek } = agenda
  const w = currentWeek.workload
  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-base font-semibold text-slate-100">
            {person.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-100">{person.name}</div>
            <div className="text-xs text-slate-400">{person.role}</div>
            {person.skills.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {person.skills.slice(0, 4).map((s) => (
                  <span key={s} className="chip bg-slate-800 text-slate-300 ring-slate-700">
                    {s}
                  </span>
                ))}
                {person.skills.length > 4 && (
                  <span className="text-[10px] text-slate-500">+{person.skills.length - 4}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <HeaderStat label="Cap. teorica" value={`${w.capacityHours}h`} />
          <HeaderStat
            label="Assenze sett."
            value={`${w.absenceHours}h`}
            tone={w.absenceHours > 0 ? 'amber' : 'slate'}
          />
          <HeaderStat label="Cap. reale" value={`${w.realCapacityHours}h`} />
          <HeaderStat label="Assegnate" value={`${w.weekHours}h`} />
          <div className="ml-1 flex flex-col items-end">
            <div className={`text-2xl font-semibold tabular-nums leading-none ${LOAD_TEXT_CLASS[w.level]}`}>
              {w.isFullyAbsent ? '—' : `${w.loadPercent}%`}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">{LOAD_LABELS[w.level]}</div>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full ${LOAD_BAR_CLASS[w.level]}`}
            style={{
              width: `${w.realCapacityHours > 0 ? Math.min(100, w.loadPercent) : w.weekHours > 0 ? 100 : 0}%`,
            }}
          />
          {w.loadPercent > 100 && (
            <div
              className="absolute top-0 h-full bg-red-400/70"
              style={{
                left: '100%',
                width: `${Math.min(40, (w.loadPercent - 100) / 2)}%`,
                transform: 'translateX(-1px)',
              }}
              aria-hidden
            />
          )}
        </div>
      </div>
    </div>
  )
}

function HeaderStat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'amber' }) {
  const cls = tone === 'amber' ? 'text-amber-300' : 'text-slate-100'
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 px-2.5 py-1.5 min-w-[88px]">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  )
}

// ===== KPI strip =====

function PersonKpiStrip({ agenda }: { agenda: PersonAgenda }) {
  const s = agenda.stats
  const tiles: Array<{ label: string; value: number | string; tone: string; hint?: string }> = [
    { label: 'Task aperti', value: s.openTasks, tone: 'sky' },
    { label: 'In ritardo', value: s.delayedTasks, tone: s.delayedTasks > 0 ? 'red' : 'emerald' },
    { label: 'A rischio', value: s.riskTasks, tone: s.riskTasks > 0 ? 'amber' : 'emerald' },
    { label: 'In attesa', value: s.waitingTasks, tone: s.waitingTasks > 0 ? 'amber' : 'slate' },
    { label: 'Completati', value: s.completedTasks, tone: 'emerald' },
    {
      label: 'Ore residue',
      value: `${s.remainingHoursThisWeek}h`,
      tone: s.remainingHoursThisWeek === 0 ? 'amber' : 'sky',
      hint: 'settimana corrente',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <KpiCard key={t.label} {...t} />
      ))}
    </div>
  )
}

const KPI_TONE: Record<string, { bg: string; text: string }> = {
  sky: { bg: 'from-sky-500/15', text: 'text-sky-200' },
  emerald: { bg: 'from-emerald-500/15', text: 'text-emerald-200' },
  amber: { bg: 'from-amber-500/20', text: 'text-amber-200' },
  red: { bg: 'from-red-500/25', text: 'text-red-200' },
  slate: { bg: 'from-slate-500/10', text: 'text-slate-200' },
}

function KpiCard({ label, value, tone, hint }: { label: string; value: number | string; tone: string; hint?: string }) {
  const t = KPI_TONE[tone] ?? KPI_TONE.slate
  return (
    <div className="panel relative overflow-hidden p-3">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b ${t.bg} to-transparent`} aria-hidden />
      <div className="relative">
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${t.text}`}>{value}</div>
        {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
      </div>
    </div>
  )
}

// ===== Week tasks section =====

function WeekTasksSection({
  title,
  subtitle,
  week,
  accent,
  onOpenWorkItem,
  onEditTask,
}: {
  title: string
  subtitle: string
  week: WeekAgenda
  accent: 'sky' | 'violet'
  onOpenWorkItem: (workItemId: string) => void
  onEditTask: (task: Task) => void
}) {
  const accentClass = accent === 'sky' ? 'bg-sky-500' : 'bg-violet-500'
  return (
    <section className="panel p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className={`mt-1 h-3 w-1 rounded-sm ${accentClass}`} aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            <p className="text-[11px] text-slate-500">{subtitle}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{week.tasks.length} task</div>
          <div className="text-[10px] tabular-nums text-slate-500">
            {week.workload.weekHours}h / {week.workload.realCapacityHours}h
          </div>
        </div>
      </header>
      {week.tasks.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-700 px-3 py-6 text-center text-[12px] text-slate-500">
          Nessun task pianificato in questa settimana.
        </div>
      ) : (
        <ul className="space-y-2">
          {week.tasks.map((wt) => (
            <AgendaTaskRow
              key={wt.task.id}
              wt={wt}
              week={week}
              onOpenWorkItem={onOpenWorkItem}
              onEdit={() => onEditTask(wt.task)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function AgendaTaskRow({
  wt,
  week,
  onOpenWorkItem,
  onEdit,
}: {
  wt: WeekAgendaTask
  week: WeekAgenda
  onOpenWorkItem: (workItemId: string) => void
  onEdit: () => void
}) {
  const { setTaskStatus } = useData()
  const toast = useToast()
  const { task, workItem, health, expectedProgress, hoursInWeek, hasAbsenceConflict } = wt
  const diff = task.progressPercent - expectedProgress

  // Borders by health
  const borderClass =
    health === 'in ritardo'
      ? 'border-red-500/40'
      : health === 'a rischio'
        ? 'border-amber-500/30'
        : 'border-slate-800'

  return (
    <li className={`rounded-md border bg-slate-900/40 p-2.5 ${borderClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {workItem?.code && (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                {workItem.code}
              </span>
            )}
            {workItem && <TypeBadge type={workItem.type} />}
            {wt.startsInWeek && (
              <span className="chip bg-sky-500/10 text-sky-300 ring-sky-500/30 text-[10px]">parte</span>
            )}
            {wt.endsInWeek && (
              <span className="chip bg-violet-500/10 text-violet-300 ring-violet-500/30 text-[10px]">scade</span>
            )}
          </div>
          <button
            onClick={() => workItem && onOpenWorkItem(workItem.id)}
            className="mt-1 block w-full text-left text-sm font-medium text-slate-100 hover:text-sky-300"
            title="Apri dettaglio lavoro"
          >
            {task.title}
          </button>
          {workItem && (
            <div className="mt-0.5 truncate text-[11px] text-slate-500">
              {workItem.title}
              {workItem.customer && <> · {workItem.customer}</>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <HealthBadge health={health} />
          <StatusSelect
            value={task.status}
            onChange={(s: Status) => {
              setTaskStatus(task.id, s)
              toast.info(`Stato task: ${s}`)
            }}
          />
          <button
            onClick={onEdit}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title="Modifica task (progresso, bloccanti, note)"
            aria-label="Modifica task"
          >
            ✎
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-400 md:grid-cols-3">
        <div>
          <span className="text-slate-500">Inizio:</span>{' '}
          <span className="text-slate-300">{formatItalianShort(task.startDate)}</span>
        </div>
        <div>
          <span className="text-slate-500">Scad:</span>{' '}
          <span className={health === 'in ritardo' ? 'text-red-300' : 'text-slate-300'}>
            {formatItalianShort(task.dueDate)}
          </span>
        </div>
        <div className="tabular-nums">
          <span className="text-slate-500">In settimana:</span>{' '}
          <span className="text-slate-200">{hoursInWeek}h</span>
        </div>
        <div className="md:col-span-3">
          <span className="text-slate-500">Avanz.:</span>{' '}
          <span className="tabular-nums text-slate-200">Reale {task.progressPercent}%</span>{' · '}
          <span className="tabular-nums text-amber-300">Atteso {expectedProgress}%</span>{' '}
          <span
            className={`tabular-nums ${
              diff < -20 ? 'text-red-300' : diff < 0 ? 'text-amber-300' : 'text-emerald-300'
            }`}
          >
            ({diff > 0 ? '+' : ''}
            {diff}%)
          </span>
        </div>
      </div>

      <div className="relative mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-sky-500" style={{ width: `${task.progressPercent}%` }} />
        <div
          className="absolute top-0 h-full w-px bg-amber-300"
          style={{ left: `${expectedProgress}%` }}
          aria-hidden
        />
      </div>

      {hasAbsenceConflict && week.absences.length > 0 && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-200">
          ⚠ Periodo del task interseca un'assenza dell'assegnatario in settimana.
        </div>
      )}

      {task.blockers.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-amber-300">
          {task.blockers.map((b, i) => (
            <li key={i}>⛔ {b}</li>
          ))}
        </ul>
      )}

      {task.notes && (
        <div className="mt-1.5 whitespace-pre-wrap text-[11px] text-slate-400">{task.notes}</div>
      )}
    </li>
  )
}

// ===== Absences section =====

const ABSENCE_DOT: Record<string, string> = {
  ferie: 'bg-emerald-500',
  permesso: 'bg-sky-500',
  malattia: 'bg-red-500',
  trasferta: 'bg-violet-500',
  altro: 'bg-slate-400',
}

function AbsencesSection({ agenda }: { agenda: PersonAgenda }) {
  const cur = agenda.currentWeek.absences
  const next = agenda.nextWeek.absences
  if (cur.length === 0 && next.length === 0) {
    return (
      <section className="panel p-4">
        <SectionHeader accent="emerald" title="Ferie · permessi · malattie" />
        <p className="mt-2 text-[12px] text-slate-500">
          Nessuna assenza pianificata per {agenda.person.name} nelle prossime due settimane.
        </p>
      </section>
    )
  }
  return (
    <section className="panel p-4">
      <SectionHeader accent="emerald" title="Ferie · permessi · malattie" />
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <AbsencesBucket title="Settimana corrente" absences={cur} />
        <AbsencesBucket title="Prossima settimana" absences={next} />
      </div>
    </section>
  )
}

function AbsencesBucket({ title, absences }: { title: string; absences: Absence[] }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      {absences.length === 0 ? (
        <div className="text-[11px] italic text-slate-500">Nessuna assenza.</div>
      ) : (
        <ul className="space-y-1.5">
          {absences.map((a) => (
            <li
              key={a.id}
              className="rounded-md border border-slate-800 bg-slate-900/40 px-2.5 py-1.5 text-[12px]"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${ABSENCE_DOT[a.type] ?? 'bg-slate-400'}`} aria-hidden />
                <span className="font-medium capitalize text-slate-200">{a.type}</span>
                <span className="ml-auto tabular-nums text-slate-400">{a.hoursPerDay}h/g</span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {a.startDate === a.endDate
                  ? formatItalianShort(a.startDate)
                  : `${formatItalianShort(a.startDate)} → ${formatItalianShort(a.endDate)}`}
              </div>
              {a.notes && <div className="mt-0.5 text-[11px] italic text-slate-500">{a.notes}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ===== Timeline =====

const TIMELINE_TONE: Record<string, string> = {
  'task-start': 'bg-sky-500',
  'task-due': 'bg-violet-500',
  'absence-start': 'bg-amber-500',
  'absence-end': 'bg-amber-400',
}

const DOW = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

function fmtTimelineDate(iso: string): string {
  const d = parseISODate(iso)
  return `${DOW[d.getDay()]} ${formatItalianShort(iso)}`
}

function TimelineSection({
  events,
  onOpenWorkItem,
}: {
  events: TimelineEvent[]
  onOpenWorkItem: (workItemId: string) => void
}) {
  return (
    <section className="panel p-4">
      <SectionHeader accent="sky" title="Timeline · prossime 2 settimane" />
      {events.length === 0 ? (
        <p className="mt-2 text-[12px] text-slate-500">Nessun evento rilevante nelle prossime due settimane.</p>
      ) : (
        <ol className="mt-3 space-y-1">
          {events.map((ev, i) => (
            <li
              key={`${ev.kind}-${ev.date}-${ev.task?.id ?? ev.absence?.id ?? i}`}
              className="grid grid-cols-[110px_auto_1fr] items-center gap-3 rounded-md px-2 py-1.5 text-[12px] hover:bg-slate-800/40"
            >
              <div className="text-[11px] tabular-nums text-slate-400">{fmtTimelineDate(ev.date)}</div>
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${TIMELINE_TONE[ev.kind]}`} aria-hidden />
                <span className="text-[10px] uppercase tracking-wide text-slate-500">
                  {ev.kind === 'task-start'
                    ? 'inizio'
                    : ev.kind === 'task-due'
                      ? 'scad.'
                      : ev.kind === 'absence-start'
                        ? 'ass. inizio'
                        : 'ass. fine'}
                </span>
              </div>
              <TimelineLabel ev={ev} onOpenWorkItem={onOpenWorkItem} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function TimelineLabel({
  ev,
  onOpenWorkItem,
}: {
  ev: TimelineEvent
  onOpenWorkItem: (workItemId: string) => void
}) {
  if (ev.task) {
    const code = ev.workItem?.code
    return (
      <div className="flex min-w-0 items-center gap-2">
        {code && (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
            {code}
          </span>
        )}
        <button
          onClick={() => ev.workItem && onOpenWorkItem(ev.workItem.id)}
          className="truncate text-left text-slate-200 hover:text-sky-300"
          title="Apri dettaglio lavoro"
        >
          {ev.task.title}
        </button>
        {ev.health && <HealthBadge health={ev.health} />}
      </div>
    )
  }
  if (ev.absence) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${ABSENCE_DOT[ev.absence.type] ?? 'bg-slate-400'}`}
          aria-hidden
        />
        <span className="capitalize text-slate-300">{ev.absence.type}</span>
        <span className="text-[11px] text-slate-500">
          ({ev.absence.startDate === ev.absence.endDate
            ? formatItalianShort(ev.absence.startDate)
            : `${formatItalianShort(ev.absence.startDate)} → ${formatItalianShort(ev.absence.endDate)}`})
        </span>
      </div>
    )
  }
  return <span className="text-slate-400">{ev.label}</span>
}

// ===== Misc =====

function SectionHeader({ accent, title }: { accent: 'sky' | 'emerald' | 'violet'; title: string }) {
  const cls =
    accent === 'sky' ? 'bg-sky-500' : accent === 'violet' ? 'bg-violet-500' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-1 rounded-sm ${cls}`} aria-hidden />
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</h3>
    </div>
  )
}

