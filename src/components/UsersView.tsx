import { useEffect, useMemo, useState } from 'react'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { createUserApi, deleteUserApi, fetchUsers, resetUserPasswordApi, updateUserApi, type AdminUserRow } from '../services/apiClient'
import { CONTENT_SECTION_OPTIONS, ROLE_OPTIONS } from '../utils/roles'
import type { Role } from '../types'

export function UsersView() {
  const { data } = useData()
  const toast = useToast()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [nu, setNu] = useState({ username: '', password: '', role: 'progettista' as Role, linkedPersonId: '' })

  const reload = () => fetchUsers().then(setUsers).catch(() => toast.error('Impossibile caricare gli utenti.'))
  useEffect(() => { void reload() }, [])

  const people = useMemo(() => data.people.filter((p) => p.active), [data.people])

  async function create() {
    try { await createUserApi(nu); setNu({ username: '', password: '', role: 'progettista', linkedPersonId: '' }); await reload(); toast.success('Utente creato.') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore creazione utente.') }
  }
  async function change(id: string, patch: { role?: Role; active?: boolean; linkedPersonId?: string }) {
    try { await updateUserApi(id, patch); await reload() } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.') }
  }
  async function toggleSection(u: AdminUserRow, section: string) {
    const next = new Set(u.visibleSections)
    if (next.has(section)) next.delete(section)
    else next.add(section)
    try { await updateUserApi(u.id, { sections: [...next] }); await reload() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.') }
  }
  async function resetPw(id: string) {
    const np = prompt('Nuova password (min 8):'); if (!np) return
    try { await resetUserPasswordApi(id, np); toast.success('Password reimpostata.') } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.') }
  }
  async function remove(id: string) {
    if (!confirm('Eliminare l\'utente?')) return
    try { await deleteUserApi(id); await reload() } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.') }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-100">Utenti</h2>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-800/80 p-4">
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Username</span>
          <input className="input-base" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Password</span>
          <input type="password" className="input-base" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Ruolo</span>
          <select className="input-base" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as Role })}>
            {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-[11px] uppercase text-slate-500">Persona collegata</span>
          <select className="input-base" value={nu.linkedPersonId} onChange={(e) => setNu({ ...nu, linkedPersonId: e.target.value })}>
            <option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <button className="btn-primary" onClick={create}>+ Crea utente</button>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase text-slate-400"><tr>
          <th className="px-2 py-1">Username</th><th className="px-2 py-1">Ruolo</th><th className="px-2 py-1">Persona</th><th className="px-2 py-1">Attivo</th><th className="px-2 py-1">Sezioni visibili <span className="normal-case text-slate-500">(vuoto = come il ruolo)</span></th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-slate-800/60">
              <td className="px-2 py-1">{u.username}</td>
              <td className="px-2 py-1">
                <select className="input-base" value={u.role} onChange={(e) => change(u.id, { role: e.target.value as Role })}>
                  {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              <td className="px-2 py-1">
                <select className="input-base" value={u.linkedPersonId} onChange={(e) => change(u.id, { linkedPersonId: e.target.value })}>
                  <option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
              <td className="px-2 py-1"><input type="checkbox" checked={u.active} onChange={(e) => change(u.id, { active: e.target.checked })} /></td>
              <td className="px-2 py-1">
                <div className="flex max-w-[420px] flex-wrap gap-x-3 gap-y-0.5">
                  {CONTENT_SECTION_OPTIONS.map(([id, label]) => (
                    <label key={id} className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                      <input type="checkbox" checked={u.visibleSections.includes(id)} onChange={() => toggleSection(u, id)} />
                      {label}
                    </label>
                  ))}
                </div>
              </td>
              <td className="px-2 py-1 text-right">
                <button className="btn-ghost text-xs" onClick={() => resetPw(u.id)}>Reset password</button>
                <button className="btn-ghost text-xs text-red-300" onClick={() => remove(u.id)}>Elimina</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
