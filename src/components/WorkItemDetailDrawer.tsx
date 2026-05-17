import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Absence, ActivityLogEntry, Task, WorkItem } from '../types'
import { isOpen } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { TypeBadge } from './TypeBadge'
import { PriorityBadge } from './PriorityBadge'
import { StatusSelect } from './StatusSelect'
import { ConfirmDialog } from './ConfirmDialog'
import { WorkItemFormModal } from './WorkItemFormModal'
import { TaskFormModal } from './TaskFormModal'
import { formatItalian, formatItalianShort, isOverdue, daysUntil } from '../utils/dates'
import { getAssigneeAbsencesDuringTask } from '../utils/availability'
import { calculateExpectedProgress, getTaskHealth } from '../utils/progress'
import { getRecentForWorkItem } from '../utils/activityLog'
import { HealthBadge } from './HealthBadge'

interface Props {
  workItemId: string | null
  onClose: () => void
}

export function WorkItemDetailDrawer({ workItemId, onClose }: Props) {
  const { data } = useData()
  const item = useMemo(() => data.workItems.find((w) => w.id === workItemId) ?? null, [data.workItems, workItemId])

  useEffect(() => {
    if (!workItemId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [workItemId, onClose])

  if (!item) return null

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="absolute right-0 top-0 h-full w-full max-w-[680px] overflow-y-auto scroll-thin border-l border-slate-800 bg-[color:var(--color-panel)] shadow-2xl">
        <DetailContent item={item} onClose={onClose} />
      </div>
    </div>
  )
}

function DetailContent({ item, onClose }: { item: WorkItem; onClose: () => void }) {
  const { data, setWorkItemStatus, deleteWorkItem, convertStudioToCommessa } = useData()
  const toast = useToast()
  const personById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people])
  const owner = personById.get(item.ownerId)
  const tasks = useMemo(() => data.tasks.filter((t) => t.workItemId === item.id), [data.tasks, item.id])

  const totals = useMemo(() => {
    const est = tasks.reduce((s, t) => s + t.estimatedHours, 0)
    const residual = tasks.reduce(
      (s, t) => s + Math.max(0, t.estimatedHours * (1 - t.progressPercent / 100)),
      0,
    )
    const avgProgress = tasks.length === 0 ? 0 : Math.round(tasks.reduce((s, t) => s + t.progressPercent, 0) / tasks.length)
    return { est, residual: Math.round(residual * 10) / 10, avgProgress }
  }, [tasks])

  const recentLog = useMemo(() => getRecentForWorkItem(data, item.id, 5), [data, item.id])

  const [showConvert, setShowConvert] = useState(false)
  const [newCode, setNewCode] = useState(() => item.code.replace(/^ST-/, 'CM-'))
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [taskFormState, setTaskFormState] = useState<{ open: boolean; mode: 'create' | 'edit'; task?: Task }>({ open: false, mode: 'create' })
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null)

  const overdue = isOverdue(item.dueDate)
  const days = daysUntil(item.dueDate)

  function handleConvert() {
    convertStudioToCommessa(item.id, newCode.trim() || undefined)
    setShowConvert(false)
    toast.success('Studio convertito in commessa.')
  }

  function handleDeleteWorkItem() {
    deleteWorkItem(item.id)
    setConfirmDelete(false)
    toast.success(`Lavoro eliminato: ${item.code || item.title}`)
    onClose()
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-[color:var(--color-panel)] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TypeBadge type={item.type} />
              <span className="font-mono text-xs text-slate-400">{item.code || '— senza codice —'}</span>
              {item.blockers.length > 0 && <span className="chip bg-amber-500/15 text-amber-300 ring-amber-500/40">⛔ bloccato</span>}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">{item.title}</h2>
            <div className="mt-0.5 text-sm text-slate-400">{item.customer || '—'}</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200" aria-label="Chiudi">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusSelect
            value={item.status}
            onChange={(s) => { setWorkItemStatus(item.id, s); toast.info(`Stato: ${s}`) }}
            size="md"
          />
          <PriorityBadge priority={item.priority} />
          {item.type === 'studio' && typeof item.acquisitionProbability === 'number' && (
            <span className="chip bg-violet-500/10 text-violet-300 ring-violet-500/30">
              prob. acquisizione {item.acquisitionProbability}%
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setEditOpen(true)} className="btn-ghost" title="Modifica i dati del lavoro">
              ✎ Modifica
            </button>
            {item.type === 'studio' && (
              <button onClick={() => setShowConvert((v) => !v)} className="btn-primary">
                {showConvert ? '× Annulla' : '→ Converti in commessa'}
              </button>
            )}
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-sm font-medium text-red-300 transition hover:bg-red-500/10"
              title="Elimina questo lavoro e tutti i suoi task"
            >
              🗑 Elimina
            </button>
          </div>
        </div>

        {showConvert && item.type === 'studio' && (
          <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
            <div className="text-xs font-medium text-sky-200">Conversione studio → commessa</div>
            <p className="mt-1 text-[12px] text-slate-300">
              La probabilità di acquisizione verrà rimossa. Puoi aggiornare il codice.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                className="input-base flex-1"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Nuovo codice commessa, es. CM-2026-040"
              />
              <button onClick={handleConvert} className="btn-primary">Converti</button>
            </div>
          </div>
        )}
      </header>

      <div className="space-y-5 px-5 py-4">
        <Section title="Dati principali">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row label="Owner" value={owner?.name ?? '—'} />
            <Row label="Assegnati" value={item.assigneeIds.map((id) => personById.get(id)?.name).filter(Boolean).join(', ') || '—'} />
            <Row label="Inizio" value={formatItalian(item.startDate)} />
            <Row label="Scadenza" value={
              <span className={overdue ? 'text-red-300 font-medium' : ''}>
                {formatItalian(item.dueDate)} <span className="text-slate-500">({overdue ? `${Math.abs(days)} gg di ritardo` : `tra ${days} gg`})</span>
              </span>
            } />
            <Row label="Ore stimate" value={`${item.estimatedHours}h`} />
            <Row
              label="Ore residue calcolate"
              value={`${Math.round(Math.max(0, item.estimatedHours * (1 - item.progressPercent / 100)) * 10) / 10}h`}
            />
            <Row label="Avanzamento" value={
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                  <span className="block h-full bg-sky-500" style={{ width: `${item.progressPercent}%` }} />
                </span>
                <span className="tabular-nums">{item.progressPercent}%</span>
              </span>
            } />
          </dl>
          {item.description && <p className="mt-3 text-sm text-slate-300">{item.description}</p>}
        </Section>

        <Section
          title={`Task collegati (${tasks.length})`}
          right={
            <button
              onClick={() => setTaskFormState({ open: true, mode: 'create' })}
              className="btn-primary"
            >
              + Aggiungi task
            </button>
          }
        >
          {tasks.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-slate-500">
              Nessun task collegato. Aggiungine uno per iniziare a tracciare l’avanzamento.
            </p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  assigneeName={personById.get(t.assigneeId)?.name ?? '—'}
                  absenceConflicts={getAssigneeAbsencesDuringTask(t.assigneeId, data.absences, t.startDate, t.dueDate)}
                  onEdit={() => setTaskFormState({ open: true, mode: 'edit', task: t })}
                  onDelete={() => setConfirmDeleteTaskId(t.id)}
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Totali (da task)">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Ore stimate" value={`${totals.est}h`} />
            <Stat label="Ore residue" value={`${totals.residual}h`} />
            <Stat label="Avanzamento medio" value={`${totals.avgProgress}%`} />
          </div>
        </Section>

        <TechnicalDetailsSection item={item} />

        {item.blockers.length > 0 && (
          <Section title="Bloccanti">
            <ul className="space-y-1 text-sm text-amber-300">
              {item.blockers.map((b, i) => <li key={i}>⛔ {b}</li>)}
            </ul>
          </Section>
        )}

        {item.notes && (
          <Section title="Note">
            <p className="whitespace-pre-wrap text-sm text-slate-300">{item.notes}</p>
          </Section>
        )}

        <Section title={`Storico recente${recentLog.length > 0 ? ` (${recentLog.length})` : ''}`}>
          {recentLog.length === 0 ? (
            <p className="text-[12px] italic text-slate-500">
              Nessuna modifica tracciata su questo lavoro o sui suoi task.
            </p>
          ) : (
            <ul className="space-y-1">
              {recentLog.map((e) => (
                <RecentLogRow key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </Section>
      </div>

      <WorkItemFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        workItem={item}
      />

      <TaskFormModal
        open={taskFormState.open}
        onClose={() => setTaskFormState({ open: false, mode: 'create' })}
        mode={taskFormState.mode}
        workItemId={item.id}
        task={taskFormState.task}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminare il lavoro?"
        message={`"${item.title}" verrà rimosso insieme ai ${tasks.length} task collegati. Operazione non reversibile.`}
        confirmLabel="Elimina"
        danger
        onConfirm={handleDeleteWorkItem}
        onCancel={() => setConfirmDelete(false)}
      />

      <DeleteTaskDialog
        open={confirmDeleteTaskId !== null}
        taskId={confirmDeleteTaskId}
        onClose={() => setConfirmDeleteTaskId(null)}
      />
    </>
  )
}

function TaskRow({
  task, assigneeName, absenceConflicts, onEdit, onDelete,
}: { task: Task; assigneeName: string; absenceConflicts: Absence[]; onEdit: () => void; onDelete: () => void }) {
  const { setTaskStatus } = useData()
  const toast = useToast()
  const overdue = isOverdue(task.dueDate)
  const hasAbsenceConflict = absenceConflicts.length > 0
  const atRisk = hasAbsenceConflict && isOpen(task.status)
  const expected = calculateExpectedProgress(task.startDate, task.dueDate)
  const health = getTaskHealth(task)
  const diff = task.progressPercent - expected

  // La scadenza cade dentro un’assenza o nei due giorni successivi
  const dueRiskAbsence = absenceConflicts.find((a) => task.dueDate >= a.startDate && task.dueDate <= addDaysISO(a.endDate, 2))
  const dueDuringAbsence = absenceConflicts.find((a) => task.dueDate >= a.startDate && task.dueDate <= a.endDate)

  return (
    <li className={`rounded-md border bg-slate-900/40 p-3 ${
      overdue ? 'border-red-500/30' : atRisk ? 'border-amber-500/30' : 'border-slate-800'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-100">{task.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{assigneeName}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <HealthBadge health={health} />
          <StatusSelect
            value={task.status}
            onChange={(s) => { setTaskStatus(task.id, s); toast.info(`Task: ${s}`) }}
          />
          <button onClick={onEdit} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200" title="Modifica task" aria-label="Modifica">✎</button>
          <button onClick={onDelete} className="rounded p-1 text-slate-400 hover:bg-red-500/10 hover:text-red-300" title="Elimina task" aria-label="Elimina">🗑</button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400 md:grid-cols-3">
        <div>
          <span className="text-slate-500">Periodo:</span> {formatItalianShort(task.startDate)} → <span className={overdue ? 'text-red-300' : ''}>{formatItalianShort(task.dueDate)}</span>
        </div>
        <div>
          <span className="text-slate-500">Ore:</span> stim. {task.estimatedHours}h ·{' '}
          residue {Math.round(Math.max(0, task.estimatedHours * (1 - task.progressPercent / 100)) * 10) / 10}h
        </div>
        <div>
          <span className="text-slate-500">Avanz.:</span>{' '}
          <span className="tabular-nums text-slate-200">Reale {task.progressPercent}%</span>
          {' · '}
          <span className="tabular-nums text-amber-300">Atteso {expected}%</span>
          {' '}
          <span className={`tabular-nums ${diff < -20 ? 'text-red-300' : diff < 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
            ({diff > 0 ? '+' : ''}{diff}%)
          </span>
        </div>
      </div>
      <div className="mt-1.5 relative h-1 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-sky-500" style={{ width: `${task.progressPercent}%` }} />
        <div className="absolute top-0 h-full w-px bg-amber-300" style={{ left: `${expected}%` }} aria-hidden />
      </div>
      {hasAbsenceConflict && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-200">
          <div className="font-medium">⚠ L’assegnatario ha assenze nel periodo del task</div>
          <ul className="mt-0.5 space-y-0.5 text-amber-200/80">
            {absenceConflicts.map((a) => (
              <li key={a.id}>
                {capitalize(a.type)} · {formatItalianShort(a.startDate)}{a.startDate !== a.endDate ? ` → ${formatItalianShort(a.endDate)}` : ''} · {a.hoursPerDay}h/g
                {a.notes ? ` — ${a.notes}` : ''}
              </li>
            ))}
          </ul>
          {dueDuringAbsence && (
            <div className="mt-1 font-medium text-orange-300">⚠ Scadenza durante un’assenza</div>
          )}
          {!dueDuringAbsence && dueRiskAbsence && (
            <div className="mt-1 text-orange-300">⚠ Scadenza subito dopo un’assenza</div>
          )}
        </div>
      )}
      {task.blockers.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-amber-300">
          {task.blockers.map((b, i) => <li key={i}>⛔ {b}</li>)}
        </ul>
      )}
      {task.notes && <div className="mt-1.5 whitespace-pre-wrap text-[11px] text-slate-400">{task.notes}</div>}
    </li>
  )
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, (d ?? 1) + days)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

function DeleteTaskDialog({ open, taskId, onClose }: { open: boolean; taskId: string | null; onClose: () => void }) {
  const { data, deleteTask } = useData()
  const toast = useToast()
  const task = data.tasks.find((t) => t.id === taskId)

  function handleConfirm() {
    if (!task) return
    deleteTask(task.id)
    toast.success('Task eliminato.')
    onClose()
  }

  return (
    <ConfirmDialog
      open={open}
      title="Eliminare il task?"
      message={task ? `"${task.title}" verrà rimosso. Operazione non reversibile.` : ''}
      confirmLabel="Elimina"
      danger
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  )
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200">{value}</dd>
    </>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-100 tabular-nums">{value}</div>
    </div>
  )
}

const COMMERCIAL_TONE: Record<string, string> = {
  bassa: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  media: 'bg-sky-500/15 text-sky-200 ring-sky-500/30',
  alta: 'bg-orange-500/15 text-orange-200 ring-orange-500/30',
  critica: 'bg-red-500/15 text-red-200 ring-red-500/40',
}

function TechnicalDetailsSection({ item }: { item: WorkItem }) {
  const hasAny =
    !!item.technicalPhase ||
    !!item.customerRequestDate ||
    !!item.plannedProductionReleaseDate ||
    !!item.actualProductionReleaseDate ||
    !!item.offerReference ||
    !!item.commercialPriority ||
    !!item.workFolderLink ||
    !!item.managerNotes

  if (!hasAny) {
    return (
      <Section title="Dettagli tecnici">
        <p className="text-[12px] italic text-slate-500">
          Nessun dettaglio tecnico/operativo. Aprilo in modifica per aggiungere fase, rilascio produzione, offerta, ecc.
        </p>
      </Section>
    )
  }

  return (
    <Section title="Dettagli tecnici">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {item.technicalPhase && (
          <Row
            label="Fase tecnica"
            value={
              <span className="inline-flex items-center rounded bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-200 ring-1 ring-inset ring-indigo-500/30">
                {item.technicalPhase}
              </span>
            }
          />
        )}
        {item.commercialPriority && (
          <Row
            label="Priorità commerciale"
            value={
              <span
                className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset ${COMMERCIAL_TONE[item.commercialPriority] ?? COMMERCIAL_TONE.media}`}
              >
                {item.commercialPriority}
              </span>
            }
          />
        )}
        {item.plannedProductionReleaseDate && (
          <Row
            label="Rilascio produzione previsto"
            value={
              <span className={item.actualProductionReleaseDate ? 'text-slate-400 line-through' : ''}>
                {formatItalian(item.plannedProductionReleaseDate)}
              </span>
            }
          />
        )}
        {item.actualProductionReleaseDate && (
          <Row
            label="Rilascio produzione effettivo"
            value={
              <span className="font-medium text-emerald-300">
                {formatItalian(item.actualProductionReleaseDate)}
              </span>
            }
          />
        )}
        {item.customerRequestDate && (
          <Row label="Data richiesta cliente" value={formatItalian(item.customerRequestDate)} />
        )}
        {item.offerReference && (
          <Row
            label="Riferimento offerta"
            value={<span className="font-mono text-[12px] text-slate-200">{item.offerReference}</span>}
          />
        )}
      </dl>

      {item.workFolderLink && (
        <div className="mt-3">
          <a
            href={item.workFolderLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-200 transition hover:bg-sky-500/20"
            title={item.workFolderLink}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
            </svg>
            Apri cartella
          </a>
        </div>
      )}

      {item.managerNotes && (
        <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Note responsabile</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{item.managerNotes}</p>
        </div>
      )}
    </Section>
  )
}

const RECENT_ACTION_LABEL: Record<string, string> = {
  created: 'creato',
  updated: 'modificato',
  deleted: 'eliminato',
  status_changed: 'stato',
  progress_changed: 'avanzamento',
  converted: 'convertito',
  imported: 'import',
  reset: 'reset',
}

const RECENT_ACTION_TONE: Record<string, string> = {
  created: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  updated: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  deleted: 'bg-red-500/15 text-red-300 ring-red-500/40',
  status_changed: 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/30',
  progress_changed: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  converted: 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
  imported: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/30',
  reset: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
}

function fmtRecentTimestamp(iso: string): string {
  const d = new Date(iso)
  return `${formatItalianShort(d.toISOString().slice(0, 10))} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function RecentLogRow({ entry }: { entry: ActivityLogEntry }) {
  const tone = RECENT_ACTION_TONE[entry.action] ?? RECENT_ACTION_TONE.updated
  return (
    <li className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-900/30 px-2.5 py-1.5 text-[12px]">
      <span className="shrink-0 text-[10px] tabular-nums text-slate-500 pt-0.5 min-w-[90px]">
        {fmtRecentTimestamp(entry.timestamp)}
      </span>
      <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${tone}`}>
        {RECENT_ACTION_LABEL[entry.action] ?? entry.action}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-slate-200">
          {entry.entityType === 'task' ? 'Task' : entry.entityType === 'workItem' ? 'Lavoro' : entry.entityType}
        </span>{' '}
        <span className="text-slate-300">{entry.title}</span>
        {entry.description && (
          <div className="mt-0.5 text-[11px] text-slate-500">{entry.description}</div>
        )}
      </span>
    </li>
  )
}
