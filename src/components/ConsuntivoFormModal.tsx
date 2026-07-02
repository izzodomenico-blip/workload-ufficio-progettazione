import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { BusinessPartnerAutocomplete } from './BusinessPartnerAutocomplete'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { mergeTubeProfiles } from '../data/tubeProfiles'
import { sheetWeightKg, tubeWeightKg } from '../utils/consuntiviCalc'
import { emptyConsuntivoInput } from '../services/consuntiviService'
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
  const { tubeProfiles, createConsuntivo, updateConsuntivo } = useData()
  const toast = useToast()
  const profiles = useMemo(() => mergeTubeProfiles(tubeProfiles), [tubeProfiles])

  const [commessaNumber, setCommessaNumber] = useState(editing?.commessaNumber ?? '')
  const [supplierName, setSupplierName] = useState(editing?.supplierName ?? '')
  const [supplierId, setSupplierId] = useState(editing?.supplierId ?? '')
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
  function setWelding(id: string, patch: Partial<WeldingRow>) {
    setWeldingRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }
  function setBending(id: string, patch: Partial<BendingRow>) {
    setBendingRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function pickProfile(rowId: string, profileId: string) {
    const p = profiles.find((x) => x.id === profileId)
    if (!p) return
    setTube(rowId, { profileId: p.id, profileLabel: p.label, kgPerMeter: p.kgPerMeter, categoria: p.categoria })
  }

  function handleSave() {
    const payload = {
      ...emptyConsuntivoInput(date, operatorName),
      commessaNumber: commessaNumber.trim(),
      supplierId,
      supplierName: supplierName.trim(),
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
      size="full"
      footer={(
        <>
          <button className="btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn-primary" onClick={handleSave}>Salva</button>
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <FormField label="Numero commessa">
          <input
            className="input-base text-base"
            value={commessaNumber}
            onChange={(e) => setCommessaNumber(e.target.value)}
            placeholder="es. 219-MT-26 (facoltativo)"
          />
        </FormField>
        <FormField label="Fornitore" className="md:col-span-2">
          <BusinessPartnerAutocomplete
            value={supplierName}
            onChange={(text, partner) => { setSupplierName(text); setSupplierId(partner?.id ?? '') }}
            placeholder="Cerca in anagrafica o scrivi libero…"
            linkedPartnerId={supplierId || undefined}
          />
        </FormField>
        <FormField label="Data">
          <input type="date" className="input-base text-base" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Operatore" className="mt-4 md:max-w-sm">
        <input className="input-base text-base" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder="Nome operaio (facoltativo)" />
      </FormField>

      {/* SEZIONE TAGLIO LASER */}
      <Section title="Taglio laser" onAdd={addLaser} empty={laserRows.length === 0}>
        {laserRows.map((row) => {
          const kg = sheetWeightKg(row, densityFactorPerMaterial[row.materiale] ?? 7.85)
          return (
            <div key={row.id} className="grid grid-cols-2 items-end gap-3 rounded-lg bg-slate-900/30 p-3 md:grid-cols-8">
              <NumInput label="Lungh. (mm)" value={row.lunghezzaMm} onChange={(v) => setLaser(row.id, { lunghezzaMm: v })} />
              <NumInput label="Largh. (mm)" value={row.larghezzaMm} onChange={(v) => setLaser(row.id, { larghezzaMm: v })} />
              <NumInput label="Spess. (mm)" value={row.spessoreMm} onChange={(v) => setLaser(row.id, { spessoreMm: v })} step="0.1" />
              <SelectInput label="Materiale" value={row.materiale} options={ALL_CONSUNTIVO_MATERIALS.map((m) => [m, CONSUNTIVO_MATERIAL_LABELS[m]])} onChange={(v) => setLaser(row.id, { materiale: v as ConsuntivoMaterial })} />
              <NumInput label="Tempo (min)" value={row.tempoMin} onChange={(v) => setLaser(row.id, { tempoMin: v })} step="0.1" />
              <SelectInput label="Gas" value={row.gas} options={ALL_CONSUNTIVO_GAS.map((g) => [g, g])} onChange={(v) => setLaser(row.id, { gas: v as LaserCutRow['gas'] })} />
              <KgCell kg={kg} />
              <RemoveBtn onClick={() => setLaserRows((r) => r.filter((x) => x.id !== row.id))} />
            </div>
          )
        })}
      </Section>

      {/* SEZIONE LASER TUBI */}
      <Section title="Laser tubi" onAdd={addTube} empty={tubeRows.length === 0}>
        {tubeRows.map((row) => {
          const kg = tubeWeightKg(row)
          const catProfiles = profiles.filter((p) => p.categoria === row.categoria)
          return (
            <div key={row.id} className="grid grid-cols-2 items-end gap-3 rounded-lg bg-slate-900/30 p-3 md:grid-cols-8">
              <SelectInput label="Categoria" value={row.categoria} options={ALL_TUBE_CATEGORIES.map((c) => [c, TUBE_CATEGORY_LABELS[c]])} onChange={(v) => setTube(row.id, { categoria: v as TubeCategory })} />
              <SelectInput label="Profilo" value={row.profileId} options={catProfiles.map((p) => [p.id, `${p.label} (${p.kgPerMeter} kg/m)`])} onChange={(v) => pickProfile(row.id, v)} />
              <SelectInput label="Materiale" value={row.materiale} options={ALL_CONSUNTIVO_MATERIALS.map((m) => [m, CONSUNTIVO_MATERIAL_LABELS[m]])} onChange={(v) => setTube(row.id, { materiale: v as ConsuntivoMaterial })} />
              <NumInput label="Lungh. (mm)" value={row.lunghezzaMm} onChange={(v) => setTube(row.id, { lunghezzaMm: v })} />
              <NumInput label="N° pezzi" value={row.nPezzi} onChange={(v) => setTube(row.id, { nPezzi: v })} />
              <NumInput label="Tempo (min)" value={row.tempoMin} onChange={(v) => setTube(row.id, { tempoMin: v })} step="0.1" />
              <KgCell kg={kg} />
              <RemoveBtn onClick={() => setTubeRows((r) => r.filter((x) => x.id !== row.id))} />
            </div>
          )
        })}
      </Section>

      {/* SALDATURA */}
      <Section title="Saldatura" onAdd={addWelding} empty={weldingRows.length === 0}>
        {weldingRows.map((row) => (
          <div key={row.id} className="grid grid-cols-2 items-end gap-3 rounded-lg bg-slate-900/30 p-3 md:grid-cols-4">
            <NumInput label="N° persone" value={row.people} onChange={(v) => setWelding(row.id, { people: v })} />
            <NumInput label="Ore" value={row.hours} onChange={(v) => setWelding(row.id, { hours: v })} step="0.1" />
            <RemoveBtn onClick={() => setWeldingRows((r) => r.filter((x) => x.id !== row.id))} />
          </div>
        ))}
      </Section>

      {/* PIEGA */}
      <Section title="Piega" onAdd={addBending} empty={bendingRows.length === 0}>
        {bendingRows.map((row) => (
          <div key={row.id} className="grid grid-cols-2 items-end gap-3 rounded-lg bg-slate-900/30 p-3 md:grid-cols-4">
            <NumInput label="Ore" value={row.hours} onChange={(v) => setBending(row.id, { hours: v })} step="0.1" />
            <RemoveBtn onClick={() => setBendingRows((r) => r.filter((x) => x.id !== row.id))} />
          </div>
        ))}
      </Section>

      <FormField label="Note" className="mt-5">
        <textarea className="input-base text-base" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>
    </Modal>
  )
}

function Section({ title, onAdd, empty, children }: { title: string; onAdd: () => void; empty: boolean; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-slate-800/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <button className="btn-ghost text-sm" onClick={onAdd}>+ Aggiungi riga</button>
      </div>
      <div className="space-y-2.5">
        {children}
        {empty && <p className="text-sm text-slate-500">Nessuna riga. Usa "+ Aggiungi riga".</p>}
      </div>
    </section>
  )
}

function KgCell({ kg }: { kg: number }) {
  return (
    <div className="text-slate-200">
      <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">kg</span>
      <span className="text-lg font-semibold tabular-nums">{kg.toFixed(1)}</span>
    </div>
  )
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn-icon justify-self-start md:justify-self-center" onClick={onClick} aria-label="Rimuovi riga" title="Rimuovi riga">✕</button>
  )
}

function NumInput({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <input type="number" step={step ?? '1'} className="input-base text-base" value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
    </label>
  )
}

function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <select className="input-base text-base" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}
