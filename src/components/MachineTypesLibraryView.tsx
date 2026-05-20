import { useMemo, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import {
  ALL_MACHINE_COMPLEXITIES,
  MACHINE_TYPE_FAMILIES,
} from '../types'
import type { MachineComplexity, MachineType } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import type { CreateMachineTypeInput } from '../services/machineTypesService'
import { Modal } from './Modal'
import { ConfirmDialog } from './ConfirmDialog'

type StatusFilter = 'active' | 'inactive' | 'all'
type ProcessKey =
  | 'defaultRequiresLaser'
  | 'defaultRequiresTubeLaser'
  | 'defaultRequiresBending'
  | 'defaultRequiresWelding'
  | 'defaultRequiresAssembly'
  | 'defaultRequiresPainting'
  | 'defaultRequiresTesting'
type ProcessWeightKey =
  | 'defaultLaserWeightPercent'
  | 'defaultTubeLaserWeightPercent'
  | 'defaultBendingWeightPercent'
  | 'defaultWeldingWeightPercent'
  | 'defaultAssemblyWeightPercent'
  | 'defaultPaintingWeightPercent'
  | 'defaultTestingWeightPercent'
type NumericMachineTypeField = 'defaultImpactWeight' | 'typicalAssemblyCount' | 'typicalPartCount' | ProcessWeightKey

const PROCESS_FIELDS: Array<{ key: ProcessKey; weight: ProcessWeightKey; label: string }> = [
  { key: 'defaultRequiresLaser', weight: 'defaultLaserWeightPercent', label: 'Laser' },
  { key: 'defaultRequiresTubeLaser', weight: 'defaultTubeLaserWeightPercent', label: 'Laser tubo' },
  { key: 'defaultRequiresBending', weight: 'defaultBendingWeightPercent', label: 'Piegatura' },
  { key: 'defaultRequiresWelding', weight: 'defaultWeldingWeightPercent', label: 'Saldatura' },
  { key: 'defaultRequiresAssembly', weight: 'defaultAssemblyWeightPercent', label: 'Montaggio' },
  { key: 'defaultRequiresPainting', weight: 'defaultPaintingWeightPercent', label: 'Verniciatura' },
  { key: 'defaultRequiresTesting', weight: 'defaultTestingWeightPercent', label: 'Collaudo' },
]

const EMPTY_FORM: CreateMachineTypeInput = {
  code: '',
  name: '',
  family: 'Generico',
  description: '',
  defaultImpactWeight: 1,
  defaultComplexity: 'media',
  defaultRequiresLaser: true,
  defaultRequiresTubeLaser: false,
  defaultRequiresBending: true,
  defaultRequiresWelding: true,
  defaultRequiresAssembly: true,
  defaultRequiresPainting: false,
  defaultRequiresTesting: false,
  defaultLaserWeightPercent: 25,
  defaultTubeLaserWeightPercent: 0,
  defaultBendingWeightPercent: 25,
  defaultWeldingWeightPercent: 25,
  defaultAssemblyWeightPercent: 25,
  defaultPaintingWeightPercent: 0,
  defaultTestingWeightPercent: 0,
  typicalAssemblyCount: 1,
  typicalPartCount: 10,
  active: true,
  notes: '',
}

export function MachineTypesLibraryView() {
  const {
    machineTypes,
    createMachineType,
    updateMachineType,
    setMachineTypeActive,
  } = useData()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [familyFilter, setFamilyFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [editing, setEditing] = useState<MachineType | null>(null)
  const [form, setForm] = useState<CreateMachineTypeInput>(EMPTY_FORM)
  const [modalOpen, setModalOpen] = useState(false)
  const [toggleTarget, setToggleTarget] = useState<MachineType | null>(null)

  const families = useMemo(() => {
    const set = new Set<string>([...MACHINE_TYPE_FAMILIES])
    machineTypes.forEach((item) => {
      if (item.family.trim()) set.add(item.family.trim())
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }))
  }, [machineTypes])

  const counts = useMemo(() => {
    const active = machineTypes.filter((item) => item.active).length
    return {
      total: machineTypes.length,
      active,
      inactive: machineTypes.length - active,
      families: new Set(machineTypes.map((item) => item.family).filter(Boolean)).size,
    }
  }, [machineTypes])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return machineTypes.filter((item) => {
      if (statusFilter === 'active' && !item.active) return false
      if (statusFilter === 'inactive' && item.active) return false
      if (familyFilter && item.family !== familyFilter) return false
      if (!q) return true
      const hay = `${item.code} ${item.name} ${item.family} ${item.description} ${item.notes}`.toLowerCase()
      return hay.includes(q)
    })
  }, [machineTypes, search, familyFilter, statusFilter])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(machineType: MachineType) {
    setEditing(machineType)
    setForm(toForm(machineType))
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  function updateField<K extends keyof CreateMachineTypeInput>(key: K, value: CreateMachineTypeInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleNumberField(key: NumericMachineTypeField) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value)
      updateField(key, Number.isFinite(value) ? value : 0)
    }
  }

  function handleSave() {
    const code = form.code.trim().toUpperCase()
    const name = form.name.trim()
    const family = form.family.trim()
    if (!code || !name || !family) {
      toast.error('Codice, nome e famiglia sono obbligatori.')
      return
    }
    const duplicate = machineTypes.some((item) => (
      item.code.trim().toUpperCase() === code && item.id !== editing?.id
    ))
    if (duplicate) {
      toast.error(`Esiste gia una tipologia con codice ${code}.`)
      return
    }
    const payload: CreateMachineTypeInput = {
      ...form,
      code,
      name,
      family,
      description: form.description.trim(),
      notes: form.notes.trim(),
      defaultImpactWeight: Math.max(0.1, form.defaultImpactWeight),
      ...normalizeFormProcessWeights(form),
      typicalAssemblyCount: Math.max(0, Math.round(form.typicalAssemblyCount)),
      typicalPartCount: Math.max(0, Math.round(form.typicalPartCount)),
    }
    if (editing) {
      updateMachineType(editing.id, payload)
      toast.success('Tipologia disegno aggiornata.')
    } else {
      createMachineType(payload)
      toast.success('Tipologia disegno creata.')
    }
    closeModal()
  }

  function confirmToggle() {
    if (!toggleTarget) return
    setMachineTypeActive(toggleTarget.id, !toggleTarget.active)
    toast.success(toggleTarget.active ? 'Tipologia disattivata.' : 'Tipologia riattivata.')
    setToggleTarget(null)
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-label">Registro disegni aziendale</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">Libreria disegni</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Tipologie macchina e default indicativi usati dal Registro Disegni INNO.TEC.
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <PlusIcon />
          Nuova tipologia
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Tipologie" value={counts.total} tone="sky" />
        <KpiCard label="Attive" value={counts.active} tone="emerald" />
        <KpiCard label="Disattivate" value={counts.inactive} tone="amber" />
        <KpiCard label="Famiglie" value={counts.families} tone="violet" />
      </div>

      <div className="rounded-xl border border-slate-800 bg-[color:var(--color-panel)] p-3">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_220px_180px]">
          <label className="min-w-0">
            <span className="sr-only">Cerca codice o nome</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input-base"
              placeholder="Cerca codice, nome o descrizione..."
            />
          </label>
          <label>
            <span className="sr-only">Famiglia</span>
            <select
              value={familyFilter}
              onChange={(event) => setFamilyFilter(event.target.value)}
              className="input-base"
            >
              <option value="">Tutte le famiglie</option>
              {families.map((family) => (
                <option key={family} value={family}>{family}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Stato</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="input-base"
            >
              <option value="active">Solo attive</option>
              <option value="inactive">Solo disattivate</option>
              <option value="all">Tutte</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-[color:var(--color-panel)]">
        <div className="overflow-x-auto scroll-thin">
          <table className="min-w-[1080px] w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Codice</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Famiglia</th>
                <th className="px-4 py-3 text-right">Peso</th>
                <th className="px-4 py-3">Complessita</th>
                <th className="px-4 py-3 text-right">Complessivi</th>
                <th className="px-4 py-3 text-right">Particolari</th>
                <th className="px-4 py-3">Processi</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((item) => (
                <tr key={item.id} className="transition hover:bg-slate-800/35">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-100">{item.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">{item.name}</div>
                    {item.description && item.description !== item.name && (
                      <div className="mt-0.5 max-w-[320px] truncate text-xs text-slate-500">{item.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{item.family}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-slate-200">{item.defaultImpactWeight.toFixed(1)}</td>
                  <td className="px-4 py-3">
                    <span className={`chip-sm ${complexityBadgeClass(item.defaultComplexity)}`}>{item.defaultComplexity}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-200">{item.typicalAssemblyCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-200">{item.typicalPartCount}</td>
                  <td className="px-4 py-3">
                    <ProcessBadges item={item} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`chip-sm ${item.active ? 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30' : 'bg-amber-500/10 text-amber-200 ring-amber-500/30'}`}>
                      {item.active ? 'Attiva' : 'Disattivata'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(item)} className="btn-ghost text-xs">Modifica</button>
                      <button
                        onClick={() => setToggleTarget(item)}
                        className={item.active ? 'btn-ghost text-xs text-amber-200' : 'btn-ghost text-xs text-emerald-200'}
                      >
                        {item.active ? 'Disattiva' : 'Riattiva'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                    Nessuna tipologia trovata con i filtri correnti.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <MachineTypeModal
        open={modalOpen}
        editing={editing}
        form={form}
        families={families}
        onClose={closeModal}
        onSave={handleSave}
        onFieldChange={updateField}
        onNumberField={handleNumberField}
      />

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        title={toggleTarget?.active ? 'Disattiva tipologia' : 'Riattiva tipologia'}
        message={
          toggleTarget
            ? `${toggleTarget.code} - ${toggleTarget.name}: la tipologia non verra cancellata, cambiera solo lo stato active.`
            : ''
        }
        confirmLabel={toggleTarget?.active ? 'Disattiva' : 'Riattiva'}
        danger={Boolean(toggleTarget?.active)}
        onConfirm={confirmToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </section>
  )
}

function MachineTypeModal({
  open,
  editing,
  form,
  families,
  onClose,
  onSave,
  onFieldChange,
  onNumberField,
}: {
  open: boolean
  editing: MachineType | null
  form: CreateMachineTypeInput
  families: string[]
  onClose: () => void
  onSave: () => void
  onFieldChange: <K extends keyof CreateMachineTypeInput>(key: K, value: CreateMachineTypeInput[K]) => void
  onNumberField: (key: NumericMachineTypeField) => (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Modifica ${editing.code}` : 'Nuova tipologia disegno'}
      subtitle="Default indicativi, modificabili e usati come base per le fasi successive"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Annulla</button>
          <button onClick={onSave} className="btn-primary">Salva tipologia</button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Codice registro">
          <input
            value={form.code}
            onChange={(event) => onFieldChange('code', event.target.value)}
            className="input-base font-mono"
            placeholder="I.RM"
          />
        </Field>
        <Field label="Famiglia">
          <input
            list="machine-type-families"
            value={form.family}
            onChange={(event) => onFieldChange('family', event.target.value)}
            className="input-base"
          />
          <datalist id="machine-type-families">
            {families.map((family) => (
              <option key={family} value={family} />
            ))}
          </datalist>
        </Field>
        <Field label="Nome">
          <input
            value={form.name}
            onChange={(event) => onFieldChange('name', event.target.value)}
            className="input-base"
            placeholder="Rulliere motorizzate"
          />
        </Field>
        <Field label="Complessita default">
          <select
            value={form.defaultComplexity}
            onChange={(event) => onFieldChange('defaultComplexity', event.target.value as MachineComplexity)}
            className="input-base"
          >
            {ALL_MACHINE_COMPLEXITIES.map((complexity) => (
              <option key={complexity} value={complexity}>{complexity}</option>
            ))}
          </select>
        </Field>
        <Field label="Peso base">
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={form.defaultImpactWeight}
            onChange={onNumberField('defaultImpactWeight')}
            className="input-base"
          />
        </Field>
        <Field label="Complessivi tipici">
          <input
            type="number"
            min="0"
            step="1"
            value={form.typicalAssemblyCount}
            onChange={onNumberField('typicalAssemblyCount')}
            className="input-base"
          />
        </Field>
        <Field label="Particolari tipici">
          <input
            type="number"
            min="0"
            step="1"
            value={form.typicalPartCount}
            onChange={onNumberField('typicalPartCount')}
            className="input-base"
          />
        </Field>
        <label className="mt-6 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => onFieldChange('active', event.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-slate-900"
          />
          Disponibile nei nuovi lavori
        </label>
        <Field label="Descrizione" className="md:col-span-2">
          <textarea
            value={form.description}
            onChange={(event) => onFieldChange('description', event.target.value)}
            className="input-base min-h-[76px] resize-y"
          />
        </Field>
        <div className="md:col-span-2">
          <div className="mb-2 section-label">Processi default</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PROCESS_FIELDS.map((process) => (
              <div key={process.key} className="grid grid-cols-[1fr_82px] items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
                <label className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(form[process.key])}
                    onChange={(event) => {
                      const checked = event.target.checked
                      onFieldChange(process.key, checked)
                      if (checked && form[process.weight] <= 0) onFieldChange(process.weight, 20)
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
                  disabled={!form[process.key]}
                  value={form[process.weight]}
                  onChange={onNumberField(process.weight)}
                  className="input-base h-8 px-2 text-right text-xs disabled:opacity-45"
                  aria-label={`Incidenza ${process.label}`}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Le percentuali pesano il singolo processo dentro quella tipologia macchina. Sono default indicativi e restano modificabili sul singolo output officina.
          </p>
        </div>
        <Field label="Note" className="md:col-span-2">
          <textarea
            value={form.notes}
            onChange={(event) => onFieldChange('notes', event.target.value)}
            className="input-base min-h-[86px] resize-y"
          />
        </Field>
      </div>
    </Modal>
  )
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`space-y-1.5 ${className}`}>
      <span className="section-label">{label}</span>
      {children}
    </label>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'sky' | 'emerald' | 'amber' | 'violet'
}) {
  const toneClass = {
    sky: 'border-sky-500/25 bg-sky-500/8 text-sky-200',
    emerald: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-200',
    amber: 'border-amber-500/25 bg-amber-500/8 text-amber-200',
    violet: 'border-violet-500/25 bg-violet-500/8 text-violet-200',
  }[tone]
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-75">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function ProcessBadges({ item }: { item: MachineType }) {
  const labels = PROCESS_FIELDS
    .filter((process) => item[process.key])
    .map((process) => `${process.label} ${item[process.weight]}%`)

  if (labels.length === 0) return <span className="text-xs text-slate-500">Nessuno</span>

  return (
    <div className="flex max-w-[260px] flex-wrap gap-1">
      {labels.map((label) => (
        <span key={label} className="chip-sm bg-slate-500/10 text-slate-300 ring-slate-500/25">{label}</span>
      ))}
    </div>
  )
}

function normalizeFormProcessWeights(form: CreateMachineTypeInput): Pick<
  MachineType,
  | 'defaultLaserWeightPercent'
  | 'defaultTubeLaserWeightPercent'
  | 'defaultBendingWeightPercent'
  | 'defaultWeldingWeightPercent'
  | 'defaultAssemblyWeightPercent'
  | 'defaultPaintingWeightPercent'
  | 'defaultTestingWeightPercent'
> {
  const active = PROCESS_FIELDS.filter((process) => form[process.key])
  const fallback = active.length > 0 ? Math.round(100 / active.length) : 0
  return Object.fromEntries(
    PROCESS_FIELDS.map((process) => [
      process.weight,
      form[process.key] ? clampPercent(form[process.weight], fallback) : 0,
    ]),
  ) as Pick<
    MachineType,
    | 'defaultLaserWeightPercent'
    | 'defaultTubeLaserWeightPercent'
    | 'defaultBendingWeightPercent'
    | 'defaultWeldingWeightPercent'
    | 'defaultAssemblyWeightPercent'
    | 'defaultPaintingWeightPercent'
    | 'defaultTestingWeightPercent'
  >
}

function clampPercent(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, Math.round(value)))
}

function complexityBadgeClass(complexity: MachineComplexity): string {
  if (complexity === 'bassa') return 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30'
  if (complexity === 'media') return 'bg-sky-500/10 text-sky-200 ring-sky-500/30'
  if (complexity === 'alta') return 'bg-amber-500/10 text-amber-200 ring-amber-500/30'
  return 'bg-red-500/10 text-red-200 ring-red-500/30'
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function toForm(machineType: MachineType): CreateMachineTypeInput {
  return {
    code: machineType.code,
    name: machineType.name,
    family: machineType.family,
    description: machineType.description,
    defaultImpactWeight: machineType.defaultImpactWeight,
    defaultComplexity: machineType.defaultComplexity,
    defaultRequiresLaser: machineType.defaultRequiresLaser,
    defaultRequiresTubeLaser: machineType.defaultRequiresTubeLaser,
    defaultRequiresBending: machineType.defaultRequiresBending,
    defaultRequiresWelding: machineType.defaultRequiresWelding,
    defaultRequiresAssembly: machineType.defaultRequiresAssembly,
    defaultRequiresPainting: machineType.defaultRequiresPainting,
    defaultRequiresTesting: machineType.defaultRequiresTesting,
    defaultLaserWeightPercent: machineType.defaultLaserWeightPercent,
    defaultTubeLaserWeightPercent: machineType.defaultTubeLaserWeightPercent,
    defaultBendingWeightPercent: machineType.defaultBendingWeightPercent,
    defaultWeldingWeightPercent: machineType.defaultWeldingWeightPercent,
    defaultAssemblyWeightPercent: machineType.defaultAssemblyWeightPercent,
    defaultPaintingWeightPercent: machineType.defaultPaintingWeightPercent,
    defaultTestingWeightPercent: machineType.defaultTestingWeightPercent,
    typicalAssemblyCount: machineType.typicalAssemblyCount,
    typicalPartCount: machineType.typicalPartCount,
    active: machineType.active,
    notes: machineType.notes,
  }
}
