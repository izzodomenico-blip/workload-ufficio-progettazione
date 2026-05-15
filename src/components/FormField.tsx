import type { ReactNode } from 'react'

interface Props {
  label: string
  error?: string
  required?: boolean
  hint?: string
  className?: string
  children: ReactNode
}

export function FormField({ label, error, required, hint, className = '', children }: Props) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
        {required && <span className="text-red-400" aria-hidden>*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-red-300">{error}</span>}
    </label>
  )
}
