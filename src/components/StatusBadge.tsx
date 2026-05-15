import type { Status } from '../types'

const STYLES: Record<Status, string> = {
  'Da pianificare': 'bg-slate-500/10 text-slate-300 ring-slate-500/30',
  'Assegnato': 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/30',
  'In corso': 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  'In attesa input commerciale': 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  'In attesa input cliente': 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  'In attesa scelta tecnica': 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  'In verifica responsabile': 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
  'Da correggere': 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
  'Pronto per rilascio': 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  'Rilasciato produzione': 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40',
  'Sospeso': 'bg-zinc-500/10 text-zinc-300 ring-zinc-500/30',
  'Annullato': 'bg-zinc-700/30 text-zinc-400 ring-zinc-700/40 line-through',
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`chip ${STYLES[status]}`}>{status}</span>
}
