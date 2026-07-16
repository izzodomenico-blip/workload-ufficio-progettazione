import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FormField } from './FormField'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { fetchConsuntiviPricing } from '../services/apiClient'
import {
  bendingRowCost,
  consuntivoTotals,
  emptyKgByMaterial,
  laserRowCost,
  tubeRowCost,
  weldingRowCost,
} from '../utils/consuntiviCalc'
import { ALL_CONSUNTIVO_MATERIALS, CONSUNTIVO_MATERIAL_LABELS } from '../types'
import type { ConsuntiviPricingConfig, Consuntivo } from '../types'

interface Props { open: boolean; onClose: () => void }

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const KG = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const eur = (n: number) => EUR.format(n)
const kg = (n: number) => `${KG.format(n)} kg`

type CatKey = 'material' | 'gas' | 'time' | 'welding' | 'bending'
const CAT_LABELS: Record<CatKey, string> = {
  material: 'Materiale',
  gas: 'Gas (taglio laser)',
  time: 'Tempo laser tubi',
  welding: 'Saldatura',
  bending: 'Piega',
}

function emptyCats(): Record<CatKey, number> {
  return { material: 0, gas: 0, time: 0, welding: 0, bending: 0 }
}

export function ConsuntiviReportModal({ open, onClose }: Props) {
  const { consuntivi, consuntiviClosures } = useData()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [pricing, setPricing] = useState<ConsuntiviPricingConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedCommessa, setSelectedCommessa] = useState<string | null>(null)

  const commesse = useMemo(() => {
    const closed = new Set(consuntiviClosures.map((cl) => cl.commessaKey))
    const set = new Set(consuntivi.map((c) => c.commessaNumber.trim() || '(senza commessa)'))
    return Array.from(set).filter((k) => !closed.has(k)).sort((a, b) => a.localeCompare(b))
  }, [consuntivi, consuntiviClosures])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

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
    if (!pricing || !selectedCommessa) return null
    const groups = new Map<string, {
      commessaNumber: string
      supplierName: string
      items: Array<{ c: Consuntivo; totals: ReturnType<typeof consuntivoTotals> }>
      subtotal: number
      subKg: number
      cats: Record<CatKey, number>
    }>()
    let grandTotal = 0
    let grandKgTot = 0
    const grandKg = emptyKgByMaterial()
    const grandCats = emptyCats()

    // Ordina per data crescente per una lettura cronologica dentro ogni commessa.
    const filtered = consuntivi.filter((c) => (c.commessaNumber.trim() || '(senza commessa)') === selectedCommessa)
    const ordered = [...filtered].sort((a, b) => a.date.localeCompare(b.date))

    for (const c of ordered) {
      const t = consuntivoTotals(c, pricing)
      grandTotal += t.total
      grandKgTot += t.totalKg
      for (const m of ALL_CONSUNTIVO_MATERIALS) grandKg[m] += t.kgByMaterial[m]
      grandCats.material += t.materialCost
      grandCats.gas += t.gasCost
      grandCats.time += t.timeCost
      grandCats.welding += t.weldingCost
      grandCats.bending += t.bendingCost

      const key = c.commessaNumber.trim() || '(senza commessa)'
      const g = groups.get(key) ?? {
        commessaNumber: key,
        supplierName: c.supplierName || '',
        items: [],
        subtotal: 0,
        subKg: 0,
        cats: emptyCats(),
      }
      if (!g.supplierName && c.supplierName) g.supplierName = c.supplierName
      g.items.push({ c, totals: t })
      g.subtotal += t.total
      g.subKg += t.totalKg
      g.cats.material += t.materialCost
      g.cats.gas += t.gasCost
      g.cats.time += t.timeCost
      g.cats.welding += t.weldingCost
      g.cats.bending += t.bendingCost
      groups.set(key, g)
    }

    return {
      groups: Array.from(groups.values()).sort((a, b) => b.subtotal - a.subtotal),
      grandTotal,
      grandKgTot,
      grandKg,
      grandCats,
      count: ordered.length,
    }
  }, [consuntivi, pricing, selectedCommessa])

  if (!open) return null

  const generatedAt = new Date().toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })

  const content = (
    <div className="cons-report-portal">
      <div className="cons-report-overlay">
        {/* Barra strumenti — esclusa dalla stampa */}
        <div className="cons-report-bar no-print">
          <span className="text-sm font-medium text-slate-300">Report consuntivi</span>
          <div className="flex items-center gap-2">
            {pricing && selectedCommessa && (
              <button className="btn-ghost" onClick={() => setSelectedCommessa(null)}>Cambia commessa</button>
            )}
            {pricing && selectedCommessa && (
              <button className="btn-primary" onClick={() => window.print()}>Stampa / PDF</button>
            )}
            <button className="btn-ghost" onClick={onClose}>Chiudi</button>
          </div>
        </div>

        {!pricing ? (
          <div className="cons-report-lock no-print">
            <div className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-800/80 bg-[color:var(--color-panel)] p-6">
              <h3 className="text-base font-semibold text-slate-100">Report protetto</h3>
              <p className="text-sm text-slate-400">Inserisci la password della sezione Consuntivi per generare il report costi.</p>
              <FormField label="Password Consuntivi">
                <input
                  type="password"
                  className="input-base"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') unlock() }}
                />
              </FormField>
              <button className="btn-primary w-full" disabled={busy} onClick={unlock}>Genera report</button>
            </div>
          </div>
        ) : !selectedCommessa ? (
          <div className="cons-report-lock no-print">
            <div className="w-full max-w-md space-y-3 rounded-2xl border border-slate-800/80 bg-[color:var(--color-panel)] p-6">
              <h3 className="text-base font-semibold text-slate-100">Scegli la commessa</h3>
              <p className="text-sm text-slate-400">Il report e il PDF riguarderanno solo la commessa selezionata.</p>
              <div className="max-h-72 space-y-1 overflow-auto">
                {commesse.length === 0 && <p className="text-sm text-slate-500">Nessun consuntivo presente.</p>}
                {commesse.map((k) => (
                  <button key={k} className="btn-ghost w-full justify-start" onClick={() => setSelectedCommessa(k)}>{k}</button>
                ))}
              </div>
            </div>
          </div>
        ) : report && (
          <div className="cons-report-sheet" id="consuntivi-print-root">
            {/* Intestazione documento */}
            <header className="cons-doc-head">
              <div>
                <img src="/flowrlink-logo-light.png" alt="Flowrlink" className="cons-doc-logo" />
                <div className="cons-kicker">Officina · Riepilogo costi di produzione</div>
                <h1 className="cons-title">Consuntivo di produzione</h1>
              </div>
              <div className="cons-doc-meta">
                <div><span>Generato</span><strong>{generatedAt}</strong></div>
                <div><span>Consuntivi</span><strong>{report.count}</strong></div>
                <div><span>Commesse</span><strong>{report.groups.length}</strong></div>
              </div>
            </header>

            {/* Sintesi globale */}
            <section className="cons-summary">
              <div className="cons-grandtotal">
                <span>Totale generale</span>
                <strong>{eur(report.grandTotal)}</strong>
                <em>{kg(report.grandKgTot)} lavorati</em>
              </div>
              <div className="cons-derivation">
                <div className="cons-derivation-title">Come si compone il totale</div>
                <ul>
                  {(Object.keys(CAT_LABELS) as CatKey[]).map((k) => (
                    <li key={k}><span>{CAT_LABELS[k]}</span><b>{eur(report.grandCats[k])}</b></li>
                  ))}
                  <li className="cons-derivation-sum"><span>Totale</span><b>{eur(report.grandTotal)}</b></li>
                </ul>
              </div>
            </section>

            <section className="cons-kgband">
              {ALL_CONSUNTIVO_MATERIALS.map((m) => (
                <div key={m} className="cons-kgchip">
                  <span>{CONSUNTIVO_MATERIAL_LABELS[m]}</span>
                  <strong>{kg(report.grandKg[m])}</strong>
                </div>
              ))}
            </section>

            {/* Dettaglio per commessa */}
            {report.groups.map((g) => (
              <article key={g.commessaNumber} className="cons-commessa">
                <div className="cons-commessa-head">
                  <div>
                    <div className="cons-commessa-label">Commessa</div>
                    <h2>{g.commessaNumber}</h2>
                    <div className="cons-commessa-supplier">Fornitore: {g.supplierName || '—'}</div>
                  </div>
                  <div className="cons-commessa-total">
                    <span>Totale commessa</span>
                    <strong>{eur(g.subtotal)}</strong>
                    <em>{kg(g.subKg)}</em>
                  </div>
                </div>

                {g.items.map(({ c, totals }) => (
                  <div key={c.id} className="cons-session">
                    <div className="cons-session-head">
                      <span>{new Date(c.date).toLocaleDateString('it-IT', { dateStyle: 'medium' })}</span>
                      {c.operatorName && <span>· Operatore: {c.operatorName}</span>}
                      <span className="cons-session-total">{eur(totals.total)}</span>
                    </div>

                    {c.laserRows.length > 0 && (
                      <table className="cons-table">
                        <thead><tr><th>Taglio laser</th><th>Materiale</th><th className="r">kg</th><th className="r">€ materiale</th><th className="r">€ gas</th></tr></thead>
                        <tbody>
                          {c.laserRows.map((row) => {
                            const rc = laserRowCost(row, pricing)
                            return (
                              <tr key={row.id}>
                                <td>{row.lunghezzaMm}×{row.larghezzaMm}×{row.spessoreMm} mm · {row.nPezzi} pz · {row.tempoMin} min · {row.gas}</td>
                                <td>{CONSUNTIVO_MATERIAL_LABELS[row.materiale]}</td>
                                <td className="r">{KG.format(rc.kg)}</td>
                                <td className="r">{eur(rc.materialCost)}</td>
                                <td className="r">{eur(rc.gasCost)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}

                    {c.tubeRows.length > 0 && (
                      <table className="cons-table cons-tube-warn">
                        <thead><tr><th>Laser tubi <span className="cons-verify-badge">da verificare</span></th><th>Materiale</th><th className="r">kg</th><th className="r">€ materiale</th><th className="r">€ tempo</th></tr></thead>
                        <tbody>
                          {c.tubeRows.map((row) => {
                            const rc = tubeRowCost(row, pricing)
                            return (
                              <tr key={row.id}>
                                <td>{row.profileLabel} · {row.lunghezzaMm} mm × {row.nPezzi} pz · {row.tempoMin} min</td>
                                <td>{CONSUNTIVO_MATERIAL_LABELS[row.materiale]}</td>
                                <td className="r">{KG.format(rc.kg)}</td>
                                <td className="r">{eur(rc.materialCost)}</td>
                                <td className="r">{eur(rc.timeCost)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}

                    {(c.weldingRows.length > 0 || c.bendingRows.length > 0) && (
                      <table className="cons-table">
                        <thead><tr><th>Manodopera</th><th>Dettaglio</th><th className="r" colSpan={3}>Costo</th></tr></thead>
                        <tbody>
                          {c.weldingRows.map((row) => (
                            <tr key={row.id}>
                              <td>Saldatura</td>
                              <td>{row.people} pers. × {row.hours} h × {eur(pricing.weldingRatePerHour)}/h</td>
                              <td className="r" colSpan={3}>{eur(weldingRowCost(row, pricing))}</td>
                            </tr>
                          ))}
                          {c.bendingRows.map((row) => (
                            <tr key={row.id}>
                              <td>Piega</td>
                              <td>{row.hours} h × {eur(pricing.bendingRatePerHour)}/h</td>
                              <td className="r" colSpan={3}>{eur(bendingRowCost(row, pricing))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}

                {/* Derivazione del totale commessa */}
                <div className="cons-commessa-derivation">
                  {(Object.keys(CAT_LABELS) as CatKey[]).map((k) => (
                    <span key={k} className="cons-term">{CAT_LABELS[k]} <b>{eur(g.cats[k])}</b></span>
                  ))}
                  <span className="cons-term cons-term-eq">= <b>{eur(g.subtotal)}</b></span>
                </div>
              </article>
            ))}

            <footer className="cons-doc-foot">
              Prezzi riservati — documento protetto della sezione Consuntivi. Generato il {generatedAt}.
            </footer>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
