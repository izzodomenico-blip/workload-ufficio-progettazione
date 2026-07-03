import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useData } from '../state/DataProvider'
import {
  getCurrentWeekReportData,
  getNextWeekReportData,
  type CurrentWeekReport,
  type NextWeekReport,
  type PersonWorkloadReport,
  type WorkloadLevel,
} from '../utils/weeklyReport'
import { computePlanningMatrix, type PlanningMatrix } from '../utils/planning'
import type { Absence, AbsenceType, Person, Task, WorkItem } from '../types'
import { endOfWeek, formatISODate, formatItalianShort, startOfWeek, workingDaysOverlap } from '../utils/dates'
import { getWorkloadActivitiesForPerson } from '../utils/workload'

interface Props {
  open: boolean
  onClose: () => void
}

const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

function fmtDayMonth(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getInitials(name: string): string {
  return name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()
}

function isWithinDays(iso: string, days: number): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return false
  const target = new Date(y, m - 1, d).getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (target - today.getTime()) / 86_400_000
  return diff <= days
}

export function WeeklyReportModal({ open, onClose }: Props) {
  const { data } = useData()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const computed = useMemo(() => {
    if (!open) return null
    const generatedAt = new Date()
    return {
      current: getCurrentWeekReportData(data, generatedAt),
      next: getNextWeekReportData(data, generatedAt),
      planning: computePlanningMatrix(data, generatedAt, 4),
      generatedAt,
    }
  }, [open, data])

  if (!open || !computed) return null

  const { current, next, planning, generatedAt } = computed
  const personById = new Map<string, Person>(data.people.map((p) => [p.id, p]))
  const workItemById = new Map<string, WorkItem>(data.workItems.map((w) => [w.id, w]))

  return (
    <div
      className="report-print-root executive-report-print-root fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Anteprima report settimanale"
    >
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm print:hidden"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative z-20 mx-auto flex max-w-[230mm] items-center justify-between gap-3 px-4 pt-4 print:hidden">
        <div className="hidden sm:flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-200 ring-1 ring-inset ring-sky-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
            Anteprima · pronta per stampa o PDF
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden max-w-[320px] text-[11px] leading-snug text-slate-400 md:inline">
            Nel dialog di stampa disattiva "Intestazioni e pie di pagina" se il browser li mostra.
          </span>
          <button type="button" onClick={onClose} className="btn-ghost">
            Chiudi
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-primary"
            title="Nel dialog di stampa disattiva 'Intestazioni e pie di pagina' se il browser li mostra."
          >
            <PrinterIcon /> Stampa · Salva PDF
          </button>
        </div>
      </div>

      <article className="report-print-area executive-report-print-area relative z-10 mx-auto my-6 max-w-[210mm] bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200 print:m-0 print:max-w-none print:shadow-none print:ring-0">
        <div className="executive-report-body px-9 pt-8 pb-9 print:px-0 print:pt-2 print:pb-0">
          <ReportHeader current={current} generatedAt={generatedAt} />
          <div className="mt-6">
            <KpiBar current={current} />
          </div>
          <div className="mt-6">
            <PeopleSection
              workload={current.workload}
              tasks={data.tasks}
              workItems={data.workItems}
              workItemById={workItemById}
              generatedAt={generatedAt}
            />
          </div>
          <div className="executive-report-columns mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2 print:gap-4">
            <AbsencesSection
              absences={current.absences}
              personById={personById}
              weekStart={current.weekStart}
              weekEnd={current.weekEnd}
              generatedAt={generatedAt}
            />
            <CriticalSection issues={current.criticalIssues} />
          </div>
          <div className="mt-6">
            <NextWeekSection
              next={next}
              planning={planning}
              personById={personById}
              workItemById={workItemById}
            />
          </div>
          <ReportFooter generatedAt={generatedAt} />
        </div>
      </article>
    </div>
  )
}

// ===== Section title =====

function SectionTitle({
  accent,
  children,
  meta,
}: {
  accent: string
  children: ReactNode
  meta?: ReactNode
}) {
  return (
    <h2 className="executive-section-title flex items-center gap-2 text-sm font-semibold text-slate-800">
      <span className={`h-3 w-1 rounded-sm ${accent}`} aria-hidden />
      <span>{children}</span>
      {meta !== undefined && (
        <span className="ml-1 text-xs font-normal text-slate-500">· {meta}</span>
      )}
    </h2>
  )
}

// ===== Header =====

function ReportHeader({ current, generatedAt }: { current: CurrentWeekReport; generatedAt: Date }) {
  return (
    <header className="executive-report-header flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900">
          <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden>
            <path
              d="M14 44 L24 24 L32 36 L40 20 L50 44"
              stroke="#38bdf8"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <h1 className="executive-report-title text-[24px] font-semibold leading-tight text-slate-950">
            Report settimanale
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Ufficio Progettazione Meccanica
          </p>
        </div>
      </div>
      <div className="text-right">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          Settimana {current.weekIso}
        </div>
        <div className="mt-1.5 text-sm font-medium text-slate-700">
          {fmtDayMonth(current.weekStart)} — {fmtDayMonth(current.weekEnd)} {current.weekEnd.getFullYear()}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          Generato {fmtDayMonth(generatedAt)} · {fmtTime(generatedAt)}
        </div>
      </div>
    </header>
  )
}

// ===== KPI bar =====

const TONE_TEXT: Record<string, string> = {
  sky: 'text-sky-700',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
  slate: 'text-slate-900',
}

function KpiBar({ current }: { current: CurrentWeekReport }) {
  const s = current.summary
  const totalOpen = s.openCommesse + s.openStudi + s.openInterni
  const overloaded = current.workload.filter((w) => w.level === 'overloaded').length
  const reducedCap = current.workload.filter(
    (w) => w.level !== 'absent' && w.absenceHours > 0 && w.realCapacity < w.capacity / 2,
  ).length
  const operational = current.workload.filter((w) => w.level !== 'absent').length
  const absentTotal = current.workload.length - operational

  const tiles: Array<{ value: number; label: string; sub: string; tone: string }> = [
    {
      value: totalOpen,
      label: 'Lavori aperti',
      sub: `${s.openCommesse} commesse · ${s.openStudi} studi`,
      tone: 'sky',
    },
    {
      value: s.openTasks,
      label: 'Task aperti',
      sub: `${s.completedThisWeekCount} completati in settimana${s.completedTasks > 0 ? ` · ${s.completedTasks} totali` : ''}`,
      tone: 'slate',
    },
    {
      value: operational,
      label: 'Persone operative',
      sub: absentTotal > 0 ? `${absentTotal} assenti tutta la settimana` : 'tutti presenti',
      tone: 'emerald',
    },
    {
      value: s.lateTasks,
      label: 'Task in ritardo',
      sub: s.lateTasks > 0 ? 'da gestire subito' : 'tutto regolare',
      tone: s.lateTasks > 0 ? 'red' : 'emerald',
    },
    {
      value: s.atRiskTasks,
      label: 'A rischio',
      sub: s.atRiskTasks > 0 ? 'da monitorare' : 'sotto controllo',
      tone: s.atRiskTasks > 0 ? 'amber' : 'emerald',
    },
    {
      value: overloaded,
      label: 'Sovraccarichi',
      sub: reducedCap > 0 ? `${reducedCap} con capacità ridotta` : 'team bilanciato',
      tone: overloaded > 0 ? 'red' : 'emerald',
    },
  ]

  return (
    <section className="executive-print-section print-keep">
      <SectionTitle accent="bg-sky-500">Sintesi</SectionTitle>
      <div className="executive-kpi-grid mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 print:gap-2">
        {tiles.map((t) => (
          <KpiTile key={t.label} {...t} />
        ))}
      </div>
    </section>
  )
}

function KpiTile({ value, label, sub, tone }: { value: number; label: string; sub: string; tone: string }) {
  const accent = TONE_TEXT[tone] ?? TONE_TEXT.slate
  return (
    <div className="executive-print-card rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-3 print:bg-white">
      <div className={`text-2xl font-semibold tabular-nums leading-none ${accent}`}>{value}</div>
      <div className="mt-1.5 text-xs font-medium text-slate-700">{label}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{sub}</div>
    </div>
  )
}

// ===== People section =====

const LEVEL_DOT: Record<WorkloadLevel, string> = {
  absent: 'bg-slate-300',
  available: 'bg-emerald-500',
  normal: 'bg-sky-500',
  full: 'bg-amber-500',
  overloaded: 'bg-red-500',
}

const LEVEL_BAR: Record<WorkloadLevel, string> = {
  absent: 'bg-slate-200',
  available: 'bg-emerald-500',
  normal: 'bg-sky-500',
  full: 'bg-amber-500',
  overloaded: 'bg-red-500',
}

const LEVEL_PCT_TEXT: Record<WorkloadLevel, string> = {
  absent: 'text-slate-400',
  available: 'text-emerald-700',
  normal: 'text-sky-700',
  full: 'text-amber-700',
  overloaded: 'text-red-700',
}

const LEVEL_LABEL: Record<WorkloadLevel, string> = {
  absent: 'Assente',
  available: 'Disponibile',
  normal: 'Normale',
  full: 'Pieno',
  overloaded: 'Sovraccarico',
}

function PeopleSection({
  workload,
  tasks,
  workItems,
  workItemById,
  generatedAt,
}: {
  workload: PersonWorkloadReport[]
  tasks: Task[]
  workItems: WorkItem[]
  workItemById: Map<string, WorkItem>
  generatedAt: Date
}) {
  if (workload.length === 0) {
    return (
      <section>
        <SectionTitle accent="bg-slate-400">Carico di lavoro</SectionTitle>
        <p className="mt-3 text-sm text-slate-500">Nessuna persona attiva.</p>
      </section>
    )
  }
  return (
    <section>
      <SectionTitle accent="bg-slate-700" meta={`${workload.length} persone`}>
        Carico di lavoro
      </SectionTitle>
      <div className="executive-people-list mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {workload.map((w, idx) => (
          <PersonRow
            key={w.person.id}
            wl={w}
            tasks={tasks}
            workItems={workItems}
            workItemById={workItemById}
            isLast={idx === workload.length - 1}
            generatedAt={generatedAt}
          />
        ))}
      </div>
    </section>
  )
}

function PersonRow({
  wl,
  tasks,
  workItems,
  workItemById,
  isLast,
  generatedAt,
}: {
  wl: PersonWorkloadReport
  tasks: Task[]
  workItems: WorkItem[]
  workItemById: Map<string, WorkItem>
  isLast: boolean
  generatedAt: Date
}) {
  // Tutte le attivita' della settimana per questa persona, ordinate da
  // getWorkloadActivitiesForPerson per scadenza crescente, residuo decrescente.
  const ws = startOfWeek(generatedAt)
  const we = endOfWeek(generatedAt)
  const activities = getWorkloadActivitiesForPerson(wl.person, tasks, workItems, ws, we, generatedAt)
  const barWidth = wl.realCapacity > 0 ? Math.min(100, wl.loadPercent) : wl.weekHours > 0 ? 100 : 0
  const overflow = wl.loadPercent > 100 ? Math.min(40, (wl.loadPercent - 100) / 2) : 0
  const todayISO = formatISODate(generatedAt)

  return (
    <div
      className={`executive-person-row print-keep px-3.5 py-3 ${
        isLast ? '' : 'border-b border-slate-100'
      }`}
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3">
        <div className="flex items-center gap-2 pt-0.5">
          <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT[wl.level]}`} aria-hidden />
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
            {getInitials(wl.person.name)}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <div className="truncate text-sm font-semibold text-slate-900">{wl.person.name}</div>
            <div className="truncate text-[11px] text-slate-500">{wl.person.role}</div>
          </div>
          <div className="mt-1.5">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full ${LEVEL_BAR[wl.level]}`} style={{ width: `${barWidth}%` }} />
              {overflow > 0 && (
                <div
                  className="absolute top-0 h-full bg-red-400/70"
                  style={{ left: '100%', width: `${overflow}%`, transform: 'translateX(-1px)' }}
                  aria-hidden
                />
              )}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className={`text-base font-semibold tabular-nums leading-none ${LEVEL_PCT_TEXT[wl.level]}`}>
            {wl.level === 'absent' ? '—' : `${wl.loadPercent}%`}
          </div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {LEVEL_LABEL[wl.level]}
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-slate-500">
            {wl.weekHours}h <span className="text-slate-400">/ {wl.realCapacity}h</span>
          </div>
        </div>
      </div>

      {/* Agenda della settimana: tutti i lavori della persona, lista compatta con rail. */}
      <div className="mt-2.5 pl-[40px]">
        {activities.length === 0 ? (
          <div className="text-[11px] italic text-slate-400">
            {wl.level === 'absent' ? 'Assente tutta la settimana' : 'Nessuna attività pianificata'}
          </div>
        ) : (
          <ul className="executive-person-activities border-l border-slate-200 pl-3">
            {activities.map((activity) => (
              <ActivityLine
                key={`${activity.kind}-${activity.id}`}
                activity={activity}
                wi={activity.workItem ?? workItemById.get(activity.workItemId)}
                todayISO={todayISO}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ActivityLine({
  activity,
  wi,
  todayISO,
}: {
  activity: ReturnType<typeof getWorkloadActivitiesForPerson>[number]
  wi: WorkItem | undefined
  todayISO: string
}) {
  const phase = wi?.technicalPhase
  const commPrio = wi?.commercialPriority
  const overdue = activity.dueDate < todayISO
  const releaseSoon =
    wi?.plannedProductionReleaseDate &&
    !wi.actualProductionReleaseDate &&
    isWithinDays(wi.plannedProductionReleaseDate, 21)

  return (
    <li className="executive-activity-line grid grid-cols-[44px_1fr_auto] items-baseline gap-x-2 py-1 text-[11px] leading-snug">
      <span className="font-semibold tabular-nums text-slate-700">
        {activity.hoursInWeek}h
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className={`rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide ${
            activity.kind === 'task' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {activity.kind === 'task' ? 'Task' : 'Lavoro'}
          </span>
          {wi?.code && (
            <span className="font-mono text-[10.5px] font-medium text-slate-800">{wi.code}</span>
          )}
          <span className="min-w-0 truncate text-slate-700">{activity.title}</span>
          {phase && (
            <span className="rounded bg-indigo-50 px-1 py-px text-[9px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200/60">
              {phase}
            </span>
          )}
          {commPrio && (commPrio === 'alta' || commPrio === 'critica') && (
            <span
              className={`rounded px-1 py-px text-[9px] font-semibold ${
                commPrio === 'critica'
                  ? 'bg-red-100 text-red-700 ring-1 ring-inset ring-red-200/60'
                  : 'bg-orange-100 text-orange-700 ring-1 ring-inset ring-orange-200/60'
              }`}
              title="Priorità commerciale"
            >
              comm.{commPrio === 'critica' ? '!' : ''}
            </span>
          )}
          {releaseSoon && wi?.plannedProductionReleaseDate && (
            <span
              className="rounded bg-sky-50 px-1 py-px text-[9px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200/60"
              title="Rilascio produzione previsto vicino"
            >
              rel. {formatItalianShort(wi.plannedProductionReleaseDate)}
            </span>
          )}
        </div>
      </div>
      <span className={`shrink-0 tabular-nums text-[10.5px] ${overdue ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
        {overdue && '! '}{formatItalianShort(activity.dueDate)}
      </span>
    </li>
  )
}

// ===== Absences =====

const ABSENCE_DOT: Record<AbsenceType, string> = {
  ferie: 'bg-emerald-500',
  permesso: 'bg-sky-500',
  malattia: 'bg-red-500',
  trasferta: 'bg-violet-500',
  altro: 'bg-slate-400',
}

const ABSENCE_LABEL: Record<AbsenceType, string> = {
  ferie: 'Ferie',
  permesso: 'Permesso',
  malattia: 'Malattia',
  trasferta: 'Trasferta',
  altro: 'Altro',
}

function AbsencesSection({
  absences,
  personById,
  weekStart,
  weekEnd,
  generatedAt,
}: {
  absences: Absence[]
  personById: Map<string, Person>
  weekStart: Date
  weekEnd: Date
  generatedAt: Date
}) {
  // Nasconde le assenze interamente concluse prima della data di stampa:
  // ferie/permessi dei giorni passati della settimana non devono apparire.
  const todayISO = formatISODate(generatedAt)
  const upcoming = absences.filter((a) => a.endDate >= todayISO)
  return (
    <section className="executive-print-section print-keep">
      <SectionTitle accent="bg-emerald-500" meta={upcoming.length}>
        Ferie · permessi · malattie
      </SectionTitle>
      {upcoming.length === 0 ? (
        <p className="mt-3 text-[12px] text-slate-500">
          {absences.length === 0
            ? 'Nessuna assenza pianificata in settimana.'
            : 'Nessuna assenza dalla data odierna a fine settimana.'}
        </p>
      ) : (
        <ul className="mt-2.5 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {upcoming.slice(0, 8).map((a) => {
            const name = personById.get(a.personId)?.name ?? '—'
            const days = workingDaysOverlap(a.startDate, a.endDate, weekStart, weekEnd)
            const period =
              a.startDate === a.endDate
                ? formatItalianShort(a.startDate)
                : `${formatItalianShort(a.startDate)} — ${formatItalianShort(a.endDate)}`
            return (
              <li key={a.id} className="flex items-center gap-2.5 px-3 py-1.5 text-[12px]">
                <span className={`h-2 w-2 shrink-0 rounded-full ${ABSENCE_DOT[a.type]}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{name}</span>
                <span className="shrink-0 text-[11px] text-slate-600">{ABSENCE_LABEL[a.type]}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{period}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                  {days}g · {a.hoursPerDay}h/g
                </span>
              </li>
            )
          })}
          {upcoming.length > 8 && (
            <li className="px-3 py-1.5 text-center text-[10px] text-slate-400">
              + altre {upcoming.length - 8}
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

// ===== Critical =====

function CriticalSection({ issues }: { issues: string[] }) {
  const shown = issues.slice(0, 7)
  const more = Math.max(0, issues.length - 7)
  return (
    <section className="executive-print-section print-keep">
      <SectionTitle accent="bg-red-500" meta={issues.length}>
        Criticità
      </SectionTitle>
      {issues.length === 0 ? (
        <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-[12px] text-emerald-800 print:bg-white">
          <span className="font-semibold">Tutto sotto controllo.</span> Nessuna criticità rilevata.
        </div>
      ) : (
        <ul className="mt-2.5 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {shown.map((c, i) => (
            <li key={i} className="flex items-start gap-2 px-3 py-1.5 text-[12px] text-slate-800">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
              <span className="leading-snug">{c}</span>
            </li>
          ))}
          {more > 0 && (
            <li className="px-3 py-1.5 text-center text-[10px] text-slate-400">
              + altre {more} segnalazioni
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

// ===== Next week =====

function NextWeekSection({
  next,
  planning,
  personById,
  workItemById,
}: {
  next: NextWeekReport
  planning: PlanningMatrix
  personById: Map<string, Person>
  workItemById: Map<string, WorkItem>
}) {
  const reducedCount = next.reducedCapacityPeople.length
  const outlook = planning.summary
  return (
    <section className="executive-print-section print-keep">
      <SectionTitle
        accent="bg-sky-500"
        meta={`S${next.weekIso} · ${fmtDayMonth(next.weekStart)} — ${fmtDayMonth(next.weekEnd)}`}
      >
        Focus prossima settimana
      </SectionTitle>

      <p className="mt-1.5 text-[11px] text-slate-500">
        Outlook prossime 4 settimane:{' '}
        <span className={`font-semibold ${outlook.criticalWeeks > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
          {outlook.criticalWeeks}/4 critiche
        </span>
        {outlook.overloadedPeople > 0 && (
          <>
            {' · '}
            <span className="font-semibold text-red-700">{outlook.overloadedPeople}</span>{' '}
            {outlook.overloadedPeople === 1 ? 'persona sovraccarica' : 'persone sovraccariche'}
          </>
        )}
        {' · '}
        <span className="tabular-nums text-slate-600">{Math.round(outlook.totalPlannedHours)}h</span>{' '}
        pianificate
      </p>

      <div className="executive-next-grid mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4 print:gap-2">
        <NextTile value={next.startingTasks.length} label="Task in partenza" tone="sky" />
        <NextTile value={next.endingTasks.length} label="Task in scadenza" tone="amber" />
        <NextTile value={next.activeWorkItems.length} label="Lavori attivi" tone="slate" />
        <NextTile
          value={reducedCount}
          label="Capacità ridotta"
          tone={reducedCount > 0 ? 'red' : 'emerald'}
        />
      </div>

      {(next.endingTasks.length > 0 || reducedCount > 0) && (
        <div className="executive-next-columns mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-600">
              In scadenza
            </div>
            {next.endingTasks.length === 0 ? (
              <div className="text-[11px] italic text-slate-400">Nessuna scadenza.</div>
            ) : (
              <ul className="space-y-1 text-[11.5px]">
                {next.endingTasks.slice(0, 4).map((t) => {
                  const wi = workItemById.get(t.workItemId)
                  const a = personById.get(t.assigneeId)?.name ?? '—'
                  return (
                    <li key={t.id} className="flex items-center gap-1.5 text-slate-700">
                      <span className="text-slate-300">▸</span>
                      {wi?.code && <span className="font-medium text-slate-800">{wi.code}</span>}
                      {wi?.code && <span className="text-slate-400">·</span>}
                      <span className="min-w-0 truncate">{t.title}</span>
                      <span className="ml-auto shrink-0 text-slate-500">
                        {a} · {formatItalianShort(t.dueDate)}
                      </span>
                    </li>
                  )
                })}
                {next.endingTasks.length > 4 && (
                  <li className="text-[10px] text-slate-400">+ altre {next.endingTasks.length - 4}</li>
                )}
              </ul>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-600">
              Capacità ridotta
            </div>
            {reducedCount === 0 ? (
              <div className="text-[11px] italic text-slate-400">Capacità piena per tutto il team.</div>
            ) : (
              <ul className="space-y-1 text-[11.5px]">
                {next.reducedCapacityPeople.slice(0, 4).map((p) => (
                  <li key={p.person.id} className="flex items-center gap-1.5 text-slate-700">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
                    <span className="font-medium text-slate-800">{p.person.name}</span>
                    <span className="ml-auto tabular-nums text-slate-500">
                      −{p.absenceHours}h · restano {p.realCapacity}h
                    </span>
                  </li>
                ))}
                {reducedCount > 4 && (
                  <li className="text-[10px] text-slate-400">+ altre {reducedCount - 4}</li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function NextTile({ value, label, tone }: { value: number; label: string; tone: string }) {
  const accent = TONE_TEXT[tone] ?? TONE_TEXT.slate
  return (
    <div className="executive-print-card rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 print:bg-white">
      <div className={`text-xl font-semibold tabular-nums leading-none ${accent}`}>{value}</div>
      <div className="mt-1 text-[11px] text-slate-600">{label}</div>
    </div>
  )
}

// ===== Footer =====

function ReportFooter({ generatedAt }: { generatedAt: Date }) {
  return (
    <footer className="mt-7 border-t border-slate-200 pt-3 text-[10px] text-slate-400">
      Flowrlink · CRM &amp; Workload · Report generato il {fmtDayMonth(generatedAt)}{' '}
      {generatedAt.getFullYear()} alle {fmtTime(generatedAt)}
    </footer>
  )
}

// ===== Icons =====

function PrinterIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v8H6Z" />
    </svg>
  )
}
