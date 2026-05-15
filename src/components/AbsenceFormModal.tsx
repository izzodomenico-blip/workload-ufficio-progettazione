import { useEffect, useMemo, useState } from 'react'
import type { Absence, AbsenceType } from '../types'
import { ALL_ABSENCE_TYPES } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { todayISO } from '../utils/dates'
import { validateAbsence } from '../utils/validation'
import type { AbsenceField, ValidationErrors } from '../utils/validation'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { ConfirmDialog } from './ConfirmDialog'

const TYPE_DEFAULT_HOURS: Record<AbsenceType, number> = {
  ferie: 8,
  permesso: 4,
  malattia: 8,
  trasferta: 8,
  altro: 8,
}

export const ABSENCE_COLORS: Record<AbsenceType, { bg: string; ring: string; text: string; dot: string; band: string; label: string }> = {
  ferie: { bg: 'bg-emerald-500/15', ring: 'ring-emerald-500/40', text: 'text-emerald-200', dot: 'bg-emerald-400', band: 'bg-emerald-500/20', label: 'Ferie' },
  permesso: { bg: 'bg-sky-500/15', ring: 'ring-sky-500/40', text: 'text-sky-200', dot: 'bg-sky-400', band: 'bg-sky-500/20', label: 'Permesso' },
  malattia: { bg: 'bg-rose-500/15', ring: 'ring-rose-500/40', text: 'text-rose-200', dot: 'bg-rose-400', band: 'bg-rose-500/20', label: 'Malattia' },
  trasferta: { bg: 'bg-amber-500/15', ring: 'ring-amber-500/40', text: 'text-amber-200', dot: 'bg-amber-400', band: 'bg-amber-500/20', label: 'Trasferta' },
  altro: { bg: 'bg-zinc-500/15', ring: 'ring-zinc-500/40', text: 'text-zinc-200', dot: 'bg-zinc-400', band: 'bg-zinc-500/20', label: 'Altro' },
}

interface FormValues {
  personId: string
  type: AbsenceType
  startDate: string
  endDate: string
  hoursPerDay: number
  notes: string
}

function emptyValues(defaultPersonId: string, prefilledDate?: string): FormValues {
  const date = prefilledDate ?? todayISO()
  return {
    personId: defaultPersonId,
    type: 'ferie',
    startDate: date,
    endDate: date,
    hoursPerDay: TYPE_DEFAULT_HOURS.ferie,
    notes: '',
  }
}

function fromAbsence(a: Absence): FormValues {
  return {
    personId: a.personId,
    type: a.type,
    startDate: a.startDate,
    endDate: a.endDate,
    hoursPerDay: a.hoursPerDay,
    notes: a.notes ?? '',
  }
}

interface Props {
  open: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  absence?: Absence
  prefill?: { personId?: string; date?: string }
}

export function AbsenceFormModal({ open, onClose, mode, absence, prefill }: Props) {
  const { data, createAbsence, updateAbsence, deleteAbsence } = useData()
  const toast = useToast()

  const defaultPersonId = prefill?.personId ?? data.people.find((p) => p.active)?.id ?? data.people[0]?.id ?? ''
  const [values, setValues] = useState<FormValues>(() => emptyValues(defaultPersonId, prefill?.date))
  const [errors, setErrors] = useState<ValidationErrors<AbsenceField>>({})
  const [submitted, setSubmitted] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [typeTouched, setTypeTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues(mode === 'edit' && absence ? fromAbsence(absence) : emptyValues(defaultPersonId, prefill?.date))
    setErrors({})
    setSubmitted(false)
    setTypeTouched(false)
  }, [open, mode, absence, defaultPersonId, prefill?.date])

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setValues((prev) => ({ ...prev, [k]: v }))

  function setType(t: AbsenceType) {
    setValues((prev) => ({
      ...prev,
      type: t,
      hoursPerDay: typeTouched ? prev.hoursPerDay : TYPE_DEFAULT_HOURS[t],
    }))
  }

  const payload = useMemo<Omit<Absence, 'id'>>(() => ({
    personId: values.personId,
    type: values.type,
    startDate: values.startDate,
    endDate: values.endDate,
    hoursPerDay: Number(values.hoursPerDay) || 0,
    notes: values.notes.trim() === '' ? undefined : values.notes.trim(),
  }), [values])

  function handleSubmit() {
    setSubmitted(true)
    const result = validateAbsence(payload)
    if (!result.ok) {
      setErrors(result.errors)
      toast.error('Controlla i campi evidenziati.')
      return
    }
    if (mode === 'create') {
      createAbsence(payload)
      toast.success('Assenza inserita.')
    } else if (absence) {
      updateAbsence(absence.id, payload)
      toast.success('Assenza aggiornata.')
    }
    onClose()
  }

  function handleDelete() {
    if (!absence) return
    deleteAbsence(absence.id)
    toast.success('Assenza eliminata.')
    setConfirmDelete(false)
    onClose()
  }

  function liveValidate<K extends AbsenceField>(field: K, value: unknown) {
    if (!submitted) return
    const r = validateAbsence({ ...payload, [field]: value })
    setErrors(r.ok ? {} : r.errors)
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={mode === 'create' ? 'Nuova assenza' : 'Modifica assenza'}
        subtitle="Ferie, permesso, malattia, trasferta o altro"
        size="md"
        footer={
          <>
            {mode === 'edit' && (
              <button onClick={() => setConfirmDelete(true)} className="mr-auto inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-500/10">
                🗑 Elimina
              </button>
            )}
            <button onClick={onClose} className="btn-ghost">Annulla</button>
            <button onClick={handleSubmit} className="btn-primary">{mode === 'create' ? 'Inserisci' : 'Salva'}</button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="Persona" required error={errors.personId}>
            <select
              className="input-base"
              value={values.personId}
              onChange={(e) => { set('personId', e.target.value); liveValidate('personId', e.target.value) }}
            >
              {data.people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              {data.people.filter((p) => !p.active).map((p) => <option key={p.id} value={p.id}>{p.name} (non attiva)</option>)}
            </select>
          </FormField>

          <FormField label="Tipo" required error={errors.type}>
            <div className="grid grid-cols-5 gap-1 rounded-md border border-slate-700 p-1">
              {ALL_ABSENCE_TYPES.map((t) => {
                const c = ABSENCE_COLORS[t]
                const on = values.type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    title={c.label}
                    className={`flex items-center justify-center gap-1 rounded px-1 py-1 text-[11px] font-medium capitalize transition ${
                      on ? `${c.bg} ${c.text} ring-1 ring-inset ${c.ring}` : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dot}`} />
                    {t}
                  </button>
                )
              })}
            </div>
          </FormField>

          <FormField label="Inizio" required error={errors.startDate}>
            <input
              type="date" className="input-base"
              value={values.startDate}
              onChange={(e) => { set('startDate', e.target.value); liveValidate('startDate', e.target.value) }}
            />
          </FormField>

          <FormField label="Fine" required error={errors.endDate}>
            <input
              type="date" className="input-base"
              value={values.endDate}
              onChange={(e) => { set('endDate', e.target.value); liveValidate('endDate', e.target.value) }}
            />
          </FormField>

          <FormField label="Ore al giorno" required error={errors.hoursPerDay} hint="1–8 (8 = giornata intera, 4 = mezza giornata)" className="md:col-span-2">
            <div className="flex items-center gap-3">
              <input
                type="range" min={1} max={8} step={1}
                value={values.hoursPerDay}
                onChange={(e) => { setTypeTouched(true); set('hoursPerDay', Number(e.target.value)); liveValidate('hoursPerDay', Number(e.target.value)) }}
                className="flex-1"
              />
              <input
                type="number" min={1} max={8} step={1}
                value={values.hoursPerDay}
                onChange={(e) => { setTypeTouched(true); set('hoursPerDay', Number(e.target.value)); liveValidate('hoursPerDay', Number(e.target.value)) }}
                className="input-base w-20 text-right"
              />
            </div>
          </FormField>

          <FormField label="Note" className="md:col-span-2">
            <textarea
              rows={2}
              className="input-base resize-y"
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Annotazioni interne (es. ponte, sopralluogo cliente…)"
            />
          </FormField>
        </div>
      </Modal>

      {mode === 'edit' && absence && (
        <ConfirmDialog
          open={confirmDelete}
          title="Eliminare l’assenza?"
          message="L’assenza verrà rimossa. Operazione non reversibile."
          confirmLabel="Elimina"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
