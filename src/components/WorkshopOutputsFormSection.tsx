import { useState } from 'react'
import type { MachineType, WorkItemType } from '../types'
import type { WorkshopOutputDraft } from '../services/workshopOutputsService'
import { getWorkshopImpactLevel, WORKSHOP_IMPACT_EXPLANATION } from '../utils/workshopImpact'
import {
  impactLevelClass,
  workshopOutputStatusLabel,
  WorkshopOutputFormModal,
  workshopProcessLabels,
} from './WorkshopOutputFormModal'

interface Props {
  workItemType: WorkItemType
  outputs: WorkshopOutputDraft[]
  machineTypes: MachineType[]
  defaultPlannedReleaseDate: string
  onChange: (outputs: WorkshopOutputDraft[]) => void
}

export function WorkshopOutputsFormSection({
  workItemType,
  outputs,
  machineTypes,
  defaultPlannedReleaseDate,
  onChange,
}: Props) {
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; index: number | null } | null>(null)

  if (workItemType === 'studio') {
    return (
      <div className="md:col-span-2 rounded-lg border border-slate-800 bg-slate-900/35 px-3 py-2 text-[12px] text-slate-400">
        Gli output officina saranno disponibili quando lo studio diventa commessa.
        {outputs.length > 0 && (
          <span className="ml-1 text-amber-200">
            Sono presenti output salvati in precedenza: non verranno cancellati automaticamente.
          </span>
        )}
      </div>
    )
  }

  if (workItemType === 'interno') {
    return outputs.length > 0 ? (
      <div className="md:col-span-2 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-[12px] text-amber-100">
        Questo lavoro interno ha output officina salvati in precedenza. Restano nascosti e non vengono cancellati automaticamente.
      </div>
    ) : null
  }

  function handleSave(output: WorkshopOutputDraft) {
    if (!modal) return
    if (modal.mode === 'create') {
      onChange([...outputs, { ...output, id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }])
    } else if (modal.index !== null) {
      onChange(outputs.map((item, index) => (index === modal.index ? { ...item, ...output, id: item.id } : item)))
    }
    setModal(null)
  }

  function removeAt(index: number) {
    onChange(outputs.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <section className="md:col-span-2 mt-1 border-t border-slate-800 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Output verso officina
          </h3>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-slate-500">
            Indica cosa arrivera in officina quando la progettazione sara rilasciata. Il dato serve alla produzione per prevedere il flusso futuro. Non rappresenta ore officina.
          </p>
        </div>
        <button type="button" onClick={() => setModal({ mode: 'create', index: null })} className="btn-primary">
          + Aggiungi output
        </button>
      </div>

      <p className="mt-3 rounded-md border border-sky-500/25 bg-sky-500/8 px-3 py-2 text-[12px] text-sky-100">
        {WORKSHOP_IMPACT_EXPLANATION}
      </p>

      <div className="mt-3 space-y-2">
        {outputs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700/70 bg-slate-900/30 px-3 py-5 text-center text-sm text-slate-500">
            Nessun output officina inserito. Puoi salvare la commessa anche senza compilarli.
          </div>
        ) : (
          outputs.map((output, index) => (
            <OutputRow
              key={output.id ?? `${output.machineTypeCode}_${index}`}
              output={output}
              onEdit={() => setModal({ mode: 'edit', index })}
              onDelete={() => removeAt(index)}
            />
          ))
        )}
      </div>

      <WorkshopOutputFormModal
        open={modal !== null}
        mode={modal?.mode ?? 'create'}
        output={modal?.index !== null && modal?.index !== undefined ? outputs[modal.index] : null}
        machineTypes={machineTypes}
        defaultPlannedReleaseDate={defaultPlannedReleaseDate}
        onSave={handleSave}
        onClose={() => setModal(null)}
      />
    </section>
  )
}

function OutputRow({
  output,
  onEdit,
  onDelete,
}: {
  output: WorkshopOutputDraft
  onEdit: () => void
  onDelete: () => void
}) {
  const level = getWorkshopImpactLevel(output.impactScore)
  const processes = workshopProcessLabels(output)
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-200 ring-1 ring-inset ring-slate-700">
              {output.machineTypeCode || '---'}
            </span>
            <span className="font-medium text-slate-100">{output.machineTypeName || 'Tipologia non selezionata'}</span>
            <span className="chip-sm bg-slate-500/10 text-slate-300 ring-slate-500/25">
              qta {output.quantity}
            </span>
            <span className="chip-sm bg-indigo-500/10 text-indigo-200 ring-indigo-500/25">
              {output.complexity}
            </span>
            <span className={`chip-sm ${impactLevelClass(level)}`}>
              impatto {output.impactScore} - {level}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <span>Rilascio previsto: <span className="text-slate-200">{output.plannedReleaseDate || '---'}</span></span>
            <span>Stato: <span className="text-slate-200">{workshopOutputStatusLabel(output.status)}</span></span>
            <span>Processi: <span className="text-slate-200">{processes.length > 0 ? processes.join(', ') : 'nessuno'}</span></span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onEdit} className="btn-ghost text-xs">Modifica</button>
          <button type="button" onClick={onDelete} className="btn-ghost text-xs text-red-200">Elimina</button>
        </div>
      </div>
    </div>
  )
}

