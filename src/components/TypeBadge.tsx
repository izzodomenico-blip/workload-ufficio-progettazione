import type { WorkItemType } from '../types'

const STYLES: Record<WorkItemType, string> = {
  commessa: 'bg-sky-500/15 text-sky-200 ring-sky-400/40',
  studio: 'bg-violet-500/15 text-violet-200 ring-violet-400/40',
  interno: 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/40',
}

const LABELS: Record<WorkItemType, string> = {
  commessa: 'Commessa',
  studio: 'Studio',
  interno: 'Interno',
}

export function TypeBadge({ type }: { type: WorkItemType }) {
  return <span className={`chip ${STYLES[type]}`}>{LABELS[type]}</span>
}
