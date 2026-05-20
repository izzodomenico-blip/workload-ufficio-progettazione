import { useEffect, useMemo, useState } from 'react'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import type { LinkPlan, LinkSelection } from '../services/businessPartnersService'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
}

const SKIP = '__skip__'

export function CustomerLinkModal({ open, onClose }: Props) {
  const { businessPartners, planCustomerLinking, applyCustomerLinking } = useData()
  const toast = useToast()
  const [plan, setPlan] = useState<LinkPlan | null>(null)
  const [certainChecked, setCertainChecked] = useState<Record<string, boolean>>({})
  const [ambiguousChoice, setAmbiguousChoice] = useState<Record<string, string>>({})
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!open) return
    const next = planCustomerLinking()
    setPlan(next)
    const cc: Record<string, boolean> = {}
    for (const item of next.certain) cc[item.workItemId] = true
    setCertainChecked(cc)
    const ac: Record<string, string> = {}
    for (const item of next.ambiguous) ac[item.workItemId] = SKIP // di default i dubbi sono non selezionati
    setAmbiguousChoice(ac)
  }, [open, planCustomerLinking])

  const partnerById = useMemo(() => new Map(businessPartners.map((p) => [p.id, p])), [businessPartners])

  const selections = useMemo<LinkSelection[]>(() => {
    if (!plan) return []
    const result: LinkSelection[] = []
    for (const item of plan.certain) {
      if (certainChecked[item.workItemId] && item.suggestedPartnerId) {
        result.push({ workItemId: item.workItemId, partnerId: item.suggestedPartnerId })
      }
    }
    for (const item of plan.ambiguous) {
      const choice = ambiguousChoice[item.workItemId]
      if (choice && choice !== SKIP) {
        result.push({ workItemId: item.workItemId, partnerId: choice })
      }
    }
    return result
  }, [plan, certainChecked, ambiguousChoice])

  function setAllCertain(checked: boolean) {
    if (!plan) return
    const next: Record<string, boolean> = {}
    for (const item of plan.certain) next[item.workItemId] = checked
    setCertainChecked(next)
  }

  function handleApply() {
    if (selections.length === 0) {
      toast.info('Nessun lavoro selezionato — niente da collegare.')
      return
    }
    setApplying(true)
    try {
      const result = applyCustomerLinking(selections)
      toast.success(`Collegati ${result.linked} lavori${result.skipped > 0 ? ` · ${result.skipped} saltati` : ''}.`)
      onClose()
    } catch (err) {
      toast.error(`Errore durante il collegamento: ${err instanceof Error ? err.message : 'errore sconosciuto'}`)
    } finally {
      setApplying(false)
    }
  }

  const certainSelectedCount = plan
    ? plan.certain.filter((i) => certainChecked[i.workItemId]).length
    : 0
  const ambiguousSelectedCount = plan
    ? plan.ambiguous.filter((i) => ambiguousChoice[i.workItemId] && ambiguousChoice[i.workItemId] !== SKIP).length
    : 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Collega lavori esistenti alle anagrafiche"
      subtitle="Confronto tra il testo del cliente sui lavori e l'archivio anagrafiche (case/punti/SRL/SPA normalizzati)"
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Annulla</button>
          <button
            onClick={handleApply}
            disabled={applying || selections.length === 0}
            className={`btn-primary ${applying || selections.length === 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Collega {selections.length} {selections.length === 1 ? 'lavoro' : 'lavori'}
          </button>
        </>
      }
    >
      {!plan ? (
        <p className="text-sm text-slate-400">Analisi in corso…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-md border border-sky-500/35 bg-sky-500/8 px-3 py-2.5 text-xs text-sky-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
            </svg>
            <span>
              L'operazione aggiorna solo i collegamenti
              <code className="mx-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-mono">customerPartnerId</code> e
              <code className="mx-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-mono">customerPartnerName</code>.
              Il testo del campo <em>customer</em> non viene modificato. I lavori già collegati vengono saltati. Un backup automatico viene creato prima dell'operazione.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Totali" value={plan.totalWorkItems} tone="slate" />
            <Stat label="Già collegati" value={plan.alreadyLinked} tone="sky" />
            <Stat label="Match certi" value={plan.certain.length} tone="emerald" />
            <Stat label="Match dubbi" value={plan.ambiguous.length} tone="amber" />
            <Stat label="Non trovati" value={plan.notFound.length} tone="zinc" />
          </div>

          {/* Sezione certi */}
          <section>
            <header className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                Match certi · {certainSelectedCount}/{plan.certain.length} selezionati
              </h3>
              {plan.certain.length > 0 && (
                <div className="flex gap-2 text-[11px]">
                  <button className="text-emerald-300 hover:text-emerald-200" onClick={() => setAllCertain(true)}>Seleziona tutti</button>
                  <span className="text-slate-600">·</span>
                  <button className="text-slate-400 hover:text-slate-200" onClick={() => setAllCertain(false)}>Deseleziona tutti</button>
                </div>
              )}
            </header>
            {plan.certain.length === 0 ? (
              <EmptyHint>Nessun match esatto trovato.</EmptyHint>
            ) : (
              <ul className="divide-y divide-slate-800 rounded-md border border-emerald-500/30 bg-emerald-500/5">
                {plan.certain.map((item) => {
                  const partner = item.suggestedPartnerId ? partnerById.get(item.suggestedPartnerId) : undefined
                  return (
                    <li key={item.workItemId} className="flex items-start gap-3 px-3 py-2 text-xs">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 cursor-pointer accent-emerald-400"
                        checked={!!certainChecked[item.workItemId]}
                        onChange={(e) => setCertainChecked((prev) => ({ ...prev, [item.workItemId]: e.target.checked }))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-300">{item.workItemCode || '—'}</span>
                          <span className="truncate text-sm text-slate-100">{item.workItemTitle}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          "<span className="text-slate-200">{item.originalCustomer}</span>"
                          <span className="mx-1.5 text-slate-600">→</span>
                          <span className="text-emerald-200">{partner?.name ?? '—'}</span>
                          {partner?.accountCode && <span className="ml-1 font-mono text-slate-500">({partner.accountCode})</span>}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Sezione dubbi */}
          <section>
            <header className="mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                Match dubbi · {ambiguousSelectedCount}/{plan.ambiguous.length} selezionati
              </h3>
              <p className="text-[11px] text-slate-500">Default: non collegare. Scegli manualmente il candidato.</p>
            </header>
            {plan.ambiguous.length === 0 ? (
              <EmptyHint>Nessun caso dubbio.</EmptyHint>
            ) : (
              <ul className="divide-y divide-slate-800 rounded-md border border-amber-500/30 bg-amber-500/5">
                {plan.ambiguous.map((item) => (
                  <li key={item.workItemId} className="flex flex-wrap items-start gap-3 px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-300">{item.workItemCode || '—'}</span>
                        <span className="truncate text-sm text-slate-100">{item.workItemTitle}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        Testo lavoro: "<span className="text-slate-200">{item.originalCustomer}</span>"
                      </div>
                    </div>
                    <div className="shrink-0">
                      <select
                        className="input-base w-72"
                        value={ambiguousChoice[item.workItemId] ?? SKIP}
                        onChange={(e) => setAmbiguousChoice((prev) => ({ ...prev, [item.workItemId]: e.target.value }))}
                      >
                        <option value={SKIP}>— Non collegare —</option>
                        {item.candidatePartnerIds.map((id) => {
                          const p = partnerById.get(id)
                          if (!p) return null
                          const label = [p.name, p.city, p.vatNumber].filter(Boolean).join(' · ')
                          return <option key={id} value={id}>{label}</option>
                        })}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Sezione non trovati */}
          <section>
            <header className="mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
                Non trovati · {plan.notFound.length}
              </h3>
              <p className="text-[11px] text-slate-500">
                Crea l'anagrafica corrispondente dal tab Anagrafiche, poi rilancia il collegamento.
              </p>
            </header>
            {plan.notFound.length === 0 ? (
              <EmptyHint>Tutti i clienti hanno almeno un candidato.</EmptyHint>
            ) : (
              <ul className="max-h-48 divide-y divide-slate-800 overflow-y-auto scroll-thin rounded-md border border-slate-700 bg-slate-900/30">
                {plan.notFound.map((item) => (
                  <li key={item.workItemId} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                    <span className="font-mono text-[11px] text-slate-400">{item.workItemCode || '—'}</span>
                    <span className="truncate text-slate-300">{item.workItemTitle}</span>
                    <span className="ml-auto text-[11px] text-slate-500">"{item.originalCustomer}"</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {plan.alreadyLinked > 0 && (
            <p className="text-[11px] text-slate-500">
              <strong>{plan.alreadyLinked}</strong> lavori sono già collegati ad anagrafiche e non vengono toccati.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-slate-700 px-3 py-3 text-center text-[11px] text-slate-500">
      {children}
    </div>
  )
}

const STAT_TONE = {
  slate: 'border-slate-700 bg-slate-900/40 text-slate-200',
  sky: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  zinc: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-200',
} as const

function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof STAT_TONE }) {
  return (
    <div className={`rounded-md border p-2 ${STAT_TONE[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  )
}
