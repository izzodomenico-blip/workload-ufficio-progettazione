import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Task, WorkItem } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { TypeBadge } from './TypeBadge'
import { PriorityBadge } from './PriorityBadge'
import { StatusSelect } from './StatusSelect'
import { ConfirmDialog } from './ConfirmDialog'
import { WorkItemFormModal } from './WorkItemFormModal'
import { TaskFormModal } from './TaskFormModal'
import { formatItalian, formatItalianShort, isOverdue, daysUntil } from '../utils/dates'

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
    const log = tasks.reduce((s, t) => s + t.loggedHours, 0)
    const avgProgress = tasks.length === 0 ? 0 : Math.round(tasks.reduce((s, t) => s + t.progressPercent, 0) / tasks.length)
    return { est, log, avgProgress }
  }, [tasks])

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
            <Row label="Ore consuntivate" value={`${item.loggedHours}h`} />
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
            <Stat label="Ore consuntivate" value={`${totals.log}h`} />
            <Stat label="Avanzamento medio" value={`${totals.avgProgress}%`} />
          </div>
        </Section>

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
  task, assigneeName, onEdit, onDelete,
}: { task: Task; assigneeName: string; onEdit: () => void; onDelete: () => void }) {
  const { setTaskStatus } = useData()
  const toast = useToast()
  const overdue = isOverdue(task.dueDate)

  return (
    <li className={`rounded-md border bg-slate-900/40 p-3 ${overdue ? 'border-red-500/30' : 'border-slate-800'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-100">{task.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{assigneeName}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusSelect
            value={task.status}
            onChange={(s) => { setTaskStatus(task.id, s); toast.info(`Task: ${s}`) }}
          />
          <button onClick={onEdit} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200" title="Modifica task" aria-label="Modifica">✎</button>
          <button onClick={onDelete} className="rounded p-1 text-slate-400 hover:bg-red-500/10 hover:text-red-300" title="Elimina task" aria-label="Elimina">🗑</button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
        <div>
          <span className="text-slate-500">Periodo:</span> {formatItalianShort(task.startDate)} → <span className={overdue ? 'text-red-300' : ''}>{formatItalianShort(task.dueDate)}</span>
        </div>
        <div><span className="text-slate-500">Ore:</span> {task.loggedHours}/{task.estimatedHours}h</div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Avanz.:</span>
          <span className="inline-block h-1 w-12 overflow-hidden rounded-full bg-slate-800"><span className="block h-full bg-sky-500" style={{ width: `${task.progressPercent}%` }} /></span>
          <span className="tabular-nums">{task.progressPercent}%</span>
        </div>
      </div>
      {task.blockers.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-amber-300">
          {task.blockers.map((b, i) => <li key={i}>⛔ {b}</li>)}
        </ul>
      )}
      {task.notes && <div className="mt-1.5 whitespace-pre-wrap text-[11px] text-slate-400">{task.notes}</div>}
    </li>
  )
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
