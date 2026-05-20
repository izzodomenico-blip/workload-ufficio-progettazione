import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { uid } from '../utils/format'

export type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  kind: ToastKind
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const KIND_CLASS: Record<ToastKind, string> = {
  success: 'border-emerald-500/45 bg-emerald-500/12 text-emerald-100',
  error: 'border-red-500/45 bg-red-500/12 text-red-100',
  info: 'border-sky-500/45 bg-sky-500/12 text-sky-100',
}

const KIND_ICON_BG: Record<ToastKind, string> = {
  success: 'bg-emerald-500/30 text-emerald-200',
  error: 'bg-red-500/30 text-red-200',
  info: 'bg-sky-500/30 text-sky-200',
}

const KIND_ICON: Record<ToastKind, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = uid('tst')
    setToasts((prev) => [...prev, { id, message, kind }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  const value = useMemo<ToastContextValue>(() => ({
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
    info: (m) => show(m, 'info'),
  }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(360px,90vw)] flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm shadow-[0_10px_25px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md transition hover:opacity-95 ${KIND_CLASS[t.kind]}`}
          >
            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${KIND_ICON_BG[t.kind]}`}>
              {KIND_ICON[t.kind]}
            </span>
            <span className="flex-1 leading-snug">{t.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast() richiede <ToastProvider>')
  return ctx
}
