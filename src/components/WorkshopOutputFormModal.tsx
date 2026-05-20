import { useEffect, useMemo, useState } from 'react'
import type { MachineType, WorkshopOutputStatus } from '../types'
import { ALL_MACHINE_COMPLEXITIES, ALL_WORKSHOP_OUTPUT_STATUSES } from '../types'
import type { WorkshopOutputDraft } from '../services/workshopOutputsService'
import { calculateWorkshopImpact, getWorkshopImpactLevel, WORKSHOP_IMPACT_EXPLANATION } from '../utils/workshopImpact'
import { Modal } from './Modal'
import { FormField } from './FormField'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  output?: WorkshopOutputDraft | null
  machineTypes: MachineType[]
  defaultPlannedReleaseDate: string
  onClose: () => void
  onSave: (output: WorkshopOutputDraft) => void
}

const EMPTY_OUTPUT: WorkshopOutputDraft = {
  machineTypeId: '',
  machineTypeCode: '',
  machineTypeName: '',
  description: '',
  quantity: 1,
  complexity: 'media',
  assemblyCount: 1,
  estimatedPartCount: 10,
  requiresLaser: true,
  requiresTubeLaser: false,
  requiresBending: true,
  requiresWelding: true,
  requiresAssembly: true,
  requiresPainting: false,
  requiresTesting: false,
  plannedReleaseDate: '',
  actualReleaseDate: '',
  impactScore: 0,
  status: 'previsto',
  notes: '',
}

const PROCESS_FIELDS = [
  ['requiresLaser', 'Laser piano'],
  ['requiresTubeLaser', 'Laser tubo'],
  ['requiresBending', 'Piega'],
  ['requiresWelding', 'Saldatura/carpenteria'],
  ['requiresAssembly', 'Montaggio'],
  ['requiresPainting', 'Verniciatura/trattamento'],
  ['requiresTesting', 'Collaudo'],
] as const

const STATUS_LABEL: Record<WorkshopOutputStatus, string> = {
  previsto: 'Previsto',
  in_progettazione: 'In progettazione',
  pronto_rilascio: 'Pronto rilascio',
  rilasciato_produzione: 'Rilasciato produzione',
  ricevuto_officina: 'Ricevuto officina',
  sospeso: 'Sospeso',
}

export function WorkshopOutputFormModal({
  open,
  mode,
  output,
  machineTypes,
  defaultPlannedReleaseDate,
  onClose,
  onSave,
}: Props) {
  const activeMachineTypes = useMemo(
    () => machineTypes.filter((item) => item.active),
    [machineTypes],
  )
  const [values, setValues] = useState<WorkshopOutputDraft>(EMPTY_OUTPUT)
  const [search, setSearch] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(mode === 'edit')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const base = output
      ? { ...output }
      : { ...EMPTY_OUTPUT, plannedReleaseDate: defaultPlannedReleaseDate }
    setValues(recalculate(base, machineTypes))
    setSearch(output ? `${output.machineTypeCode} ${output.machineTypeName}` : '')
    setDetailsOpen(mode === 'edit')
    setError('')
  }, [open, output, defaultPlannedReleaseDate, mode, machineTypes])

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activeMachineTypes
      .filter((item) => {
        if (!q) return true
        const hay = `${item.code} ${item.name} ${item.family}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 12)
  }, [activeMachineTypes, search])

  function set<K extends keyof WorkshopOutputDraft>(key: K, value: WorkshopOutputDraft[K]) {
    setValues((current) => recalculate({ ...current, [key]: value }, machineTypes))
  }

  function selectMachineType(machineType: MachineType) {
    const next: WorkshopOutputDraft = {
      ...values,
      machineTypeId: machineType.id,
      machineTypeCode: machineType.code,
      machineTypeName: machineType.name,
      description: values.description || machineType.name,
      quantity: 1,
      complexity: machineType.defaultComplexity,
      assemblyCount: machineType.typicalAssemblyCount,
      estimatedPartCount: machineType.typicalPartCount,
      requiresLaser: machineType.defaultRequiresLaser,
      requiresTubeLaser: machineType.defaultRequiresTubeLaser,
      requiresBending: machineType.defaultRequiresBending,
      requiresWelding: machineType.defaultRequiresWelding,
      requiresAssembly: machineType.defaultRequiresAssembly,
      requiresPainting: machineType.defaultRequiresPainting,
      requiresTesting: machineType.defaultRequiresTesting,
      plannedReleaseDate: values.plannedReleaseDate || defaultPlannedReleaseDate,
      status: values.status || 'previsto',
    }
    setValues(recalculate(next, machineTypes))
    setSearch(`${machineType.code} ${machineType.name}`)
    setError('')
  }

  function handleSave() {
    if (!values.machineTypeCode || !values.machineTypeName) {
      setError('Seleziona una tipologia dalla Libreria disegni.')
      return
    }
    onSave(recalculate(values, machineTypes))
  }

  const level = getWorkshopImpactLevel(values.impactScore)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Aggiungi output officina' : 'Modifica output officina'}
      subtitle="I default arrivano dalla Libreria disegni, ma qui restano modificabili per la singola commessa"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Annulla</button>
          <button onClick={handleSave} className="btn-primary">Salva output</button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Tipologia macchina/disegno" required error={error}>
          <input
            className="input-base"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca per codice, nome o famiglia..."
          />
          <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/35 p-1 scroll-thin">
            {candidates.map((machineType) => (
              <button
                key={machineType.id}
                type="button"
                onClick={() => selectMachineType(machineType)}
                className={`grid w-full grid-cols-[70px_1fr_auto] items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-slate-800/70 ${
                  values.machineTypeId === machineType.id ? 'bg-sky-500/10 text-sky-100 ring-1 ring-inset ring-sky-500/35' : 'text-slate-200'
                }`}
              >
                <span className="font-mono text-xs font-semibold">{machineType.code}</span>
                <span className="min-w-0 truncate">{machineType.name}</span>
                <span className="text-[10px] text-slate-500">{machineType.family}</span>
              </button>
            ))}
            {candidates.length === 0 && (
              <div className="px-2.5 py-4 text-center text-sm text-slate-500">Nessuna tipologia attiva trovata.</div>
            )}
          </div>
        </FormField>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <FormField label="Quantita">
            <input
              type="number"
              min={0.1}
              step={1}
              className="input-base"
              value={values.quantity}
              onChange={(event) => set('quantity', Number(event.target.value))}
            />
          </FormField>
          <FormField label="Complessita">
            <select
              className="input-base"
              value={values.complexity}
              onChange={(event) => set('complexity', event.target.value as WorkshopOutputDraft['complexity'])}
            >
              {ALL_MACHINE_COMPLEXITIES.map((complexity) => (
                <option key={complexity} value={complexity}>{complexity}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Rilascio previsto">
            <input
              type="date"
              className="input-base"
              value={values.plannedReleaseDate}
              onChange={(event) => set('plannedReleaseDate', event.target.value)}
            />
          </FormField>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Indice impatto</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-slate-100">{values.impactScore}</span>
              <span className={`chip-sm ${impactLevelClass(level)}`}>{level}</span>
            </div>
          </div>
        </div>

        <p className="rounded-md border border-sky-500/25 bg-sky-500/8 px-3 py-2 text-[12px] text-sky-100">
          {WORKSHOP_IMPACT_EXPLANATION}
        </p>

        <button
          type="button"
          onClick={() => setDetailsOpen((current) => !current)}
          className="btn-ghost text-xs"
        >
          {detailsOpen ? 'Nascondi dettagli' : 'Dettagli'}
        </button>

        {detailsOpen && (
          <div className="grid grid-cols-1 gap-4 border-t border-slate-800 pt-4 md:grid-cols-2">
            <FormField label="Descrizione" className="md:col-span-2">
              <textarea
                rows={2}
                className="input-base resize-y"
                value={values.description}
                onChange={(event) => set('description', event.target.value)}
              />
            </FormField>
            <FormField label="Numero complessivi">
              <input
                type="number"
                min={0}
                step={1}
                className="input-base"
                value={values.assemblyCount}
                onChange={(event) => set('assemblyCount', Number(event.target.value))}
              />
            </FormField>
            <FormField label="Numero particolari stimati">
              <input
                type="number"
                min={0}
                step={1}
                className="input-base"
                value={values.estimatedPartCount}
                onChange={(event) => set('estimatedPartCount', Number(event.target.value))}
              />
            </FormField>
            <div className="md:col-span-2">
              <div className="mb-2 section-label">Processi</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PROCESS_FIELDS.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={Boolean(values[key])}
                      onChange={(event) => set(key, event.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <FormField label="Stato">
              <select
                className="input-base"
                value={values.status}
                onChange={(event) => set('status', event.target.value as WorkshopOutputStatus)}
              >
                {ALL_WORKSHOP_OUTPUT_STATUSES.map((status) => (
                  <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Rilascio effettivo">
              <input
                type="date"
                className="input-base"
                value={values.actualReleaseDate}
                onChange={(event) => set('actualReleaseDate', event.target.value)}
              />
            </FormField>
            <FormField label="Note" className="md:col-span-2">
              <textarea
                rows={2}
                className="input-base resize-y"
                value={values.notes}
                onChange={(event) => set('notes', event.target.value)}
              />
            </FormField>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function workshopOutputStatusLabel(status: WorkshopOutputStatus): string {
  return STATUS_LABEL[status]
}

export function workshopProcessLabels(output: Pick<
  WorkshopOutputDraft,
  | 'requiresLaser'
  | 'requiresTubeLaser'
  | 'requiresBending'
  | 'requiresWelding'
  | 'requiresAssembly'
  | 'requiresPainting'
  | 'requiresTesting'
>): string[] {
  return PROCESS_FIELDS
    .filter(([key]) => Boolean(output[key]))
    .map(([, label]) => label)
}

export function impactLevelClass(level: ReturnType<typeof getWorkshopImpactLevel>): string {
  if (level === 'basso') return 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30'
  if (level === 'medio') return 'bg-sky-500/10 text-sky-200 ring-sky-500/30'
  if (level === 'alto') return 'bg-amber-500/10 text-amber-200 ring-amber-500/30'
  return 'bg-red-500/10 text-red-200 ring-red-500/35'
}

function recalculate(output: WorkshopOutputDraft, machineTypes: MachineType[]): WorkshopOutputDraft {
  const machineType = machineTypes.find((item) => (
    item.id === output.machineTypeId ||
    item.code.toUpperCase() === output.machineTypeCode.toUpperCase()
  ))
  return {
    ...output,
    quantity: Number.isFinite(output.quantity) ? Math.max(0.1, output.quantity) : 1,
    assemblyCount: Number.isFinite(output.assemblyCount) ? Math.max(0, Math.round(output.assemblyCount)) : 0,
    estimatedPartCount: Number.isFinite(output.estimatedPartCount) ? Math.max(0, Math.round(output.estimatedPartCount)) : 0,
    impactScore: calculateWorkshopImpact(output, machineType),
  }
}

