import type { Status } from '../types'
import { ALL_STATUSES } from '../types'

const STYLES: Record<Status, string> = {
  'Da pianificare': 'bg-slate-500/10 text-slate-300 ring-slate-500/30',
  'Pianificato': 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/30',
  'In corso': 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  'In attesa': 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  'In verifica': 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
  'Completato': 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40',
  'Sospeso': 'bg-zinc-500/10 text-zinc-300 ring-zinc-500/30',
}

interface Props {
  value: Status
  onChange: (next: Status) => void
  size?: 'sm' | 'md'
  className?: string
  ariaLabel?: string
}

export function StatusSelect({ value, onChange, size = 'sm', className = '', ariaLabel }: Props) {
  const sizeCls = size === 'sm' ? 'text-[11px] py-0.5 pl-2 pr-6' : 'text-xs py-1 pl-2.5 pr-7'
  return (
    <div className={`relative inline-block ${className}`} onClick={(e) => e.stopPropagation()}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Status)}
        aria-label={ariaLabel ?? 'Cambia stato'}
        className={`appearance-none rounded-md font-medium ring-1 ring-inset outline-none transition ${STYLES[value]} ${sizeCls} cursor-pointer focus:ring-2 focus:ring-sky-500/40`}
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s} className="bg-slate-900 text-slate-100">{s}</option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        width="10"
        height="10"
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 opacity-70"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  )
}

