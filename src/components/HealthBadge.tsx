import type { HealthStatus } from '../utils/progress'
import { HEALTH_LABELS } from '../utils/progress'

const STYLES: Record<HealthStatus, string> = {
  ok: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  'a rischio': 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  'in ritardo': 'bg-red-500/10 text-red-300 ring-red-500/40',
  'in attesa': 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  sospeso: 'bg-zinc-500/10 text-zinc-300 ring-zinc-500/30',
  completato: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40',
}

interface Props {
  health: HealthStatus
  size?: 'sm' | 'md'
  className?: string
}

export function HealthBadge({ health, size = 'sm', className = '' }: Props) {
  const sizeCls = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
  return (
    <span className={`inline-flex items-center rounded-md font-medium ring-1 ring-inset ${STYLES[health]} ${sizeCls} ${className}`}>
      {HEALTH_LABELS[health]}
    </span>
  )
}
