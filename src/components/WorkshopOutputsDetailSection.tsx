import { useMemo, useState } from 'react'
import type { WorkshopOutput, WorkItem } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { formatItalian } from '../utils/dates'
import { getWorkshopImpactLevel, WORKSHOP_IMPACT_EXPLANATION } from '../utils/workshopImpact'
import type { WorkshopOutputDraft } from '../services/workshopOutputsService'
import { isPendingCommercialOutput, WORKSHOP_OUTPUT_CLOSING_STATUSES } from '../utils/commercialComponents'
import type { CommercialClosureResolution } from '../utils/commercialComponents'
import {
  impactLevelClass,
  workshopOutputStatusLabel,
  WorkshopOutputFormModal,
  workshopProcessLabels,
} from './WorkshopOutputFormModal'
import { ConfirmDialog } from './ConfirmDialog'
import { CommercialComponentsConfirmModal } from './CommercialComponentsConfirmModal'

export function WorkshopOutputsDetailSection({ item }: { item: WorkItem }) {
  const {
    data,
    createWorkshopOutput,
    updateWorkshopOutput,
    updateWorkshopOutputAfterCommercialCheck,
    deleteWorkshopOutput,
  } = useData()
  const toast = useToast()
  const outputs = useMemo(
    () => data.workshopOutputs.filter((output) => output.workItemId === item.id),
    [data.workshopOutputs, item.id],
  )
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; output?: WorkshopOutput } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WorkshopOutput | null>(null)
  const [commercialCheck, setCommercialCheck] = useState<{
    output: WorkshopOutput
    draft: WorkshopOutputDraft
  } | null>(null)

  if (item.type !== 'commessa') return null

  const defaultPlannedReleaseDate = item.plannedProductionReleaseDate || item.dueDate

  function handleSave(output: WorkshopOutputDraft) {
    if (!modal) return
    if (modal.mode === 'create') {
      createWorkshopOutput(item.id, output)
      toast.success('Output officina creato.')
    } else if (modal.output) {
      const candidate: WorkshopOutput = { ...modal.output, ...output }
      if (WORKSHOP_OUTPUT_CLOSING_STATUSES.has(candidate.status) && isPendingCommercialOutput(candidate)) {
        setCommercialCheck({ output: modal.output, draft: output })
        return
      }
      updateWorkshopOutput(modal.output.id, output)
      toast.success('Output officina aggiornato.')
    }
    setModal(null)
  }

  function resolveCommercialCheck(resolution: CommercialClosureResolution) {
    if (!commercialCheck) return
    updateWorkshopOutputAfterCommercialCheck(commercialCheck.output.id, commercialCheck.draft, resolution)
    toast.success('Output officina aggiornato.')
    setCommercialCheck(null)
    setModal(null)
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteWorkshopOutput(deleteTarget.id)
    toast.success('Output officina eliminato.')
    setDeleteTarget(null)
  }

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="section-label">Output verso officina</h3>
        <button onClick={() => setModal({ mode: 'create' })} className="btn-primary">
          + Aggiungi output
        </button>
      </div>

      <p className="mb-3 rounded-md border border-sky-500/25 bg-sky-500/8 px-3 py-2 text-[12px] text-sky-100">
        {WORKSHOP_IMPACT_EXPLANATION}
      </p>

      {outputs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700/70 bg-slate-900/30 px-3 py-6 text-center">
          <div className="text-sm font-medium text-slate-300">Nessun output officina</div>
          <p className="mt-1 text-[12px] text-slate-500">
            Questa commessa non ha ancora output verso officina. Aggiungili per aiutare la produzione a prevedere il carico futuro.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {outputs.map((output) => (
            <OutputCard
              key={output.id}
              output={output}
              onEdit={() => setModal({ mode: 'edit', output })}
              onDelete={() => setDeleteTarget(output)}
            />
          ))}
        </ul>
      )}

      <WorkshopOutputFormModal
        open={modal !== null}
        mode={modal?.mode ?? 'create'}
        output={modal?.output ?? null}
        machineTypes={data.machineTypes}
        defaultPlannedReleaseDate={defaultPlannedReleaseDate}
        onSave={handleSave}
        onClose={() => setModal(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminare output officina?"
        message={deleteTarget ? `${deleteTarget.machineTypeCode} - ${deleteTarget.machineTypeName} verra rimosso dalla commessa.` : ''}
        confirmLabel="Elimina"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <CommercialComponentsConfirmModal
        open={Boolean(commercialCheck)}
        pendingOutputs={commercialCheck ? [{ ...commercialCheck.output, ...commercialCheck.draft }] : []}
        targetLabel={commercialCheck ? `${commercialCheck.output.machineTypeCode} - ${commercialCheck.output.machineTypeName}` : ''}
        onCancel={() => setCommercialCheck(null)}
        onResolve={resolveCommercialCheck}
      />
    </section>
  )
}

function OutputCard({
  output,
  onEdit,
  onDelete,
}: {
  output: WorkshopOutput
  onEdit: () => void
  onDelete: () => void
}) {
  const level = getWorkshopImpactLevel(output.impactScore)
  const processes = workshopProcessLabels(output)
  return (
    <li className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-200 ring-1 ring-inset ring-slate-700">
              {output.machineTypeCode}
            </span>
            <span className="font-medium text-slate-100">{output.machineTypeName}</span>
            <span className="chip-sm bg-slate-500/10 text-slate-300 ring-slate-500/25">
              qta {output.quantity}
            </span>
            <span className={`chip-sm ${impactLevelClass(level)}`}>
              impatto {output.impactScore} - {level}
            </span>
          </div>
          {output.description && (
            <p className="mt-1 text-[12px] text-slate-400">{output.description}</p>
          )}
          <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-slate-400 md:grid-cols-2">
            <Info label="Complessita" value={output.complexity} />
            <Info label="Stato" value={workshopOutputStatusLabel(output.status)} />
            <Info label="Complessivi" value={String(output.assemblyCount)} />
            <Info label="Particolari stimati" value={String(output.estimatedPartCount)} />
            <Info label="Rilascio previsto" value={output.plannedReleaseDate ? formatItalian(output.plannedReleaseDate) : '---'} />
            <Info label="Rilascio effettivo" value={output.actualReleaseDate ? formatItalian(output.actualReleaseDate) : '---'} />
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            <span className="text-slate-500">Processi:</span>{' '}
            <span className="text-slate-200">{processes.length > 0 ? processes.join(', ') : 'nessuno'}</span>
          </div>
          {output.notes && (
            <p className="mt-2 whitespace-pre-wrap text-[11px] text-slate-500">{output.notes}</p>
          )}
          {output.hasStandardComponents && (
            <div className="mt-2 rounded-md border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-2 text-[11px] text-emerald-100">
              <div className="font-medium">Standard anticipabili: {output.standardComponentsDescription || 'descrizione non indicata'}</div>
              <div className="mt-1 text-emerald-200/80">
                qta {output.standardComponentsQuantity ?? 0} · producibile da {output.standardComponentsReadyFromDate ? formatItalian(output.standardComponentsReadyFromDate) : '---'} · impatto {output.standardComponentsImpactScore ?? 0}
              </div>
            </div>
          )}
          {output.hasCommercialComponents && (
            <div className={`mt-2 rounded-md border px-2.5 py-2 text-[11px] ${
              output.commercialComponentsOrderRequired && !output.commercialComponentsOrdered
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                : 'border-sky-500/20 bg-sky-500/8 text-sky-100'
            }`}>
              <div className="font-medium">Commerciali: {output.commercialComponentsDescription || 'descrizione non indicata'}</div>
              <div className="mt-1 opacity-80">
                {output.commercialComponentsOrderRequired ? 'ordine richiesto' : 'ordine non richiesto'} · {output.commercialComponentsOrdered ? `ordinati${output.commercialComponentsOrderedAt ? ` il ${formatItalian(output.commercialComponentsOrderedAt)}` : ''}` : 'non confermati'}
              </div>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={onEdit} className="btn-ghost text-xs">Modifica</button>
          <button onClick={onDelete} className="btn-ghost text-xs text-red-200">Elimina</button>
        </div>
      </div>
    </li>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-500">{label}:</span> <span className="text-slate-200">{value}</span>
    </div>
  )
}
