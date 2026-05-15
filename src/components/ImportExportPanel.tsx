import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { downloadTextFile, readJSONFile } from '../storage/localStorage'
import { generateWeeklyAdminReport } from '../utils/weeklyReport'
import { ConfirmDialog } from './ConfirmDialog'

export function ImportExportPanel() {
  const { data, exportData, importData, resetData } = useData()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (!open) return
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
    exportData()
    toast.success('Backup JSON scaricato.')
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
      const next = await readJSONFile(file)
      importData(next)
      toast.success('Dati importati.')
    } catch (err) {
      toast.error(`Importazione fallita: ${err instanceof Error ? err.message : 'errore sconosciuto'}`)
    }
    setOpen(false)
  }

  function handleReset() {
    resetData()
    setConfirmReset(false)
    toast.info('Dati demo ripristinati.')
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
          <MenuItem onClick={handleExport} icon={<Icon path="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />}>
            Esporta JSON
          </MenuItem>
          <MenuItem onClick={handlePickFile} icon={<Icon path="M12 21V9m0 0-4 4m4-4 4 4M5 3h14" />}>
            Importa JSON
          </MenuItem>
          <MenuItem
            onClick={() => { setConfirmReset(true); setOpen(false) }}
            icon={<Icon path="M4 4v6h6M20 20v-6h-6M5 19a9 9 0 0 0 14-5M19 5a9 9 0 0 0-14 5" />}
          >
            Reset demo
          </MenuItem>

          <div className="my-1 border-t border-slate-800" />

          <SectionLabel>Report</SectionLabel>
          <p className="px-3 pb-1 text-[11px] leading-snug text-slate-400">
            Genera un riepilogo leggibile per amministratore/direzione con stato lavori, carichi, criticità e attività previste.
          </p>
          <MenuItem
            onClick={handleReport}
            icon={<Icon path="M9 17v-6m3 6V8m3 9v-3M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z" />}
          >
            Esporta report settimanale
          </MenuItem>
        </div>
      )}

      <input ref={inputRef} type="file" accept="application/json" onChange={handleFileChange} className="hidden" />

      <ConfirmDialog
        open={confirmReset}
        title="Ripristinare i dati demo?"
        message="Tutte le modifiche locali andranno perse. L’operazione non è reversibile."
        confirmLabel="Ripristina"
        danger
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />
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

function Icon({ path }: { path: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
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
