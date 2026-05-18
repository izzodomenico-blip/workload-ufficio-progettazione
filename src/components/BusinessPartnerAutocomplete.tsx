import { useEffect, useMemo, useRef, useState } from 'react'
import type { BusinessPartner } from '../types'
import { useData } from '../state/DataProvider'
import { searchBusinessPartners } from '../services/businessPartnersService'

interface Props {
  value: string
  onChange: (text: string, partner: BusinessPartner | null) => void
  placeholder?: string
  className?: string
  /** Mostra messaggio "non in anagrafica" sotto al campo se il testo non corrisponde. */
  showFreeTextHint?: boolean
  /** Id corrente collegato (per non mostrare "non in anagrafica" se è già linkato). */
  linkedPartnerId?: string
}

export function BusinessPartnerAutocomplete({
  value, onChange, placeholder, className, showFreeTextHint = true, linkedPartnerId,
}: Props) {
  const { businessPartners } = useData()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const results = useMemo(() => {
    if (value.trim().length < 3) return []
    return searchBusinessPartners(businessPartners, value, { activeOnly: true, limit: 8 })
  }, [businessPartners, value])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => { setHighlight(0) }, [results.length])

  const matchedLinked = linkedPartnerId
    ? businessPartners.find((p) => p.id === linkedPartnerId) ?? null
    : null
  const matchesLinked = matchedLinked && matchedLinked.name === value
  const noMatch = !matchesLinked
    && value.trim().length >= 3
    && !businessPartners.some((p) => p.name.toLowerCase() === value.trim().toLowerCase())

  function pick(partner: BusinessPartner) {
    onChange(partner.name, partner)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <input
        className="input-base"
        value={value}
        placeholder={placeholder ?? 'Inizia a scrivere…'}
        onChange={(e) => { onChange(e.target.value, null); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(results[highlight]) }
          else if (e.key === 'Escape') { setOpen(false) }
        }}
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto scroll-thin rounded-md border border-slate-700 bg-[color:var(--color-panel)] shadow-2xl">
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(p) }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition ${
                i === highlight ? 'bg-slate-800' : 'hover:bg-slate-800/70'
              }`}
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px]">
                <TypeDot type={p.type} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-100">{p.name}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] capitalize text-slate-300">{p.type}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {[p.city, p.province].filter(Boolean).join(' · ') || '—'}
                  {p.vatNumber ? <span> · P.IVA <code className="text-slate-300">{p.vatNumber}</code></span> : p.fiscalCode ? <span> · CF <code className="text-slate-300">{p.fiscalCode}</code></span> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {showFreeTextHint && noMatch && (
        <p className="mt-1 text-[11px] text-amber-300">Cliente non presente in anagrafica — verrà salvato come testo libero.</p>
      )}
      {matchesLinked && matchedLinked && (
        <p className="mt-1 text-[11px] text-emerald-300">Collegato all'anagrafica: {matchedLinked.name}</p>
      )}
    </div>
  )
}

const TYPE_COLORS: Record<BusinessPartner['type'], string> = {
  cliente: 'bg-sky-400',
  fornitore: 'bg-emerald-400',
  personale: 'bg-violet-400',
  altro: 'bg-zinc-400',
}

function TypeDot({ type }: { type: BusinessPartner['type'] }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${TYPE_COLORS[type]}`} />
}
