import type { Person } from '../types'

interface Props {
  people: Person[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  excludeId?: string
}

export function AssigneesPicker({ people, selectedIds, onChange, excludeId }: Props) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }
  const visible = people.filter((p) => p.active && p.id !== excludeId)
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((p) => {
        const on = selectedIds.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
              on
                ? 'bg-sky-500/20 text-sky-100 ring-sky-400/50'
                : 'bg-slate-800/60 text-slate-300 ring-slate-700 hover:bg-slate-800'
            }`}
          >
            {on && <span className="mr-1" aria-hidden>✓</span>}
            {p.name}
          </button>
        )
      })}
      {visible.length === 0 && (
        <span className="text-xs text-slate-500">Nessuna persona attiva disponibile.</span>
      )}
    </div>
  )
}
