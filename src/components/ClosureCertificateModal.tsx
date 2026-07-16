import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { useAuth } from '../state/AuthProvider'
import type { ConsuntiviClosure, ConsuntivoMaterial } from '../types'
import { CONSUNTIVO_MATERIAL_LABELS, ALL_CONSUNTIVO_MATERIALS } from '../types'

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const KG = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })
const dateIT = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { dateStyle: 'long' })

type CatKey = 'material' | 'gas' | 'time' | 'welding' | 'bending'
const CAT_LABELS: Record<CatKey, string> = {
  material: 'Materiale',
  gas: 'Gas taglio',
  time: 'Tempo laser tubi',
  welding: 'Saldatura',
  bending: 'Piega',
}

interface Props { closure: ConsuntiviClosure; onClose: () => void }

export function ClosureCertificateModal({ closure, onClose }: Props) {
  const { user } = useAuth()
  const canSeePrices = !!user?.permissions.viewConsuntiviPrices

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  const s = closure.snapshot
  const showMoney = canSeePrices && s.total !== undefined && !!s.cats
  const generatedAt = new Date().toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })

  const content = (
    <div className="closure-cert-portal">
      <div className="closure-cert-overlay">
        <div className="cons-report-bar no-print">
          <span className="text-sm font-medium text-slate-300">Certificato di chiusura</span>
          <div className="flex items-center gap-2">
            <button className="btn-primary" onClick={() => window.print()}>Stampa / PDF</button>
            <button className="btn-ghost" onClick={onClose}>Chiudi</button>
          </div>
        </div>

        <div className="closure-cert-sheet">
          <div className="closure-cert-stamp" aria-hidden>
            <div className="closure-cert-stamp-ring">
              <span className="closure-cert-stamp-check">✓</span>
              <span className="closure-cert-stamp-label">Certificato</span>
            </div>
          </div>

          <div className="closure-cert-head">
            <img src="/flowrlink-logo-light.png" alt="Flowrlink" className="cons-doc-logo" />
            <div className="cons-kicker">Officina · Consuntivi di produzione</div>
            <h1 className="cons-title">Certificato di chiusura commessa</h1>
          </div>

          <div className="closure-cert-grid">
            <div><span>Commessa</span><strong>{closure.commessaKey}</strong></div>
            <div><span>Fornitore</span><strong>{closure.supplierName || '—'}</strong></div>
            <div><span>Periodo</span><strong>{dateIT(closure.firstDate)} → {dateIT(closure.lastDate)}</strong></div>
            <div><span>Consuntivi</span><strong>{closure.consuntiviCount}</strong></div>
          </div>

          <section className="cons-kgband">
            {ALL_CONSUNTIVO_MATERIALS.map((m: ConsuntivoMaterial) => (
              <div key={m} className="cons-kgchip">
                <span>{CONSUNTIVO_MATERIAL_LABELS[m]}</span>
                <strong>{KG.format(s.kgByMaterial[m] ?? 0)} kg</strong>
              </div>
            ))}
            <div className="cons-kgchip">
              <span>Totale</span>
              <strong>{KG.format(s.totalKg)} kg</strong>
            </div>
          </section>

          {showMoney && (
            <section className="cons-summary">
              <div className="cons-grandtotal">
                <span>Totale certificato</span>
                <strong>{EUR.format(s.total as number)}</strong>
              </div>
              <div className="cons-derivation">
                <div className="cons-derivation-title">Come si compone il totale</div>
                <ul>
                  {(Object.keys(CAT_LABELS) as CatKey[]).map((k) => (
                    <li key={k}><span>{CAT_LABELS[k]}</span><b>{EUR.format((s.cats as Record<CatKey, number>)[k] ?? 0)}</b></li>
                  ))}
                  <li className="cons-derivation-sum"><span>Totale</span><b>{EUR.format(s.total as number)}</b></li>
                </ul>
              </div>
            </section>
          )}

          <div className="closure-cert-note">
            ✓ Certificata — chiusa da <strong>{closure.closedByUsername}</strong> il {dateIT(closure.closedAt)}.
            Valori congelati alla chiusura: le variazioni successive dei prezzi non alterano questo documento.
          </div>

          <footer className="cons-doc-foot">Documento riservato — sezione Consuntivi, Flowrlink. Generato il {generatedAt}.</footer>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
