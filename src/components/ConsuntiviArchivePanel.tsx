import { useMemo, useState } from 'react'
import { useData } from '../state/DataProvider'
import { useAuth } from '../state/AuthProvider'
import { useToast } from '../state/ToastProvider'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { reopenCommessa } from '../services/apiClient'
import { ClosureCertificateModal } from './ClosureCertificateModal'
import { ALL_CONSUNTIVO_MATERIALS, CONSUNTIVO_MATERIAL_LABELS } from '../types'
import type { ConsuntiviClosure } from '../types'

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const KG = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })
const dateIT = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { dateStyle: 'medium' })

export function ConsuntiviArchivePanel() {
  const { consuntiviClosures, refreshAppData } = useData()
  const { user } = useAuth()
  const toast = useToast()
  const canSeePrices = !!user?.permissions.viewConsuntiviPrices
  const [query, setQuery] = useState('')
  const [certFor, setCertFor] = useState<ConsuntiviClosure | null>(null)
  const [reopenFor, setReopenFor] = useState<ConsuntiviClosure | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...consuntiviClosures].sort((a, b) => b.closedAt.localeCompare(a.closedAt))
    if (!q) return sorted
    return sorted.filter((cl) => cl.commessaKey.toLowerCase().includes(q) || cl.supplierName.toLowerCase().includes(q))
  }, [consuntiviClosures, query])

  async function doReopen() {
    if (!reopenFor || busy) return
    setBusy(true)
    try {
      await reopenCommessa(reopenFor.id, password)
      await refreshAppData()
      toast.success(`Commessa ${reopenFor.commessaKey} riaperta: torna in lavorazione.`)
      setReopenFor(null)
      setPassword('')
    } catch {
      toast.error('Riapertura non riuscita: password errata.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">Commesse chiuse e certificate. I valori sono congelati alla chiusura.</p>
        <input className="input-base w-64" placeholder="Cerca commessa o fornitore…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗄️</div>
          <div className="font-medium text-slate-300">{query ? 'Nessun risultato' : 'Nessuna commessa chiusa'}</div>
          <div>{query ? 'Prova con un altro termine di ricerca.' : 'Chiudi una commessa da «In lavorazione» per archiviarla qui, certificata.'}</div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((cl, i) => {
            const materialsWithKg = ALL_CONSUNTIVO_MATERIALS.filter((m) => (cl.snapshot.kgByMaterial[m] ?? 0) > 0)
            return (
              <article key={cl.id} className="cons-archive-card panel" style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}>
                <header className="cons-archive-head">
                  <div>
                    <div className="cons-archive-label">Commessa</div>
                    <h3 className="cons-archive-number">{cl.commessaKey}</h3>
                    <div className="cons-archive-supplier">{cl.supplierName || 'Fornitore —'}</div>
                  </div>
                  <span className="chip-pill cons-archive-seal">✓ Certificata</span>
                </header>

                <dl className="cons-archive-stats">
                  <div><dt>Periodo</dt><dd>{dateIT(cl.firstDate)} → {dateIT(cl.lastDate)}</dd></div>
                  <div><dt>Consuntivi</dt><dd>{cl.consuntiviCount}</dd></div>
                  <div><dt>Peso totale</dt><dd>{KG.format(cl.snapshot.totalKg)} kg</dd></div>
                  <div><dt>Chiusa il</dt><dd>{dateIT(cl.closedAt)}</dd></div>

                  {materialsWithKg.length > 0 && (
                    <div className="cons-archive-materials">
                      {materialsWithKg.map((m) => (
                        <span key={m} className="chip-sm bg-[color:var(--color-surface-2)] text-slate-300 ring-[color:var(--color-edge-soft)]">
                          {CONSUNTIVO_MATERIAL_LABELS[m]} <b className="font-semibold text-slate-200">{KG.format(cl.snapshot.kgByMaterial[m])} kg</b>
                        </span>
                      ))}
                    </div>
                  )}

                  {canSeePrices && cl.snapshot.total !== undefined && (
                    <div className="cons-archive-total"><dt>Totale congelato</dt><dd>{EUR.format(cl.snapshot.total)}</dd></div>
                  )}
                </dl>

                <footer className="cons-archive-foot">
                  <span className="text-[11px] text-slate-500">Chiusa da {cl.closedByUsername}</span>
                  <div className="flex gap-1.5">
                    <button className="btn-ghost text-xs" onClick={() => setCertFor(cl)}>Certificato</button>
                    <button className="btn-ghost text-xs hover:border-amber-500/50 hover:text-amber-300" onClick={() => { setReopenFor(cl); setPassword('') }}>Riapri 🔒</button>
                  </div>
                </footer>
              </article>
            )
          })}
        </div>
      )}

      {certFor && <ClosureCertificateModal closure={certFor} onClose={() => setCertFor(null)} />}

      {reopenFor && (
        <Modal open onClose={() => setReopenFor(null)} title={`Riapri commessa ${reopenFor.commessaKey}`} size="sm"
          footer={<>
            <button className="btn-ghost" onClick={() => setReopenFor(null)}>Annulla</button>
            <button className="btn-danger" disabled={busy || !password} onClick={doReopen}>Riapri (elimina il sigillo)</button>
          </>}>
          <div className="space-y-3">
            <p className="text-sm text-slate-400">La commessa torna in lavorazione e lo snapshot certificato viene eliminato.</p>
            <FormField label="Password Consuntivi">
              <input type="password" className="input-base" autoFocus value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doReopen() }} />
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  )
}
