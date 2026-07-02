import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { fetchConsuntiviPricing } from '../services/apiClient'
import { consuntivoTotals, emptyKgByMaterial } from '../utils/consuntiviCalc'
import { ALL_CONSUNTIVO_MATERIALS, CONSUNTIVO_MATERIAL_LABELS } from '../types'
import type { ConsuntiviPricingConfig, ConsuntivoMaterial } from '../types'

interface Props { open: boolean; onClose: () => void }

const eur = (n: number) => `€ ${n.toFixed(2)}`
const kg = (n: number) => `${n.toFixed(1)} kg`

export function ConsuntiviReportModal({ open, onClose }: Props) {
  const { consuntivi } = useData()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [pricing, setPricing] = useState<ConsuntiviPricingConfig | null>(null)
  const [busy, setBusy] = useState(false)

  async function unlock() {
    setBusy(true)
    try {
      setPricing(await fetchConsuntiviPricing(password))
    } catch {
      toast.error('Password errata o report non accessibile.')
    } finally {
      setBusy(false)
    }
  }

  const report = useMemo(() => {
    if (!pricing) return null
    const byCommessa = new Map<string, {
      code: string; title: string; customer: string; total: number; totalKg: number
      kgByMaterial: Record<ConsuntivoMaterial, number>
    }>()
    let grandTotal = 0
    const grandKg = emptyKgByMaterial()

    for (const c of consuntivi) {
      const t = consuntivoTotals(c, pricing)
      grandTotal += t.total
      for (const m of ALL_CONSUNTIVO_MATERIALS) grandKg[m] += t.kgByMaterial[m]
      const key = c.workItemId
      const agg = byCommessa.get(key) ?? { code: c.workItemCode, title: c.workItemTitle, customer: c.customer, total: 0, totalKg: 0, kgByMaterial: emptyKgByMaterial() }
      agg.total += t.total
      agg.totalKg += t.totalKg
      for (const m of ALL_CONSUNTIVO_MATERIALS) agg.kgByMaterial[m] += t.kgByMaterial[m]
      byCommessa.set(key, agg)
    }
    return { rows: Array.from(byCommessa.values()).sort((a, b) => b.total - a.total), grandTotal, grandKg }
  }, [consuntivi, pricing])

  return (
    <Modal open={open} onClose={onClose} title="Report consuntivi (protetto)" size="xl"
      footer={pricing ? (<><button className="btn-ghost" onClick={onClose}>Chiudi</button><button className="btn-primary" onClick={() => window.print()}>Stampa / PDF</button></>) : undefined}>
      {!pricing ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Inserisci la password admin per generare il report costi.</p>
          <FormField label="Password admin">
            <input type="password" className="input-base" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') unlock() }} />
          </FormField>
          <button className="btn-primary" disabled={busy} onClick={unlock}>Genera report</button>
        </div>
      ) : report && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Totale per commessa</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase text-slate-400">
                <tr><th className="px-2 py-1">Commessa</th><th className="px-2 py-1">Cliente</th><th className="px-2 py-1 text-right">kg totali</th><th className="px-2 py-1 text-right">Costo €</th></tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.code + r.title} className="border-t border-slate-800/60">
                    <td className="px-2 py-1">{r.code} · {r.title}</td>
                    <td className="px-2 py-1">{r.customer || '—'}</td>
                    <td className="px-2 py-1 text-right">{kg(r.totalKg)}</td>
                    <td className="px-2 py-1 text-right font-medium">{eur(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700 font-semibold">
                  <td className="px-2 py-1" colSpan={3}>Totale generale</td>
                  <td className="px-2 py-1 text-right">{eur(report.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">kg utilizzati per materiale (globale)</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {ALL_CONSUNTIVO_MATERIALS.map((m) => (
                <div key={m} className="rounded-lg border border-slate-800/70 p-3">
                  <div className="text-[11px] uppercase text-slate-500">{CONSUNTIVO_MATERIAL_LABELS[m]}</div>
                  <div className="text-lg font-semibold text-slate-100">{kg(report.grandKg[m])}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Modal>
  )
}
