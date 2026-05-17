import { useEffect, useMemo, useState } from 'react'
import type { Priority, Status, TechnicalPhase, WorkItem, WorkItemType } from '../types'
import { ALL_PRIORITIES, ALL_STATUSES, ALL_TYPES, TECHNICAL_PHASES } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { todayISO } from '../utils/dates'
import { validateWorkItem } from '../utils/validation'
import type { ValidationErrors, WorkItemField } from '../utils/validation'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { BlockersEditor } from './BlockersEditor'
import { AssigneesPicker } from './AssigneesPicker'

interface FormValues {
  type: WorkItemType
  code: string
  customer: string
  title: string
  description: string
  priority: Priority
  status: Status
  ownerId: string
  assigneeIds: string[]
  startDate: string
  dueDate: string
  estimatedHours: number
  progressPercent: number
  acquisitionProbability: number
  blockers: string[]
  notes: string
  // Dettagli tecnici e operativi
  technicalPhase: TechnicalPhase | ''
  customerRequestDate: string
  plannedProductionReleaseDate: string
  actualProductionReleaseDate: string
  workFolderLink: string
  offerReference: string
  commercialPriority: Priority | ''
  managerNotes: string
}

function emptyValues(defaultOwnerId: string): FormValues {
  const today = todayISO()
  return {
    type: 'commessa',
    code: '',
    customer: '',
    title: '',
    description: '',
    priority: 'media',
    status: 'Da pianificare',
    ownerId: defaultOwnerId,
    assigneeIds: [],
    startDate: today,
    dueDate: today,
    estimatedHours: 0,
    progressPercent: 0,
    acquisitionProbability: 50,
    blockers: [],
    notes: '',
    technicalPhase: '',
    customerRequestDate: '',
    plannedProductionReleaseDate: '',
    actualProductionReleaseDate: '',
    workFolderLink: '',
    offerReference: '',
    commercialPriority: '',
    managerNotes: '',
  }
}

function fromWorkItem(w: WorkItem): FormValues {
  return {
    type: w.type,
    code: w.code,
    customer: w.customer,
    title: w.title,
    description: w.description,
    priority: w.priority,
    status: w.status,
    ownerId: w.ownerId,
    assigneeIds: [...w.assigneeIds],
    startDate: w.startDate,
    dueDate: w.dueDate,
    estimatedHours: w.estimatedHours,
    progressPercent: w.progressPercent,
    acquisitionProbability: w.acquisitionProbability ?? 50,
    blockers: [...w.blockers],
    notes: w.notes ?? '',
    technicalPhase: w.technicalPhase ?? '',
    customerRequestDate: w.customerRequestDate ?? '',
    plannedProductionReleaseDate: w.plannedProductionReleaseDate ?? '',
    actualProductionReleaseDate: w.actualProductionReleaseDate ?? '',
    workFolderLink: w.workFolderLink ?? '',
    offerReference: w.offerReference ?? '',
    commercialPriority: w.commercialPriority ?? '',
    managerNotes: w.managerNotes ?? '',
  }
}

interface Props {
  open: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  workItem?: WorkItem
  onCreated?: (id: string) => void
}

export function WorkItemFormModal({ open, onClose, mode, workItem, onCreated }: Props) {
  const { data, createWorkItem, updateWorkItem } = useData()
  const toast = useToast()

  const defaultOwnerId = data.people[0]?.id ?? ''
  const [values, setValues] = useState<FormValues>(() => emptyValues(defaultOwnerId))
  const [errors, setErrors] = useState<ValidationErrors<WorkItemField>>({})
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues(mode === 'edit' && workItem ? fromWorkItem(workItem) : emptyValues(defaultOwnerId))
    setErrors({})
    setSubmitted(false)
  }, [open, mode, workItem, defaultOwnerId])

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setValues((prev) => ({ ...prev, [k]: v }))

  const isStudio = values.type === 'studio'

  const payload = useMemo<Omit<WorkItem, 'id'>>(() => {
    const linkRaw = values.workFolderLink.trim()
    return {
      type: values.type,
      code: values.code.trim(),
      customer: values.customer.trim(),
      title: values.title.trim(),
      description: values.description.trim(),
      priority: values.priority,
      status: values.status,
      ownerId: values.ownerId,
      assigneeIds: values.assigneeIds,
      startDate: values.startDate,
      dueDate: values.dueDate,
      estimatedHours: Number(values.estimatedHours) || 0,
      // loggedHours non più gestito in UI — preserva valore esistente per compat dati legacy
      loggedHours: workItem?.loggedHours ?? 0,
      progressPercent: Number(values.progressPercent) || 0,
      blockers: values.blockers,
      notes: values.notes.trim() === '' ? undefined : values.notes.trim(),
      ...(isStudio ? { acquisitionProbability: Number(values.acquisitionProbability) || 0 } : {}),
      ...(values.technicalPhase ? { technicalPhase: values.technicalPhase } : {}),
      ...(values.customerRequestDate ? { customerRequestDate: values.customerRequestDate } : {}),
      ...(values.plannedProductionReleaseDate ? { plannedProductionReleaseDate: values.plannedProductionReleaseDate } : {}),
      ...(values.actualProductionReleaseDate ? { actualProductionReleaseDate: values.actualProductionReleaseDate } : {}),
      ...(linkRaw ? { workFolderLink: linkRaw } : {}),
      ...(values.offerReference.trim() ? { offerReference: values.offerReference.trim() } : {}),
      ...(values.commercialPriority ? { commercialPriority: values.commercialPriority } : {}),
      ...(values.managerNotes.trim() ? { managerNotes: values.managerNotes.trim() } : {}),
    }
  }, [values, isStudio])

  function handleSubmit() {
    setSubmitted(true)
    const result = validateWorkItem(payload)
    if (!result.ok) {
      setErrors(result.errors)
      toast.error('Controlla i campi evidenziati.')
      return
    }
    if (mode === 'create') {
      const id = createWorkItem(payload)
      toast.success(`Lavoro creato: ${payload.code || payload.title}`)
      onCreated?.(id)
    } else if (workItem) {
      updateWorkItem(workItem.id, payload)
      toast.success('Lavoro aggiornato.')
    }
    onClose()
  }

  function handleValidateLive(field: WorkItemField, value: unknown) {
    if (!submitted) return
    const next = validateWorkItem({ ...payload, [field]: value })
    setErrors(next.ok ? {} : next.errors)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Nuovo lavoro' : `Modifica ${workItem?.code ?? 'lavoro'}`}
      subtitle={mode === 'create' ? 'Crea una commessa, uno studio o un’attività interna' : 'Aggiorna i dati del lavoro selezionato'}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Annulla</button>
          <button onClick={handleSubmit} className="btn-primary">
            {mode === 'create' ? 'Crea lavoro' : 'Salva modifiche'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="Tipo" required error={errors.type}>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-slate-700 p-1">
            {ALL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { set('type', t); handleValidateLive('type', t) }}
                className={`rounded px-2 py-1 text-xs font-medium capitalize transition ${
                  values.type === t ? 'bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/50' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Codice" hint="Es. CM-2026-040 / ST-2026-007">
          <input
            className="input-base"
            value={values.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder="Codice identificativo"
          />
        </FormField>

        <FormField label="Cliente" className="md:col-span-1">
          <input
            className="input-base"
            value={values.customer}
            onChange={(e) => set('customer', e.target.value)}
            placeholder="Nome cliente o reparto interno"
          />
        </FormField>

        <FormField label="Titolo" required error={errors.title}>
          <input
            className="input-base"
            value={values.title}
            onChange={(e) => { set('title', e.target.value); handleValidateLive('title', e.target.value) }}
            placeholder="Es. Linea montaggio carter"
          />
        </FormField>

        <FormField label="Descrizione" className="md:col-span-2">
          <textarea
            rows={2}
            className="input-base resize-y"
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Breve descrizione del lavoro"
          />
        </FormField>

        <FormField label="Priorità">
          <select className="input-base capitalize" value={values.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            {ALL_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </FormField>

        <FormField label="Stato" required error={errors.status}>
          <select
            className="input-base"
            value={values.status}
            onChange={(e) => { set('status', e.target.value as Status); handleValidateLive('status', e.target.value) }}
          >
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>

        <FormField label="Owner">
          <select className="input-base" value={values.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
            {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </FormField>

        <FormField label="Inizio" error={undefined}>
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

        <FormField
          label="Ore stimate"
          error={errors.estimatedHours}
          hint="Le ore residue vengono calcolate da stima e avanzamento."
        >
          <input
            type="number"
            min={0}
            step={1}
            className="input-base"
            value={values.estimatedHours}
            onChange={(e) => set('estimatedHours', Number(e.target.value))}
          />
        </FormField>

        <FormField
          label="Avanzamento reale %"
          error={errors.progressPercent}
          hint="L’avanzamento atteso viene calcolato automaticamente in base a date e giorni lavorativi."
        >
          <div className="flex items-center gap-3">
            <input
              type="range" min={0} max={100} value={values.progressPercent}
              onChange={(e) => set('progressPercent', Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-10 text-right text-sm tabular-nums text-slate-200">{values.progressPercent}%</span>
          </div>
        </FormField>

        {isStudio && (
          <FormField label="Probabilità acquisizione %" error={errors.acquisitionProbability} hint="Quanto è probabile che lo studio diventi commessa">
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} value={values.acquisitionProbability}
                onChange={(e) => set('acquisitionProbability', Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-10 text-right text-sm tabular-nums text-violet-200">{values.acquisitionProbability}%</span>
            </div>
          </FormField>
        )}

        <FormField label="Assegnati" className="md:col-span-2" hint="Persone coinvolte nel lavoro">
          <AssigneesPicker
            people={data.people}
            selectedIds={values.assigneeIds}
            onChange={(ids) => set('assigneeIds', ids)}
          />
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

        <div className="md:col-span-2 mt-1 border-t border-slate-800 pt-3">
          <div className="flex items-baseline gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Dettagli tecnici e operativi
            </h3>
            <span className="text-[10px] text-slate-500">tutti i campi sono opzionali</span>
          </div>
        </div>

        <FormField label="Fase tecnica">
          <select
            className="input-base"
            value={values.technicalPhase}
            onChange={(e) => set('technicalPhase', e.target.value as TechnicalPhase | '')}
          >
            <option value="">— non specificata —</option>
            {TECHNICAL_PHASES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Priorità commerciale" hint="Indicatore separato dalla priorità tecnica">
          <select
            className="input-base capitalize"
            value={values.commercialPriority}
            onChange={(e) => set('commercialPriority', e.target.value as Priority | '')}
          >
            <option value="">— non specificata —</option>
            {ALL_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Data richiesta cliente">
          <input
            type="date"
            className="input-base"
            value={values.customerRequestDate}
            onChange={(e) => set('customerRequestDate', e.target.value)}
          />
        </FormField>

        <FormField label="Riferimento offerta">
          <input
            className="input-base"
            value={values.offerReference}
            onChange={(e) => set('offerReference', e.target.value)}
            placeholder="Es. OFF-2026-070"
          />
        </FormField>

        <FormField label="Rilascio produzione previsto">
          <input
            type="date"
            className="input-base"
            value={values.plannedProductionReleaseDate}
            onChange={(e) => set('plannedProductionReleaseDate', e.target.value)}
          />
        </FormField>

        <FormField
          label="Rilascio produzione effettivo"
          hint={values.actualProductionReleaseDate ? 'Lavoro rilasciato in produzione' : 'Vuoto finché non rilasciato'}
        >
          <input
            type="date"
            className="input-base"
            value={values.actualProductionReleaseDate}
            onChange={(e) => set('actualProductionReleaseDate', e.target.value)}
          />
        </FormField>

        <FormField label="Link cartella commessa" className="md:col-span-2" hint="URL o percorso file (es. file:///… oppure https://…)">
          <input
            className="input-base"
            value={values.workFolderLink}
            onChange={(e) => set('workFolderLink', e.target.value)}
            placeholder="https://… oppure file:///…"
          />
        </FormField>

        <FormField label="Note responsabile" className="md:col-span-2" hint="Visibili nel dettaglio lavoro">
          <textarea
            rows={2}
            className="input-base resize-y"
            value={values.managerNotes}
            onChange={(e) => set('managerNotes', e.target.value)}
            placeholder="Indicazioni interne, priorità, contesto…"
          />
        </FormField>
      </div>
    </Modal>
  )
}
