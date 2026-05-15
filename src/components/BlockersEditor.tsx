import { useState } from 'react'

interface Props {
  blockers: string[]
  onChange: (next: string[]) => void
}

export function BlockersEditor({ blockers, onChange }: Props) {
  const [draft, setDraft] = useState('')

  function addCurrent() {
    const v = draft.trim()
    if (!v) return
    onChange([...blockers, v])
    setDraft('')
  }

  function remove(i: number) {
    onChange(blockers.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input-base flex-1"
          placeholder="Es. Manca conferma volumi dal commerciale"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCurrent()
            }
          }}
        />
        <button type="button" onClick={addCurrent} className="btn-ghost">+ Aggiungi</button>
      </div>
      {blockers.length > 0 && (
        <ul className="space-y-1">
          {blockers.map((b, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-200">
              <span className="min-w-0 flex-1">⛔ {b}</span>
              <button type="button" onClick={() => remove(i)} className="text-amber-300/80 hover:text-amber-200" aria-label="Rimuovi bloccante">×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
