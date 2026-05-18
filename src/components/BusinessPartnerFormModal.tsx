import { useEffect, useMemo, useState } from 'react'
import type { BusinessPartner, BusinessPartnerType } from '../types'
import { ALL_BUSINESS_PARTNER_TYPES } from '../types'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import { validateBusinessPartner } from '../utils/validation'
import type { BusinessPartnerField, ValidationErrors } from '../utils/validation'
import { Modal } from './Modal'
import { FormField } from './FormField'

const TYPE_LABELS: Record<BusinessPartnerType, string> = {
  cliente: 'Cliente',
  fornitore: 'Fornitore',
  personale: 'Personale',
  altro: 'Altro',
}

interface FormValues {
  accountCode: string
  name: string
  type: BusinessPartnerType
  vatNumber: string
  fiscalCode: string
  sdiCode: string
  address: string
  postalCode: string
  city: string
  province: string
  country: string
  email: string
  pec: string
  phone: string
  paymentCode: string
  paymentDescription: string
  bankName: string
  abi: string
  cab: string
  vatExemptionCode: string
  balance: string
  exposure: string
  creditLimit: string
  overCreditLimit: string
  risk: string
  notes: string
  active: boolean
}

function emptyValues(): FormValues {
  return {
    accountCode: '',
    name: '',
    type: 'cliente',
    vatNumber: '',
    fiscalCode: '',
    sdiCode: '',
    address: '',
    postalCode: '',
    city: '',
    province: '',
    country: 'IT',
    email: '',
    pec: '',
    phone: '',
    paymentCode: '',
    paymentDescription: '',
    bankName: '',
    abi: '',
    cab: '',
    vatExemptionCode: '',
    balance: '',
    exposure: '',
    creditLimit: '',
    overCreditLimit: '',
    risk: '',
    notes: '',
    active: true,
  }
}

function fromPartner(p: BusinessPartner): FormValues {
  return {
    accountCode: p.accountCode ?? '',
    name: p.name,
    type: p.type,
    vatNumber: p.vatNumber ?? '',
    fiscalCode: p.fiscalCode ?? '',
    sdiCode: p.sdiCode ?? '',
    address: p.address ?? '',
    postalCode: p.postalCode ?? '',
    city: p.city ?? '',
    province: p.province ?? '',
    country: p.country ?? '',
    email: p.email ?? '',
    pec: p.pec ?? '',
    phone: p.phone ?? '',
    paymentCode: p.paymentCode ?? '',
    paymentDescription: p.paymentDescription ?? '',
    bankName: p.bankName ?? '',
    abi: p.abi ?? '',
    cab: p.cab ?? '',
    vatExemptionCode: p.vatExemptionCode ?? '',
    balance: p.balance !== undefined ? String(p.balance) : '',
    exposure: p.exposure !== undefined ? String(p.exposure) : '',
    creditLimit: p.creditLimit !== undefined ? String(p.creditLimit) : '',
    overCreditLimit: p.overCreditLimit !== undefined ? String(p.overCreditLimit) : '',
    risk: p.risk !== undefined ? String(p.risk) : '',
    notes: p.notes ?? '',
    active: p.active,
  }
}

function toNumber(v: string): number | undefined {
  if (!v.trim()) return undefined
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

interface Props {
  open: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  partner?: BusinessPartner
  onCreated?: (id: string) => void
}

export function BusinessPartnerFormModal({ open, onClose, mode, partner, onCreated }: Props) {
  const { createBusinessPartner, updateBusinessPartner } = useData()
  const toast = useToast()
  const [values, setValues] = useState<FormValues>(() => emptyValues())
  const [errors, setErrors] = useState<ValidationErrors<BusinessPartnerField>>({})
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues(mode === 'edit' && partner ? fromPartner(partner) : emptyValues())
    setErrors({})
    setSubmitted(false)
  }, [open, mode, partner])

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setValues((prev) => ({ ...prev, [k]: v }))

  const payload = useMemo(() => ({
    accountCode: values.accountCode.trim(),
    name: values.name.trim(),
    type: values.type,
    vatNumber: values.vatNumber.trim() || undefined,
    fiscalCode: values.fiscalCode.trim() || undefined,
    sdiCode: values.sdiCode.trim() || undefined,
    address: values.address.trim() || undefined,
    postalCode: values.postalCode.trim() || undefined,
    city: values.city.trim() || undefined,
    province: values.province.trim() || undefined,
    country: values.country.trim() || undefined,
    email: values.email.trim() || undefined,
    pec: values.pec.trim() || undefined,
    phone: values.phone.trim() || undefined,
    paymentCode: values.paymentCode.trim() || undefined,
    paymentDescription: values.paymentDescription.trim() || undefined,
    bankName: values.bankName.trim() || undefined,
    abi: values.abi.trim() || undefined,
    cab: values.cab.trim() || undefined,
    vatExemptionCode: values.vatExemptionCode.trim() || undefined,
    balance: toNumber(values.balance),
    exposure: toNumber(values.exposure),
    creditLimit: toNumber(values.creditLimit),
    overCreditLimit: toNumber(values.overCreditLimit),
    risk: toNumber(values.risk),
    notes: values.notes.trim() || undefined,
    active: values.active,
  }), [values])

  function handleSubmit() {
    setSubmitted(true)
    const result = validateBusinessPartner(payload)
    if (!result.ok) {
      setErrors(result.errors)
      toast.error('Controlla i campi evidenziati.')
      return
    }
    if (mode === 'create') {
      const id = createBusinessPartner(payload)
      toast.success(`Anagrafica creata: ${payload.name}`)
      onCreated?.(id)
    } else if (partner) {
      updateBusinessPartner(partner.id, payload)
      toast.success('Anagrafica aggiornata.')
    }
    onClose()
  }

  function liveValidate(field: BusinessPartnerField, value: unknown) {
    if (!submitted) return
    const r = validateBusinessPartner({ ...payload, [field]: value })
    setErrors(r.ok ? {} : r.errors)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Nuova anagrafica' : `Modifica ${partner?.name ?? 'anagrafica'}`}
      subtitle="Dati clienti, fornitori e altri soggetti"
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Annulla</button>
          <button onClick={handleSubmit} className="btn-primary">{mode === 'create' ? 'Crea' : 'Salva'}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="Tipo" required error={errors.type}>
          <div className="grid grid-cols-4 gap-1 rounded-md border border-slate-700 p-1">
            {ALL_BUSINESS_PARTNER_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { set('type', t); liveValidate('type', t) }}
                className={`rounded px-2 py-1 text-xs font-medium transition ${
                  values.type === t ? 'bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/50' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Codice conto">
          <input className="input-base" value={values.accountCode} onChange={(e) => set('accountCode', e.target.value)} placeholder="Es. C00001" />
        </FormField>

        <FormField label="Ragione sociale" required error={errors.name} className="md:col-span-2">
          <input className="input-base" value={values.name} onChange={(e) => { set('name', e.target.value); liveValidate('name', e.target.value) }} />
        </FormField>

        <FormField label="P.IVA" error={errors.vatNumber}>
          <input className="input-base" value={values.vatNumber} onChange={(e) => { set('vatNumber', e.target.value); liveValidate('vatNumber', e.target.value) }} />
        </FormField>

        <FormField label="Codice fiscale">
          <input className="input-base" value={values.fiscalCode} onChange={(e) => set('fiscalCode', e.target.value)} />
        </FormField>

        <FormField label="Codice SDI">
          <input className="input-base" value={values.sdiCode} onChange={(e) => set('sdiCode', e.target.value)} />
        </FormField>

        <FormField label="Cod. IVA / Esenzione">
          <input className="input-base" value={values.vatExemptionCode} onChange={(e) => set('vatExemptionCode', e.target.value)} />
        </FormField>

        <FormField label="Indirizzo" className="md:col-span-2">
          <input className="input-base" value={values.address} onChange={(e) => set('address', e.target.value)} />
        </FormField>

        <FormField label="CAP"><input className="input-base" value={values.postalCode} onChange={(e) => set('postalCode', e.target.value)} /></FormField>
        <FormField label="Città"><input className="input-base" value={values.city} onChange={(e) => set('city', e.target.value)} /></FormField>
        <FormField label="Provincia"><input className="input-base" value={values.province} onChange={(e) => set('province', e.target.value)} /></FormField>
        <FormField label="Nazione"><input className="input-base" value={values.country} onChange={(e) => set('country', e.target.value)} /></FormField>

        <FormField label="Email" error={errors.email}>
          <input type="email" className="input-base" value={values.email} onChange={(e) => { set('email', e.target.value); liveValidate('email', e.target.value) }} />
        </FormField>
        <FormField label="PEC" error={errors.pec}>
          <input type="email" className="input-base" value={values.pec} onChange={(e) => { set('pec', e.target.value); liveValidate('pec', e.target.value) }} />
        </FormField>

        <FormField label="Telefono" className="md:col-span-2">
          <input className="input-base" value={values.phone} onChange={(e) => set('phone', e.target.value)} />
        </FormField>

        <FormField label="Cod. pagamento"><input className="input-base" value={values.paymentCode} onChange={(e) => set('paymentCode', e.target.value)} /></FormField>
        <FormField label="Descrizione pagamento"><input className="input-base" value={values.paymentDescription} onChange={(e) => set('paymentDescription', e.target.value)} /></FormField>

        <FormField label="Banca" className="md:col-span-2"><input className="input-base" value={values.bankName} onChange={(e) => set('bankName', e.target.value)} /></FormField>
        <FormField label="ABI"><input className="input-base" value={values.abi} onChange={(e) => set('abi', e.target.value)} /></FormField>
        <FormField label="CAB"><input className="input-base" value={values.cab} onChange={(e) => set('cab', e.target.value)} /></FormField>

        <FormField label="Saldo" error={errors.balance}><input className="input-base" value={values.balance} onChange={(e) => set('balance', e.target.value)} placeholder="0.00" /></FormField>
        <FormField label="Esposizione" error={errors.exposure}><input className="input-base" value={values.exposure} onChange={(e) => set('exposure', e.target.value)} placeholder="0.00" /></FormField>
        <FormField label="Fido" error={errors.creditLimit}><input className="input-base" value={values.creditLimit} onChange={(e) => set('creditLimit', e.target.value)} placeholder="0.00" /></FormField>
        <FormField label="Fuori fido" error={errors.overCreditLimit}><input className="input-base" value={values.overCreditLimit} onChange={(e) => set('overCreditLimit', e.target.value)} placeholder="0.00" /></FormField>
        <FormField label="Rischio" error={errors.risk}><input className="input-base" value={values.risk} onChange={(e) => set('risk', e.target.value)} placeholder="0.00" /></FormField>

        <FormField label="Stato">
          <button
            type="button"
            onClick={() => set('active', !values.active)}
            className={`mt-0.5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border text-xs font-medium transition ${
              values.active
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-zinc-600 bg-zinc-800/40 text-zinc-400'
            }`}
          >
            <span aria-hidden>{values.active ? '●' : '○'}</span>
            {values.active ? 'Attiva' : 'Disattivata'}
          </button>
        </FormField>

        <FormField label="Note" className="md:col-span-2">
          <textarea rows={3} className="input-base resize-y" value={values.notes} onChange={(e) => set('notes', e.target.value)} />
        </FormField>
      </div>
    </Modal>
  )
}
