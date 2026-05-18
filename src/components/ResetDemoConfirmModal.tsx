import { useEffect, useState } from 'react'
import { Modal } from './Modal'

interface ResetDemoConfirmModalProps {
  open: boolean
  lastBackupAt: string | null
  onDownloadBackup: () => void
  onCancel: () => void
  onConfirm: () => void
}

export function ResetDemoConfirmModal({
  open,
  lastBackupAt,
  onDownloadBackup,
  onCancel,
  onConfirm,
}: ResetDemoConfirmModalProps) {
  const [confirmed, setConfirmed] = useState(false)
  const warning = getBackupWarning(lastBackupAt)

  useEffect(() => {
    if (open) setConfirmed(false)
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Reset demo protetto"
      subtitle="Conferma richiesta prima di sostituire i dati locali"
      size="sm"
      footer={
        <>
          <button onClick={onCancel} className="btn-ghost">Annulla</button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-red-300/50 ${
              confirmed
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'cursor-not-allowed bg-red-500/30 text-red-100/60'
            }`}
          >
            Ripristina dati demo
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-300">
          Questa azione sostituirà tutti i dati attuali con i dati demo.
        </p>

        <div className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
          {formatLastBackupLabel(lastBackupAt)}
        </div>

        {warning && (
          <div className={`rounded-md border px-3 py-2 text-sm ${warning.className}`}>
            {warning.message}
          </div>
        )}

        <button onClick={onDownloadBackup} className="btn-ghost w-full justify-center">
          Scarica backup prima del reset
        </button>

        <label className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-900/35 px-3 py-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 accent-sky-500"
          />
          <span>Ho capito che i dati attuali verranno sostituiti.</span>
        </label>
      </div>
    </Modal>
  )
}

function getBackupWarning(lastBackupAt: string | null): { message: string; className: string } | null {
  if (!lastBackupAt) {
    return {
      message: 'Backup consigliato: non risulta ancora un backup dei dati.',
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    }
  }
  const ageDays = getBackupAgeDays(lastBackupAt)
  if (ageDays === null) return null
  if (ageDays > 7) {
    return {
      message: 'Attenzione: ultimo backup più di 7 giorni fa.',
      className: 'border-red-500/45 bg-red-500/15 text-red-100',
    }
  }
  if (ageDays > 3) {
    return {
      message: 'Backup consigliato: ultimo backup più di 3 giorni fa.',
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    }
  }
  return null
}

function formatLastBackupLabel(lastBackupAt: string | null): string {
  if (!lastBackupAt) return 'Nessun backup effettuato'
  const date = new Date(lastBackupAt)
  if (Number.isNaN(date.getTime())) return 'Nessun backup effettuato'
  if (date.toDateString() === new Date().toDateString()) {
    return `Ultimo backup: oggi alle ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }
  const ageDays = getBackupCalendarAgeDays(date)
  if (ageDays !== null) return `Ultimo backup: ${ageDays} ${ageDays === 1 ? 'giorno' : 'giorni'} fa`
  return 'Nessun backup effettuato'
}

function getBackupAgeDays(lastBackupAt: string): number | null {
  const date = new Date(lastBackupAt)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
}

function getBackupCalendarAgeDays(date: Date): number | null {
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.max(1, Math.floor((todayStart - dateStart) / 86_400_000))
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
