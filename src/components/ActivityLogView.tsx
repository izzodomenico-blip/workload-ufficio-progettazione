import { useMemo, useState } from 'react'
import { useData } from '../state/DataProvider'
import type {
  ActivityLogAction,
  ActivityLogEntityType,
  ActivityLogEntry,
} from '../types'
import { ALL_ACTIVITY_ACTIONS, ALL_ACTIVITY_ENTITY_TYPES } from '../types'
import { endOfWeek, startOfWeek } from '../utils/dates'

type Period = 'today' | 'week' | 'month' | 'all'

interface Filters {
  entityType: ActivityLogEntityType | ''
  action: ActivityLogAction | ''
  period: Period
  search: string
}

const EMPTY_FILTERS: Filters = {
  entityType: '',
  action: '',
  period: 'all',
  search: '',
}

export function ActivityLogView() {
  const { data } = useData()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const log = data.activityLog ?? []

  const filtered = useMemo(() => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const ws = startOfWeek(now).toISOString().slice(0, 10)
    const we = endOfWeek(now).toISOString().slice(0, 10)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
    const q = filters.search.trim().toLowerCase()

    return log.filter((e) => {
      if (filters.entityType && e.entityType !== filters.entityType) return false
      if (filters.action && e.action !== filters.action) return false
      const day = e.timestamp.slice(0, 10)
      if (filters.period === 'today' && day !== today) return false
      if (filters.period === 'week' && (day < ws || day > we)) return false
      if (filters.period === 'month' && (day < monthStart || day > monthEnd)) return false
      if (q) {
        const hay = `${e.title} ${e.description ?? ''} ${e.entityType} ${e.action}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [log, filters])

  const grouped = useMemo(() => groupByDay(filtered), [filtered])

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-7 w-1 rounded-full bg-gradient-to-b from-amber-400 to-amber-600" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">Storico modifiche</h2>
            <p className="text-[11px] text-slate-500">
              Eventi locali tracciati sul database condiviso · ultimi {ACTIVITY_LIMIT_LABEL} eventi
              {' · '}
              <span className="text-slate-400">{log.length} totali</span>
              {filtered.length !== log.length && (
                <>
                  {' · '}
                  <span className="text-sky-300">{filtered.length} dopo filtri</span>
                </>
              )}
            </p>
          </div>
        </div>
        {(filters.entityType !== '' ||
          filters.action !== '' ||
          filters.period !== 'all' ||
          filters.search !== '') && (
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="btn-ghost text-xs">
            Reset filtri
          </button>
        )}
      </header>

      <FiltersBar filters={filters} onChange={setFilters} />

      {grouped.length === 0 ? (
        <div className="panel p-10 text-center">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/60 ring-1 ring-inset ring-slate-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
                <path d="M3 3v18h18" /><path d="M7 13l3-3 3 3 5-5" />
              </svg>
            </div>
            <div className="text-sm font-medium text-slate-300">
              {log.length === 0 ? 'Nessun evento ancora registrato' : 'Nessun evento corrisponde ai filtri'}
            </div>
            <p className="text-[12px] text-slate-500">
              {log.length === 0
                ? 'Le prossime modifiche compariranno qui automaticamente.'
                : 'Modifica i filtri o esegui un reset per allargare i risultati.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <DayGroup key={g.day} dayISO={g.day} entries={g.entries} />
          ))}
        </div>
      )}
    </div>
  )
}

const ACTIVITY_LIMIT_LABEL = '1.000'

// ===== Filters bar =====

function FiltersBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v })
  return (
    <div className="panel flex flex-wrap items-center gap-2 p-3">
      <select
        className="input-base max-w-[180px]"
        value={filters.entityType}
        onChange={(e) => set('entityType', e.target.value as Filters['entityType'])}
        aria-label="Tipo entità"
      >
        <option value="">Tutte le entità</option>
        {ALL_ACTIVITY_ENTITY_TYPES.map((t) => (
          <option key={t} value={t}>
            {ENTITY_LABEL[t]}
          </option>
        ))}
      </select>
      <select
        className="input-base max-w-[200px]"
        value={filters.action}
        onChange={(e) => set('action', e.target.value as Filters['action'])}
        aria-label="Azione"
      >
        <option value="">Tutte le azioni</option>
        {ALL_ACTIVITY_ACTIONS.map((a) => (
          <option key={a} value={a}>
            {ACTION_LABEL[a]}
          </option>
        ))}
      </select>
      <div className="inline-flex rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs">
        {(['today', 'week', 'month', 'all'] as const).map((p) => (
          <button
            key={p}
            onClick={() => set('period', p)}
            className={`rounded px-2.5 py-1 transition ${filters.period === p ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      <input
        type="search"
        className="input-base flex-1 min-w-[180px]"
        placeholder="Cerca per titolo, descrizione, tipo…"
        value={filters.search}
        onChange={(e) => set('search', e.target.value)}
      />
    </div>
  )
}

const ENTITY_LABEL: Record<ActivityLogEntityType, string> = {
  workItem: 'Lavori',
  task: 'Task',
  person: 'Persone',
  absence: 'Assenze',
  machineType: 'Tipologie disegno',
  workshopOutput: 'Output officina',
  workshopWorker: 'Operai officina',
  workshopAssignment: 'Assegnazioni officina',
  system: 'Sistema',
}

const ACTION_LABEL: Record<ActivityLogAction, string> = {
  created: 'Creato',
  updated: 'Modificato',
  deleted: 'Eliminato',
  status_changed: 'Cambio stato',
  progress_changed: 'Avanzamento',
  converted: 'Convertito',
  exported: 'Export',
  imported: 'Import',
  reset: 'Reset',
}

const PERIOD_LABEL: Record<Period, string> = {
  today: 'Oggi',
  week: 'Sett.',
  month: 'Mese',
  all: 'Tutto',
}

// ===== Day groups =====

interface DayGroup {
  day: string
  entries: ActivityLogEntry[]
}

function groupByDay(entries: ActivityLogEntry[]): DayGroup[] {
  const map = new Map<string, ActivityLogEntry[]>()
  for (const e of entries) {
    const day = e.timestamp.slice(0, 10)
    const arr = map.get(day) ?? []
    arr.push(e)
    map.set(day, arr)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, entries]) => ({ day, entries }))
}

const DOW = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  const todayIso = new Date().toISOString().slice(0, 10)
  if (iso === todayIso) return `Oggi · ${DOW[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
  return `${DOW[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

function DayGroup({ dayISO, entries }: { dayISO: string; entries: ActivityLogEntry[] }) {
  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-800 bg-[color:var(--color-surface-1)]/60 px-3 py-2">
        <span className="section-label">{fmtDay(dayISO)}</span>
        <span className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[10px] tabular-nums text-slate-400 ring-1 ring-inset ring-slate-700/60">
          {entries.length} evento{entries.length === 1 ? '' : 'i'}
        </span>
      </header>
      <ul className="divide-y divide-slate-800/60">
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} />
        ))}
      </ul>
    </section>
  )
}

// ===== Entry row =====

const ACTION_TONE: Record<ActivityLogAction, string> = {
  created: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  updated: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  deleted: 'bg-red-500/15 text-red-300 ring-red-500/40',
  status_changed: 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/30',
  progress_changed: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  converted: 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
  exported: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  imported: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/30',
  reset: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
}

const ENTITY_DOT: Record<ActivityLogEntityType, string> = {
  workItem: 'bg-sky-400',
  task: 'bg-emerald-400',
  person: 'bg-violet-400',
  absence: 'bg-amber-400',
  machineType: 'bg-cyan-400',
  workshopOutput: 'bg-orange-400',
  workshopWorker: 'bg-lime-400',
  workshopAssignment: 'bg-fuchsia-400',
  system: 'bg-slate-400',
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function EntryRow({ entry }: { entry: ActivityLogEntry }) {
  return (
    <li className="grid grid-cols-[58px_auto_1fr] items-start gap-3 px-3 py-2.5 transition hover:bg-slate-800/30">
      <div className="text-[11px] tabular-nums text-slate-500">{fmtTime(entry.timestamp)}</div>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${ENTITY_DOT[entry.entityType]}`} aria-hidden />
        <span
          className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${ACTION_TONE[entry.action]}`}
        >
          {ACTION_LABEL[entry.action]}
        </span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{ENTITY_LABEL[entry.entityType]}</span>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-100">{entry.title}</div>
        {entry.description && (
          <div className="mt-0.5 text-[11px] text-slate-400">{entry.description}</div>
        )}
        <BeforeAfterBadges entry={entry} />
      </div>
    </li>
  )
}

function BeforeAfterBadges({ entry }: { entry: ActivityLogEntry }) {
  const before = entry.before as Record<string, unknown> | undefined
  const after = entry.after as Record<string, unknown> | undefined
  if (entry.action === 'status_changed' && before && after) {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[10px]">
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">{String(before.status ?? '—')}</span>
        <span className="text-slate-500">→</span>
        <span className="rounded bg-slate-700 px-1.5 py-0.5 font-medium text-slate-100">{String(after.status ?? '—')}</span>
      </div>
    )
  }
  if (entry.action === 'progress_changed' && before && after) {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[10px]">
        <span className="rounded bg-slate-800 px-1.5 py-0.5 tabular-nums text-slate-300">{String(before.progressPercent ?? 0)}%</span>
        <span className="text-slate-500">→</span>
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-medium tabular-nums text-amber-200">{String(after.progressPercent ?? 0)}%</span>
      </div>
    )
  }
  return null
}
