import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import type { ImportPlan, ImportPlanItem, ImportPlanRecord, ImportResult } from '../services/businessPartnersService'
import { Modal } from './Modal'

type Step = 'pick' | 'parsing' | 'preview' | 'applying' | 'done' | 'error'

interface ParseResponse {
  filename?: string
  totalRows: number
  headerFound: boolean
  skipped: number
  recordsRead: number
  errors: string[]
  records: ImportPlanRecord[]
}

interface Props {
  open: boolean
  onClose: () => void
}

export function BusinessPartnerImportModal({ open, onClose }: Props) {
  const { planBusinessPartnerImport, applyBusinessPartnerImport } = useData()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [step, setStep] = useState<Step>('pick')
  const [filename, setFilename] = useState<string | undefined>()
  const [parseResp, setParseResp] = useState<ParseResponse | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setStep('pick')
    setFilename(undefined)
    setParseResp(null)
    setPlan(null)
    setResult(null)
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function pickFile() {
    inputRef.current?.click()
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFilename(file.name)
    setStep('parsing')
    setError(null)
    try {
      const text = await file.text()
      const response = await fetch('/api/business-partners/parse-xml', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ xml: text, filename: file.name }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? `Errore ${response.status}`)
      }
      const data = (await response.json()) as ParseResponse
      setParseResp(data)
      const planned = planBusinessPartnerImport(data.records, file.name)
      setPlan(planned)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante il parsing.')
      setStep('error')
    }
  }

  function handleConfirm() {
    if (!plan) return
    setStep('applying')
    try {
      const r = applyBusinessPartnerImport(plan)
      setResult(r)
      setStep('done')
      toast.success(`Import completato: ${r.created} nuove, ${r.updated} aggiornate, ${r.skipped} scartate.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante l’import.')
      setStep('error')
    }
  }

  const previewSamples = plan ? plan.items.slice(0, 10) : []

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Importa anagrafiche"
      subtitle="XML Excel SpreadsheetML — l'operazione aggiorna o aggiunge, non cancella le anagrafiche esistenti"
      size="lg"
      footer={
        <>
          <button onClick={handleClose} className="btn-ghost">Chiudi</button>
          {step === 'preview' && plan && (
            <button onClick={handleConfirm} className="btn-primary">
              Conferma import ({plan.toCreate} nuove + {plan.toUpdate} aggiornate)
            </button>
          )}
          {step === 'error' && (
            <button onClick={reset} className="btn-ghost">Riprova</button>
          )}
          {step === 'done' && (
            <button onClick={reset} className="btn-ghost">Importa un altro file</button>
          )}
        </>
      }
    >
      <input ref={inputRef} type="file" accept=".xml,.csv,.json,application/xml,text/xml" onChange={handleFile} className="hidden" />

      {step === 'pick' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Seleziona il file <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">ANAGRAFICA.xml</code> esportato dal
            gestionale (formato Excel SpreadsheetML 2003). Il file viene letto in locale dal backend; nessun upload cloud.
          </p>
          <ul className="space-y-1 text-xs text-slate-400">
            <li>• Header riconosciuto cercando una cella con valore "Conto"</li>
            <li>• Colonne mappate per nome (non per posizione fissa)</li>
            <li>• Righe vuote o senza ragione sociale vengono scartate</li>
            <li>• Deduplica per <em>codice conto</em>, poi <em>P.IVA + nome</em>, poi <em>CF + nome</em></li>
          </ul>
          <button onClick={pickFile} className="btn-primary mt-2">Seleziona file XML</button>
        </div>
      )}

      {step === 'parsing' && (
        <div className="space-y-2 text-sm text-slate-400">
          <div className="text-slate-200">Parsing in corso…</div>
          {filename && <div>File: <code className="text-slate-200">{filename}</code></div>}
        </div>
      )}

      {step === 'preview' && plan && parseResp && (
        <div className="space-y-4">
          <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-100">
            Questa operazione <strong>aggiornerà o aggiungerà</strong> anagrafiche.
            Non verrà cancellata nessuna anagrafica esistente.
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Letti" value={parseResp.recordsRead} hint={`su ${parseResp.totalRows} righe`} tone="slate" />
            <Stat label="Nuovi" value={plan.toCreate} tone="emerald" />
            <Stat label="Aggiornati" value={plan.toUpdate} tone="sky" />
            <Stat label="Scartati" value={plan.toSkip + parseResp.skipped} tone="amber" />
          </div>

          {parseResp.errors.length > 0 && (
            <details className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-200">
              <summary className="cursor-pointer font-medium">Avvisi di parsing ({parseResp.errors.length})</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {parseResp.errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}

          <div>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Anteprima primi {previewSamples.length} record
            </h3>
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/60 text-left text-[10px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-2 py-1.5">Azione</th>
                    <th className="px-2 py-1.5">Conto</th>
                    <th className="px-2 py-1.5">Ragione sociale</th>
                    <th className="px-2 py-1.5">Tipo</th>
                    <th className="px-2 py-1.5">P.IVA</th>
                    <th className="px-2 py-1.5">Città</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {previewSamples.map((item, i) => (
                    <PreviewRow key={i} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {step === 'applying' && (
        <div className="text-sm text-slate-300">Salvataggio in corso…</div>
      )}

      {step === 'done' && result && (
        <div className="space-y-3">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-100">
            Import completato.
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Nuove" value={result.created} tone="emerald" />
            <Stat label="Aggiornate" value={result.updated} tone="sky" />
            <Stat label="Scartate" value={result.skipped} tone="amber" />
          </div>
          <p className="text-xs text-slate-400">
            L'evento è stato registrato nello storico modifiche.
          </p>
        </div>
      )}

      {step === 'error' && error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </Modal>
  )
}

function PreviewRow({ item }: { item: ImportPlanItem }) {
  const r = item.record
  const tone =
    item.decision === 'create' ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40'
    : item.decision === 'update' ? 'bg-sky-500/15 text-sky-200 ring-sky-500/40'
    : 'bg-amber-500/15 text-amber-200 ring-amber-500/40'
  const label =
    item.decision === 'create' ? 'Nuovo'
    : item.decision === 'update' ? `Update (${item.matchedBy ?? ''})`
    : 'Skip'
  return (
    <tr className="text-slate-200">
      <td className="px-2 py-1"><span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${tone}`}>{label}</span></td>
      <td className="px-2 py-1 font-mono text-[11px] text-slate-300">{r.accountCode || '—'}</td>
      <td className="px-2 py-1 text-slate-100">{r.name}</td>
      <td className="px-2 py-1 capitalize">{r.type}</td>
      <td className="px-2 py-1 text-slate-400">{r.vatNumber || '—'}</td>
      <td className="px-2 py-1 text-slate-400">{r.city || '—'}</td>
    </tr>
  )
}

const STAT_TONE = {
  slate: 'border-slate-700 bg-slate-900/40 text-slate-200',
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  sky: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
} as const

function Stat({ label, value, hint, tone = 'slate' }: { label: string; value: number; hint?: string; tone?: keyof typeof STAT_TONE }) {
  return (
    <div className={`rounded-md border p-2.5 ${STAT_TONE[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] opacity-70">{hint}</div>}
    </div>
  )
}
