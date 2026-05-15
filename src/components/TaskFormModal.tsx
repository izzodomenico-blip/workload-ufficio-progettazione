import { useEffect, useMemo, useState } from 'react'
import type { Status, Task } from '../types'
import { ALL_STATUSES } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { todayISO } from '../utils/dates'
import { validateTask } from '../utils/validation'
import type { TaskField, ValidationErrors } from '../utils/validation'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { BlockersEditor } from './BlockersEditor'

interface FormValues {
  title: string
  assigneeId: string
  status: Status
  startDate: string
  dueDate: string
  estimatedHours: number
  loggedHours: number
  progressPercent: number
  blockers: string[]
  notes: string
}

function emptyValues(defaultAssigneeId: string): FormValues {
  const today = todayISO()
  return {
    title: '',
    assigneeId: defaultAssigneeId,
    status: 'Da pianificare',
    startDate: today,
    dueDate: today,
    estimatedHours: 8,
    loggedHours: 0,
    progressPercent: 0,
    blockers: [],
    notes: '',
  }
}

function fromTask(t: Task): FormValues {
  return {
    title: t.title,
    assigneeId: t.assigneeId,
    status: t.status,
    startDate: t.startDate,
    dueDate: t.dueDate,
    estimatedHours: t.estimatedHours,
    loggedHours: t.loggedHours,
    progressPercent: t.progressPercent,
    blockers: [...t.blockers],
    notes: t.notes ?? '',
  }
}

interface Props {
  open: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  workItemId: string
  task?: Task
}

export function TaskFormModal({ open, onClose, mode, workItemId, task }: Props) {
  const { data, createTask, updateTask } = useData()
  const toast = useToast()

  const defaultAssigneeId = data.people.find((p) => p.active)?.id ?? data.people[0]?.id ?? ''
  const [values, setValues] = useState<FormValues>(() => emptyValues(defaultAssigneeId))
  const [errors, setErrors] = useState<ValidationErrors<TaskField>>({})
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues(mode === 'edit' && task ? fromTask(task) : emptyValues(defaultAssigneeId))
    setErrors({})
    setSubmitted(false)
  }, [open, mode, task, defaultAssigneeId])

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setValues((prev) => ({ ...prev, [k]: v }))

  const payload = useMemo<Omit<Task, 'id' | 'workItemId'>>(() => ({
    title: values.title.trim(),
    assigneeId: values.assigneeId,
    status: values.status,
    startDate: values.startDate,
    dueDate: values.dueDate,
    estimatedHours: Number(values.estimatedHours) || 0,
    loggedHours: Number(values.loggedHours) || 0,
    progressPercent: Number(values.progressPercent) || 0,
    blockers: values.blockers,
    notes: values.notes.trim() === '' ? undefined : values.notes.trim(),
  }), [values])

  function handleSubmit() {
    setSubmitted(true)
    const result = validateTask(payload)
    if (!result.ok) {
      setErrors(result.errors)
      toast.error('Controlla i campi evidenziati.')
      return
    }
    if (mode === 'create') {
      createTask(workItemId, payload)
      toast.success(`Task creato: ${payload.title}`)
    } else if (task) {
      updateTask(task.id, payload)
      toast.success('Task aggiornato.')
    }
    onClose()
  }

  function handleValidateLive(field: TaskField, value: unknown) {
    if (!submitted) return
    const next = validateTask({ ...payload, [field]: value })
    setErrors(next.ok ? {} : next.errors)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Nuovo task' : 'Modifica task'}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Annulla</button>
          <button onClick={handleSubmit} className="btn-primary">
            {mode === 'create' ? 'Crea task' : 'Salva modifiche'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="Titolo" required error={errors.title} className="md:col-span-2">
          <input
            className="input-base"
            value={values.title}
            onChange={(e) => { set('title', e.target.value); handleValidateLive('title', e.target.value) }}
            placeholder="Es. Layout stazione 1"
          />
        </FormField>

        <FormField label="Assegnato" required error={errors.assigneeId}>
          <select
            className="input-base"
            value={values.assigneeId}
            onChange={(e) => { set('assigneeId', e.target.value); handleValidateLive('assigneeId', e.target.value) }}
          >
            {data.people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            {data.people.filter((p) => !p.active).map((p) => <option key={p.id} value={p.id}>{p.name} (non attivo)</option>)}
          </select>
        </FormField>

        <FormField label="Stato" required>
          <select
            className="input-base"
            value={values.status}
            onChange={(e) => set('status', e.target.value as Status)}
          >
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>

        <FormField label="Inizio">
          <input type="date" className="input-base" value={values.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </FormField>

        <FormField label="Scadenza" required error={errors.dueDate}>
          <input
            type="date"
            className="input-base"
            value={values.dueDate}
            onChange={(e) => { set('dueDate', e.target.value); handleValidateLive('dueDate', e.target.value) }}
          />
        </FormField>

        <FormField label="Ore stimate" error={errors.estimatedHours}>
          <input type="number" min={0} step={1} className="input-base" value={values.estimatedHours} onChange={(e) => set('estimatedHours', Number(e.target.value))} />
        </FormField>

        <FormField label="Ore consuntivate" error={errors.loggedHours}>
          <input type="number" min={0} step={1} className="input-base" value={values.loggedHours} onChange={(e) => set('loggedHours', Number(e.target.value))} />
        </FormField>

        <FormField label="Avanzamento %" error={errors.progressPercent} className="md:col-span-2">
          <div className="flex items-center gap-3">
            <input
              type="range" min={0} max={100} value={values.progressPercent}
              onChange={(e) => set('progressPercent', Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-10 text-right text-sm tabular-nums text-slate-200">{values.progressPercent}%</span>
          </div>
        </FormField>

        <FormField label="Bloccanti" className="md:col-span-2" hint="Aggiungi un bloccante e premi Invio">
          <BlockersEditor blockers={values.blockers} onChange={(b) => set('blockers', b)} />
        </FormField>

        <FormField label="Note" className="md:col-span-2">
          <textarea
            rows={3}
            className="input-base resize-y"
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Annotazioni libere"
          />
        </FormField>
      </div>
    </Modal>
  )
}
