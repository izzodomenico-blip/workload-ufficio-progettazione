import { useEffect, useMemo, useState } from 'react'
import type { MachineType, WorkshopAssignmentProcess, WorkshopOutputStatus } from '../types'
import { ALL_MACHINE_COMPLEXITIES, ALL_WORKSHOP_OUTPUT_STATUSES, WORKSHOP_WORKER_SKILL_LABELS } from '../types'
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
  requiresTurning: false,
  requiresMilling: false,
  requiresAssembly: true,
  requiresPainting: false,
  requiresTesting: false,
  laserWeightPercent: 25,
  tubeLaserWeightPercent: 0,
  bendingWeightPercent: 25,
  weldingWeightPercent: 25,
  turningWeightPercent: 0,
  millingWeightPercent: 0,
  assemblyWeightPercent: 25,
  paintingWeightPercent: 0,
  testingWeightPercent: 0,
  plannedReleaseDate: '',
  actualReleaseDate: '',
  hasStandardComponents: false,
  standardComponentsDescription: '',
  standardComponentsQuantity: 0,
  standardComponentsReadyFromDate: '',
  standardComponentsImpactScore: 0,
  standardComponentsProcesses: [],
  standardComponentsNotes: '',
  hasCommercialComponents: false,
  commercialComponentsDescription: '',
  commercialComponentsOrderRequired: false,
  commercialComponentsOrdered: false,
  commercialComponentsOrderedAt: '',
  commercialComponentsOrderedBy: '',
  commercialComponentsNotes: '',
  impactScore: 0,
  status: 'previsto',
  notes: '',
}

const PROCESS_FIELDS = [
  { key: 'requiresLaser', weight: 'laserWeightPercent', label: 'Laser piano' },
  { key: 'requiresTubeLaser', weight: 'tubeLaserWeightPercent', label: 'Laser tubo' },
  { key: 'requiresBending', weight: 'bendingWeightPercent', label: 'Piega' },
  { key: 'requiresWelding', weight: 'weldingWeightPercent', label: 'Saldatura/carpenteria' },
  { key: 'requiresTurning', weight: 'turningWeightPercent', label: 'Tornitura' },
  { key: 'requiresMilling', weight: 'millingWeightPercent', label: 'Fresatura' },
  { key: 'requiresAssembly', weight: 'assemblyWeightPercent', label: 'Montaggio' },
  { key: 'requiresPainting', weight: 'paintingWeightPercent', label: 'Verniciatura/trattamento' },
  { key: 'requiresTesting', weight: 'testingWeightPercent', label: 'Collaudo' },
] as const

const STATUS_LABEL: Record<WorkshopOutputStatus, string> = {
  previsto: 'Previsto',
  in_progettazione: 'In progettazione',
  pronto_rilascio: 'Pronto rilascio',
  rilasciato_produzione: 'Rilasciato produzione',
  ricevuto_officina: 'Ricevuto officina',
  sospeso: 'Sospeso',
}

const STANDARD_PROCESS_OPTIONS: WorkshopAssignmentProcess[] = [
  'laser_piano',
  'laser_tubo',
  'piegatrice',
  'saldatura',
  'tornitura',
  'fresatura',
  'montaggio',
  'verniciatura',
  'collaudo',
  'altro',
]

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

  function setStandardProcess(process: WorkshopAssignmentProcess, checked: boolean) {
    setValues((current) => {
      const existing = current.standardComponentsProcesses ?? []
      const nextProcesses = checked
        ? Array.from(new Set([...existing, process]))
        : existing.filter((item) => item !== process)
      return recalculate({ ...current, standardComponentsProcesses: nextProcesses }, machineTypes)
    })
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
      requiresTurning: machineType.defaultRequiresTurning ?? false,
      requiresMilling: machineType.defaultRequiresMilling ?? false,
      requiresAssembly: machineType.defaultRequiresAssembly,
      requiresPainting: machineType.defaultRequiresPainting,
      requiresTesting: machineType.defaultRequiresTesting,
      laserWeightPercent: machineType.defaultLaserWeightPercent,
      tubeLaserWeightPercent: machineType.defaultTubeLaserWeightPercent,
      bendingWeightPercent: machineType.defaultBendingWeightPercent,
      weldingWeightPercent: machineType.defaultWeldingWeightPercent,
      turningWeightPercent: machineType.defaultTurningWeightPercent ?? 0,
      millingWeightPercent: machineType.defaultMillingWeightPercent ?? 0,
      assemblyWeightPercent: machineType.defaultAssemblyWeightPercent,
      paintingWeightPercent: machineType.defaultPaintingWeightPercent,
      testingWeightPercent: machineType.defaultTestingWeightPercent,
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
                {PROCESS_FIELDS.map((process) => (
                  <div key={process.key} className="grid grid-cols-[1fr_82px] items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
                    <label className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(values[process.key])}
                        onChange={(event) => {
                          const checked = event.target.checked
                          setValues((current) => recalculate({
                            ...current,
                            [process.key]: checked,
                            [process.weight]: checked && (current[process.weight] ?? 0) <= 0 ? 20 : (current[process.weight] ?? 0),
                          }, machineTypes))
                        }}
                        className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                      />
                      <span className="truncate">{process.label}</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      disabled={!values[process.key]}
                      value={values[process.weight] ?? 0}
                      onChange={(event) => set(process.weight, Number(event.target.value))}
                      className="input-base h-8 px-2 text-right text-xs disabled:opacity-45"
                      aria-label={`Incidenza ${process.label}`}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Le percentuali sono incidenze relative del processo per questo output; non devono sommare per forza a 100.
              </p>
            </div>

            <section className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-900/35 p-3">
              <label className="flex items-start gap-2 text-sm font-medium text-slate-100">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900"
                  checked={Boolean(values.hasStandardComponents)}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setValues((current) => recalculate({
                      ...current,
                      hasStandardComponents: checked,
                      standardComponentsReadyFromDate: checked && !current.standardComponentsReadyFromDate
                        ? new Date().toISOString().slice(0, 10)
                        : current.standardComponentsReadyFromDate,
                      standardComponentsImpactScore: checked && (!current.standardComponentsImpactScore || current.standardComponentsImpactScore <= 0)
                        ? Math.max(0.1, Math.round((current.impactScore || values.impactScore || 1) * 2.5) / 10)
                        : current.standardComponentsImpactScore,
                    }, machineTypes))
                  }}
                />
                Sono presenti componenti/disegni standard producibili in anticipo
              </label>
              <p className="mt-2 text-[11px] text-slate-500">
                Le parti standard possono essere pianificate prima del rilascio completo della macchina, perché già note o standardizzate.
              </p>
              {values.hasStandardComponents && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <FormField label="Descrizione componenti" className="md:col-span-4">
                    <textarea rows={2} className="input-base resize-y" value={values.standardComponentsDescription ?? ''} onChange={(event) => set('standardComponentsDescription', event.target.value)} />
                  </FormField>
                  <FormField label="Quantità indicativa">
                    <input type="number" min={0} step={1} className="input-base" value={values.standardComponentsQuantity ?? 0} onChange={(event) => set('standardComponentsQuantity', Number(event.target.value))} />
                  </FormField>
                  <FormField label="Producibile da">
                    <input type="date" className="input-base" value={values.standardComponentsReadyFromDate ?? ''} onChange={(event) => set('standardComponentsReadyFromDate', event.target.value)} />
                  </FormField>
                  <FormField label="Impatto standard stimato">
                    <input type="number" min={0} step={0.1} className="input-base" value={values.standardComponentsImpactScore ?? 0} onChange={(event) => set('standardComponentsImpactScore', Number(event.target.value))} />
                  </FormField>
                  <FormField label="Processi coinvolti" className="md:col-span-4">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                      {STANDARD_PROCESS_OPTIONS.map((process) => (
                        <label key={process} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/25 px-2.5 py-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                            checked={(values.standardComponentsProcesses ?? []).includes(process)}
                            onChange={(event) => setStandardProcess(process, event.target.checked)}
                          />
                          {WORKSHOP_WORKER_SKILL_LABELS[process]}
                        </label>
                      ))}
                    </div>
                  </FormField>
                  <FormField label="Note standard" className="md:col-span-4">
                    <textarea rows={2} className="input-base resize-y" value={values.standardComponentsNotes ?? ''} onChange={(event) => set('standardComponentsNotes', event.target.value)} />
                  </FormField>
                </div>
              )}
            </section>

            <section className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-900/35 p-3">
              <label className="flex items-start gap-2 text-sm font-medium text-slate-100">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900"
                  checked={Boolean(values.hasCommercialComponents)}
                  onChange={(event) => set('hasCommercialComponents', event.target.checked)}
                />
                Sono presenti componenti commerciali
              </label>
              <p className="mt-2 text-[11px] text-slate-500">
                Questo promemoria serve a evitare la chiusura dell'output/progetto senza confermare l'acquisto dei componenti commerciali necessari.
              </p>
              {values.hasCommercialComponents && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <FormField label="Descrizione componenti commerciali" className="md:col-span-4">
                    <textarea rows={2} className="input-base resize-y" value={values.commercialComponentsDescription ?? ''} onChange={(event) => set('commercialComponentsDescription', event.target.value)} />
                  </FormField>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/25 px-2.5 py-2 text-xs text-slate-300">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-700 bg-slate-900" checked={Boolean(values.commercialComponentsOrderRequired)} onChange={(event) => set('commercialComponentsOrderRequired', event.target.checked)} />
                    Ordine richiesto
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/25 px-2.5 py-2 text-xs text-slate-300">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-700 bg-slate-900" checked={Boolean(values.commercialComponentsOrdered)} onChange={(event) => set('commercialComponentsOrdered', event.target.checked)} />
                    Componenti ordinati
                  </label>
                  <FormField label="Data ordine">
                    <input type="date" className="input-base" value={values.commercialComponentsOrderedAt ?? ''} onChange={(event) => set('commercialComponentsOrderedAt', event.target.value)} />
                  </FormField>
                  <FormField label="Ordinato da">
                    <input className="input-base" value={values.commercialComponentsOrderedBy ?? ''} onChange={(event) => set('commercialComponentsOrderedBy', event.target.value)} />
                  </FormField>
                  <FormField label="Note commerciali" className="md:col-span-4">
                    <textarea rows={2} className="input-base resize-y" value={values.commercialComponentsNotes ?? ''} onChange={(event) => set('commercialComponentsNotes', event.target.value)} />
                  </FormField>
                </div>
              )}
            </section>
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
  | 'requiresTurning'
  | 'requiresMilling'
  | 'requiresAssembly'
  | 'requiresPainting'
  | 'requiresTesting'
  | 'laserWeightPercent'
  | 'tubeLaserWeightPercent'
  | 'bendingWeightPercent'
  | 'weldingWeightPercent'
  | 'turningWeightPercent'
  | 'millingWeightPercent'
  | 'assemblyWeightPercent'
  | 'paintingWeightPercent'
  | 'testingWeightPercent'
>): string[] {
  return PROCESS_FIELDS
    .filter((process) => Boolean(output[process.key]))
    .map((process) => `${process.label} ${output[process.weight] ?? 0}%`)
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
  const normalized = {
    ...output,
    quantity: Number.isFinite(output.quantity) ? Math.max(0.1, output.quantity) : 1,
    assemblyCount: Number.isFinite(output.assemblyCount) ? Math.max(0, Math.round(output.assemblyCount)) : 0,
    estimatedPartCount: Number.isFinite(output.estimatedPartCount) ? Math.max(0, Math.round(output.estimatedPartCount)) : 0,
    laserWeightPercent: clampPercent(output.laserWeightPercent),
    tubeLaserWeightPercent: clampPercent(output.tubeLaserWeightPercent),
    bendingWeightPercent: clampPercent(output.bendingWeightPercent),
    weldingWeightPercent: clampPercent(output.weldingWeightPercent),
    turningWeightPercent: clampPercent(output.turningWeightPercent ?? 0),
    millingWeightPercent: clampPercent(output.millingWeightPercent ?? 0),
    assemblyWeightPercent: clampPercent(output.assemblyWeightPercent),
    paintingWeightPercent: clampPercent(output.paintingWeightPercent),
    testingWeightPercent: clampPercent(output.testingWeightPercent),
  }
  return {
    ...normalized,
    impactScore: calculateWorkshopImpact(normalized, machineType),
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}
