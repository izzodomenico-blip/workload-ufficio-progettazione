import type { Priority } from '../types'

const STYLES: Record<Priority, string> = {
  bassa: 'bg-slate-500/10 text-slate-300 ring-slate-500/30',
  media: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  alta: 'bg-orange-500/10 text-orange-300 ring-orange-500/40',
  critica: 'bg-red-500/15 text-red-300 ring-red-500/50',
}

const ICON: Record<Priority, string> = {
  bassa: '○',
  media: '◐',
  alta: '◑',
  critica: '●',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`chip ${STYLES[priority]}`}>
      <span aria-hidden>{ICON[priority]}</span>
      {priority}
    </span>
  )
}
