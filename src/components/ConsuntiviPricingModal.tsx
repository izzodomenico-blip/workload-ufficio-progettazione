import { useState } from 'react'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { useToast } from '../state/ToastProvider'
import { fetchConsuntiviPricing, saveConsuntiviPricing } from '../services/apiClient'
import { DEFAULT_CONSUNTIVI_PRICING } from '../utils/consuntiviCalc'
import { ALL_CONSUNTIVO_GAS, ALL_CONSUNTIVO_MATERIALS, CONSUNTIVO_MATERIAL_LABELS } from '../types'
import type { ConsuntiviPricingConfig, ConsuntivoMaterial } from '../types'

interface Props { open: boolean; onClose: () => void }

export function ConsuntiviPricingModal({ open, onClose }: Props) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [config, setConfig] = useState<ConsuntiviPricingConfig>(DEFAULT_CONSUNTIVI_PRICING)
  const [busy, setBusy] = useState(false)

  async function unlock() {
    setBusy(true)
    try {
      const cfg = await fetchConsuntiviPricing(password)
      setConfig(cfg)
      setUnlocked(true)
    } catch {
      toast.error('Password errata o configurazione non accessibile.')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    try {
      const saved = await saveConsuntiviPricing(config, password)
      setConfig(saved)
      toast.success('Configurazione prezzi salvata.')
      onClose()
    } catch {
      toast.error('Salvataggio non riuscito (password?).')
    } finally {
      setBusy(false)
    }
  }

  function num(v: string): number { return v === '' ? 0 : Number(v) }

  return (
    <Modal open={open} onClose={onClose} title="Configuratore prezzi (protetto)" size="lg"
      footer={unlocked ? (<><button className="btn-ghost" onClick={onClose}>Chiudi</button><button className="btn-primary" disabled={busy} onClick={save}>Salva</button></>) : undefined}>
      {!unlocked ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Inserisci la password della sezione Consuntivi per accedere ai prezzi.</p>
          <FormField label="Password Consuntivi">
            <input type="password" className="input-base" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') unlock() }} />
          </FormField>
          <button className="btn-primary" disabled={busy} onClick={unlock}>Sblocca</button>
        </div>
      ) : (
        <div className="space-y-5">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-200">€/kg materiale</legend>
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
              {ALL_CONSUNTIVO_MATERIALS.map((m) => (
                <FormField key={m} label={CONSUNTIVO_MATERIAL_LABELS[m]}>
                  <input type="number" step="0.01" className="input-base" value={config.materialPricePerKg[m]}
                    onChange={(e) => setConfig((c) => ({ ...c, materialPricePerKg: { ...c.materialPricePerKg, [m]: num(e.target.value) } }))} />
                </FormField>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-200">€/min gas</legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {ALL_CONSUNTIVO_GAS.map((g) => (
                <FormField key={g} label={g}>
                  <input type="number" step="0.01" className="input-base" value={config.gasCostPerMin[g]}
                    onChange={(e) => setConfig((c) => ({ ...c, gasCostPerMin: { ...c.gasCostPerMin, [g]: num(e.target.value) } }))} />
                </FormField>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField label="€/min tempo laser tubi">
              <input type="number" step="0.01" className="input-base" value={config.tubeLaserRatePerMin}
                onChange={(e) => setConfig((c) => ({ ...c, tubeLaserRatePerMin: num(e.target.value) }))} />
            </FormField>
            <FormField label="€/h saldatura">
              <input type="number" step="0.01" className="input-base" value={config.weldingRatePerHour}
                onChange={(e) => setConfig((c) => ({ ...c, weldingRatePerHour: num(e.target.value) }))} />
            </FormField>
            <FormField label="€/h piega">
              <input type="number" step="0.01" className="input-base" value={config.bendingRatePerHour}
                onChange={(e) => setConfig((c) => ({ ...c, bendingRatePerHour: num(e.target.value) }))} />
            </FormField>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-200">Densità per materiale (kg per m²·mm)</legend>
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
              {ALL_CONSUNTIVO_MATERIALS.map((m) => (
                <FormField key={m} label={CONSUNTIVO_MATERIAL_LABELS[m]}>
                  <input type="number" step="0.01" className="input-base" value={config.densityFactorPerMaterial[m]}
                    onChange={(e) => setConfig((c) => ({ ...c, densityFactorPerMaterial: { ...c.densityFactorPerMaterial, [m]: num(e.target.value) as number } as Record<ConsuntivoMaterial, number> }))} />
                </FormField>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </Modal>
  )
}
