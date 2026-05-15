import { useMemo, useState } from 'react'
import type { Absence, AbsenceType, Person } from '../types'
import { ALL_ABSENCE_TYPES } from '../types'
import { useData } from '../state/DataProvider'
import { absenceWorkingDaysInRange } from '../utils/availability'
import { addDays, formatISODate, parseISODate, startOfWeek } from '../utils/dates'
import { Modal } from './Modal'
import { AbsenceFormModal, ABSENCE_COLORS } from './AbsenceFormModal'

interface DayCell {
  date: Date
  iso: string
  inMonth: boolean
  isWeekend: boolean
  isToday: boolean
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function lastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}
function isSameDayLocal(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function buildMonthDays(month: Date): DayCell[] {
  const start = startOfWeek(firstOfMonth(month))
  const today = new Date()
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i)
    return {
      date,
      iso: formatISODate(date),
      inMonth: date.getMonth() === month.getMonth(),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isToday: isSameDayLocal(date, today),
    }
  })
}

const MONTH_LABELS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const DOW_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

interface Props {
  open: boolean
  onClose: () => void
}

export function AbsencesCalendarModal({ open, onClose }: Props) {
  const { data } = useData()
  const [month, setMonth] = useState<Date>(() => firstOfMonth(new Date()))
  const [filterPersonId, setFilterPersonId] = useState<string>('')
  const [formState, setFormState] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    absence?: Absence
    prefill?: { personId?: string; date?: string }
  }>({ open: false, mode: 'create' })

  const days = useMemo(() => buildMonthDays(month), [month])
  const monthStartISO = formatISODate(firstOfMonth(month))
  const monthEndISO = formatISODate(lastOfMonth(month))

  const personById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people])

  const visibleAbsences = useMemo(() => {
    return data.absences
      .filter((a) => !filterPersonId || a.personId === filterPersonId)
      .filter((a) => a.startDate <= monthEndISO && a.endDate >= monthStartISO)
  }, [data.absences, filterPersonId, monthStartISO, monthEndISO])

  // Per giorno (working days), elenco assenze.
  const absencesByDay = useMemo(() => {
    const map = new Map<string, Absence[]>()
    for (const a of visibleAbsences) {
      const cursor = parseISODate(a.startDate)
      const limit = parseISODate(a.endDate)
      while (cursor.getTime() <= limit.getTime()) {
        const dow = cursor.getDay()
        if (dow !== 0 && dow !== 6) {
          const iso = formatISODate(cursor)
          if (!map.has(iso)) map.set(iso, [])
          map.get(iso)!.push(a)
        }
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    return map
  }, [visibleAbsences])

  // Riepilogo mensile per persona × tipo.
  const summary = useMemo(() => {
    const result = new Map<string, Record<AbsenceType, number>>()
    for (const p of data.people) {
      result.set(p.id, { ferie: 0, permesso: 0, malattia: 0, trasferta: 0, altro: 0 })
    }
    for (const a of data.absences) {
      const wd = absenceWorkingDaysInRange(a, monthStartISO, monthEndISO)
      if (wd === 0) continue
      const bucket = result.get(a.personId)
      if (!bucket) continue
      bucket[a.type] += wd * a.hoursPerDay
    }
    return result
  }, [data.absences, data.people, monthStartISO, monthEndISO])

  const monthLabel = `${MONTH_LABELS[month.getMonth()]} ${month.getFullYear()}`

  function openCreateForDate(iso?: string) {
    setFormState({
      open: true,
      mode: 'create',
      prefill: {
        personId: filterPersonId || undefined,
        date: iso,
      },
    })
  }

  function openEdit(a: Absence) {
    setFormState({ open: true, mode: 'edit', absence: a })
  }

  function navigateMonth(delta: number) {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Ferie e permessi"
        subtitle="Calendario mensile · Le assenze riducono automaticamente la capacità reale settimanale"
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button onClick={() => navigateMonth(-12)} className="btn-ghost px-2" title="Anno precedente">«</button>
              <button onClick={() => navigateMonth(-1)} className="btn-ghost px-2" title="Mese precedente">‹</button>
              <button onClick={() => setMonth(firstOfMonth(new Date()))} className="btn-ghost" title="Mese corrente">Oggi</button>
              <button onClick={() => navigateMonth(1)} className="btn-ghost px-2" title="Mese successivo">›</button>
              <button onClick={() => navigateMonth(12)} className="btn-ghost px-2" title="Anno successivo">»</button>
              <div className="ml-3 text-base font-semibold text-slate-100">{monthLabel}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Persona</span>
                <select
                  className="input-base w-44"
                  value={filterPersonId}
                  onChange={(e) => setFilterPersonId(e.target.value)}
                >
                  <option value="">Tutti</option>
                  {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <button onClick={() => openCreateForDate()} className="btn-primary">+ Nuova assenza</button>
            </div>
          </div>

          <Legend />

          <CalendarGrid
            days={days}
            absencesByDay={absencesByDay}
            personById={personById}
            singlePersonView={!!filterPersonId}
            onDayClick={(iso) => openCreateForDate(iso)}
            onAbsenceClick={openEdit}
          />

          <MonthlySummary people={data.people} summary={summary} monthLabel={monthLabel} />
        </div>
      </Modal>

      <AbsenceFormModal
        open={formState.open}
        onClose={() => setFormState({ open: false, mode: 'create' })}
        mode={formState.mode}
        absence={formState.absence}
        prefill={formState.prefill}
      />
    </>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
      <span className="font-medium uppercase tracking-wide text-slate-500">Legenda:</span>
      {ALL_ABSENCE_TYPES.map((t) => {
        const c = ABSENCE_COLORS[t]
        return (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        )
      })}
    </div>
  )
}

interface CalendarGridProps {
  days: DayCell[]
  absencesByDay: Map<string, Absence[]>
  personById: Map<string, Person>
  singlePersonView: boolean
  onDayClick: (iso: string) => void
  onAbsenceClick: (a: Absence) => void
}

function CalendarGrid({ days, absencesByDay, personById, singlePersonView, onDayClick, onAbsenceClick }: CalendarGridProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/30">
      <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-900/60 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {DOW_LABELS.map((d, i) => (
          <div key={d} className={`px-2 py-1.5 text-center ${i >= 5 ? 'text-slate-500' : ''}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <DayCellView
            key={day.iso}
            day={day}
            absences={absencesByDay.get(day.iso) ?? []}
            personById={personById}
            singlePersonView={singlePersonView}
            onDayClick={onDayClick}
            onAbsenceClick={onAbsenceClick}
          />
        ))}
      </div>
    </div>
  )
}

function DayCellView({
  day, absences, personById, singlePersonView, onDayClick, onAbsenceClick,
}: {
  day: DayCell
  absences: Absence[]
  personById: Map<string, Person>
  singlePersonView: boolean
  onDayClick: (iso: string) => void
  onAbsenceClick: (a: Absence) => void
}) {
  const dim = !day.inMonth
  const weekend = day.isWeekend
  const visible = absences.slice(0, 3)
  const overflow = absences.length - visible.length

  return (
    <button
      type="button"
      onClick={() => onDayClick(day.iso)}
      className={`group flex min-h-[92px] flex-col items-stretch gap-1 border-b border-r border-slate-800 p-1.5 text-left transition ${
        weekend ? 'bg-slate-900/20' : 'bg-slate-900/40 hover:bg-slate-800/40'
      } ${dim ? 'opacity-40' : ''}`}
      title={weekend ? 'Sabato/domenica — non conteggiati' : 'Click per inserire un’assenza'}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-semibold tabular-nums ${
          day.isToday ? 'rounded bg-sky-500 px-1.5 text-slate-950' : weekend ? 'text-slate-500' : 'text-slate-300'
        }`}>
          {day.date.getDate()}
        </span>
        {absences.length > 0 && (
          <span className="rounded-full bg-slate-800 px-1.5 text-[10px] tabular-nums text-slate-400">
            {absences.length}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        {visible.map((a) => {
          const c = ABSENCE_COLORS[a.type]
          const person = personById.get(a.personId)
          const label = singlePersonView ? c.label : person?.name ?? '?'
          return (
            <span
              key={a.id}
              onClick={(e) => { e.stopPropagation(); onAbsenceClick(a) }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onAbsenceClick(a) } }}
              className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium ring-1 ring-inset ${c.bg} ${c.text} ${c.ring}`}
              title={`${person?.name ?? ''} · ${c.label} · ${a.hoursPerDay}h`}
            >
              <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
              <span className="truncate">{label}</span>
              <span className="ml-auto tabular-nums opacity-70">{a.hoursPerDay}h</span>
            </span>
          )
        })}
        {overflow > 0 && (
          <span className="rounded px-1 py-0.5 text-center text-[10px] text-slate-500">+{overflow} altre</span>
        )}
      </div>
    </button>
  )
}

interface SummaryProps {
  people: Person[]
  summary: Map<string, Record<AbsenceType, number>>
  monthLabel: string
}

function MonthlySummary({ people, summary, monthLabel }: SummaryProps) {
  const rows = people
    .map((p) => {
      const s = summary.get(p.id) ?? { ferie: 0, permesso: 0, malattia: 0, trasferta: 0, altro: 0 }
      const total = s.ferie + s.permesso + s.malattia + s.trasferta + s.altro
      return { person: p, ...s, total }
    })
    .filter((r) => r.total > 0)

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-100">Riepilogo {monthLabel}</h3>
        <span className="text-[11px] text-slate-500">ore working-day per persona e tipo</span>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/40 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-semibold">Persona</th>
              {ALL_ABSENCE_TYPES.map((t) => (
                <th key={t} className="px-3 py-2 text-right font-semibold capitalize">{t}</th>
              ))}
              <th className="px-3 py-2 text-right font-semibold">Totale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {rows.length === 0 && (
              <tr><td colSpan={ALL_ABSENCE_TYPES.length + 2} className="px-3 py-6 text-center text-[12px] text-slate-500">Nessuna assenza in questo mese.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.person.id} className="hover:bg-slate-800/40">
                <td className="px-3 py-2 text-slate-200">{r.person.name}</td>
                {ALL_ABSENCE_TYPES.map((t) => {
                  const c = ABSENCE_COLORS[t]
                  const v = r[t]
                  return (
                    <td key={t} className="px-3 py-2 text-right tabular-nums">
                      {v > 0 ? <span className={`${c.text}`}>{v}h</span> : <span className="text-slate-600">—</span>}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-100">{r.total}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
