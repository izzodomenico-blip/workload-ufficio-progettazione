import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import {
  ALL_WORKSHOP_WORKER_SKILLS,
  WORKSHOP_WORKER_SKILL_LABELS,
} from '../types'
import type { WorkshopWorker, WorkshopWorkerSkill } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import type { CreateWorkshopWorkerInput } from '../services/workshopWorkersService'
import { parseWorkshopWorkersExcel } from '../utils/workshopWorkersImport'
import type { WorkshopWorkerImportPlan } from '../utils/workshopWorkersImport'
import { Modal } from './Modal'
import { ConfirmDialog } from './ConfirmDialog'

type StatusFilter = 'attivi' | 'disattivati' | 'tutti'
type SkillFilter = WorkshopWorkerSkill | 'tutte'

const EMPTY_FORM: CreateWorkshopWorkerInput = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  displayName: '',
  role: '',
  department: '',
  employmentType: '',
  phone: '',
  mobilePhone: '',
  email: '',
  address: '',
  city: '',
  province: '',
  fiscalCode: '',
  birthDate: '',
  hireDate: '',
  skills: [],
  primarySkill: '',
  dailyCapacityPoints: 100,
  weeklyCapacityPoints: 500,
  active: true,
  notes: '',
}

export function WorkshopWorkersView() {
  const {
    workshopWorkers,
    createWorkshopWorker,
    updateWorkshopWorker,
    setWorkshopWorkerActive,
    applyWorkshopWorkerImport,
  } = useData()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [search, setSearch] = useState('')
  const [skillFilter, setSkillFilter] = useState<SkillFilter>('tutte')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('attivi')
  const [editing, setEditing] = useState<WorkshopWorker | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [toggleTarget, setToggleTarget] = useState<WorkshopWorker | null>(null)
  const [importPlan, setImportPlan] = useState<WorkshopWorkerImportPlan | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  const counts = useMemo(() => {
    const active = workshopWorkers.filter((worker) => worker.active)
    return {
      active: active.length,
      inactive: workshopWorkers.length - active.length,
      laserPiano: active.filter((worker) => worker.skills.includes('laser_piano')).length,
      laserTubo: active.filter((worker) => worker.skills.includes('laser_tubo')).length,
      piegatrice: active.filter((worker) => worker.skills.includes('piegatrice')).length,
      saldatura: active.filter((worker) => worker.skills.includes('saldatura')).length,
      montaggio: active.filter((worker) => worker.skills.includes('montaggio')).length,
    }
  }, [workshopWorkers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return workshopWorkers.filter((worker) => {
      if (statusFilter === 'attivi' && !worker.active) return false
      if (statusFilter === 'disattivati' && worker.active) return false
      if (skillFilter !== 'tutte' && !worker.skills.includes(skillFilter)) return false
      if (!q) return true
      const hay = [
        worker.displayName,
        worker.firstName,
        worker.lastName,
        worker.role,
        worker.department,
        worker.phone,
        worker.mobilePhone,
        worker.email,
        worker.fiscalCode,
        worker.skills.map((skill) => WORKSHOP_WORKER_SKILL_LABELS[skill]).join(' '),
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [workshopWorkers, search, skillFilter, statusFilter])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportBusy(true)
    try {
      const plan = await parseWorkshopWorkersExcel(file, workshopWorkers)
      setImportPlan(plan)
    } catch (error) {
      console.error('Import Excel dipendenti fallito', error)
      toast.error(`Import Excel non riuscito: ${error instanceof Error ? error.message : 'errore sconosciuto'}`)
    } finally {
      setImportBusy(false)
    }
  }

  function confirmImport() {
    if (!importPlan || importPlan.errors.length > 0) return
    const result = applyWorkshopWorkerImport(importPlan)
    toast.success(`Import completato: ${result.created} nuovi, ${result.updated} aggiornati, ${result.skipped} scartati.`)
    setImportPlan(null)
  }

  function confirmToggle() {
    if (!toggleTarget) return
    setWorkshopWorkerActive(toggleTarget.id, !toggleTarget.active)
    toast.success(toggleTarget.active ? 'Operaio disattivato.' : 'Operaio riattivato.')
    setToggleTarget(null)
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-label">Anagrafica officina</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">Operai officina</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Dipendenti e mansioni operative condivise dal database SQLite locale.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleFileChange}
          />
          <button className="btn-ghost" onClick={() => fileInputRef.current?.click()} disabled={importBusy}>
            <UploadIcon />
            {importBusy ? 'Lettura Excel...' : 'Importa Excel dipendenti'}
          </button>
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            Nuovo operaio
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        <KpiCard label="Attivi" value={counts.active} tone="emerald" />
        <KpiCard label="Laser piano" value={counts.laserPiano} tone="sky" />
        <KpiCard label="Laser tubo" value={counts.laserTubo} tone="violet" />
        <KpiCard label="Piegatrice" value={counts.piegatrice} tone="amber" />
        <KpiCard label="Saldatori" value={counts.saldatura} tone="orange" />
        <KpiCard label="Montatori" value={counts.montaggio} tone="slate" />
        <KpiCard label="Disattivati" value={counts.inactive} tone="zinc" />
      </div>

      <div className="panel grid grid-cols-1 gap-2 p-3 lg:grid-cols-[1fr_220px_180px]">
        <label>
          <span className="sr-only">Cerca operaio</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="input-base"
            placeholder="Cerca nome, telefono, mansione, reparto..."
          />
        </label>
        <label>
          <span className="sr-only">Mansione</span>
          <select value={skillFilter} onChange={(event) => setSkillFilter(event.target.value as SkillFilter)} className="input-base">
            <option value="tutte">Tutte le mansioni</option>
            {ALL_WORKSHOP_WORKER_SKILLS.map((skill) => (
              <option key={skill} value={skill}>{WORKSHOP_WORKER_SKILL_LABELS[skill]}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Stato</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="input-base">
            <option value="attivi">Solo attivi</option>
            <option value="disattivati">Solo disattivati</option>
            <option value="tutti">Tutti</option>
          </select>
        </label>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="table-head border-b border-slate-800">
              <tr>
                <th className="px-3 py-2.5 w-[28px]" />
                <th className="px-3 py-2.5 font-semibold">Nominativo</th>
                <th className="px-3 py-2.5 font-semibold">Ruolo / mansione</th>
                <th className="px-3 py-2.5 font-semibold">Reparto</th>
                <th className="px-3 py-2.5 font-semibold">Skill</th>
                <th className="px-3 py-2.5 font-semibold">Telefono</th>
                <th className="px-3 py-2.5 font-semibold">Cellulare</th>
                <th className="px-3 py-2.5 font-semibold">Email</th>
                <th className="px-3 py-2.5 font-semibold text-right">Cap. giorno</th>
                <th className="px-3 py-2.5 font-semibold text-right">Cap. sett.</th>
                <th className="px-3 py-2.5 font-semibold text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((worker) => (
                <tr key={worker.id} className={`table-row ${worker.active ? '' : 'opacity-60'}`}>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex h-2 w-2 rounded-full ${worker.active ? 'bg-emerald-400 ring-2 ring-emerald-500/30' : 'bg-zinc-500'}`} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-100">{worker.displayName}</div>
                    {worker.employeeCode && <div className="mt-0.5 font-mono text-[10px] text-slate-500">{worker.employeeCode}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{worker.role || '-'}</td>
                  <td className="px-3 py-2.5 text-slate-300">{worker.department || '-'}</td>
                  <td className="px-3 py-2.5"><SkillBadges worker={worker} /></td>
                  <td className="px-3 py-2.5 text-slate-400">{worker.phone || '-'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{worker.mobilePhone || '-'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{worker.email || '-'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{worker.dailyCapacityPoints}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{worker.weeklyCapacityPoints}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button className="btn-ghost text-xs" onClick={() => setEditing(worker)}>Modifica</button>
                      <button
                        className={worker.active ? 'btn-ghost text-xs text-amber-200' : 'btn-ghost text-xs text-emerald-200'}
                        onClick={() => setToggleTarget(worker)}
                      >
                        {worker.active ? 'Disattiva' : 'Riattiva'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-14 text-center text-sm text-slate-500">
                    Nessun operaio officina corrisponde ai filtri correnti.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <WorkshopWorkerFormModal
        open={createOpen}
        title="Nuovo operaio officina"
        initial={EMPTY_FORM}
        onClose={() => setCreateOpen(false)}
        onSave={(payload) => {
          createWorkshopWorker(payload)
          toast.success('Operaio officina creato.')
          setCreateOpen(false)
        }}
      />

      <WorkshopWorkerFormModal
        open={editing !== null}
        title={`Modifica ${editing?.displayName ?? 'operaio'}`}
        initial={editing ? toForm(editing) : EMPTY_FORM}
        onClose={() => setEditing(null)}
        onSave={(payload) => {
          if (!editing) return
          updateWorkshopWorker(editing.id, payload)
          toast.success('Operaio officina aggiornato.')
          setEditing(null)
        }}
      />

      <ImportWorkersPreviewModal
        plan={importPlan}
        onCancel={() => setImportPlan(null)}
        onConfirm={confirmImport}
      />

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        title={toggleTarget?.active ? 'Disattivare operaio?' : 'Riattivare operaio?'}
        message={
          toggleTarget
            ? `${toggleTarget.displayName}: il record non verra cancellato, cambiera solo lo stato active.`
            : ''
        }
        confirmLabel={toggleTarget?.active ? 'Disattiva' : 'Riattiva'}
        danger={Boolean(toggleTarget?.active)}
        onConfirm={confirmToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </section>
  )
}

function WorkshopWorkerFormModal({
  open,
  title,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  initial: CreateWorkshopWorkerInput
  onClose: () => void
  onSave: (payload: CreateWorkshopWorkerInput) => void
}) {
  const [form, setForm] = useState<CreateWorkshopWorkerInput>(initial)

  useEffect(() => {
    if (open) setForm(initial)
  }, [open, title])

  function set<K extends keyof CreateWorkshopWorkerInput>(key: K, value: CreateWorkshopWorkerInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleSkill(skill: WorkshopWorkerSkill) {
    const next = form.skills.includes(skill)
      ? form.skills.filter((item) => item !== skill)
      : [...form.skills, skill]
    setForm((current) => ({
      ...current,
      skills: next,
      primarySkill: current.primarySkill && next.includes(current.primarySkill) ? current.primarySkill : (next[0] ?? ''),
    }))
  }

  function save() {
    const displayName = form.displayName.trim() || [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ')
    if (!displayName) return
    onSave({
      ...form,
      displayName,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dailyCapacityPoints: Math.max(1, Math.round(form.dailyCapacityPoints)),
      weeklyCapacityPoints: Math.max(1, Math.round(form.weeklyCapacityPoints)),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="Anagrafica, contatti, mansioni e capacita relativa"
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Annulla</button>
          <button onClick={save} className="btn-primary" disabled={!form.displayName.trim() && !form.firstName.trim() && !form.lastName.trim()}>
            Salva operaio
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Nome">
          <input className="input-base" value={form.firstName} onChange={(event) => set('firstName', event.target.value)} />
        </Field>
        <Field label="Cognome">
          <input className="input-base" value={form.lastName} onChange={(event) => set('lastName', event.target.value)} />
        </Field>
        <Field label="Nominativo" className="md:col-span-2">
          <input className="input-base" value={form.displayName} onChange={(event) => set('displayName', event.target.value)} placeholder="Mario Rossi" />
        </Field>
        <Field label="Codice / matricola">
          <input className="input-base" value={form.employeeCode} onChange={(event) => set('employeeCode', event.target.value)} />
        </Field>
        <Field label="Codice fiscale">
          <input className="input-base font-mono" value={form.fiscalCode} onChange={(event) => set('fiscalCode', event.target.value)} />
        </Field>
        <Field label="Mansione / ruolo">
          <input className="input-base" value={form.role} onChange={(event) => set('role', event.target.value)} />
        </Field>
        <Field label="Reparto">
          <input className="input-base" value={form.department} onChange={(event) => set('department', event.target.value)} />
        </Field>
        <Field label="Tipo contratto">
          <input className="input-base" value={form.employmentType} onChange={(event) => set('employmentType', event.target.value)} />
        </Field>
        <Field label="Skill primaria">
          <select value={form.primarySkill} onChange={(event) => set('primarySkill', event.target.value as WorkshopWorkerSkill | '')} className="input-base">
            <option value="">Nessuna</option>
            {form.skills.map((skill) => (
              <option key={skill} value={skill}>{WORKSHOP_WORKER_SKILL_LABELS[skill]}</option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <div className="mb-2 section-label">Mansioni abilitate</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {ALL_WORKSHOP_WORKER_SKILLS.map((skill) => (
              <label key={skill} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.skills.includes(skill)}
                  onChange={() => toggleSkill(skill)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                />
                <span>{WORKSHOP_WORKER_SKILL_LABELS[skill]}</span>
              </label>
            ))}
          </div>
        </div>
        <Field label="Telefono">
          <input className="input-base" value={form.phone} onChange={(event) => set('phone', event.target.value)} />
        </Field>
        <Field label="Cellulare">
          <input className="input-base" value={form.mobilePhone} onChange={(event) => set('mobilePhone', event.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" className="input-base" value={form.email} onChange={(event) => set('email', event.target.value)} />
        </Field>
        <Field label="Indirizzo">
          <input className="input-base" value={form.address} onChange={(event) => set('address', event.target.value)} placeholder="Indirizzo se disponibile" />
        </Field>
        <Field label="Citta">
          <input className="input-base" value={form.city} onChange={(event) => set('city', event.target.value)} />
        </Field>
        <Field label="Provincia">
          <input className="input-base" value={form.province} onChange={(event) => set('province', event.target.value)} />
        </Field>
        <Field label="Data nascita">
          <input type="date" className="input-base" value={form.birthDate} onChange={(event) => set('birthDate', event.target.value)} />
        </Field>
        <Field label="Data assunzione">
          <input type="date" className="input-base" value={form.hireDate} onChange={(event) => set('hireDate', event.target.value)} />
        </Field>
        <Field label="Capacita giornaliera">
          <input type="number" min={1} className="input-base" value={form.dailyCapacityPoints} onChange={(event) => set('dailyCapacityPoints', Number(event.target.value))} />
        </Field>
        <Field label="Capacita settimanale">
          <input type="number" min={1} className="input-base" value={form.weeklyCapacityPoints} onChange={(event) => set('weeklyCapacityPoints', Number(event.target.value))} />
        </Field>
        <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
          <input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} className="h-4 w-4 rounded border-slate-700 bg-slate-900" />
          Attivo
        </label>
        <Field label="Note" className="md:col-span-2">
          <textarea rows={3} className="input-base resize-y" value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        </Field>
        {form.extraFields && Object.keys(form.extraFields).length > 0 && (
          <div className="md:col-span-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <div className="section-label">Dettagli extra importati</div>
            <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-300 md:grid-cols-2">
              {Object.entries(form.extraFields).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <span className="text-slate-500">{key}: </span>
                  <span className="break-words text-slate-200">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function ImportWorkersPreviewModal({
  plan,
  onCancel,
  onConfirm,
}: {
  plan: WorkshopWorkerImportPlan | null
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!plan) return null
  const canImport = plan.errors.length === 0 && (plan.toCreate + plan.toUpdate) > 0
  return (
    <Modal
      open={Boolean(plan)}
      onClose={onCancel}
      title="Anteprima import dipendenti"
      subtitle="L'import aggiorna o aggiunge dipendenti senza cancellare quelli esistenti"
      size="lg"
      footer={
        <>
          <button onClick={onCancel} className="btn-ghost">Annulla</button>
          <button onClick={onConfirm} className="btn-primary" disabled={!canImport}>Conferma import</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm sm:grid-cols-2">
          <Info label="File" value={plan.fileName} mono />
          <Info label="Foglio letto" value={plan.sheetName || '-'} />
          <Info label="Righe lette" value={String(plan.totalRows)} />
          <Info label="Record validi" value={String(plan.recordsRead)} />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <MiniStat label="Nuovi" value={plan.toCreate} tone="emerald" />
          <MiniStat label="Aggiornati" value={plan.toUpdate} tone="sky" />
          <MiniStat label="Scartati" value={plan.toSkip} tone="amber" />
          <MiniStat label="Duplicati possibili" value={plan.possibleDuplicates} tone="violet" />
          <MiniStat label="Colonne" value={plan.headers.length} tone="slate" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <ColumnList title="Colonne riconosciute" items={plan.recognizedColumns.map((column) => `${column.header} -> ${column.label}`)} />
          <ColumnList title="Colonne non riconosciute / extra" items={plan.unrecognizedColumns} />
        </div>
        {plan.errors.length > 0 && (
          <div className="rounded-lg border border-red-500/35 bg-red-500/10 p-3 text-sm text-red-100">
            {plan.errors.map((error) => <div key={error}>{error}</div>)}
          </div>
        )}
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100">
          L'import aggiornera o aggiungera dipendenti, senza cancellare quelli esistenti.
        </div>
      </div>
    </Modal>
  )
}

function SkillBadges({ worker }: { worker: WorkshopWorker }) {
  if (worker.skills.length === 0) return <span className="text-xs text-slate-500">-</span>
  return (
    <div className="flex max-w-[240px] flex-wrap gap-1">
      {worker.skills.slice(0, 4).map((skill) => (
        <span key={skill} className={`chip-sm ${skill === worker.primarySkill ? 'bg-sky-500/10 text-sky-200 ring-sky-500/30' : 'bg-slate-500/10 text-slate-300 ring-slate-500/25'}`}>
          {WORKSHOP_WORKER_SKILL_LABELS[skill]}
        </span>
      ))}
      {worker.skills.length > 4 && <span className="chip-sm bg-slate-500/10 text-slate-400 ring-slate-500/25">+{worker.skills.length - 4}</span>}
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`space-y-1.5 ${className}`}>
      <span className="section-label">{label}</span>
      {children}
    </label>
  )
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="section-label">{label}</div>
      <div className={`mt-1 break-words text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  )
}

function ColumnList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="section-label">{title}</div>
      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto scroll-thin text-xs text-slate-300">
        {items.length === 0 ? <span className="text-slate-500">Nessuna</span> : items.map((item) => <div key={item}>{item}</div>)}
      </div>
    </div>
  )
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'sky' | 'violet' | 'amber' | 'orange' | 'slate' | 'zinc' }) {
  const cls = {
    emerald: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-200',
    sky: 'border-sky-500/30 bg-sky-500/8 text-sky-200',
    violet: 'border-violet-500/30 bg-violet-500/8 text-violet-200',
    amber: 'border-amber-500/30 bg-amber-500/8 text-amber-200',
    orange: 'border-orange-500/30 bg-orange-500/8 text-orange-200',
    slate: 'border-slate-600/60 bg-slate-800/40 text-slate-200',
    zinc: 'border-zinc-500/30 bg-zinc-500/8 text-zinc-200',
  }[tone]
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-75">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'sky' | 'amber' | 'violet' | 'slate' }) {
  return <KpiCard label={label} value={value} tone={tone} />
}

function toForm(worker: WorkshopWorker): CreateWorkshopWorkerInput {
  return {
    employeeCode: worker.employeeCode,
    firstName: worker.firstName,
    lastName: worker.lastName,
    displayName: worker.displayName,
    role: worker.role,
    department: worker.department,
    employmentType: worker.employmentType,
    phone: worker.phone,
    mobilePhone: worker.mobilePhone,
    email: worker.email,
    address: worker.address,
    city: worker.city,
    province: worker.province,
    fiscalCode: worker.fiscalCode,
    birthDate: worker.birthDate,
    hireDate: worker.hireDate,
    skills: worker.skills,
    primarySkill: worker.primarySkill,
    dailyCapacityPoints: worker.dailyCapacityPoints,
    weeklyCapacityPoints: worker.weeklyCapacityPoints,
    active: worker.active,
    notes: worker.notes,
    extraFields: worker.extraFields,
  }
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12m0-12-4 4m4-4 4 4M5 21h14" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
