import { useState } from 'react'
import { useAuth } from '../state/AuthProvider'
import { useToast } from '../state/ToastProvider'

export function LoginScreen() {
  const { status, login, setupAdmin } = useAuth()
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const isSetup = status === 'needsSetup'

  async function submit() {
    setBusy(true)
    try {
      if (isSetup) await setupAdmin(username.trim(), password)
      else await login(username.trim(), password)
    } catch {
      toast.error(isSetup ? 'Setup non riuscito (password min 8).' : 'Credenziali non valide.')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-800/80 bg-[color:var(--color-panel)] p-7 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
        <div className="flex flex-col items-center gap-2">
          <img src="/flowrlink-mark.png" alt="Flowrlink" className="h-16 w-auto" />
          <div className="bg-gradient-to-r from-[color:var(--color-accent)] to-[color:var(--color-accent-2)] bg-clip-text text-2xl font-extrabold text-transparent">Flowrlink</div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">CRM &amp; Workload</div>
        </div>
        <h1 className="text-center text-sm font-semibold text-slate-200">
          {isSetup ? 'Crea l\'account amministratore' : 'Accedi'}
        </h1>
        <div className="space-y-3">
          <input className="input-base" placeholder="Username" value={username} autoFocus
            onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
          <input type="password" className="input-base" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
          <button className="btn-primary w-full" disabled={busy || !username || !password} onClick={submit}>
            {isSetup ? 'Crea amministratore' : 'Entra'}
          </button>
        </div>
      </div>
    </div>
  )
}
