import { useCallback, useEffect, useState } from 'react'
import type { Person } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { validatePerson } from '../utils/validation'
import {
  fetchAdminStatus,
  setAdminPassword,
  verifyAdminPassword,
} from '../services/apiClient'
import { Modal } from './Modal'
import { FormField } from './FormField'

interface Props {
  open: boolean
  onClose: () => void
}

export function PeopleSettingsModal({ open, onClose }: Props) {
  const { data, updatePeople } = useData()
  const toast = useToast()

  const [draft, setDraft] = useState<Person[]>(() => data.people.map((p) => ({ ...p, skills: [...p.skills] })))
  const [adminStatus, setAdminStatusValue] = useState<AdminStatusUi>({ kind: 'loading' })
  const [adminPassword, setAdminPasswordState] = useState<string | null>(null)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [setPasswordOpen, setSetPasswordOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const refreshAdminStatus = useCallback(() => {
    setAdminStatusValue({ kind: 'loading' })
    fetchAdminStatus()
      .then((status) => setAdminStatusValue({ kind: status.protected ? 'protected' : 'unprotected' }))
      .catch((err) => setAdminStatusValue({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Backend non raggiungibile',
      }))
  }, [])

  // Reset draft + unlock state ogni volta che si apre la modale
  useEffect(() => {
    if (!open) return
    setDraft(data.people.map((p) => ({ ...p, skills: [...p.skills] })))
    setAdminPasswordState(null)
    refreshAdminStatus()
  }, [open, data.people, refreshAdminStatus])

  const protectedState =
    adminStatus.kind === 'protected' ? true : adminStatus.kind === 'unprotected' ? false : null

  function setField<K extends keyof Person>(idx: number, key: K, value: Person[K]) {
    setDraft((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)))
  }

  function addSkill(idx: number, skill: string) {
    const v = skill.trim()
    if (!v) return
    setDraft((prev) => prev.map((p, i) => {
      if (i !== idx) return p
      if (p.skills.includes(v)) return p
      return { ...p, skills: [...p.skills, v] }
    }))
  }

  function removeSkill(idx: number, skill: string) {
    setDraft((prev) => prev.map((p, i) => i === idx ? { ...p, skills: p.skills.filter((s) => s !== skill) } : p))
  }

  const baselineChanged = hasBaselineDiff(data.people, draft)
  const needsAdminPassword = baselineChanged && protectedState === true && !adminPassword
  const baselineUnlocked = !baselineChanged || protectedState !== true || adminPassword !== null

  async function handleSave() {
    for (const p of draft) {
      const r = validatePerson(p)
      if (!r.ok) {
        const firstErr = Object.values(r.errors)[0]
        toast.error(`${p.name || 'Persona'}: ${firstErr}`)
        return
      }
    }
    if (needsAdminPassword) {
      setUnlockOpen(true)
      return
    }
    setSaving(true)
    try {
      updatePeople(draft, adminPassword ? { adminPassword } : undefined)
      toast.success(`Salvate ${draft.length} persone.`)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function handleUnlockSuccess(password: string) {
    setAdminPasswordState(password)
    setUnlockOpen(false)
    toast.success('Sbloccato per questa sessione di modifica.')
  }

  function handlePasswordUpdated(nowProtected: boolean) {
    setAdminStatusValue({ kind: nowProtected ? 'protected' : 'unprotected' })
    setSetPasswordOpen(false)
    setAdminPasswordState(null)
    if (nowProtected) {
      toast.success('Password admin aggiornata.')
    } else {
      toast.info('Protezione admin rimossa.')
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Persone e capacità"
        subtitle="Modifica nome, ruolo, ore settimanali, skill e carico base"
        size="lg"
        footer={
          <>
            <button onClick={onClose} className="btn-ghost" disabled={saving}>Annulla</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? 'Salvataggio…' : 'Salva tutto'}
            </button>
          </>
        }
      >
        <AdminStatusBanner
          status={adminStatus}
          unlocked={adminPassword !== null}
          onUnlock={() => setUnlockOpen(true)}
          onSetPassword={() => setSetPasswordOpen(true)}
          onRetry={refreshAdminStatus}
        />

        <div className="mt-4 space-y-3">
          {draft.map((p, idx) => (
            <PersonEditor
              key={p.id}
              person={p}
              originalBaseline={data.people.find((x) => x.id === p.id)?.baselineLoadPercent}
              baselineEditable={baselineUnlocked || protectedState !== true}
              protectedField={protectedState === true}
              onUnlockRequest={() => setUnlockOpen(true)}
              onChange={(k, v) => setField(idx, k, v)}
              onAddSkill={(s) => addSkill(idx, s)}
              onRemoveSkill={(s) => removeSkill(idx, s)}
            />
          ))}
        </div>
      </Modal>

      <AdminUnlockDialog
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        onSuccess={handleUnlockSuccess}
      />

      <AdminSetPasswordDialog
        open={setPasswordOpen}
        protectedState={protectedState === true}
        onClose={() => setSetPasswordOpen(false)}
        onSuccess={handlePasswordUpdated}
      />
    </>
  )
}

function hasBaselineDiff(before: Person[], after: Person[]): boolean {
  const map = new Map(before.map((p) => [p.id, p.baselineLoadPercent ?? 0]))
  for (const p of after) {
    if ((p.baselineLoadPercent ?? 0) !== (map.get(p.id) ?? 0)) return true
  }
  return false
}

// === Banner stato protezione ===

type AdminStatusUi =
  | { kind: 'loading' }
  | { kind: 'protected' }
  | { kind: 'unprotected' }
  | { kind: 'error'; message: string }

function AdminStatusBanner({
  status,
  unlocked,
  onUnlock,
  onSetPassword,
  onRetry,
}: {
  status: AdminStatusUi
  unlocked: boolean
  onUnlock: () => void
  onSetPassword: () => void
  onRetry: () => void
}) {
  if (status.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-[12px] text-slate-400">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" aria-hidden />
        Verifica protezione admin in corso…
      </div>
    )
  }
  if (status.kind === 'error') {
    return (
      <div className="flex items-start gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-red-300" aria-hidden>
          <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
        </svg>
        <div className="min-w-0 flex-1 text-[12px] text-red-100">
          <div className="font-medium">Backend non raggiungibile</div>
          <p className="mt-0.5 text-red-200/85">
            Impossibile verificare la protezione admin ({status.message}).
            <br />
            Riavvia il server Node.js per caricare gli endpoint admin, poi riprova.
          </p>
        </div>
        <button onClick={onRetry} className="btn-ghost shrink-0">
          Riprova
        </button>
      </div>
    )
  }
  if (status.kind === 'unprotected') {
    return (
      <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-300" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div className="min-w-0 flex-1 text-[12px] text-amber-100">
          <div className="font-medium">Carico base non protetto</div>
          <p className="mt-0.5 text-amber-200/80">
            Chiunque acceda all'app può modificare il <em>Carico base %</em> delle persone.
            Imposta una password per proteggere il campo.
          </p>
        </div>
        <button onClick={onSetPassword} className="btn-ghost shrink-0">
          Imposta password
        </button>
      </div>
    )
  }
  return (
    <div className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${
      unlocked
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
        : 'border-sky-500/35 bg-sky-500/8 text-sky-100'
    }`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
        {unlocked ? (
          <>
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </>
        ) : (
          <>
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </>
        )}
      </svg>
      <div className="min-w-0 flex-1 text-[12px]">
        <div className="font-medium">
          {unlocked ? 'Carico base sbloccato per questa modifica' : 'Carico base protetto'}
        </div>
        <p className="mt-0.5 opacity-80">
          {unlocked
            ? 'Le modifiche verranno autorizzate al salvataggio.'
            : 'Sblocca con la password admin per modificare il carico base delle persone.'}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {!unlocked && (
          <button onClick={onUnlock} className="btn-ghost">
            Sblocca
          </button>
        )}
        <button onClick={onSetPassword} className="btn-ghost">
          Cambia password
        </button>
      </div>
    </div>
  )
}

interface PersonEditorProps {
  person: Person
  originalBaseline: number | undefined
  baselineEditable: boolean
  protectedField: boolean
  onUnlockRequest: () => void
  onChange: <K extends keyof Person>(key: K, value: Person[K]) => void
  onAddSkill: (skill: string) => void
  onRemoveSkill: (skill: string) => void
}

function PersonEditor({
  person,
  originalBaseline,
  baselineEditable,
  protectedField,
  onUnlockRequest,
  onChange,
  onAddSkill,
  onRemoveSkill,
}: PersonEditorProps) {
  const [skillDraft, setSkillDraft] = useState('')
  const baselineValue = person.baselineLoadPercent ?? 0
  const baselineChanged = baselineValue !== (originalBaseline ?? 0)

  return (
    <div className={`rounded-lg border p-3 transition ${person.active ? 'border-slate-700 bg-slate-900/40' : 'border-slate-800 bg-slate-900/20 opacity-70'}`}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <FormField label="Nome" className="md:col-span-3" required>
          <input className="input-base" value={person.name} onChange={(e) => onChange('name', e.target.value)} />
        </FormField>
        <FormField label="Ruolo" className="md:col-span-4" required>
          <input className="input-base" value={person.role} onChange={(e) => onChange('role', e.target.value)} />
        </FormField>
        <FormField label="Ore/sett" className="md:col-span-2" required hint="0–80">
          <input
            type="number" min={0} max={80} className="input-base"
            value={person.weeklyCapacityHours}
            onChange={(e) => onChange('weeklyCapacityHours', Number(e.target.value))}
          />
        </FormField>
        <FormField label="Attiva" className="md:col-span-3">
          <button
            type="button"
            onClick={() => onChange('active', !person.active)}
            className={`mt-0.5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border text-xs font-medium transition ${
              person.active
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-zinc-600 bg-zinc-800/40 text-zinc-400'
            }`}
          >
            <span aria-hidden>{person.active ? '●' : '○'}</span>
            {person.active ? 'Attiva' : 'Disattivata'}
          </button>
        </FormField>

        <FormField
          label="Carico base %"
          className="md:col-span-4"
          hint={baselineEditable
            ? 'Lavoro non dichiarato come task (supervisione, coordinamento). Si scala in caso di assenze.'
            : 'Campo protetto da password admin.'}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                className={`input-base pr-8 ${baselineChanged && baselineEditable ? 'border-sky-500/60' : ''}`}
                value={baselineValue}
                disabled={!baselineEditable}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  onChange('baselineLoadPercent', Number.isFinite(n) ? n : 0)
                }}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">%</span>
            </div>
            {protectedField && !baselineEditable && (
              <button
                type="button"
                onClick={onUnlockRequest}
                className="btn-ghost shrink-0"
                title="Sblocca il campo con la password admin"
              >
                <LockIcon /> Sblocca
              </button>
            )}
            {protectedField && baselineEditable && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200 ring-1 ring-inset ring-emerald-500/35">
                <UnlockIcon /> sbloccato
              </span>
            )}
          </div>
        </FormField>

        <FormField label="Skill" className="md:col-span-8" hint="Premi Invio per aggiungere">
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                className="input-base flex-1"
                placeholder="Es. layout, distinte, calcolo strutturale…"
                value={skillDraft}
                onChange={(e) => setSkillDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onAddSkill(skillDraft)
                    setSkillDraft('')
                  }
                }}
              />
              <button
                type="button"
                onClick={() => { onAddSkill(skillDraft); setSkillDraft('') }}
                className="btn-ghost"
              >
                + Aggiungi
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {person.skills.length === 0 && <span className="text-xs text-slate-500">Nessuna skill definita.</span>}
              {person.skills.map((s) => (
                <span key={s} className="chip bg-slate-800 text-slate-200 ring-slate-700">
                  {s}
                  <button
                    type="button"
                    onClick={() => onRemoveSkill(s)}
                    className="ml-1 text-slate-400 hover:text-red-300"
                    aria-label={`Rimuovi ${s}`}
                  >×</button>
                </span>
              ))}
            </div>
          </div>
        </FormField>

        <FormField label="Note" className="md:col-span-12">
          <textarea
            rows={2}
            className="input-base resize-y"
            value={person.notes ?? ''}
            onChange={(e) => onChange('notes', e.target.value || undefined)}
            placeholder="Annotazioni interne (es. ferie programmate)"
          />
        </FormField>
      </div>
    </div>
  )
}

// === Dialog: sblocco con password ===

function AdminUnlockDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: (password: string) => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setPassword('')
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  async function handleSubmit() {
    if (!password) {
      setError('Inserisci la password.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await verifyAdminPassword(password)
      if (!result.ok) {
        setError('Password non corretta.')
        return
      }
      onSuccess(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore verifica password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sblocca carico base"
      subtitle="Inserisci la password admin per modificare il carico base delle persone"
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost" disabled={submitting}>Annulla</button>
          <button onClick={handleSubmit} className="btn-primary" disabled={submitting}>
            {submitting ? 'Verifico…' : 'Sblocca'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Password admin" error={error ?? undefined}>
          <input
            type="password"
            className="input-base"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSubmit()
              }
            }}
          />
        </FormField>
        <p className="text-[11px] text-slate-500">
          Lo sblocco vale solo per la modifica corrente. Chiudendo questa finestra,
          dovrai inserire di nuovo la password per cambiare altri valori.
        </p>
      </div>
    </Modal>
  )
}

// === Dialog: imposta/cambia password ===

function AdminSetPasswordDialog({
  open,
  protectedState,
  onClose,
  onSuccess,
}: {
  open: boolean
  protectedState: boolean
  onClose: () => void
  onSuccess: (nowProtected: boolean) => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [removeMode, setRemoveMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
      setRemoveMode(false)
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  async function handleSubmit() {
    setError(null)
    if (protectedState && !currentPassword) {
      setError('Inserisci la password attuale.')
      return
    }
    if (!removeMode) {
      if (newPassword.length < 4) {
        setError('La nuova password deve avere almeno 4 caratteri.')
        return
      }
      if (newPassword !== confirm) {
        setError('Le due password non coincidono.')
        return
      }
    }
    setSubmitting(true)
    try {
      const result = await setAdminPassword({
        currentPassword: protectedState ? currentPassword : undefined,
        newPassword: removeMode ? '' : newPassword,
      })
      onSuccess(result.protected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore aggiornamento password.')
    } finally {
      setSubmitting(false)
    }
  }

  const title = protectedState
    ? (removeMode ? 'Rimuovi protezione' : 'Cambia password admin')
    : 'Imposta password admin'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="La password protegge il campo 'Carico base %' lato server"
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost" disabled={submitting}>Annulla</button>
          <button onClick={handleSubmit} className="btn-primary" disabled={submitting}>
            {submitting ? 'Salvataggio…' : (removeMode ? 'Rimuovi protezione' : 'Salva password')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {protectedState && (
          <FormField label="Password attuale" required>
            <input
              type="password"
              className="input-base"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
            />
          </FormField>
        )}

        {!removeMode && (
          <>
            <FormField label="Nuova password" hint="Minimo 4 caratteri" required>
              <input
                type="password"
                className="input-base"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </FormField>
            <FormField label="Conferma nuova password" required>
              <input
                type="password"
                className="input-base"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </FormField>
          </>
        )}

        {protectedState && (
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-800 bg-slate-900/35 px-3 py-2 text-xs text-slate-300 hover:bg-slate-900/55">
            <input
              type="checkbox"
              checked={removeMode}
              onChange={(e) => setRemoveMode(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 accent-sky-500"
            />
            <span>
              <span className="font-medium text-slate-200">Rimuovi protezione</span>
              <br />
              <span className="text-[11px] text-slate-500">
                Il campo "Carico base %" diventerà modificabile senza password.
              </span>
            </span>
          </label>
        )}

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function UnlockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  )
}
