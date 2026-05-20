import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button onClick={onCancel} className="btn-ghost">{cancelLabel}</button>
          <button
            onClick={onConfirm}
            className={
              danger
                ? 'inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_8px_18px_-10px_rgba(239,68,68,0.6)] transition hover:bg-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60'
                : 'btn-primary'
            }
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {danger && (
        <div className="mb-3 flex items-start gap-2.5 rounded-md border border-red-500/35 bg-red-500/8 px-3 py-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-red-300" aria-hidden>
            <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
          <p className="text-sm leading-relaxed text-red-100">{message}</p>
        </div>
      )}
      {!danger && <p className="text-sm leading-relaxed text-slate-300">{message}</p>}
    </Modal>
  )
}
