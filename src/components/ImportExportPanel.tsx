import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { readJSONFile } from '../storage/localStorage'
import { ConfirmDialog } from './ConfirmDialog'
import { useState } from 'react'

export function ImportExportPanel() {
  const { exportData, importData, resetData } = useData()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  function handleExport() {
    exportData()
    toast.success('Esportazione completata.')
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
  }

  function handleReset() {
    resetData()
    setConfirmReset(false)
    toast.info('Dati demo ripristinati.')
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={handleExport} className="btn-ghost" title="Scarica un file JSON con i dati correnti">
        <Icon path="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
        Esporta
      </button>
      <button onClick={handlePickFile} className="btn-ghost" title="Carica un file JSON precedentemente esportato">
        <Icon path="M12 21V9m0 0-4 4m4-4 4 4M5 3h14" />
        Importa
      </button>
      <button onClick={() => setConfirmReset(true)} className="btn-ghost" title="Ripristina i dati demo iniziali">
        <Icon path="M4 4v6h6M20 20v-6h-6M5 19a9 9 0 0 0 14-5M19 5a9 9 0 0 0-14 5" />
        Reset demo
      </button>
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

function Icon({ path }: { path: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
}
