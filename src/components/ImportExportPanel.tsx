import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { AppData } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import type { BackupStatus } from '../services/apiClient'
import { fetchBackupStatus } from '../services/apiClient'
import { downloadTextFile, readJSONFile } from '../storage/localStorage'
import type { BackupSummary } from '../utils/backup'
import { getLastBackupAt, validateBackupPayload } from '../utils/backup'
import { generateWeeklyAdminReport } from '../utils/weeklyReport'
import { ImportPreviewModal } from './ImportPreviewModal'
import { ResetDemoConfirmModal } from './ResetDemoConfirmModal'
import { WeeklyReportModal } from './WeeklyReportModal'

interface PendingImport {
  fileName: string
  data: AppData
  summary: BackupSummary
}

export function ImportExportPanel() {
  const { data, exportData, importData, resetData } = useData()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [lastBackupAt, setLastBackupAtState] = useState<string | null>(() => getLastBackupAt())
  const [serverBackupStatus, setServerBackupStatus] = useState<BackupStatus | null>(null)
  const reminder = getBackupReminder(lastBackupAt)

  useEffect(() => {
    if (!open) return
    setLastBackupAtState(getLastBackupAt())
    fetchBackupStatus()
      .then(setServerBackupStatus)
      .catch(() => setServerBackupStatus(null))
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handleExport() {
    const result = exportData()
    setLastBackupAtState(result.exportedAt)
    toast.success(`Backup JSON scaricato: ${result.filename}`)
    setOpen(false)
  }

  function handlePickFile() {
    inputRef.current?.click()
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const payload = await readJSONFile(file)
      const result = validateBackupPayload(payload)
      if (!result.ok) {
        toast.error(`Importazione fallita: ${result.error}`)
        setOpen(false)
        return
      }
      setPendingImport({
        fileName: file.name,
        data: result.data,
        summary: result.summary,
      })
    } catch (err) {
      toast.error(`Importazione fallita: ${err instanceof Error ? err.message : 'errore sconosciuto'}`)
    }
    setOpen(false)
  }

  function handleConfirmImport() {
    if (!pendingImport) return
    importData(pendingImport.data, {
      fileName: pendingImport.fileName,
      exportedAt: pendingImport.summary.exportedAt,
      version: pendingImport.summary.version,
    })
    setPendingImport(null)
    toast.success('Backup JSON importato.')
  }

  function handleReset() {
    resetData()
    setConfirmReset(false)
    toast.info('Dati demo ripristinati.')
  }

  function handleBackupBeforeReset() {
    const result = exportData()
    setLastBackupAtState(result.exportedAt)
    toast.success(`Backup JSON scaricato: ${result.filename}`)
  }

  function handleReport() {
    try {
      const md = generateWeeklyAdminReport(data)
      const today = new Date().toISOString().slice(0, 10)
      downloadTextFile(md, `report_settimanale_ufficio_tecnico_${today}.md`)
      toast.success('Report settimanale scaricato.')
    } catch (err) {
      toast.error(`Generazione report fallita: ${err instanceof Error ? err.message : 'errore sconosciuto'}`)
    }
    setOpen(false)
  }

  function handlePreview() {
    setPreviewOpen(true)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost"
        title="Esporta, importa, reset e report"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon path="M12 5v.01M12 12v.01M12 19v.01" />
        Strumenti
        <Caret open={open} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-lg border border-slate-700 bg-[color:var(--color-panel)] shadow-2xl"
        >
          <SectionLabel>Backup dati</SectionLabel>
          {reminder && <BackupReminderBox reminder={reminder} />}
          <MenuItem onClick={handleExport} icon={<Icon path="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />}>
            Scarica backup JSON
          </MenuItem>
          <div className="px-3 py-1 text-xs text-slate-400">
            {formatLastBackupLabel(lastBackupAt)}
          </div>
          <ServerBackupStatusBox status={serverBackupStatus} />
          <MenuItem onClick={handlePickFile} icon={<Icon path="M12 21V9m0 0-4 4m4-4 4 4M5 3h14" />}>
            Importa backup JSON
          </MenuItem>
          <MenuItem
            onClick={() => { setConfirmReset(true); setOpen(false) }}
            icon={<Icon path="M4 4v6h6M20 20v-6h-6M5 19a9 9 0 0 0 14-5M19 5a9 9 0 0 0-14 5" />}
          >
            Reset demo protetto
          </MenuItem>

          <div className="my-1 border-t border-slate-800" />

          <SectionLabel>Report</SectionLabel>
          <MenuItem
            onClick={handleReport}
            icon={<Icon path="M9 17v-6m3 6V8m3 9v-3M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z" />}
          >
            Esporta report settimanale Markdown
          </MenuItem>
          <MenuItem
            onClick={handlePreview}
            icon={<Icon path="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />}
          >
            Anteprima report executive / Stampa PDF
          </MenuItem>
        </div>
      )}

      <input ref={inputRef} type="file" accept="application/json" onChange={handleFileChange} className="hidden" />

      <ImportPreviewModal
        open={pendingImport !== null}
        fileName={pendingImport?.fileName ?? ''}
        summary={pendingImport?.summary ?? null}
        onConfirm={handleConfirmImport}
        onCancel={() => setPendingImport(null)}
      />

      <ResetDemoConfirmModal
        open={confirmReset}
        lastBackupAt={lastBackupAt}
        onDownloadBackup={handleBackupBeforeReset}
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />

      <WeeklyReportModal open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
      {children}
    </div>
  )
}

function MenuItem({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800/70"
    >
      <span className="text-slate-400">{icon}</span>
      <span className="flex-1">{children}</span>
    </button>
  )
}

type BackupReminder = {
  message: string
  className: string
}

function BackupReminderBox({ reminder }: { reminder: BackupReminder }) {
  return (
    <div className={`mx-3 mb-1 rounded-md border px-2.5 py-2 text-[12px] leading-snug ${reminder.className}`}>
      {reminder.message}
    </div>
  )
}

function ServerBackupStatusBox({ status }: { status: BackupStatus | null }) {
  return (
    <div className="mx-3 my-1 rounded-md border border-slate-800 bg-slate-900/35 px-2.5 py-2 text-[11px] leading-snug text-slate-400">
      <div className="flex items-center justify-between gap-2">
        <span>Backup automatico</span>
        <span className={status?.autoBackupEnabled ? 'font-medium text-emerald-300' : 'font-medium text-slate-500'}>
          {status?.autoBackupEnabled ? 'attivo' : 'non disponibile'}
        </span>
      </div>
      <div className="mt-1">Ultimo backup automatico: {formatServerBackupDate(status?.lastAutoBackupAt)}</div>
      <div>Backup automatici conservati: {status?.autoBackupCount ?? '—'}</div>
      {status?.lastAutoBackupError && (
        <div className="mt-1 text-amber-200">Warning: ultimo backup automatico fallito.</div>
      )}
      <div className="mt-1 text-slate-500">
        I backup automatici sono salvati sul PC server nella cartella backups/auto.
      </div>
    </div>
  )
}

function getBackupReminder(lastBackupAt: string | null): BackupReminder | null {
  if (!lastBackupAt) {
    return {
      message: 'Backup consigliato: non risulta ancora un backup dei dati.',
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    }
  }
  const ageDays = getBackupAgeDays(lastBackupAt)
  if (ageDays === null) {
    return {
      message: 'Backup consigliato: non risulta ancora un backup dei dati.',
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    }
  }
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

function formatServerBackupDate(iso?: string | null): string {
  if (!iso) return 'mai'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.toLocaleDateString('it-IT')} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
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

function Icon({ path }: { path: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
