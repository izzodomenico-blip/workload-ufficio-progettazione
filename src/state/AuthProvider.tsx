import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '../types'
import { apiLogin, apiLogout, apiSetupAdmin, fetchMe, fetchSetupStatus } from '../services/apiClient'

type Status = 'loading' | 'needsSetup' | 'loggedOut' | 'loggedIn'
interface AuthCtx {
  status: Status
  user: AuthUser | null
  login: (u: string, p: string) => Promise<void>
  setupAdmin: (u: string, p: string) => Promise<void>
  logout: () => Promise<void>
}
const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  const boot = useCallback(async () => {
    try {
      const me = await fetchMe()
      setUser(me.user); setStatus('loggedIn'); return
    } catch { /* 401 */ }
    try {
      const s = await fetchSetupStatus()
      setStatus(s.needsSetup ? 'needsSetup' : 'loggedOut')
    } catch { setStatus('loggedOut') }
  }, [])

  useEffect(() => { void boot() }, [boot])

  const login = useCallback(async (u: string, p: string) => {
    const r = await apiLogin(u, p); setUser(r.user); setStatus('loggedIn')
  }, [])
  const setupAdmin = useCallback(async (u: string, p: string) => {
    const r = await apiSetupAdmin(u, p); setUser(r.user); setStatus('loggedIn')
  }, [])
  const logout = useCallback(async () => {
    try { await apiLogout() } finally { setUser(null); setStatus('loggedOut') }
  }, [])

  return <Ctx.Provider value={{ status, user, login, setupAdmin, logout }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth richiede <AuthProvider>')
  return c
}
