import type {
  BendingRow,
  Consuntivo,
  ConsuntiviPricingConfig,
  ConsuntivoMaterial,
  LaserCutRow,
  TubeLaserRow,
  TubeShape,
  WeldingRow,
} from '../types'
import { ALL_CONSUNTIVO_MATERIALS } from '../types'

export const DEFAULT_CONSUNTIVI_PRICING: ConsuntiviPricingConfig = {
  materialPricePerKg: { ferro: 1.3, inox: 4.5, zincato: 2, corten: 3 },
  gasCostPerMin: { ossigeno: 2.5, azoto: 3 },
  tubeLaserRatePerMin: 2.5,
  weldingRatePerHour: 35,
  bendingRatePerHour: 60,
  densityFactorPerMaterial: { ferro: 7.85, inox: 8.0, zincato: 7.85, corten: 7.85 },
  tubeCoefficientPerKg: { quadro: 0.91, rettangolo: 1.18, piccolo: 1.30 },
}

export interface ConsuntivoTotals {
  totalKg: number
  materialCost: number
  gasCost: number
  timeCost: number
  weldingCost: number
  bendingCost: number
  total: number
  kgByMaterial: Record<ConsuntivoMaterial, number>
}

function num(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export function emptyKgByMaterial(): Record<ConsuntivoMaterial, number> {
  return { ferro: 0, inox: 0, zincato: 0, corten: 0 }
}

export function sheetWeightKg(
  row: Pick<LaserCutRow, 'lunghezzaMm' | 'larghezzaMm' | 'spessoreMm'>,
  densityFactor: number,
): number {
  return (num(row.lunghezzaMm) / 1000) * (num(row.larghezzaMm) / 1000) * (num(row.spessoreMm) * num(densityFactor))
}

/** Numero di pezzi valido (>=1); tollera valori mancanti/invalidi dei dati legacy. */
function pieces(n: number | undefined): number {
  return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 1
}

/** Peso totale di una riga taglio laser = peso di una lamiera × numero di pezzi. */
export function laserRowKg(
  row: Pick<LaserCutRow, 'lunghezzaMm' | 'larghezzaMm' | 'spessoreMm' | 'nPezzi'>,
  densityFactor: number,
): number {
  return sheetWeightKg(row, densityFactor) * pieces(row.nPezzi)
}

export function tubeWeightKg(row: Pick<TubeLaserRow, 'kgPerMeter' | 'lunghezzaMm' | 'nPezzi'>): number {
  return num(row.kgPerMeter) * (num(row.lunghezzaMm) / 1000) * num(row.nPezzi)
}

export function laserRowCost(row: LaserCutRow, pricing: ConsuntiviPricingConfig) {
  const kg = laserRowKg(row, pricing.densityFactorPerMaterial[row.materiale] ?? 7.85)
  const materialCost = kg * (pricing.materialPricePerKg[row.materiale] ?? 0)
  const gasCost = num(row.tempoMin) * (pricing.gasCostPerMin[row.gas] ?? 0)
  return { kg, materialCost, gasCost, total: materialCost + gasCost }
}

export function parseTubeSides(label: string): { a: number; b: number } | null {
  const nums = String(label ?? '').replace(/,/g, '.').match(/\d+(?:\.\d+)?/g)
  if (!nums || nums.length < 2) return null
  return { a: Number(nums[0]), b: Number(nums[1]) }
}

export function tubeShape(label: string): TubeShape {
  const s = parseTubeSides(label)
  if (!s) return 'rettangolo'
  if (s.a + s.b <= 60) return 'piccolo'
  if (s.a === s.b) return 'quadro'
  return 'rettangolo'
}

export function tubeRowCost(row: TubeLaserRow, pricing: ConsuntiviPricingConfig) {
  const kg = tubeWeightKg(row)
  const shape = tubeShape(row.profileLabel)
  const materialCost = kg * (pricing.tubeCoefficientPerKg?.[shape] ?? 0)
  const timeCost = num(row.tempoMin) * num(pricing.tubeLaserRatePerMin)
  return { kg, shape, materialCost, timeCost, total: materialCost + timeCost }
}

export function weldingRowCost(row: WeldingRow, pricing: ConsuntiviPricingConfig): number {
  return num(row.people) * num(row.hours) * num(pricing.weldingRatePerHour)
}

export function bendingRowCost(row: BendingRow, pricing: ConsuntiviPricingConfig): number {
  return num(row.hours) * num(pricing.bendingRatePerHour)
}

export function consuntivoTotals(c: Consuntivo, pricing: ConsuntiviPricingConfig): ConsuntivoTotals {
  const kgByMaterial = emptyKgByMaterial()
  let totalKg = 0
  let materialCost = 0
  let gasCost = 0
  let timeCost = 0

  for (const row of c.laserRows ?? []) {
    const r = laserRowCost(row, pricing)
    totalKg += r.kg
    kgByMaterial[row.materiale] += r.kg
    materialCost += r.materialCost
    gasCost += r.gasCost
  }
  for (const row of c.tubeRows ?? []) {
    const r = tubeRowCost(row, pricing)
    totalKg += r.kg
    kgByMaterial[row.materiale] += r.kg
    materialCost += r.materialCost
    timeCost += r.timeCost
  }
  const weldingCost = (c.weldingRows ?? []).reduce((sum, row) => sum + weldingRowCost(row, pricing), 0)
  const bendingCost = (c.bendingRows ?? []).reduce((sum, row) => sum + bendingRowCost(row, pricing), 0)

  // Difesa: assicura che tutti i materiali siano presenti nella mappa.
  for (const m of ALL_CONSUNTIVO_MATERIALS) if (!(m in kgByMaterial)) kgByMaterial[m] = 0

  return {
    totalKg,
    materialCost,
    gasCost,
    timeCost,
    weldingCost,
    bendingCost,
    total: materialCost + gasCost + timeCost + weldingCost + bendingCost,
    kgByMaterial,
  }
}
