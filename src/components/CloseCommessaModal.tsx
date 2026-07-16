import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { closeCommessa } from '../services/apiClient'

interface Props { open: boolean; onClose: () => void }

const keyOf = (n: string) => n.trim() || '(senza commessa)'

export function CloseCommessaModal({ open, onClose }: Props) {
  const { consuntivi, consuntiviClosures, refreshAppData } = useData()
  const toast = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const aperte = useMemo(() => {
    const closed = new Set(consuntiviClosures.map((cl) => cl.commessaKey))
    const map = new Map<string, { count: number; first: string; last: string }>()
    for (const c of consuntivi) {
      const k = keyOf(c.commessaNumber)
      if (closed.has(k)) continue
      const cur = map.get(k) ?? { count: 0, first: c.date, last: c.date }
      cur.count += 1
      if (c.date < cur.first) cur.first = c.date
      if (c.date > cur.last) cur.last = c.date
      map.set(k, cur)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [consuntivi, consuntiviClosures])

  async function submit() {
    if (!selected) return
    setBusy(true)
    try {
      await closeCommessa(selected, password)
      await refreshAppData()
      toast.success(`Commessa ${selected} chiusa e archiviata.`)
      onClose()
    } catch {
      toast.error('Chiusura non riuscita: password errata o commessa non valida.')
    } finally {
      setBusy(false)
    }
  }

  const info = selected ? aperte.find(([k]) => k === selected)?.[1] : undefined

  return (
    <Modal open={open} onClose={onClose} title="Chiudi commessa (certificata)" size="md"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn-primary" disabled={busy || !selected || !password} onClick={submit}>Sigilla e archivia 🔒</button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          La chiusura congela i totali coi prezzi correnti (calcolo certificato dal server),
          blocca i consuntivi della commessa e la sposta nell'Archivio.
        </p>
        <FormField label="Commessa da chiudere">
          <select className="input-base" value={selected ?? ''} onChange={(e) => setSelected(e.target.value || null)}>
            <option value="">— scegli —</option>
            {aperte.map(([k, v]) => (
              <option key={k} value={k}>{k} · {v.count} consuntivi</option>
            ))}
          </select>
        </FormField>
        {info && (
          <div className="panel-soft px-3 py-2 text-sm text-slate-300">
            {info.count} consuntivi · periodo {info.first} → {info.last}
          </div>
        )}
        <FormField label="Password Consuntivi">
          <input type="password" className="input-base" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
        </FormField>
      </div>
    </Modal>
  )
}
