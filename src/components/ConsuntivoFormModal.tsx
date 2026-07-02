import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { WorkItemAutocomplete } from './WorkItemAutocomplete'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { mergeTubeProfiles } from '../data/tubeProfiles'
import { sheetWeightKg, tubeWeightKg } from '../utils/consuntiviCalc'
import { consuntivoFromWorkItem } from '../services/consuntiviService'
import {
  ALL_CONSUNTIVO_GAS,
  ALL_CONSUNTIVO_MATERIALS,
  ALL_TUBE_CATEGORIES,
  CONSUNTIVO_MATERIAL_LABELS,
  TUBE_CATEGORY_LABELS,
} from '../types'
import type {
  BendingRow,
  Consuntivo,
  ConsuntivoMaterial,
  LaserCutRow,
  TubeCategory,
  TubeLaserRow,
  WeldingRow,
  WorkItem,
} from '../types'

interface Props {
  open: boolean
  onClose: () => void
  /** consuntivo esistente da modificare, oppure null per crearne uno nuovo */
  editing: Consuntivo | null
  densityFactorPerMaterial: Record<ConsuntivoMaterial, number>
}

function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export function ConsuntivoFormModal({ open, onClose, editing, densityFactorPerMaterial }: Props) {
  const { data, tubeProfiles, createConsuntivo, updateConsuntivo } = useData()
  const toast = useToast()
  const profiles = useMemo(() => mergeTubeProfiles(tubeProfiles), [tubeProfiles])

  const [workItemText, setWorkItemText] = useState(editing ? `${editing.workItemCode} · ${editing.workItemTitle}` : '')
  const [workItem, setWorkItem] = useState<WorkItem | null>(
    editing ? data.workItems.find((w) => w.id === editing.workItemId) ?? null : null,
  )
  const [date, setDate] = useState(editing?.date ?? todayISO())
  const [operatorName, setOperatorName] = useState(editing?.operatorName ?? '')
  const [laserRows, setLaserRows] = useState<LaserCutRow[]>(editing?.laserRows ?? [])
  const [tubeRows, setTubeRows] = useState<TubeLaserRow[]>(editing?.tubeRows ?? [])
  const [weldingRows, setWeldingRows] = useState<WeldingRow[]>(editing?.weldingRows ?? [])
  const [bendingRows, setBendingRows] = useState<BendingRow[]>(editing?.bendingRows ?? [])
  const [notes, setNotes] = useState(editing?.notes ?? '')

  function addLaser() {
    setLaserRows((r) => [...r, { id: rid('r'), lunghezzaMm: 0, larghezzaMm: 0, spessoreMm: 0, materiale: 'ferro', tempoMin: 0, gas: 'ossigeno' }])
  }
  function addTube() {
    const first = profiles[0]
    setTubeRows((r) => [...r, {
      id: rid('t'), categoria: first?.categoria ?? 'tubolari', profileId: first?.id ?? '', profileLabel: first?.label ?? '',
      kgPerMeter: first?.kgPerMeter ?? 0, materiale: 'ferro', lunghezzaMm: 0, nPezzi: 1, tempoMin: 0,
    }])
  }
  function addWelding() { setWeldingRows((r) => [...r, { id: rid('w'), people: 1, hours: 0 }]) }
  function addBending() { setBendingRows((r) => [...r, { id: rid('b'), hours: 0 }]) }

  function setLaser(id: string, patch: Partial<LaserCutRow>) {
    setLaserRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }
  function setTube(id: string, patch: Partial<TubeLaserRow>) {
    setTubeRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function pickProfile(rowId: string, profileId: string) {
    const p = profiles.find((x) => x.id === profileId)
    if (!p) return
    setTube(rowId, { profileId: p.id, profileLabel: p.label, kgPerMeter: p.kgPerMeter, categoria: p.categoria })
  }

  function handleSave() {
    if (!workItem) { toast.error('Seleziona una commessa.'); return }
    const payload = {
      ...consuntivoFromWorkItem(workItem, date, operatorName),
      laserRows, tubeRows, weldingRows, bendingRows, notes,
    }
    if (editing) {
      updateConsuntivo(editing.id, payload)
      toast.success('Consuntivo aggiornato.')
    } else {
      createConsuntivo(payload)
      toast.success('Consuntivo creato.')
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Modifica consuntivo' : 'Nuovo consuntivo'}
      subtitle="Taglio laser · Laser tubi · Saldatura · Piega"
      size="xl"
      footer={(
        <>
          <button className="btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn-primary" onClick={handleSave}>Salva</button>
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FormField label="Commessa" required className="md:col-span-2">
          <WorkItemAutocomplete
            value={workItemText}
            onText={(t) => { setWorkItemText(t); setWorkItem(null) }}
            onPick={(w) => { setWorkItem(w); setWorkItemText(`${w.code} · ${w.title}`) }}
          />
        </FormField>
        <FormField label="Data">
          <input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Operatore" className="mt-3">
        <input className="input-base" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder="Nome operaio (facoltativo)" />
      </FormField>

      {/* SEZIONE TAGLIO LASER */}
      <Section title="Taglio laser" onAdd={addLaser}>
        {laserRows.map((row) => {
          const kg = sheetWeightKg(row, densityFactorPerMaterial[row.materiale] ?? 7.85)
          return (
            <div key={row.id} className="grid grid-cols-2 items-end gap-2 md:grid-cols-8">
              <NumInput label="Lungh. (mm)" value={row.lunghezzaMm} onChange={(v) => setLaser(row.id, { lunghezzaMm: v })} />
              <NumInput label="Largh. (mm)" value={row.larghezzaMm} onChange={(v) => setLaser(row.id, { larghezzaMm: v })} />
              <NumInput label="Spess. (mm)" value={row.spessoreMm} onChange={(v) => setLaser(row.id, { spessoreMm: v })} step="0.1" />
              <SelectInput label="Materiale" value={row.materiale} options={ALL_CONSUNTIVO_MATERIALS.map((m) => [m, CONSUNTIVO_MATERIAL_LABELS[m]])} onChange={(v) => setLaser(row.id, { materiale: v as ConsuntivoMaterial })} />
              <NumInput label="Tempo (min)" value={row.tempoMin} onChange={(v) => setLaser(row.id, { tempoMin: v })} step="0.1" />
              <SelectInput label="Gas" value={row.gas} options={ALL_CONSUNTIVO_GAS.map((g) => [g, g])} onChange={(v) => setLaser(row.id, { gas: v as LaserCutRow['gas'] })} />
              <div className="text-xs text-slate-300"><span className="block text-[11px] uppercase text-slate-500">kg</span>{kg.toFixed(1)}</div>
              <button className="btn-icon" onClick={() => setLaserRows((r) => r.filter((x) => x.id !== row.id))} aria-label="Rimuovi">✕</button>
            </div>
          )
        })}
      </Section>

      {/* SEZIONE LASER TUBI */}
      <Section title="Laser tubi" onAdd={addTube}>
        {tubeRows.map((row) => {
          const kg = tubeWeightKg(row)
          const catProfiles = profiles.filter((p) => p.categoria === row.categoria)
          return (
            <div key={row.id} className="grid grid-cols-2 items-end gap-2 md:grid-cols-8">
              <SelectInput label="Categoria" value={row.categoria} options={ALL_TUBE_CATEGORIES.map((c) => [c, TUBE_CATEGORY_LABELS[c]])} onChange={(v) => setTube(row.id, { categoria: v as TubeCategory })} />
              <SelectInput label="Profilo" value={row.profileId} options={catProfiles.map((p) => [p.id, `${p.label} (${p.kgPerMeter} kg/m)`])} onChange={(v) => pickProfile(row.id, v)} />
              <SelectInput label="Materiale" value={row.materiale} options={ALL_CONSUNTIVO_MATERIALS.map((m) => [m, CONSUNTIVO_MATERIAL_LABELS[m]])} onChange={(v) => setTube(row.id, { materiale: v as ConsuntivoMaterial })} />
              <NumInput label="Lungh. (mm)" value={row.lunghezzaMm} onChange={(v) => setTube(row.id, { lunghezzaMm: v })} />
              <NumInput label="N° pezzi" value={row.nPezzi} onChange={(v) => setTube(row.id, { nPezzi: v })} />
              <NumInput label="Tempo (min)" value={row.tempoMin} onChange={(v) => setTube(row.id, { tempoMin: v })} step="0.1" />
              <div className="text-xs text-slate-300"><span className="block text-[11px] uppercase text-slate-500">kg</span>{kg.toFixed(1)}</div>
              <button className="btn-icon" onClick={() => setTubeRows((r) => r.filter((x) => x.id !== row.id))} aria-label="Rimuovi">✕</button>
            </div>
          )
        })}
      </Section>

      {/* SALDATURA */}
      <Section title="Saldatura" onAdd={addWelding}>
        {weldingRows.map((row) => (
          <div key={row.id} className="grid grid-cols-2 items-end gap-2 md:grid-cols-4">
            <NumInput label="N° persone" value={row.people} onChange={(v) => setWeldingRows((r) => r.map((x) => (x.id === row.id ? { ...x, people: v } : x)))} />
            <NumInput label="Ore" value={row.hours} onChange={(v) => setWeldingRows((r) => r.map((x) => (x.id === row.id ? { ...x, hours: v } : x)))} step="0.1" />
            <button className="btn-icon" onClick={() => setWeldingRows((r) => r.filter((x) => x.id !== row.id))} aria-label="Rimuovi">✕</button>
          </div>
        ))}
      </Section>

      {/* PIEGA */}
      <Section title="Piega" onAdd={addBending}>
        {bendingRows.map((row) => (
          <div key={row.id} className="grid grid-cols-2 items-end gap-2 md:grid-cols-4">
            <NumInput label="Ore" value={row.hours} onChange={(v) => setBendingRows((r) => r.map((x) => (x.id === row.id ? { ...x, hours: v } : x)))} step="0.1" />
            <button className="btn-icon" onClick={() => setBendingRows((r) => r.filter((x) => x.id !== row.id))} aria-label="Rimuovi">✕</button>
          </div>
        ))}
      </Section>

      <FormField label="Note" className="mt-3">
        <textarea className="input-base" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>
    </Modal>
  )
}

function Section({ title, onAdd, children }: { title: string; onAdd: () => void; children: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <button className="btn-ghost text-xs" onClick={onAdd}>+ Aggiungi riga</button>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function NumInput({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <input type="number" step={step ?? '1'} className="input-base" value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
    </label>
  )
}

function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <select className="input-base" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}
