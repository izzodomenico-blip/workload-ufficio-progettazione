import { useEffect, useMemo, useState } from 'react'
import { useData } from '../state/DataProvider'
import { useAuth } from '../state/AuthProvider'
import { ConsuntivoFormModal } from './ConsuntivoFormModal'
import { ConsuntiviPricingModal } from './ConsuntiviPricingModal'
import { ConsuntiviReportModal } from './ConsuntiviReportModal'
import { TubeProfilesLibraryModal } from './TubeProfilesLibraryModal'
import { fetchConsuntiviSettings } from '../services/apiClient'
import { DEFAULT_CONSUNTIVI_PRICING } from '../utils/consuntiviCalc'
import type { Consuntivo, ConsuntivoMaterial } from '../types'

export function ConsuntiviView() {
  const { consuntivi, deleteConsuntivo } = useData()
  const { user } = useAuth()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Consuntivo | null>(null)
  const [filter, setFilter] = useState('')
  const [density, setDensity] = useState<Record<ConsuntivoMaterial, number>>(DEFAULT_CONSUNTIVI_PRICING.densityFactorPerMaterial)
  const [pricingOpen, setPricingOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchConsuntiviSettings()
      .then((s) => { if (!cancelled && s?.densityFactorPerMaterial) setDensity(s.densityFactorPerMaterial) })
      .catch(() => { /* fallback ai default */ })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return consuntivi
    return consuntivi.filter((c) =>
      c.commessaNumber.toLowerCase().includes(q) ||
      c.supplierName.toLowerCase().includes(q) ||
      c.date.includes(q))
  }, [consuntivi, filter])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Consuntivi</h2>
        <div className="flex items-center gap-2">
          <input className="input-base w-64" placeholder="Filtra per commessa, fornitore, data…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="btn-ghost" onClick={() => setLibraryOpen(true)}>Libreria profili</button>
          {user?.permissions.viewConsuntiviPrices && (
            <button className="btn-ghost" onClick={() => setPricingOpen(true)}>Prezzi 🔒</button>
          )}
          {user?.permissions.viewConsuntiviPrices && (
            <button className="btn-ghost" onClick={() => setReportOpen(true)}>Report 🔒</button>
          )}
          <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true) }}>+ Nuovo consuntivo</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800/80">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/40 text-left text-[11px] uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Commessa</th>
              <th className="px-3 py-2">Fornitore</th>
              <th className="px-3 py-2">Righe</th>
              <th className="px-3 py-2">Operatore</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                <td className="px-3 py-2">{c.date}</td>
                <td className="px-3 py-2">{c.commessaNumber || '—'}</td>
                <td className="px-3 py-2">{c.supplierName || '—'}</td>
                <td className="px-3 py-2 text-slate-400">{c.laserRows.length} laser · {c.tubeRows.length} tubi · {c.weldingRows.length} sald. · {c.bendingRows.length} piega</td>
                <td className="px-3 py-2 text-slate-400">{c.operatorName || '—'}</td>
                <td className="px-3 py-2 text-right">
                  <button className="btn-ghost text-xs" onClick={() => { setEditing(c); setFormOpen(true) }}>Modifica</button>
                  <button className="btn-ghost text-xs text-red-300" onClick={() => { if (confirm('Eliminare il consuntivo?')) deleteConsuntivo(c.id) }}>Elimina</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Nessun consuntivo. Crea il primo con "+ Nuovo consuntivo".</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <ConsuntivoFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          editing={editing}
          densityFactorPerMaterial={density}
        />
      )}
      {pricingOpen && <ConsuntiviPricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />}
      {reportOpen && <ConsuntiviReportModal open={reportOpen} onClose={() => setReportOpen(false)} />}
      {libraryOpen && <TubeProfilesLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} />}
    </div>
  )
}
