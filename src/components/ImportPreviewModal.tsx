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
    ['Tipologie disegno', summary.counts.machineTypes],
    ['Output officina', summary.counts.workshopOutputs],
    ['Operai officina', summary.counts.workshopWorkers],
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
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-1">
          <InfoRow label="Nome file" value={fileName} mono />
          <InfoRow label="Data esportazione" value={formatBackupDate(summary.exportedAt)} />
          <InfoRow label="Versione" value={summary.version ?? 'Non presente'} />
          <InfoRow label="Formato" value={summary.source === 'backup' ? 'Backup v1.0' : 'Export legacy AppData'} />
        </div>

        <div>
          <div className="mb-2 section-label">Contenuto rilevato</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {counts.map(([label, value]) => (
              <div key={label} className="rounded-md border border-slate-800 bg-slate-900/45 px-3 py-2.5 transition hover:border-slate-700">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-100">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
            <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
          <span>L'import sostituirà i dati attualmente presenti.</span>
        </div>
      </div>
    </Modal>
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid items-center gap-2 px-2.5 py-1.5 text-sm sm:grid-cols-[160px_1fr]">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
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
