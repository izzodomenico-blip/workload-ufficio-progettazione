import { useMemo, useRef, useState, useEffect } from 'react'
import type { WorkItem } from '../types'
import { useData } from '../state/DataProvider'

interface Props {
  value: string
  onPick: (workItem: WorkItem) => void
  onText: (text: string) => void
  placeholder?: string
  className?: string
}

export function WorkItemAutocomplete({ value, onPick, onText, placeholder, className }: Props) {
  const { data } = useData()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const results = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (q.length < 2) return []
    return data.workItems
      .filter((w) => w.type === 'commessa')
      .filter((w) => w.code.toLowerCase().includes(q) || w.title.toLowerCase().includes(q) || w.customer.toLowerCase().includes(q))
      .slice(0, 8)
  }, [data.workItems, value])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => { setHighlight(0) }, [results.length])

  function pick(w: WorkItem) {
    onPick(w)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <input
        className="input-base"
        value={value}
        placeholder={placeholder ?? 'Cerca commessa per codice, titolo o cliente…'}
        onChange={(e) => { onText(e.target.value); setOpen(true) }}
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
        <div className="menu-surface absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto scroll-thin">
          {results.map((w, i) => (
            <button
              key={w.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(w) }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs transition ${i === highlight ? 'bg-slate-800' : 'hover:bg-slate-800/70'}`}
            >
              <span className="text-sm font-medium text-slate-100">{w.code || '(senza codice)'} · {w.title}</span>
              <span className="text-[11px] text-slate-400">{w.customer || '—'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
