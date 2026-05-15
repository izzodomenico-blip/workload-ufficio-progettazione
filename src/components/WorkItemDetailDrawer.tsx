import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppData, WorkItem } from '../types'
import { TypeBadge } from './TypeBadge'
import { PriorityBadge } from './PriorityBadge'
import { StatusBadge } from './StatusBadge'
import { formatItalian, formatItalianShort, isOverdue, daysUntil } from '../utils/dates'

interface Props {
  data: AppData
  workItemId: string | null
  onClose: () => void
  onConvertStudio: (id: string, newCode?: string) => void
}

export function WorkItemDetailDrawer({ data, workItemId, onClose, onConvertStudio }: Props) {
  const item = useMemo(() => data.workItems.find((w) => w.id === workItemId) ?? null, [data.workItems, workItemId])

  useEffect(() => {
    if (!workItemId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [workItemId, onClose])

  if (!item) return null

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="absolute right-0 top-0 h-full w-full max-w-[640px] overflow-y-auto scroll-thin border-l border-slate-800 bg-[color:var(--color-panel)] shadow-2xl">
        <DetailContent data={data} item={item} onClose={onClose} onConvertStudio={onConvertStudio} />
      </div>
    </div>
  )
}

function DetailContent({
  data, item, onClose, onConvertStudio,
}: { data: AppData; item: WorkItem; onClose: () => void; onConvertStudio: (id: string, code?: string) => void }) {
  const personById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people])
  const owner = personById.get(item.ownerId)
  const tasks = useMemo(() => data.tasks.filter((t) => t.workItemId === item.id), [data.tasks, item.id])

  const totals = useMemo(() => {
    const est = tasks.reduce((s, t) => s + t.estimatedHours, 0)
    const log = tasks.reduce((s, t) => s + t.loggedHours, 0)
    const avgProgress = tasks.length === 0 ? 0 : Math.round(tasks.reduce((s, t) => s + t.progressPercent, 0) / tasks.length)
    return { est, log, avgProgress }
  }, [tasks])

  const [showConvert, setShowConvert] = useState(false)
  const [newCode, setNewCode] = useState(() => item.code.replace(/^ST-/, 'CM-'))

  const overdue = isOverdue(item.dueDate)
  const days = daysUntil(item.dueDate)

  return (
    <>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-800 bg-[color:var(--color-panel)] px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TypeBadge type={item.type} />
            <span className="font-mono text-xs text-slate-400">{item.code}</span>
            {item.blockers.length > 0 && <span className="chip bg-amber-500/15 text-amber-300 ring-amber-500/40">⛔ bloccato</span>}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">{item.title}</h2>
          <div className="mt-0.5 text-sm text-slate-400">{item.customer}</div>
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200" aria-label="Chiudi">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      <div className="space-y-5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} />
          <PriorityBadge priority={item.priority} />
          {item.type === 'studio' && typeof item.acquisitionProbability === 'number' && (
            <span className="chip bg-violet-500/10 text-violet-300 ring-violet-500/30">
              prob. acquisizione {item.acquisitionProbability}%
            </span>
          )}
          {item.type === 'studio' && (
            <button
              onClick={() => setShowConvert((v) => !v)}
              className="ml-auto btn-primary"
              title="Converte questo studio in commessa"
            >
              {showConvert ? '× Annulla' : '→ Converti in commessa'}
            </button>
          )}
        </div>

        {showConvert && item.type === 'studio' && (
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
            <div className="text-xs font-medium text-sky-200">Conversione studio → commessa</div>
            <p className="mt-1 text-[12px] text-slate-300">
              La probabilità di acquisizione verrà rimossa. Puoi aggiornare il codice (consigliato).
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                className="input-base flex-1"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Nuovo codice commessa, es. CM-2026-040"
              />
              <button
                onClick={() => {
                  onConvertStudio(item.id, newCode.trim() || undefined)
                  setShowConvert(false)
                }}
                className="btn-primary"
              >
                Converti
              </button>
            </div>
          </div>
        )}

        <Section title="Dati principali">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row label="Owner" value={owner?.name ?? '—'} />
            <Row label="Assegnati" value={item.assigneeIds.map((id) => personById.get(id)?.name).filter(Boolean).join(', ') || '—'} />
            <Row label="Inizio" value={formatItalian(item.startDate)} />
            <Row label="Scadenza" value={
              <span className={overdue ? 'text-red-300 font-medium' : ''}>
                {formatItalian(item.dueDate)} <span className="text-slate-500">({overdue ? `${Math.abs(days)} gg di ritardo` : `tra ${days} gg`})</span>
              </span>
            } />
            <Row label="Ore stimate" value={`${item.estimatedHours}h`} />
            <Row label="Ore consuntivate" value={`${item.loggedHours}h`} />
            <Row label="Avanzamento" value={
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                  <span className="block h-full bg-sky-500" style={{ width: `${item.progressPercent}%` }} />
                </span>
                <span className="tabular-nums">{item.progressPercent}%</span>
              </span>
            } />
          </dl>
          {item.description && <p className="mt-3 text-sm text-slate-300">{item.description}</p>}
        </Section>

        <Section title={`Task collegati (${tasks.length})`}>
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500">Nessun task collegato.</p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => {
                const a = personById.get(t.assigneeId)
                const od = isOverdue(t.dueDate)
                return (
                  <li key={t.id} className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100">{t.title}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{a?.name ?? '—'}</div>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                      <div>
                        <span className="text-slate-500">Periodo:</span> {formatItalianShort(t.startDate)} → <span className={od ? 'text-red-300' : ''}>{formatItalianShort(t.dueDate)}</span>
                      </div>
                      <div><span className="text-slate-500">Ore:</span> {t.loggedHours}/{t.estimatedHours}h</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Avanz.:</span>
                        <span className="inline-block h-1 w-12 overflow-hidden rounded-full bg-slate-800"><span className="block h-full bg-sky-500" style={{ width: `${t.progressPercent}%` }} /></span>
                        <span className="tabular-nums">{t.progressPercent}%</span>
                      </div>
                    </div>
                    {t.blockers.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-[11px] text-amber-300">
                        {t.blockers.map((b, i) => <li key={i}>⛔ {b}</li>)}
                      </ul>
                    )}
                    {t.notes && <div className="mt-1.5 text-[11px] text-slate-400">{t.notes}</div>}
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        <Section title="Totali (da task)">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Ore stimate" value={`${totals.est}h`} />
            <Stat label="Ore consuntivate" value={`${totals.log}h`} />
            <Stat label="Avanzamento medio" value={`${totals.avgProgress}%`} />
          </div>
        </Section>

        {item.blockers.length > 0 && (
          <Section title="Bloccanti">
            <ul className="space-y-1 text-sm text-amber-300">
              {item.blockers.map((b, i) => <li key={i}>⛔ {b}</li>)}
            </ul>
          </Section>
        )}

        {item.notes && (
          <Section title="Note">
            <p className="text-sm text-slate-300">{item.notes}</p>
          </Section>
        )}
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200">{value}</dd>
    </>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-100 tabular-nums">{value}</div>
    </div>
  )
}
