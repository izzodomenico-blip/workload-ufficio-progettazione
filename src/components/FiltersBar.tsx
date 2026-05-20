import type { ReactNode } from 'react'
import type { AppData, Filters, Priority, Status, TechnicalPhase, WorkItemType } from '../types'
import { ALL_PRIORITIES, ALL_STATUSES, ALL_TYPES, EMPTY_FILTERS, TECHNICAL_PHASES } from '../types'

interface Props {
  data: AppData
  filters: Filters
  onChange: (next: Filters) => void
}

export function FiltersBar({ data, filters, onChange }: Props) {
  const customers = Array.from(new Set(data.workItems.map((w) => w.customer))).sort()
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v })

  const dirty =
    filters.personId !== '' ||
    filters.customer !== '' ||
    filters.type !== '' ||
    filters.priority !== '' ||
    filters.status !== '' ||
    filters.search !== '' ||
    filters.technicalPhase !== '' ||
    filters.commercialPriority !== ''

  return (
    <div className="panel flex flex-wrap items-end gap-2 p-3">
      <Field label="Cerca">
        <div className="relative">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            className="input-base w-48 pl-8"
            placeholder="codice, titolo, cliente…"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
          />
        </div>
      </Field>
      <Field label="Persona">
        <select className="input-base w-40" value={filters.personId} onChange={(e) => set('personId', e.target.value)}>
          <option value="">Tutte</option>
          {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Cliente">
        <select className="input-base w-44" value={filters.customer} onChange={(e) => set('customer', e.target.value)}>
          <option value="">Tutti</option>
          {customers.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Tipo">
        <select className="input-base w-36" value={filters.type} onChange={(e) => set('type', e.target.value as WorkItemType | '')}>
          <option value="">Tutti</option>
          {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Priorità">
        <select className="input-base w-32" value={filters.priority} onChange={(e) => set('priority', e.target.value as Priority | '')}>
          <option value="">Tutte</option>
          {ALL_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
      <Field label="Stato">
        <select className="input-base w-56" value={filters.status} onChange={(e) => set('status', e.target.value as Status | '')}>
          <option value="">Tutti</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Fase tecnica">
        <select
          className="input-base w-48"
          value={filters.technicalPhase}
          onChange={(e) => set('technicalPhase', e.target.value as TechnicalPhase | '')}
        >
          <option value="">Tutte</option>
          {TECHNICAL_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
      <Field label="Priorità comm.">
        <select
          className="input-base w-36"
          value={filters.commercialPriority}
          onChange={(e) => set('commercialPriority', e.target.value as Priority | '')}
        >
          <option value="">Tutte</option>
          {ALL_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
      {dirty && (
        <button onClick={() => onChange(EMPTY_FILTERS)} className="btn-ghost h-[34px] self-end">
          Reset filtri
        </button>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  )
}
