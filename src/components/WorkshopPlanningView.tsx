import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ALL_WORKSHOP_ASSIGNMENT_STATUSES,
  ALL_WORKSHOP_WORKER_SKILLS,
  WORKSHOP_ASSIGNMENT_STATUS_LABELS,
  WORKSHOP_WORKER_SKILL_LABELS,
} from '../types'
import type {
  WorkItem,
  WorkshopAssignment,
  WorkshopAssignmentProcess,
  WorkshopAssignmentStatus,
  WorkshopOutput,
  WorkshopWorker,
} from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import type { WorkshopAssignmentDraft } from '../services/workshopAssignmentsService'
import {
  WORKSHOP_ASSIGNMENT_PROCESS_LABELS,
  aggregateWorkerLoadByDay,
  aggregateWorkerLoadByWeek,
  aggregateWorkerLoadByMonth,
  estimateProcessLoadPoints,
  getAssignableWorkersForProcess,
  getAssignmentCoverageForOutput,
  getMonthWeeks,
  getOutputRequiredProcesses,
  getWeekDays,
  getWorkerLoadLevel,
  saturationScore10,
} from '../utils/workshopCapacity'
import { formatISODate, formatItalianShort, parseISODate, startOfWeek, todayISO } from '../utils/dates'
import { Modal } from './Modal'
import { ConfirmDialog } from './ConfirmDialog'
import { WorkItemDetailDrawer } from './WorkItemDetailDrawer'

type AssignmentStatusFilter = WorkshopAssignmentStatus | ''
type ProcessFilter = WorkshopAssignmentProcess | ''
type PlanningViewMode = 'daily' | 'weekly' | 'monthly'

const VIEW_MODE_OPTIONS: Array<{ value: PlanningViewMode; label: string }> = [
  { value: 'daily', label: 'Giornaliera' },
  { value: 'weekly', label: 'Settimanale' },
  { value: 'monthly', label: 'Mensile' },
]

const MONTH_LABELS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

interface OutputCard {
  output: WorkshopOutput
  workItem?: WorkItem
  coverage: ReturnType<typeof getAssignmentCoverageForOutput>
}

interface AssignmentRowDraft extends WorkshopAssignmentDraft {
  key: string
  required: boolean
  deleted?: boolean
}

const LEVEL_CLASS = {
  disponibile: 'bg-emerald-500',
  normale: 'bg-sky-500',
  pieno: 'bg-amber-500',
  sovraccarico: 'bg-red-500',
} as const

const LEVEL_TEXT = {
  disponibile: 'text-emerald-200',
  normale: 'text-sky-200',
  pieno: 'text-amber-200',
  sovraccarico: 'text-red-200',
} as const

export function WorkshopPlanningView() {
  const {
    data,
    workshopAssignments,
    workshopOutputs,
    workshopWorkers,
    replaceWorkshopAssignmentsForOutput,
    setWorkshopAssignmentStatus,
    deleteWorkshopAssignment,
  } = useData()
  const toast = useToast()
  const [viewMode, setViewMode] = useState<PlanningViewMode>('weekly')
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [weekStart, setWeekStart] = useState(formatISODate(startOfWeek(new Date())))
  const [monthAnchor, setMonthAnchor] = useState(todayISO())
  const [processFilter, setProcessFilter] = useState<ProcessFilter>('')
  const [workerFilter, setWorkerFilter] = useState('')
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<AssignmentStatusFilter>('')
  const [query, setQuery] = useState('')
  const [onlyOverloads, setOnlyOverloads] = useState(false)
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)
  const [assigningOutputId, setAssigningOutputId] = useState<string | null>(null)
  const [drawerWorkItemId, setDrawerWorkItemId] = useState<string | null>(null)
  const [detailWorkerId, setDetailWorkerId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WorkshopAssignment | null>(null)

  const workItemById = useMemo(() => new Map(data.workItems.map((workItem) => [workItem.id, workItem])), [data.workItems])
  const workerById = useMemo(() => new Map(workshopWorkers.map((worker) => [worker.id, worker])), [workshopWorkers])
  const outputById = useMemo(() => new Map(workshopOutputs.map((output) => [output.id, output])), [workshopOutputs])
  const outputCards = useMemo<OutputCard[]>(() => workshopOutputs.map((output) => ({
    output,
    workItem: workItemById.get(output.workItemId),
    coverage: getAssignmentCoverageForOutput(output, workshopAssignments),
  })), [workshopOutputs, workItemById, workshopAssignments])

  const filteredOutputCards = useMemo(() => {
    const q = query.trim().toLowerCase()
    return outputCards.filter((card) => {
      if (card.output.status === 'sospeso') return false
      if (card.coverage.requiredProcesses.length === 0) return false
      if (card.coverage.status === 'assegnato') return false
      if (onlyUnassigned && card.coverage.status !== 'non_assegnato') return false
      if (processFilter && !card.coverage.requiredProcesses.includes(processFilter)) return false
      const outputDate = getOutputPlanningDate(card.output, card.workItem)
      if (outputDate && formatISODate(startOfWeek(parseISODate(outputDate))) !== weekStart) return false
      if (q) {
        const hay = `${card.workItem?.code ?? ''} ${card.workItem?.customer ?? ''} ${card.workItem?.title ?? ''} ${card.output.machineTypeCode} ${card.output.machineTypeName} ${card.output.description}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [outputCards, query, processFilter, onlyUnassigned, weekStart])

  const stationFilter = processFilter || undefined

  const dailyLoads = useMemo(() => {
    const rows = aggregateWorkerLoadByDay(workshopAssignments, workshopWorkers, selectedDate, stationFilter)
    return onlyOverloads ? rows.filter((row) => row.level === 'sovraccarico') : rows
  }, [workshopAssignments, workshopWorkers, selectedDate, onlyOverloads, stationFilter])

  const weeklyLoads = useMemo(() => {
    const rows = aggregateWorkerLoadByWeek(workshopAssignments, workshopWorkers, weekStart, stationFilter)
    return onlyOverloads ? rows.filter((row) => row.level === 'sovraccarico') : rows
  }, [workshopAssignments, workshopWorkers, weekStart, onlyOverloads, stationFilter])

  const monthlyLoads = useMemo(() => {
    const rows = aggregateWorkerLoadByMonth(workshopAssignments, workshopWorkers, monthAnchor, stationFilter)
    return onlyOverloads ? rows.filter((row) => row.level === 'sovraccarico') : rows
  }, [workshopAssignments, workshopWorkers, monthAnchor, onlyOverloads, stationFilter])

  const stationLabel = stationFilter ? WORKSHOP_ASSIGNMENT_PROCESS_LABELS[stationFilter] : ''

  const filteredAssignments = useMemo(() => {
    const q = query.trim().toLowerCase()
    return workshopAssignments.filter((assignment) => {
      const worker = workerById.get(assignment.workerId)
      const output = outputById.get(assignment.workshopOutputId)
      const workItem = output ? workItemById.get(output.workItemId) : undefined
      if (assignment.plannedWeek !== weekStart) return false
      if (processFilter && assignment.process !== processFilter) return false
      if (workerFilter && assignment.workerId !== workerFilter) return false
      if (assignmentStatusFilter && assignment.status !== assignmentStatusFilter) return false
      if (q) {
        const hay = `${worker?.displayName ?? ''} ${workItem?.code ?? ''} ${workItem?.customer ?? ''} ${workItem?.title ?? ''} ${output?.machineTypeCode ?? ''} ${output?.machineTypeName ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [workshopAssignments, workerById, outputById, workItemById, processFilter, workerFilter, assignmentStatusFilter, query, weekStart])

  const assigningOutput = assigningOutputId ? workshopOutputs.find((output) => output.id === assigningOutputId) ?? null : null
  const detailWorker = detailWorkerId ? workshopWorkers.find((worker) => worker.id === detailWorkerId) ?? null : null
  const detailAssignments = detailWorker
    ? workshopAssignments.filter((assignment) => assignment.workerId === detailWorker.id && assignment.plannedDate === selectedDate)
    : []

  function confirmDelete() {
    if (!deleteTarget) return
    deleteWorkshopAssignment(deleteTarget.id)
    toast.success('Assegnazione officina eliminata.')
    setDeleteTarget(null)
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-label">Produzione</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">Pianificazione officina</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Assegna processi degli output officina agli operai e controlla la saturazione relativa per giorno, settimana e mese.
          </p>
        </div>
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          Saturazione su scala <strong>0–10</strong> (10 = piena). Non sono ore: è un indice relativo di carico produttivo.
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-800 bg-[color:var(--color-surface-1)] p-0.5 text-xs">
          {VIEW_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setViewMode(option.value)}
              aria-pressed={viewMode === option.value}
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                viewMode === option.value ? 'bg-slate-700/80 text-slate-100 shadow-inner' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {viewMode === 'daily' && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-400">
            Giorno
            <input type="date" className="input-base w-auto text-xs" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </label>
        )}
        {viewMode === 'weekly' && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-400">
            Settimana
            <input type="date" className="input-base w-auto text-xs" value={weekStart} onChange={(event) => setWeekStart(formatISODate(startOfWeek(parseISODate(event.target.value))))} />
          </label>
        )}
        {viewMode === 'monthly' && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-400">
            Mese
            <input
              type="month"
              className="input-base w-auto text-xs"
              value={monthAnchor.slice(0, 7)}
              onChange={(event) => setMonthAnchor(event.target.value ? `${event.target.value}-01` : todayISO())}
            />
          </label>
        )}
      </div>

      <FiltersPanel
        selectedDate={selectedDate}
        weekStart={weekStart}
        processFilter={processFilter}
        workerFilter={workerFilter}
        assignmentStatusFilter={assignmentStatusFilter}
        query={query}
        onlyOverloads={onlyOverloads}
        onlyUnassigned={onlyUnassigned}
        workers={workshopWorkers}
        onSelectedDateChange={setSelectedDate}
        onWeekStartChange={setWeekStart}
        onProcessFilterChange={setProcessFilter}
        onWorkerFilterChange={setWorkerFilter}
        onAssignmentStatusFilterChange={setAssignmentStatusFilter}
        onQueryChange={setQuery}
        onOnlyOverloadsChange={setOnlyOverloads}
        onOnlyUnassignedChange={setOnlyUnassigned}
      />

      <OutputToAssignSection
        cards={filteredOutputCards}
        assignments={workshopAssignments}
        onAssign={(outputId) => setAssigningOutputId(outputId)}
        onWorkItemClick={setDrawerWorkItemId}
      />

      {viewMode === 'daily' && (
        <DailyLoadSection
          rows={dailyLoads}
          date={selectedDate}
          stationLabel={stationLabel}
          onWorkerClick={setDetailWorkerId}
        />
      )}

      {viewMode === 'weekly' && (
        <WeeklyLoadSection
          rows={weeklyLoads}
          assignments={workshopAssignments}
          weekStart={weekStart}
          stationFilter={stationFilter}
          stationLabel={stationLabel}
          onDayClick={(day) => {
            setSelectedDate(day)
            setWeekStart(formatISODate(startOfWeek(parseISODate(day))))
            setViewMode('daily')
          }}
        />
      )}

      {viewMode === 'monthly' && (
        <MonthlyLoadSection
          rows={monthlyLoads}
          monthAnchor={monthAnchor}
          stationLabel={stationLabel}
          onWeekClick={(weekStartISO) => {
            setWeekStart(weekStartISO)
            setViewMode('weekly')
          }}
        />
      )}

      <AssignmentsTable
        assignments={filteredAssignments}
        workers={workerById}
        outputs={outputById}
        workItems={workItemById}
        onEdit={(outputId) => setAssigningOutputId(outputId)}
        onComplete={(id) => setWorkshopAssignmentStatus(id, 'completato')}
        onSuspend={(id) => setWorkshopAssignmentStatus(id, 'sospeso')}
        onDelete={setDeleteTarget}
      />

      {assigningOutput && (
        <AssignWorkshopOutputModal
          open={Boolean(assigningOutput)}
          output={assigningOutput}
          workItem={workItemById.get(assigningOutput.workItemId)}
          workers={workshopWorkers}
          assignments={workshopAssignments.filter((assignment) => assignment.workshopOutputId === assigningOutput.id)}
          defaultDate={assigningOutput.plannedReleaseDate || workItemById.get(assigningOutput.workItemId)?.plannedProductionReleaseDate || assigningOutput.actualReleaseDate || selectedDate}
          onClose={() => setAssigningOutputId(null)}
          onSave={(drafts) => {
            replaceWorkshopAssignmentsForOutput(assigningOutput.id, drafts)
            toast.success('Assegnazioni officina salvate.')
            setAssigningOutputId(null)
          }}
        />
      )}

      {detailWorker && (
        <WorkerDayDetailModal
          worker={detailWorker}
          date={selectedDate}
          assignments={detailAssignments}
          outputById={outputById}
          workItemById={workItemById}
          onClose={() => setDetailWorkerId(null)}
          onEdit={(outputId) => {
            setDetailWorkerId(null)
            setAssigningOutputId(outputId)
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminare assegnazione?"
        message="L'assegnazione verra rimossa dalla pianificazione officina. Output, commessa e operaio restano invariati."
        confirmLabel="Elimina"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <WorkItemDetailDrawer workItemId={drawerWorkItemId} onClose={() => setDrawerWorkItemId(null)} />
    </section>
  )
}

function FiltersPanel({
  selectedDate,
  weekStart,
  processFilter,
  workerFilter,
  assignmentStatusFilter,
  query,
  onlyOverloads,
  onlyUnassigned,
  workers,
  onSelectedDateChange,
  onWeekStartChange,
  onProcessFilterChange,
  onWorkerFilterChange,
  onAssignmentStatusFilterChange,
  onQueryChange,
  onOnlyOverloadsChange,
  onOnlyUnassignedChange,
}: {
  selectedDate: string
  weekStart: string
  processFilter: ProcessFilter
  workerFilter: string
  assignmentStatusFilter: AssignmentStatusFilter
  query: string
  onlyOverloads: boolean
  onlyUnassigned: boolean
  workers: WorkshopWorker[]
  onSelectedDateChange: (value: string) => void
  onWeekStartChange: (value: string) => void
  onProcessFilterChange: (value: ProcessFilter) => void
  onWorkerFilterChange: (value: string) => void
  onAssignmentStatusFilterChange: (value: AssignmentStatusFilter) => void
  onQueryChange: (value: string) => void
  onOnlyOverloadsChange: (value: boolean) => void
  onOnlyUnassignedChange: (value: boolean) => void
}) {
  return (
    <div className="panel grid grid-cols-1 gap-2 p-3 lg:grid-cols-[160px_160px_180px_180px_170px_1fr]">
      <Field label="Giorno">
        <input type="date" className="input-base" value={selectedDate} onChange={(event) => onSelectedDateChange(event.target.value)} />
      </Field>
      <Field label="Settimana">
        <input type="date" className="input-base" value={weekStart} onChange={(event) => onWeekStartChange(formatISODate(startOfWeek(parseISODate(event.target.value))))} />
      </Field>
      <Field label="Processo">
        <select className="input-base" value={processFilter} onChange={(event) => onProcessFilterChange(event.target.value as ProcessFilter)}>
          <option value="">Tutti</option>
          {ALL_WORKSHOP_WORKER_SKILLS.map((process) => (
            <option key={process} value={process}>{WORKSHOP_ASSIGNMENT_PROCESS_LABELS[process]}</option>
          ))}
        </select>
      </Field>
      <Field label="Operaio">
        <select className="input-base" value={workerFilter} onChange={(event) => onWorkerFilterChange(event.target.value)}>
          <option value="">Tutti</option>
          {workers.map((worker) => (
            <option key={worker.id} value={worker.id}>{worker.displayName}</option>
          ))}
        </select>
      </Field>
      <Field label="Stato assegnazione">
        <select className="input-base" value={assignmentStatusFilter} onChange={(event) => onAssignmentStatusFilterChange(event.target.value as AssignmentStatusFilter)}>
          <option value="">Tutti</option>
          {ALL_WORKSHOP_ASSIGNMENT_STATUSES.map((status) => (
            <option key={status} value={status}>{WORKSHOP_ASSIGNMENT_STATUS_LABELS[status]}</option>
          ))}
        </select>
      </Field>
      <Field label="Cerca">
        <input className="input-base" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Commessa, cliente, output..." />
      </Field>
      <div className="flex flex-wrap gap-2 lg:col-span-6">
        <Toggle checked={onlyOverloads} onChange={onOnlyOverloadsChange}>Solo sovraccarichi</Toggle>
        <Toggle checked={onlyUnassigned} onChange={onOnlyUnassignedChange}>Solo output non assegnati</Toggle>
      </div>
    </div>
  )
}

function OutputToAssignSection({
  cards,
  assignments,
  onAssign,
  onWorkItemClick,
}: {
  cards: OutputCard[]
  assignments: WorkshopAssignment[]
  onAssign: (outputId: string) => void
  onWorkItemClick: (workItemId: string) => void
}) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Output da assegnare" subtitle={`${cards.length} output con processi non completamente coperti`} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {cards.map((card) => (
          <OutputAssignmentCard
            key={card.output.id}
            card={card}
            assignments={assignments.filter((assignment) => assignment.workshopOutputId === card.output.id)}
            onAssign={() => onAssign(card.output.id)}
            onWorkItemClick={() => card.workItem && onWorkItemClick(card.workItem.id)}
          />
        ))}
        {cards.length === 0 && (
          <div className="panel border-dashed border-slate-700 p-8 text-center text-sm text-slate-500 xl:col-span-2">
            Nessun output da assegnare con i filtri correnti.
          </div>
        )}
      </div>
    </section>
  )
}

function OutputAssignmentCard({
  card,
  assignments,
  onAssign,
  onWorkItemClick,
}: {
  card: OutputCard
  assignments: WorkshopAssignment[]
  onAssign: () => void
  onWorkItemClick: () => void
}) {
  const { output, workItem, coverage } = card
  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300">{workItem?.code ?? 'Senza commessa'}</span>
            <span>{workItem?.customer ?? '-'}</span>
            <CoverageBadge status={coverage.status} />
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-100">{output.machineTypeCode} - {output.machineTypeName}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-400">{output.description || workItem?.title || 'Output officina'}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Impatto</div>
          <div className="text-2xl font-semibold tabular-nums text-slate-100">{output.impactScore.toFixed(1)}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400 md:grid-cols-4">
        <Info label="Quantita" value={String(output.quantity)} />
        <Info label="Previsto" value={output.plannedReleaseDate || '-'} />
        <Info label="Stato" value={output.status} />
        <Info label="Assegnazioni" value={String(assignments.length)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {coverage.requiredProcesses.map((process) => (
          <ProcessCoverageBadge key={process} process={process} status={coverage.processStatus[process]} />
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {workItem && <button className="btn-ghost text-xs" onClick={onWorkItemClick}>Vedi commessa</button>}
        <button className="btn-primary text-xs" onClick={onAssign}>Assegna</button>
      </div>
    </div>
  )
}

function AssignWorkshopOutputModal({
  open,
  output,
  workItem,
  workers,
  assignments,
  defaultDate,
  onClose,
  onSave,
}: {
  open: boolean
  output: WorkshopOutput
  workItem?: WorkItem
  workers: WorkshopWorker[]
  assignments: WorkshopAssignment[]
  defaultDate: string
  onClose: () => void
  onSave: (drafts: WorkshopAssignmentDraft[]) => void
}) {
  const requiredProcesses = getOutputRequiredProcesses(output)
  const [rows, setRows] = useState<AssignmentRowDraft[]>(() => initialRows(output, assignments, defaultDate))

  function updateRow<K extends keyof AssignmentRowDraft>(key: string, field: K, value: AssignmentRowDraft[K]) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row))
  }

  function addManualRow() {
    const process: WorkshopAssignmentProcess = 'altro'
    setRows((current) => [
      ...current,
      {
        key: `new_${Date.now()}`,
        workshopOutputId: output.id,
        workItemId: output.workItemId,
        workerId: '',
        process,
        plannedDate: defaultDate || todayISO(),
        loadPoints: estimateProcessLoadPoints(output, process),
        status: 'pianificato',
        notes: '',
        required: false,
      },
    ])
  }

  function save() {
    onSave(rows.filter((row) => !row.deleted).map((row) => ({
      id: row.id,
      workshopOutputId: row.workshopOutputId,
      workItemId: row.workItemId,
      workerId: row.workerId,
      process: row.process,
      plannedDate: row.plannedDate,
      plannedWeek: row.plannedWeek,
      loadPoints: row.loadPoints,
      status: row.status,
      notes: row.notes,
    })))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assegna output officina"
      subtitle={`${workItem?.code ?? 'Commessa'} - ${output.machineTypeCode} ${output.machineTypeName}`}
      size="xl"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn-primary" onClick={save}>Salva assegnazioni</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/35 p-3 text-sm md:grid-cols-5">
          <Info label="Cliente" value={workItem?.customer ?? '-'} />
          <Info label="Tipologia" value={`${output.machineTypeCode} - ${output.machineTypeName}`} />
          <Info label="Impatto" value={output.impactScore.toFixed(1)} />
          <Info label="Previsto" value={output.plannedReleaseDate || defaultDate || '-'} />
          <Info label="Processi" value={String(requiredProcesses.length)} />
        </div>
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          I punti carico non sono ore. Il valore suggerito distribuisce l'impactScore sui processi richiesti e resta modificabile.
        </div>
        <div className="space-y-2">
          {rows.map((row) => (
            <AssignmentProcessRow
              key={row.key}
              row={row}
              output={output}
              workers={workers}
              onChange={updateRow}
            />
          ))}
        </div>
        <button className="btn-ghost text-xs" onClick={addManualRow}>
          <PlusIcon />
          Aggiungi processo manuale
        </button>
      </div>
    </Modal>
  )
}

function AssignmentProcessRow({
  row,
  output,
  workers,
  onChange,
}: {
  row: AssignmentRowDraft
  output: WorkshopOutput
  workers: WorkshopWorker[]
  onChange: <K extends keyof AssignmentRowDraft>(key: string, field: K, value: AssignmentRowDraft[K]) => void
}) {
  const compatible = getAssignableWorkersForProcess(row.process, workers)
  const activeWorkers = workers.filter((worker) => worker.active)
  const selectedWorker = workers.find((worker) => worker.id === row.workerId)
  const incompatible = Boolean(selectedWorker && !selectedWorker.skills.includes(row.process))
  const orderedWorkers = [
    ...compatible,
    ...activeWorkers.filter((worker) => !compatible.some((c) => c.id === worker.id)),
  ]
  return (
    <div className={`rounded-xl border p-3 ${row.deleted ? 'border-red-500/30 bg-red-500/8 opacity-60' : 'border-slate-800 bg-slate-900/35'}`}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[170px_1fr_150px_120px_150px_1fr_90px]">
        <Field label={row.required ? 'Processo richiesto' : 'Processo'}>
          <select
            className="input-base"
            value={row.process}
            disabled={row.required}
            onChange={(event) => {
              const process = event.target.value as WorkshopAssignmentProcess
              onChange(row.key, 'process', process)
              onChange(row.key, 'loadPoints', estimateProcessLoadPoints(output, process))
            }}
          >
            {ALL_WORKSHOP_WORKER_SKILLS.map((process) => (
              <option key={process} value={process}>{WORKSHOP_ASSIGNMENT_PROCESS_LABELS[process]}</option>
            ))}
          </select>
        </Field>
        <Field label="Operaio">
          <select className="input-base" value={row.workerId} onChange={(event) => onChange(row.key, 'workerId', event.target.value)}>
            <option value="">Non assegnato</option>
            {orderedWorkers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.displayName}{worker.skills.includes(row.process) ? '' : ' (non abilitato)'}
              </option>
            ))}
          </select>
          {compatible.length > 0 && (
            <div className="mt-1 truncate text-[10px] text-slate-500">
              Compatibili: {compatible.slice(0, 3).map((worker) => worker.displayName).join(', ')}
            </div>
          )}
          {incompatible && <div className="mt-1 text-[10px] text-amber-200">Operaio non abilitato a questa mansione.</div>}
        </Field>
        <Field label="Data">
          <input type="date" className="input-base" value={row.plannedDate} onChange={(event) => onChange(row.key, 'plannedDate', event.target.value)} />
        </Field>
        <Field label="Punti">
          <input type="number" min={0.1} step={0.1} className="input-base" value={row.loadPoints} onChange={(event) => onChange(row.key, 'loadPoints', Number(event.target.value))} />
        </Field>
        <Field label="Stato">
          <select className="input-base" value={row.status} onChange={(event) => onChange(row.key, 'status', event.target.value as WorkshopAssignmentStatus)}>
            {ALL_WORKSHOP_ASSIGNMENT_STATUSES.map((status) => (
              <option key={status} value={status}>{WORKSHOP_ASSIGNMENT_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <input className="input-base" value={row.notes} onChange={(event) => onChange(row.key, 'notes', event.target.value)} />
        </Field>
        <div className="flex items-end">
          <button
            className={row.deleted ? 'btn-ghost text-xs text-emerald-200' : 'btn-ghost text-xs text-red-200'}
            onClick={() => onChange(row.key, 'deleted', !row.deleted)}
          >
            {row.deleted ? 'Ripristina' : 'Cancella'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DailyLoadSection({
  rows,
  date,
  stationLabel,
  onWorkerClick,
}: {
  rows: ReturnType<typeof aggregateWorkerLoadByDay>
  date: string
  stationLabel?: string
  onWorkerClick: (workerId: string) => void
}) {
  return (
    <section className="space-y-3">
      <SectionHeader
        title={stationLabel ? `Occupazione giornaliera · ${stationLabel}` : 'Occupazione giornaliera'}
        subtitle={stationLabel ? `${formatItalianShort(date)} · solo operai con skill ${stationLabel}` : formatItalianShort(date)}
      />
      {rows.length === 0 && (
        <div className="panel px-3 py-6 text-center text-[12px] text-slate-500">
          Nessun operaio {stationLabel ? `abilitato a ${stationLabel} ` : ''}con questi filtri.
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {rows.map((row) => (
          <WorkerLoadBar
            key={row.worker.id}
            worker={row.worker}
            loadPoints={row.loadPoints}
            capacityPoints={row.capacityPoints}
            percent={row.percent}
            level={row.level}
            onClick={() => onWorkerClick(row.worker.id)}
            subtitle={`${row.assignments.length} assegnazioni`}
          />
        ))}
      </div>
    </section>
  )
}

function WeeklyLoadSection({
  rows,
  assignments,
  weekStart,
  stationFilter,
  stationLabel,
  onDayClick,
}: {
  rows: ReturnType<typeof aggregateWorkerLoadByWeek>
  assignments: WorkshopAssignment[]
  weekStart: string
  stationFilter?: WorkshopAssignmentProcess
  stationLabel?: string
  onDayClick: (date: string) => void
}) {
  const days = getWeekDays(weekStart)
  return (
    <section className="space-y-3">
      <SectionHeader
        title={stationLabel ? `Occupazione settimanale · ${stationLabel}` : 'Occupazione settimanale'}
        subtitle={stationLabel ? `Settimana dal ${formatItalianShort(weekStart)} · solo skill ${stationLabel}` : `Settimana dal ${formatItalianShort(weekStart)}`}
      />
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="table-head border-b border-slate-800">
              <tr>
                <th className="px-3 py-2.5 text-left">Operaio</th>
                {days.map((day) => <th key={day} className="px-3 py-2.5 text-left">{formatItalianShort(day)}</th>)}
                <th className="px-3 py-2.5 text-right">Totale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((row) => (
                <tr key={row.worker.id} className="table-row">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-100">{row.worker.displayName}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">{skillSummary(row.worker)}</div>
                  </td>
                  {days.map((day) => {
                    const dayLoad = assignments
                      .filter((assignment) => (
                        assignment.workerId === row.worker.id &&
                        assignment.plannedDate === day &&
                        assignment.status !== 'sospeso' &&
                        (!stationFilter || assignment.process === stationFilter)
                      ))
                      .reduce((sum, assignment) => sum + assignment.loadPoints, 0)
                    const percent = row.worker.dailyCapacityPoints > 0 ? Math.round((dayLoad / row.worker.dailyCapacityPoints) * 100) : 0
                    const level = getWorkerLoadLevel(percent)
                    return (
                      <td key={day} className="px-3 py-2.5">
                        <button className="w-full text-left" onClick={() => onDayClick(day)} title={`${percent}%`}>
                          <MiniBar percent={percent} level={level} />
                          <div className={`mt-1 text-[10px] tabular-nums ${LEVEL_TEXT[level]}`}>{saturationScore10(percent).toFixed(1)}/10</div>
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-right">
                    <div className={`font-semibold tabular-nums ${LEVEL_TEXT[row.level]}`}>
                      {saturationScore10(row.percent).toFixed(1)}<span className="text-[10px] font-normal opacity-70">/10</span>
                    </div>
                    <div className="text-[10px] text-slate-500">{row.loadPoints}/{row.capacityPoints} pt · {row.percent}%</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function MonthlyLoadSection({
  rows,
  monthAnchor,
  stationLabel,
  onWeekClick,
}: {
  rows: ReturnType<typeof aggregateWorkerLoadByMonth>
  monthAnchor: string
  stationLabel?: string
  onWeekClick: (weekStartISO: string) => void
}) {
  const weeks = getMonthWeeks(monthAnchor)
  const anchor = parseISODate(monthAnchor)
  const monthLabel = `${MONTH_LABELS[anchor.getMonth()]} ${anchor.getFullYear()}`
  const title = stationLabel ? `Occupazione mensile · ${stationLabel}` : 'Occupazione mensile'
  if (rows.length === 0) {
    return (
      <section className="space-y-3">
        <SectionHeader title={title} subtitle={monthLabel} />
        <div className="panel px-3 py-8 text-center text-[12px] text-slate-500">
          Nessun operaio {stationLabel ? `abilitato a ${stationLabel} ` : 'attivo '}con questi filtri nel mese selezionato.
        </div>
      </section>
    )
  }
  return (
    <section className="space-y-3">
      <SectionHeader title={title} subtitle={`${monthLabel} · ${weeks.length} settimane${stationLabel ? ` · solo skill ${stationLabel}` : ''}`} />
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="table-head border-b border-slate-800">
              <tr>
                <th className="px-3 py-2.5 text-left">Operaio</th>
                {weeks.map((weekStartISO, index) => (
                  <th key={weekStartISO} className="px-3 py-2.5 text-left">
                    S{rows[0]?.weeks[index]?.weekIso ?? ''}
                    <span className="ml-1 font-normal normal-case text-slate-500">{formatItalianShort(weekStartISO)}</span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right">Totale mese</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((row) => (
                <tr key={row.worker.id} className="table-row">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-100">{row.worker.displayName}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">{skillSummary(row.worker)}</div>
                  </td>
                  {row.weeks.map((cell) => (
                    <td key={cell.weekStart} className="px-3 py-2.5">
                      <button className="w-full text-left" onClick={() => onWeekClick(cell.weekStart)} title={`${cell.loadPoints} / ${cell.capacityPoints} punti · ${cell.percent}%`}>
                        <MiniBar percent={cell.percent} level={cell.level} />
                        <div className={`mt-1 text-[10px] tabular-nums ${LEVEL_TEXT[cell.level]}`}>{saturationScore10(cell.percent).toFixed(1)}/10</div>
                      </button>
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right">
                    <div className={`font-semibold tabular-nums ${LEVEL_TEXT[row.level]}`}>
                      {saturationScore10(row.percent).toFixed(1)}<span className="text-[10px] font-normal opacity-70">/10</span>
                    </div>
                    <div className="text-[10px] text-slate-500">{row.loadPoints}/{row.capacityPoints} pt · {row.percent}% mese</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function AssignmentsTable({
  assignments,
  workers,
  outputs,
  workItems,
  onEdit,
  onComplete,
  onSuspend,
  onDelete,
}: {
  assignments: WorkshopAssignment[]
  workers: Map<string, WorkshopWorker>
  outputs: Map<string, WorkshopOutput>
  workItems: Map<string, WorkItem>
  onEdit: (outputId: string) => void
  onComplete: (id: string) => void
  onSuspend: (id: string) => void
  onDelete: (assignment: WorkshopAssignment) => void
}) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Assegnazioni officina" subtitle={`${assignments.length} righe pianificate`} />
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="table-head border-b border-slate-800">
              <tr>
                <th className="px-3 py-2.5 text-left">Data</th>
                <th className="px-3 py-2.5 text-left">Operaio</th>
                <th className="px-3 py-2.5 text-left">Processo</th>
                <th className="px-3 py-2.5 text-left">Commessa</th>
                <th className="px-3 py-2.5 text-left">Cliente</th>
                <th className="px-3 py-2.5 text-left">Output</th>
                <th className="px-3 py-2.5 text-right">Punti</th>
                <th className="px-3 py-2.5 text-left">Stato</th>
                <th className="px-3 py-2.5 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {assignments.map((assignment) => {
                const worker = workers.get(assignment.workerId)
                const output = outputs.get(assignment.workshopOutputId)
                const workItem = output ? workItems.get(output.workItemId) : undefined
                return (
                  <tr key={assignment.id} className="table-row">
                    <td className="px-3 py-2.5 tabular-nums text-slate-300">{assignment.plannedDate}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-100">{worker?.displayName ?? 'Operaio non trovato'}</td>
                    <td className="px-3 py-2.5"><ProcessBadge process={assignment.process} /></td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-300">{workItem?.code ?? '-'}</td>
                    <td className="px-3 py-2.5 text-slate-300">{workItem?.customer ?? '-'}</td>
                    <td className="px-3 py-2.5 text-slate-300">{output ? `${output.machineTypeCode} - ${output.machineTypeName}` : '-'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">{assignment.loadPoints}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={assignment.status} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button className="btn-ghost text-xs" onClick={() => onEdit(assignment.workshopOutputId)}>Modifica</button>
                        <button className="btn-ghost text-xs text-emerald-200" onClick={() => onComplete(assignment.id)}>Completa</button>
                        <button className="btn-ghost text-xs text-amber-200" onClick={() => onSuspend(assignment.id)}>Sospendi</button>
                        <button className="btn-ghost text-xs text-red-200" onClick={() => onDelete(assignment)}>Elimina</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">Nessuna assegnazione con i filtri correnti.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function WorkerDayDetailModal({
  worker,
  date,
  assignments,
  outputById,
  workItemById,
  onClose,
  onEdit,
}: {
  worker: WorkshopWorker
  date: string
  assignments: WorkshopAssignment[]
  outputById: Map<string, WorkshopOutput>
  workItemById: Map<string, WorkItem>
  onClose: () => void
  onEdit: (outputId: string) => void
}) {
  return (
    <Modal open onClose={onClose} title={worker.displayName} subtitle={`Assegnazioni del ${formatItalianShort(date)}`} size="md">
      <div className="space-y-2">
        {assignments.map((assignment) => {
          const output = outputById.get(assignment.workshopOutputId)
          const workItem = output ? workItemById.get(output.workItemId) : undefined
          return (
            <button
              key={assignment.id}
              onClick={() => onEdit(assignment.workshopOutputId)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/35 px-3 py-2 text-left transition hover:border-sky-500/40"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-100">{WORKSHOP_ASSIGNMENT_PROCESS_LABELS[assignment.process]}</div>
                  <div className="mt-1 text-xs text-slate-400">{workItem?.code ?? '-'} - {output?.machineTypeName ?? '-'}</div>
                </div>
                <div className="text-right text-xs text-slate-300">{assignment.loadPoints} punti</div>
              </div>
            </button>
          )
        })}
        {assignments.length === 0 && <div className="py-8 text-center text-sm text-slate-500">Nessuna assegnazione in questo giorno.</div>}
      </div>
    </Modal>
  )
}

function WorkerLoadBar({
  worker,
  loadPoints,
  capacityPoints,
  percent,
  level,
  subtitle,
  onClick,
}: {
  worker: WorkshopWorker
  loadPoints: number
  capacityPoints: number
  percent: number
  level: ReturnType<typeof getWorkerLoadLevel>
  subtitle: string
  onClick: () => void
}) {
  return (
    <button className="panel p-3 text-left transition hover:border-sky-500/40" onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-slate-100">{worker.displayName}</div>
          <div className="mt-0.5 truncate text-[10px] text-slate-500">{skillSummary(worker)}</div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-semibold leading-none tabular-nums ${LEVEL_TEXT[level]}`}>
            {saturationScore10(percent).toFixed(1)}<span className="text-xs font-normal opacity-70">/10</span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">{percent}% · {loadPoints}/{capacityPoints} pt · {level}</div>
        </div>
      </div>
      <div className="mt-3">
        <MiniBar percent={percent} level={level} />
      </div>
      <div className="mt-2 text-[10px] text-slate-500">{subtitle}</div>
    </button>
  )
}

function MiniBar({ percent, level }: { percent: number; level: ReturnType<typeof getWorkerLoadLevel> }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full rounded-full ${LEVEL_CLASS[level]}`} style={{ width: `${Math.min(140, Math.max(0, percent))}%` }} />
    </div>
  )
}

function initialRows(output: WorkshopOutput, assignments: WorkshopAssignment[], defaultDate: string): AssignmentRowDraft[] {
  const required = getOutputRequiredProcesses(output)
  const rows: AssignmentRowDraft[] = []
  for (const process of required) {
    const existing = assignments.find((assignment) => assignment.process === process)
    rows.push(existing ? toDraftRow(existing, true) : {
      key: `required_${process}`,
      workshopOutputId: output.id,
      workItemId: output.workItemId,
      workerId: '',
      process,
      plannedDate: defaultDate || todayISO(),
      loadPoints: estimateProcessLoadPoints(output, process),
      status: 'pianificato',
      notes: '',
      required: true,
    })
  }
  const extra = assignments.filter((assignment) => !required.includes(assignment.process))
  rows.push(...extra.map((assignment) => toDraftRow(assignment, false)))
  return rows
}

function getOutputPlanningDate(output: WorkshopOutput, workItem?: WorkItem): string {
  return output.actualReleaseDate || output.plannedReleaseDate || workItem?.plannedProductionReleaseDate || workItem?.dueDate || ''
}

function toDraftRow(assignment: WorkshopAssignment, required: boolean): AssignmentRowDraft {
  return {
    key: assignment.id,
    id: assignment.id,
    workshopOutputId: assignment.workshopOutputId,
    workItemId: assignment.workItemId,
    workerId: assignment.workerId,
    process: assignment.process,
    plannedDate: assignment.plannedDate,
    plannedWeek: assignment.plannedWeek,
    loadPoints: assignment.loadPoints,
    status: assignment.status,
    notes: assignment.notes,
    required,
  }
}

function skillSummary(worker: WorkshopWorker): string {
  const skills = worker.skills.slice(0, 3).map((skill) => WORKSHOP_WORKER_SKILL_LABELS[skill])
  return skills.length > 0 ? skills.join(', ') : 'Nessuna skill'
}

function CoverageBadge({ status }: { status: OutputCard['coverage']['status'] }) {
  const cls = status === 'assegnato'
    ? 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30'
    : status === 'parziale'
      ? 'bg-amber-500/10 text-amber-200 ring-amber-500/30'
      : 'bg-slate-500/10 text-slate-300 ring-slate-500/30'
  const label = status === 'assegnato' ? 'Assegnato' : status === 'parziale' ? 'Parziale' : 'Non assegnato'
  return <span className={`chip-sm ${cls}`}>{label}</span>
}

function ProcessCoverageBadge({ process, status }: { process: WorkshopAssignmentProcess; status: 'missing' | 'partial' | 'covered' }) {
  const cls = status === 'covered'
    ? 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30'
    : status === 'partial'
      ? 'bg-amber-500/10 text-amber-200 ring-amber-500/30'
      : 'bg-slate-500/10 text-slate-300 ring-slate-500/30'
  return <span className={`chip-sm ${cls}`}>{WORKSHOP_ASSIGNMENT_PROCESS_LABELS[process]}</span>
}

function ProcessBadge({ process }: { process: WorkshopAssignmentProcess }) {
  return <span className="chip-sm bg-slate-500/10 text-slate-300 ring-slate-500/25">{WORKSHOP_ASSIGNMENT_PROCESS_LABELS[process]}</span>
}

function StatusBadge({ status }: { status: WorkshopAssignmentStatus }) {
  const cls = status === 'completato'
    ? 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30'
    : status === 'sospeso'
      ? 'bg-amber-500/10 text-amber-200 ring-amber-500/30'
      : status === 'in_lavorazione'
        ? 'bg-sky-500/10 text-sky-200 ring-sky-500/30'
        : 'bg-slate-500/10 text-slate-300 ring-slate-500/30'
  return <span className={`chip-sm ${cls}`}>{WORKSHOP_ASSIGNMENT_STATUS_LABELS[status]}</span>
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-700 bg-slate-900" />
      {children}
    </label>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="section-label">{label}</span>
      {children}
    </label>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="section-label">{label}</div>
      <div className="mt-1 text-sm text-slate-200">{value}</div>
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold tracking-tight text-slate-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
      </div>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
