import type { WorkItemType } from '../types'

const STYLES: Record<WorkItemType, string> = {
  commessa: 'bg-sky-500/12 text-sky-200 ring-sky-400/45',
  studio: 'bg-violet-500/12 text-violet-200 ring-violet-400/45',
  interno: 'bg-zinc-500/12 text-zinc-200 ring-zinc-400/45',
}

const DOTS: Record<WorkItemType, string> = {
  commessa: 'bg-sky-400',
  studio: 'bg-violet-400',
  interno: 'bg-zinc-400',
}

const LABELS: Record<WorkItemType, string> = {
  commessa: 'Commessa',
  studio: 'Studio',
  interno: 'Interno',
}

export function TypeBadge({ type }: { type: WorkItemType }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${STYLES[type]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[type]}`} aria-hidden />
      {LABELS[type]}
    </span>
  )
}
