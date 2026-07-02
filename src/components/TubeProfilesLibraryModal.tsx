import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { DEFAULT_TUBE_PROFILES } from '../data/tubeProfiles'
import { ALL_TUBE_CATEGORIES, TUBE_CATEGORY_LABELS } from '../types'
import type { TubeCategory } from '../types'

interface Props { open: boolean; onClose: () => void }

export function TubeProfilesLibraryModal({ open, onClose }: Props) {
  const { tubeProfiles, createTubeProfile, updateTubeProfile, deleteTubeProfile } = useData()
  const toast = useToast()
  const [categoria, setCategoria] = useState<TubeCategory>('tubolari')
  const [label, setLabel] = useState('')
  const [kgPerMeter, setKgPerMeter] = useState(0)

  const sorted = useMemo(() => [...tubeProfiles].sort((a, b) => a.label.localeCompare(b.label)), [tubeProfiles])

  function add() {
    if (!label.trim()) { toast.error('Inserisci la sigla del profilo.'); return }
    createTubeProfile({ categoria, label: label.trim(), kgPerMeter, active: true, notes: '' })
    setLabel(''); setKgPerMeter(0)
    toast.success('Profilo aggiunto.')
  }

  function loadDefaults() {
    const existing = new Set(tubeProfiles.map((p) => p.label.toLowerCase()))
    let added = 0
    for (const p of DEFAULT_TUBE_PROFILES) {
      if (existing.has(p.label.toLowerCase())) continue
      createTubeProfile({ categoria: p.categoria, label: p.label, kgPerMeter: p.kgPerMeter, active: true, notes: '' })
      added += 1
    }
    toast.success(`Catalogo standard caricato (${added} profili aggiunti).`)
  }

  return (
    <Modal open={open} onClose={onClose} title="Libreria profili tubi" size="lg"
      footer={<button className="btn-ghost" onClick={onClose}>Chiudi</button>}>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Categoria</span>
          <select className="input-base" value={categoria} onChange={(e) => setCategoria(e.target.value as TubeCategory)}>
            {ALL_TUBE_CATEGORIES.map((c) => <option key={c} value={c}>{TUBE_CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Sigla</span>
          <input className="input-base" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="es. 40x40x3" />
        </label>
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">kg/m</span>
          <input type="number" step="0.01" className="input-base" value={kgPerMeter} onChange={(e) => setKgPerMeter(e.target.value === '' ? 0 : Number(e.target.value))} />
        </label>
        <button className="btn-primary" onClick={add}>Aggiungi</button>
        <button className="btn-ghost" onClick={loadDefaults}>Carica catalogo standard</button>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase text-slate-400">
          <tr><th className="px-2 py-1">Categoria</th><th className="px-2 py-1">Sigla</th><th className="px-2 py-1">kg/m</th><th /></tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="border-t border-slate-800/60">
              <td className="px-2 py-1">{TUBE_CATEGORY_LABELS[p.categoria]}</td>
              <td className="px-2 py-1">{p.label}</td>
              <td className="px-2 py-1">
                <input type="number" step="0.01" className="input-base w-24" value={p.kgPerMeter}
                  onChange={(e) => updateTubeProfile(p.id, { kgPerMeter: e.target.value === '' ? 0 : Number(e.target.value) })} />
              </td>
              <td className="px-2 py-1 text-right">
                <button className="btn-ghost text-xs text-red-300" onClick={() => deleteTubeProfile(p.id)}>Elimina</button>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && <tr><td colSpan={4} className="px-2 py-6 text-center text-slate-500">Nessun profilo personalizzato. I profili standard sono comunque disponibili nel form; usa "Carica catalogo standard" per renderli modificabili.</td></tr>}
        </tbody>
      </table>
    </Modal>
  )
}
