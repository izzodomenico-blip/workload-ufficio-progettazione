import type { Priority } from '../types'

const STYLES: Record<Priority, string> = {
  bassa: 'bg-slate-500/12 text-slate-200 ring-slate-400/35',
  media: 'bg-sky-500/12 text-sky-200 ring-sky-400/40',
  alta: 'bg-orange-500/12 text-orange-200 ring-orange-400/45',
  critica: 'bg-red-500/15 text-red-100 ring-red-400/55',
}

const DOTS: Record<Priority, string> = {
  bassa: 'bg-slate-400',
  media: 'bg-sky-400',
  alta: 'bg-orange-400',
  critica: 'bg-red-400',
}

const LABELS: Record<Priority, string> = {
  bassa: 'Bassa',
  media: 'Media',
  alta: 'Alta',
  critica: 'Critica',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${STYLES[priority]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[priority]}`} aria-hidden />
      {LABELS[priority]}
    </span>
  )
}
