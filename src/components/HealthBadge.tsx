import type { HealthStatus } from '../utils/progress'
import { HEALTH_LABELS } from '../utils/progress'

const STYLES: Record<HealthStatus, string> = {
  ok: 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/35',
  'a rischio': 'bg-amber-500/10 text-amber-200 ring-amber-500/35',
  'in ritardo': 'bg-red-500/12 text-red-200 ring-red-500/45',
  'in attesa': 'bg-sky-500/10 text-sky-200 ring-sky-500/35',
  sospeso: 'bg-zinc-500/10 text-zinc-200 ring-zinc-500/35',
  completato: 'bg-emerald-500/18 text-emerald-100 ring-emerald-500/50',
}

const DOTS: Record<HealthStatus, string> = {
  ok: 'bg-emerald-400',
  'a rischio': 'bg-amber-400',
  'in ritardo': 'bg-red-400',
  'in attesa': 'bg-sky-400',
  sospeso: 'bg-zinc-400',
  completato: 'bg-emerald-300',
}

interface Props {
  health: HealthStatus
  size?: 'sm' | 'md'
  className?: string
}

export function HealthBadge({ health, size = 'sm', className = '' }: Props) {
  const sizeCls = size === 'sm' ? 'text-[10px] px-2 py-[2px]' : 'text-xs px-2.5 py-0.5'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset ${STYLES[health]} ${sizeCls} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[health]}`} aria-hidden />
      {HEALTH_LABELS[health]}
    </span>
  )
}
