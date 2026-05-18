import { useMemo, useState } from 'react'
import type { BusinessPartner, BusinessPartnerType } from '../types'
import { ALL_BUSINESS_PARTNER_TYPES } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { countByType, getWorkItemsForPartner } from '../services/businessPartnersService'
import { BusinessPartnerFormModal } from './BusinessPartnerFormModal'
import { BusinessPartnerImportModal } from './BusinessPartnerImportModal'
import { CustomerLinkModal } from './CustomerLinkModal'
import { ConfirmDialog } from './ConfirmDialog'

type TypeFilter = BusinessPartnerType | 'tutti'
type StatusFilter = 'attivi' | 'disattivati' | 'tutti'

interface Props {
  onWorkItemClick?: (workItemId: string) => void
}

const TYPE_LABEL: Record<BusinessPartnerType, string> = {
  cliente: 'Cliente',
  fornitore: 'Fornitore',
  personale: 'Personale',
  altro: 'Altro',
}

const TYPE_CHIP: Record<BusinessPartnerType, string> = {
  cliente: 'bg-sky-500/15 text-sky-200 ring-sky-500/40',
  fornitore: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40',
  personale: 'bg-violet-500/15 text-violet-200 ring-violet-500/40',
  altro: 'bg-zinc-500/15 text-zinc-200 ring-zinc-500/40',
}

export function BusinessPartnersView({ onWorkItemClick }: Props) {
  const { businessPartners, setBusinessPartnerActive } = useData()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('tutti')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('attivi')
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [editing, setEditing] = useState<BusinessPartner | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [toggleConfirm, setToggleConfirm] = useState<{ id: string; nextActive: boolean; name: string } | null>(null)

  const counts = useMemo(() => countByType(businessPartners), [businessPartners])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return businessPartners
      .filter((p) => {
        if (typeFilter !== 'tutti' && p.type !== typeFilter) return false
        if (statusFilter === 'attivi' && !p.active) return false
        if (statusFilter === 'disattivati' && p.active) return false
        if (q) {
          const hay = `${p.name} ${p.accountCode ?? ''} ${p.vatNumber ?? ''} ${p.fiscalCode ?? ''} ${p.email ?? ''} ${p.pec ?? ''} ${p.city ?? ''} ${p.phone ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
  }, [businessPartners, search, typeFilter, statusFilter])

  const detail = detailId ? businessPartners.find((p) => p.id === detailId) ?? null : null

  function confirmToggle(p: BusinessPartner) {
    setToggleConfirm({ id: p.id, nextActive: !p.active, name: p.name })
  }

  function applyToggle() {
    if (!toggleConfirm) return
    setBusinessPartnerActive(toggleConfirm.id, toggleConfirm.nextActive)
    toast.success(`${toggleConfirm.name} ${toggleConfirm.nextActive ? 'riattivata' : 'disattivata'}.`)
    setToggleConfirm(null)
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Anagrafiche</h2>
          <p className="text-xs text-slate-500">Clienti, fornitori, personale e altri soggetti</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="input-base w-56"
            placeholder="Cerca per nome, P.IVA, città…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="btn-ghost"
            onClick={() => setLinkOpen(true)}
            title="Cerca e collega i lavori esistenti alle anagrafiche corrispondenti"
          >
            <LinkIcon />
            Collega clienti esistenti
          </button>
          <button className="btn-ghost" onClick={() => setImportOpen(true)}>↑ Importa XML/CSV/JSON</button>
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Nuova anagrafica</button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Totale" value={counts.total} tone="slate" />
        <KpiCard label="Clienti" value={counts.cliente} tone="sky" />
        <KpiCard label="Fornitori" value={counts.fornitore} tone="emerald" />
        <KpiCard label="Personale" value={counts.personale} tone="violet" />
        <KpiCard label="Altri" value={counts.altro} tone="zinc" />
        <KpiCard label="Disattivati" value={counts.inactive} tone="amber" />
      </div>

      <div className="panel flex flex-wrap items-center gap-2 p-3 text-xs">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tipo:</span>
        {(['tutti', ...ALL_BUSINESS_PARTNER_TYPES] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-md px-2.5 py-1 transition ${typeFilter === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            {t === 'tutti' ? 'Tutti' : TYPE_LABEL[t]}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-slate-700" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Stato:</span>
        {(['attivi', 'disattivati', 'tutti'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-md px-2.5 py-1 transition ${statusFilter === s ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            {s === 'attivi' ? 'Attive' : s === 'disattivati' ? 'Disattivate' : 'Tutte'}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-500">{filtered.length} risultati</span>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/40 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 font-semibold">Stato</th>
                <th className="px-3 py-2 font-semibold">Tipo</th>
                <th className="px-3 py-2 font-semibold">Codice</th>
                <th className="px-3 py-2 font-semibold">Ragione sociale</th>
                <th className="px-3 py-2 font-semibold">P.IVA / CF</th>
                <th className="px-3 py-2 font-semibold">Città</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">PEC</th>
                <th className="px-3 py-2 font-semibold">Telefono</th>
                <th className="px-3 py-2 font-semibold">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setDetailId(p.id)}
                  className={`cursor-pointer transition hover:bg-slate-800/40 ${p.active ? '' : 'opacity-60'}`}
                >
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex h-2 w-2 rounded-full ${p.active ? 'bg-emerald-400' : 'bg-zinc-500'}`} title={p.active ? 'Attiva' : 'Disattivata'} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${TYPE_CHIP[p.type]}`}>{TYPE_LABEL[p.type]}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-300">{p.accountCode || '—'}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-100">{p.name}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {p.vatNumber ? <code className="text-slate-300">{p.vatNumber}</code> : p.fiscalCode ? <code className="text-slate-300">{p.fiscalCode}</code> : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{[p.city, p.province].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{p.email || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{p.pec || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{p.phone || '—'}</td>
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditing(p)}
                      className="text-xs text-sky-300 hover:text-sky-200"
                    >
                      Modifica
                    </button>
                    <span className="mx-1 text-slate-700">·</span>
                    <button
                      onClick={() => confirmToggle(p)}
                      className={`text-xs ${p.active ? 'text-amber-300 hover:text-amber-200' : 'text-emerald-300 hover:text-emerald-200'}`}
                    >
                      {p.active ? 'Disattiva' : 'Riattiva'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-sm text-slate-500">Nessuna anagrafica corrisponde ai filtri.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BusinessPartnerFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
      />

      <BusinessPartnerFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        mode="edit"
        partner={editing ?? undefined}
      />

      <BusinessPartnerImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />

      <CustomerLinkModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
      />

      {detail && (
        <BusinessPartnerDetailDrawer
          partner={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => setEditing(detail)}
          onToggleActive={() => confirmToggle(detail)}
          onWorkItemClick={onWorkItemClick}
        />
      )}

      <ConfirmDialog
        open={toggleConfirm !== null}
        title={toggleConfirm?.nextActive ? 'Riattivare anagrafica?' : 'Disattivare anagrafica?'}
        message={
          toggleConfirm?.nextActive
            ? `"${toggleConfirm.name}" tornerà visibile nelle ricerche e nell'autocomplete.`
            : `"${toggleConfirm?.name}" non sarà più visibile nell'autocomplete dei nuovi lavori. I lavori collegati restano invariati. Operazione reversibile.`
        }
        confirmLabel={toggleConfirm?.nextActive ? 'Riattiva' : 'Disattiva'}
        danger={!toggleConfirm?.nextActive}
        onConfirm={applyToggle}
        onCancel={() => setToggleConfirm(null)}
      />
    </div>
  )
}

const KPI_TONE = {
  slate: 'border-slate-700 text-slate-100',
  sky: 'border-sky-500/40 text-sky-100',
  emerald: 'border-emerald-500/40 text-emerald-100',
  violet: 'border-violet-500/40 text-violet-100',
  amber: 'border-amber-500/40 text-amber-100',
  zinc: 'border-zinc-500/40 text-zinc-200',
} as const

function KpiCard({ label, value, tone }: { label: string; value: number; tone: keyof typeof KPI_TONE }) {
  return (
    <div className={`panel p-3 ${KPI_TONE[tone]}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

// === Drawer dettaglio ===

interface DrawerProps {
  partner: BusinessPartner
  onClose: () => void
  onEdit: () => void
  onToggleActive: () => void
  onWorkItemClick?: (workItemId: string) => void
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19.07" />
    </svg>
  )
}

function BusinessPartnerDetailDrawer({ partner, onClose, onEdit, onToggleActive, onWorkItemClick }: DrawerProps) {
  const { data } = useData()
  const linkedWorkItems = useMemo(() => getWorkItemsForPartner(data, partner.id), [data, partner.id])

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col overflow-hidden border-l border-slate-800 bg-[color:var(--color-panel)] shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-800 px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${TYPE_CHIP[partner.type]}`}>{TYPE_LABEL[partner.type]}</span>
              {partner.accountCode && <span className="font-mono">{partner.accountCode}</span>}
              {!partner.active && <span className="rounded bg-zinc-700/40 px-1.5 py-0.5 text-[10px] text-zinc-300">disattivata</span>}
            </div>
            <h3 className="mt-1 truncate text-base font-semibold text-slate-100">{partner.name}</h3>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200" aria-label="Chiudi">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="P.IVA" value={partner.vatNumber} mono />
            <Field label="Codice fiscale" value={partner.fiscalCode} mono />
            <Field label="Codice SDI" value={partner.sdiCode} mono />
            <Field label="Cod. IVA/Esenz." value={partner.vatExemptionCode} mono />
            <Field label="Indirizzo" value={[partner.address, partner.postalCode, partner.city, partner.province, partner.country].filter(Boolean).join(', ')} className="col-span-2" />
            <Field label="Email" value={partner.email} />
            <Field label="PEC" value={partner.pec} />
            <Field label="Telefono" value={partner.phone} />
            <Field label="Pagamento" value={[partner.paymentCode, partner.paymentDescription].filter(Boolean).join(' · ')} />
            <Field label="Banca" value={[partner.bankName, partner.abi && `ABI ${partner.abi}`, partner.cab && `CAB ${partner.cab}`].filter(Boolean).join(' · ')} className="col-span-2" />
            {(partner.balance !== undefined || partner.exposure !== undefined || partner.creditLimit !== undefined || partner.risk !== undefined) && (
              <>
                <Field label="Saldo" value={fmtNumber(partner.balance)} />
                <Field label="Esposizione" value={fmtNumber(partner.exposure)} />
                <Field label="Fido" value={fmtNumber(partner.creditLimit)} />
                <Field label="Fuori fido" value={fmtNumber(partner.overCreditLimit)} />
                <Field label="Rischio" value={fmtNumber(partner.risk)} />
              </>
            )}
            {partner.notes && <Field label="Note" value={partner.notes} className="col-span-2" />}
          </div>

          <section className="mt-5">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Lavori collegati ({linkedWorkItems.length})
            </h4>
            {linkedWorkItems.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500">
                Nessun lavoro collegato a questa anagrafica.<br />
                Per collegarla, nel form di un lavoro cerca questo cliente con l'autocomplete.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {linkedWorkItems.map((w) => (
                  <li key={w.id}>
                    <button
                      onClick={() => { onClose(); onWorkItemClick?.(w.id) }}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-left text-xs transition hover:border-slate-600 hover:bg-slate-800/60"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] capitalize text-slate-300">{w.type}</span>
                          <span className="font-mono text-[11px] text-slate-300">{w.code}</span>
                        </div>
                        <div className="mt-0.5 truncate text-sm text-slate-100">{w.title}</div>
                      </div>
                      <div className="text-right text-[10px] text-slate-400">
                        <div>{w.status}</div>
                        <div className="tabular-nums">{w.dueDate}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-slate-800 px-5 py-3">
          <button
            onClick={onToggleActive}
            className={partner.active
              ? 'inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-sm font-medium text-amber-200 hover:bg-amber-500/10'
              : 'inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15'}
          >
            {partner.active ? 'Disattiva' : 'Riattiva'}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">Chiudi</button>
            <button onClick={onEdit} className="btn-primary">Modifica</button>
          </div>
        </footer>
      </aside>
    </div>
  )
}

function Field({ label, value, mono, className }: { label: string; value: string | undefined; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm text-slate-200 ${mono ? 'font-mono' : ''} ${value ? '' : 'text-slate-600'}`}>{value || '—'}</div>
    </div>
  )
}

function fmtNumber(n: number | undefined): string | undefined {
  if (n === undefined || n === null) return undefined
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
