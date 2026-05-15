import { useEffect, useState } from 'react'
import type { Person } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { validatePerson } from '../utils/validation'
import { Modal } from './Modal'
import { FormField } from './FormField'

interface Props {
  open: boolean
  onClose: () => void
}

export function PeopleSettingsModal({ open, onClose }: Props) {
  const { data, updatePeople } = useData()
  const toast = useToast()

  const [draft, setDraft] = useState<Person[]>(() => data.people.map((p) => ({ ...p, skills: [...p.skills] })))

  useEffect(() => {
    if (open) {
      setDraft(data.people.map((p) => ({ ...p, skills: [...p.skills] })))
    }
  }, [open, data.people])

  function setField<K extends keyof Person>(idx: number, key: K, value: Person[K]) {
    setDraft((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)))
  }

  function addSkill(idx: number, skill: string) {
    const v = skill.trim()
    if (!v) return
    setDraft((prev) => prev.map((p, i) => {
      if (i !== idx) return p
      if (p.skills.includes(v)) return p
      return { ...p, skills: [...p.skills, v] }
    }))
  }

  function removeSkill(idx: number, skill: string) {
    setDraft((prev) => prev.map((p, i) => i === idx ? { ...p, skills: p.skills.filter((s) => s !== skill) } : p))
  }

  function handleSave() {
    for (const p of draft) {
      const r = validatePerson(p)
      if (!r.ok) {
        const firstErr = Object.values(r.errors)[0]
        toast.error(`${p.name || 'Persona'}: ${firstErr}`)
        return
      }
    }
    updatePeople(draft)
    toast.success(`Salvate ${draft.length} persone.`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Persone e capacità"
      subtitle="Modifica nome, ruolo, ore settimanali, skill e disponibilità delle persone dell’ufficio"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Annulla</button>
          <button onClick={handleSave} className="btn-primary">Salva tutto</button>
        </>
      }
    >
      <div className="space-y-3">
        {draft.map((p, idx) => (
          <PersonEditor
            key={p.id}
            person={p}
            onChange={(k, v) => setField(idx, k, v)}
            onAddSkill={(s) => addSkill(idx, s)}
            onRemoveSkill={(s) => removeSkill(idx, s)}
          />
        ))}
      </div>
    </Modal>
  )
}

interface PersonEditorProps {
  person: Person
  onChange: <K extends keyof Person>(key: K, value: Person[K]) => void
  onAddSkill: (skill: string) => void
  onRemoveSkill: (skill: string) => void
}

function PersonEditor({ person, onChange, onAddSkill, onRemoveSkill }: PersonEditorProps) {
  const [skillDraft, setSkillDraft] = useState('')
  return (
    <div className={`rounded-lg border p-3 transition ${person.active ? 'border-slate-700 bg-slate-900/40' : 'border-slate-800 bg-slate-900/20 opacity-70'}`}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <FormField label="Nome" className="md:col-span-3" required>
          <input className="input-base" value={person.name} onChange={(e) => onChange('name', e.target.value)} />
        </FormField>
        <FormField label="Ruolo" className="md:col-span-5" required>
          <input className="input-base" value={person.role} onChange={(e) => onChange('role', e.target.value)} />
        </FormField>
        <FormField label="Ore/sett" className="md:col-span-2" required hint="0–80">
          <input
            type="number" min={0} max={80} className="input-base"
            value={person.weeklyCapacityHours}
            onChange={(e) => onChange('weeklyCapacityHours', Number(e.target.value))}
          />
        </FormField>
        <FormField label="Attiva" className="md:col-span-2">
          <button
            type="button"
            onClick={() => onChange('active', !person.active)}
            className={`mt-0.5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border text-xs font-medium transition ${
              person.active
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-zinc-600 bg-zinc-800/40 text-zinc-400'
            }`}
          >
            <span aria-hidden>{person.active ? '●' : '○'}</span>
            {person.active ? 'Attiva' : 'Disattivata'}
          </button>
        </FormField>

        <FormField label="Skill" className="md:col-span-12" hint="Premi Invio per aggiungere">
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                className="input-base flex-1"
                placeholder="Es. layout, distinte, calcolo strutturale…"
                value={skillDraft}
                onChange={(e) => setSkillDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onAddSkill(skillDraft)
                    setSkillDraft('')
                  }
                }}
              />
              <button
                type="button"
                onClick={() => { onAddSkill(skillDraft); setSkillDraft('') }}
                className="btn-ghost"
              >
                + Aggiungi
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {person.skills.length === 0 && <span className="text-xs text-slate-500">Nessuna skill definita.</span>}
              {person.skills.map((s) => (
                <span key={s} className="chip bg-slate-800 text-slate-200 ring-slate-700">
                  {s}
                  <button
                    type="button"
                    onClick={() => onRemoveSkill(s)}
                    className="ml-1 text-slate-400 hover:text-red-300"
                    aria-label={`Rimuovi ${s}`}
                  >×</button>
                </span>
              ))}
            </div>
          </div>
        </FormField>

        <FormField label="Note" className="md:col-span-12">
          <textarea
            rows={2}
            className="input-base resize-y"
            value={person.notes ?? ''}
            onChange={(e) => onChange('notes', e.target.value || undefined)}
            placeholder="Annotazioni interne (es. ferie programmate)"
          />
        </FormField>
      </div>
    </div>
  )
}
