import type { BackupSummary } from '../utils/backup'
import { Modal } from './Modal'

interface ImportPreviewModalProps {
  open: boolean
  fileName: string
  summary: BackupSummary | null
  onCancel: () => void
  onConfirm: () => void
}

export function ImportPreviewModal({
  open,
  fileName,
  summary,
  onCancel,
  onConfirm,
}: ImportPreviewModalProps) {
  if (!summary) return null

  const counts = [
    ['Persone', summary.counts.people],
    ['Lavori', summary.counts.workItems],
    ['Task', summary.counts.tasks],
    ['Assenze', summary.counts.absences],
    ['Eventi storico', summary.counts.activityLog],
    ['Notifiche', summary.counts.notifications],
  ] as const

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Anteprima import backup JSON"
      subtitle="Controlla il contenuto prima di sostituire i dati locali"
      size="md"
      footer={
        <>
          <button onClick={onCancel} className="btn-ghost">Annulla</button>
          <button onClick={onConfirm} className="btn-primary">Conferma import</button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid gap-2 text-sm">
          <InfoRow label="Nome file" value={fileName} mono />
          <InfoRow label="Data esportazione" value={formatBackupDate(summary.exportedAt)} />
          <InfoRow label="Versione" value={summary.version ?? 'Non presente'} />
          <InfoRow label="Formato" value={summary.source === 'backup' ? 'Backup v1.0' : 'Export legacy AppData'} />
        </dl>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {counts.map(([label, value]) => (
            <div key={label} className="rounded-md border border-slate-800 bg-slate-900/45 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          L'import sostituirà i dati attuali presenti nel browser.
        </div>
      </div>
    </Modal>
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 rounded-md border border-slate-800 bg-slate-900/35 px-3 py-2 sm:grid-cols-[150px_1fr]">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`min-w-0 break-words text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}

function formatBackupDate(iso?: string): string {
  if (!iso) return 'Non presente'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.toLocaleDateString('it-IT')} alle ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
