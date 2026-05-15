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

    const loads = data.people.filter((p) => p.active).map((p) => computeWorkload(p, data.tasks, data.absences))
    // Per il carico medio escludo persone "fully absent" (capacità reale 0)
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

  const items: Array<{ label: string; value: string; tone: string; hint?: string }> = [
    { label: 'Commesse aperte', value: String(stats.openCommesse), tone: 'sky', hint: 'in lavorazione' },
    { label: 'Studi/preventivi aperti', value: String(stats.openStudi), tone: 'violet', hint: 'in valutazione' },
    { label: 'Task in ritardo', value: String(stats.overdueTasks), tone: stats.overdueTasks > 0 ? 'red' : 'emerald', hint: 'oltre scadenza' },
    { label: 'Task bloccati', value: String(stats.blockedTasks), tone: stats.blockedTasks > 0 ? 'amber' : 'emerald', hint: 'con bloccanti aperti' },
    {
      label: 'Carico medio ufficio',
      value: `${stats.avgLoad}%`,
      tone: stats.avgLoad > 100 ? 'red' : stats.avgLoad > 85 ? 'orange' : 'sky',
      hint: stats.peopleAbsent > 0 ? `su capacità reale · ${stats.peopleAbsent} con assenze` : 'su capacità reale settimana corrente',
    },
    {
      label: 'Più sovraccarico',
      value: stats.mostLoaded ? `${stats.mostLoaded.person.name}` : '—',
      tone: stats.mostLoaded && stats.mostLoaded.percent > 100 ? 'red' : 'sky',
      hint: stats.mostLoaded ? `${stats.mostLoaded.percent}% questa settimana` : 'nessun dato',
    },
  ]

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Settimana corrente</div>
          <div className="mt-0.5 text-xl font-semibold text-slate-100">
            S{weekNum} <span className="text-slate-400 text-base font-normal">· {formatItalianShort(ws.toISOString().slice(0, 10))} – {formatItalianShort(we.toISOString().slice(0, 10))}</span>
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

const TONE_CLASS: Record<string, string> = {
  sky: 'from-sky-500/20 text-sky-200',
  violet: 'from-violet-500/20 text-violet-200',
  red: 'from-red-500/25 text-red-200',
  amber: 'from-amber-500/20 text-amber-200',
  orange: 'from-orange-500/20 text-orange-200',
  emerald: 'from-emerald-500/20 text-emerald-200',
}

function KpiTile({ label, value, tone, hint }: { label: string; value: string; tone: string; hint?: string }) {
  const cls = TONE_CLASS[tone] ?? TONE_CLASS.sky
  return (
    <div className="panel relative overflow-hidden p-4">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${cls.split(' ')[0]} to-transparent`} aria-hidden />
      <div className="relative">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className={`mt-1.5 text-2xl font-semibold ${cls.split(' ')[1] ?? 'text-slate-100'}`}>{value}</div>
        {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
      </div>
    </div>
  )
}
