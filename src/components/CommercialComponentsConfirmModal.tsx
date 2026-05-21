import type { WorkshopOutput } from '../types'
import type { CommercialClosureResolution } from '../utils/commercialComponents'
import { Modal } from './Modal'

interface Props {
  open: boolean
  pendingOutputs: WorkshopOutput[]
  targetLabel: string
  onCancel: () => void
  onResolve: (resolution: CommercialClosureResolution) => void
}

export function CommercialComponentsConfirmModal({
  open,
  pendingOutputs,
  targetLabel,
  onCancel,
  onResolve,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Componenti commerciali da verificare"
      subtitle={targetLabel}
      size="lg"
      footer={
        <>
          <button className="btn-ghost" onClick={onCancel}>Annulla chiusura</button>
          <button className="btn-ghost text-amber-200" onClick={() => onResolve('proceed_warning')}>
            Procedi comunque
          </button>
          <button className="btn-primary" onClick={() => onResolve('confirm_ordered')}>
            Conferma acquisto e procedi
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100">
          Questo output/commessa contiene componenti commerciali indicati come da ordinare.
          Confermi che l'acquisto e stato effettuato prima di procedere con la chiusura?
        </div>
        <div className="space-y-2">
          {pendingOutputs.map((output) => (
            <div key={output.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-sky-200">{output.machineTypeCode}</span>
                <span className="text-sm font-medium text-slate-100">{output.machineTypeName}</span>
                <span className="chip-sm bg-amber-500/10 text-amber-200 ring-amber-500/30">ordine richiesto</span>
              </div>
              <div className="mt-2 text-sm text-slate-300">
                {output.commercialComponentsDescription || 'Descrizione componenti commerciali non indicata.'}
              </div>
              {output.commercialComponentsNotes && (
                <div className="mt-1 text-xs text-slate-500">{output.commercialComponentsNotes}</div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          "Conferma acquisto e procedi" marca i componenti come ordinati da utente locale. "Procedi comunque" mantiene il promemoria aperto e registra un warning nello storico.
        </p>
      </div>
    </Modal>
  )
}
