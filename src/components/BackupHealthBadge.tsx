import { useEffect, useState } from 'react'
import { useAuth } from '../state/AuthProvider'
import { fetchBackupHealth, type BackupHealth } from '../services/apiClient'

const STYLE: Record<BackupHealth['status'], { dot: string; label: string }> = {
  ok: { dot: 'bg-emerald-400', label: 'Backup al sicuro' },
  warn: { dot: 'bg-amber-400', label: 'Backup: attenzione' },
  error: { dot: 'bg-red-500', label: 'Backup: problema' },
}

export function BackupHealthBadge() {
  const { user } = useAuth()
  const [health, setHealth] = useState<BackupHealth | null>(null)
  const canView = !!user?.permissions.manageBackups

  useEffect(() => {
    if (!canView) return
    let alive = true
    fetchBackupHealth().then((h) => { if (alive) setHealth(h) }).catch(() => { if (alive) setHealth(null) })
    return () => { alive = false }
  }, [canView])

  if (!canView || !health) return null
  const s = STYLE[health.status]
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800/80 bg-[color:var(--color-surface-1)]/80 px-2.5 py-1.5 text-sm" title={health.reasons.join(' · ') || 'Tutto ok'}>
      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden />
      <span className="text-slate-300">{s.label}</span>
    </div>
  )
}
