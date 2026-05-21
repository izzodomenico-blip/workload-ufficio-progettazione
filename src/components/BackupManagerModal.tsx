import { useCallback, useEffect, useState } from 'react'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import {
  backupDownloadUrl,
  fetchBackupArchives,
  fetchBackupPreview,
  restoreBackup,
} from '../services/apiClient'
import type {
  BackupArchive,
  BackupCountsSnapshot,
  BackupKind,
  BackupPreview,
  RestoreResult,
} from '../services/apiClient'
import { Modal } from './Modal'

const CONFIRM_TEXT = 'Capisco che il ripristino sostituirà i dati attuali.'

const COUNT_LABELS: Array<[keyof BackupCountsSnapshot, string]> = [
  ['people', 'Persone'],
  ['workItems', 'Lavori'],
  ['tasks', 'Task'],
  ['absences', 'Assenze'],
  ['businessPartners', 'Anagrafiche'],
  ['machineTypes', 'Tipologie macchina'],
  ['workshopOutputs', 'Output officina'],
  ['workshopWorkers', 'Operai officina'],
  ['workshopAssignments', 'Assegnazioni officina'],
]

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'list' | 'preview' | 'done'

export function BackupManagerModal({ open, onClose }: Props) {
  const { reloadFromServer } = useData()
  const toast = useToast()
  const [step, setStep] = useState<Step>('list')
  const [archives, setArchives] = useState<BackupArchive[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<BackupArchive | null>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [result, setResult] = useState<RestoreResult | null>(null)

  const loadArchives = useCallback(async () => {
    setArchives(null)
    setLoadError(null)
    try {
      setArchives(await fetchBackupArchives())
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Errore di caricamento')
      setArchives([])
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setStep('list')
    setSelected(null)
    setPreview(null)
    setConfirmChecked(false)
    setResult(null)
    void loadArchives()
  }, [open, loadArchives])

  async function openPreview(archive: BackupArchive) {
    setSelected(archive)
    setPreview(null)
    setConfirmChecked(false)
    setStep('preview')
    setPreviewLoading(true)
    try {
      setPreview(await fetchBackupPreview(archive.kind, archive.id))
    } catch (err) {
      toast.error(`Anteprima non disponibile: ${err instanceof Error ? err.message : 'errore'}`)
      setStep('list')
    } finally {
      setPreviewLoading(false)
    }
  }

  function download(archive: BackupArchive) {
    window.open(backupDownloadUrl(archive.kind, archive.id), '_blank', 'noopener')
  }

  async function doRestore() {
    if (!selected || !confirmChecked) return
    setRestoring(true)
    try {
      const res = await restoreBackup(selected.kind, selected.id)
      await reloadFromServer()
      setResult(res)
      setStep('done')
      toast.success('Ripristino completato. Dati ricaricati dal server.')
    } catch (err) {
      toast.error(`Ripristino fallito: ${err instanceof Error ? err.message : 'errore sconosciuto'}`)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gestione backup"
      subtitle="Scarica o ripristina un backup. Il ripristino crea prima un backup di sicurezza dello stato attuale."
      size="xl"
      footer={
        step === 'preview' ? (
          <>
            <button onClick={() => setStep('list')} className="btn-ghost" disabled={restoring}>Indietro</button>
            <button onClick={doRestore} className="btn-danger" disabled={!confirmChecked || restoring || previewLoading}>
              {restoring ? 'Ripristino in corso…' : 'Ripristina ora'}
            </button>
          </>
        ) : (
          <button onClick={onClose} className="btn-ghost">Chiudi</button>
        )
      }
    >
      {step === 'list' && (
        <BackupList
          archives={archives}
          loadError={loadError}
          onRetry={loadArchives}
          onDownload={download}
          onRestore={openPreview}
        />
      )}

      {step === 'preview' && selected && (
        <RestorePreview
          archive={selected}
          preview={preview}
          loading={previewLoading}
          confirmChecked={confirmChecked}
          onConfirmChange={setConfirmChecked}
        />
      )}

      {step === 'done' && result && (
        <RestoreOutcome result={result} onBackToList={() => { setStep('list'); void loadArchives() }} />
      )}
    </Modal>
  )
}

function BackupList({
  archives, loadError, onRetry, onDownload, onRestore,
}: {
  archives: BackupArchive[] | null
  loadError: string | null
  onRetry: () => void
  onDownload: (a: BackupArchive) => void
  onRestore: (a: BackupArchive) => void
}) {
  if (archives === null) {
    return <div className="py-10 text-center text-sm text-slate-400">Caricamento backup…</div>
  }
  if (loadError) {
    return (
      <div className="empty-state">
        <div className="text-slate-300">Impossibile leggere i backup dal server.</div>
        <div className="text-xs text-slate-500">{loadError}</div>
        <button onClick={onRetry} className="btn-ghost mt-2">Riprova</button>
      </div>
    )
  }
  if (archives.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden>🗄️</span>
        <div className="text-slate-300">Nessun backup disponibile</div>
        <div className="text-xs text-slate-500">
          I backup automatici vengono creati durante l'uso; un backup manuale si crea con <code className="rounded bg-slate-800 px-1.5 py-0.5">npm run backup</code> o con "Scarica backup JSON".
        </div>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <div className="max-h-[55vh] overflow-y-auto scroll-thin">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="table-head sticky top-0 z-10 border-b border-slate-800">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Tipo</th>
              <th className="px-3 py-2.5 font-semibold">Data e ora</th>
              <th className="px-3 py-2.5 font-semibold text-right">Dimensione</th>
              <th className="px-3 py-2.5 font-semibold text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {archives.map((a) => (
              <tr key={`${a.kind}:${a.id}`} className="hover:bg-sky-500/5">
                <td className="px-3 py-2.5"><KindBadge kind={a.kind} /></td>
                <td className="px-3 py-2.5 text-slate-200">{formatDateTime(a.createdAt)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{formatBytes(a.dbSize ?? a.jsonSize)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <button className="btn-ghost text-xs" onClick={() => onDownload(a)}>Scarica</button>
                    <button className="btn-ghost text-xs text-sky-200" onClick={() => onRestore(a)}>Ripristina</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RestorePreview({
  archive, preview, loading, confirmChecked, onConfirmChange,
}: {
  archive: BackupArchive
  preview: BackupPreview | null
  loading: boolean
  confirmChecked: boolean
  onConfirmChange: (v: boolean) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <KindBadge kind={archive.kind} />
        <span className="text-slate-300">{formatDateTime(archive.createdAt)}</span>
        {preview?.backupInfo?.version && (
          <span className="chip bg-slate-500/10 text-slate-300 ring-slate-500/30">{preview.backupInfo.version}</span>
        )}
      </div>

      <div>
        <div className="section-label mb-2">Contenuto del backup</div>
        {loading ? (
          <div className="py-6 text-center text-sm text-slate-400">Lettura anteprima…</div>
        ) : preview ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COUNT_LABELS.map(([key, label]) => (
              <div key={key} className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">{preview.counts[key] ?? 0}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500">Anteprima non disponibile.</div>
        )}
      </div>

      <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100">
        <div className="font-medium">Attenzione: operazione che sostituisce i dati</div>
        <p className="mt-1 text-amber-100/90">
          Il ripristino <strong>sostituirà tutti i dati attuali</strong> con quelli del backup selezionato.
          Prima dell'operazione viene creato automaticamente un <strong>backup di sicurezza</strong> dello stato corrente,
          così potrai tornare indietro. Nessun backup esistente viene cancellato.
        </p>
      </div>

      <label className="flex items-start gap-2.5 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2.5 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={confirmChecked}
          onChange={(e) => onConfirmChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 accent-red-400"
        />
        <span>{CONFIRM_TEXT}</span>
      </label>
    </div>
  )
}

function RestoreOutcome({ result, onBackToList }: { result: RestoreResult; onBackToList: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3 text-sm text-emerald-100">
        <div className="font-medium">Ripristino completato</div>
        <p className="mt-1 text-emerald-100/90">Dati ripristinati da <code className="rounded bg-slate-900/60 px-1.5 py-0.5">{result.restoredFrom}</code> e ricaricati dal server.</p>
      </div>

      <div>
        <div className="section-label mb-2">Conteggi: prima → dopo</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {COUNT_LABELS.map(([key, label]) => {
            const before = result.before[key] ?? 0
            const after = result.after[key] ?? 0
            const changed = before !== after
            return (
              <div key={key} className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                <div className={`mt-0.5 text-sm tabular-nums ${changed ? 'text-sky-200' : 'text-slate-300'}`}>
                  {before} <span className="text-slate-600">→</span> <span className="font-semibold">{after}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {result.safetyBackup && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
          <div className="section-label mb-1">Backup di sicurezza creato</div>
          <div className="break-all">{result.safetyBackup.dbPath}</div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onBackToList} className="btn-ghost">Torna all'elenco</button>
      </div>
    </div>
  )
}

function KindBadge({ kind }: { kind: BackupKind }) {
  return kind === 'manual' ? (
    <span className="chip bg-sky-500/12 text-sky-200 ring-sky-400/40">Manuale</span>
  ) : (
    <span className="chip bg-slate-500/12 text-slate-300 ring-slate-400/30">Automatico</span>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++ }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
