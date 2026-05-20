import { useMemo } from 'react'
import type { AppData, Person } from '../types'
import { isOpen } from '../types'
import { computeWorkload } from '../utils/workload'
import { isOverdue, isoWeekNumber, startOfWeek, endOfWeek, formatItalianShort } from '../utils/dates'

interface Props {
  data: AppData
}

export function HeroStats({ data }: Props) {
  const stats = useMemo(() => {
    const openCommesse = data.workItems.filter((w) => w.type === 'commessa' && isOpen(w.status)).length
    const openStudi = data.workItems.filter((w) => w.type === 'studio' && isOpen(w.status)).length
    const overdueTasks = data.tasks.filter((t) => isOpen(t.status) && isOverdue(t.dueDate)).length
    const blockedTasks = data.tasks.filter((t) => isOpen(t.status) && t.blockers.length > 0).length

    const loads = data.people.filter((p) => p.active).map((p) => computeWorkload(p, data.tasks, data.absences, new Date(), data.workItems))
    const measurable = loads.filter((l) => !l.isFullyAbsent)
    const avgLoad = measurable.length === 0 ? 0 : Math.round(measurable.reduce((s, l) => s + l.loadPercent, 0) / measurable.length)
    let mostLoaded: { person: Person; percent: number } | null = null
    for (const l of loads) {
      if (l.isFullyAbsent) continue
      if (mostLoaded === null || l.loadPercent > mostLoaded.percent) {
        const person = data.people.find((p) => p.id === l.personId)
        if (person) mostLoaded = { person, percent: l.loadPercent }
      }
    }
    const peopleAbsent = loads.filter((l) => l.absenceHours > 0).length
    return { openCommesse, openStudi, overdueTasks, blockedTasks, avgLoad, mostLoaded, peopleAbsent }
  }, [data])

  const now = new Date()
  const weekNum = isoWeekNumber(now)
  const ws = startOfWeek(now)
  const we = endOfWeek(now)

  const items: Array<{ label: string; value: string; tone: Tone; hint?: string; icon: string }> = [
    {
      label: 'Commesse aperte',
      value: String(stats.openCommesse),
      tone: 'sky',
      hint: 'in lavorazione',
      icon: 'M4 7h16M4 12h16M4 17h10',
    },
    {
      label: 'Studi e preventivi',
      value: String(stats.openStudi),
      tone: 'violet',
      hint: 'in valutazione',
      icon: 'M9 12h6m-6 4h6m-3-14a4 4 0 0 1 4 4v12H5V6a4 4 0 0 1 4-4Z',
    },
    {
      label: 'Task in ritardo',
      value: String(stats.overdueTasks),
      tone: stats.overdueTasks > 0 ? 'red' : 'emerald',
      hint: stats.overdueTasks > 0 ? 'da recuperare' : 'tutti in tempo',
      icon: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    },
    {
      label: 'Task bloccati',
      value: String(stats.blockedTasks),
      tone: stats.blockedTasks > 0 ? 'amber' : 'emerald',
      hint: stats.blockedTasks > 0 ? 'con bloccanti' : 'nessun blocco',
      icon: 'M6 10V8a6 6 0 1 1 12 0v2M5 10h14v10H5z',
    },
    {
      label: 'Carico medio',
      value: `${stats.avgLoad}%`,
      tone: stats.avgLoad > 100 ? 'red' : stats.avgLoad > 85 ? 'orange' : 'sky',
      hint: stats.peopleAbsent > 0 ? `cap. reale · ${stats.peopleAbsent} con assenze` : 'capacità reale settimana',
      icon: 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Zm9-5v5l4 2',
    },
    {
      label: 'Più sovraccarico',
      value: stats.mostLoaded ? stats.mostLoaded.person.name : '—',
      tone: stats.mostLoaded && stats.mostLoaded.percent > 100 ? 'red' : 'sky',
      hint: stats.mostLoaded ? `${stats.mostLoaded.percent}% questa settimana` : 'nessun dato',
      icon: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-4 2c-3 0-7 1.5-7 4v2h14v-2c0-2.5-4-4-7-4Z',
    },
  ]

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
            Settimana corrente
          </div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <div className="text-2xl font-semibold tracking-tight text-slate-100 tabular-nums">
              S{weekNum}
            </div>
            <div className="text-sm font-normal text-slate-400 tabular-nums">
              {formatItalianShort(ws.toISOString().slice(0, 10))} – {formatItalianShort(we.toISOString().slice(0, 10))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((it) => (
          <KpiTile key={it.label} {...it} />
        ))}
      </div>
    </section>
  )
}

type Tone = 'sky' | 'violet' | 'red' | 'amber' | 'orange' | 'emerald'

const TONE_BG: Record<Tone, string> = {
  sky: 'from-sky-500/25 to-transparent',
  violet: 'from-violet-500/25 to-transparent',
  red: 'from-red-500/30 to-transparent',
  amber: 'from-amber-500/25 to-transparent',
  orange: 'from-orange-500/25 to-transparent',
  emerald: 'from-emerald-500/25 to-transparent',
}

const TONE_TEXT: Record<Tone, string> = {
  sky: 'text-sky-200',
  violet: 'text-violet-200',
  red: 'text-red-200',
  amber: 'text-amber-200',
  orange: 'text-orange-200',
  emerald: 'text-emerald-200',
}

const TONE_ICON: Record<Tone, string> = {
  sky: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  violet: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  red: 'bg-red-500/15 text-red-300 ring-red-500/30',
  amber: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  orange: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
}

function KpiTile({ label, value, tone, hint, icon }: { label: string; value: string; tone: Tone; hint?: string; icon: string }) {
  return (
    <div className="panel group relative overflow-hidden p-4 transition hover:border-slate-700">
      <div
        className={`pointer-events-none absolute inset-x-0 -top-2 h-24 bg-gradient-to-b ${TONE_BG[tone]} opacity-90`}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
          <div className={`mt-1.5 truncate text-[22px] font-semibold tracking-tight tabular-nums ${TONE_TEXT[tone]}`}>
            {value}
          </div>
          {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
        </div>
        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${TONE_ICON[tone]}`} aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
        </span>
      </div>
    </div>
  )
}
