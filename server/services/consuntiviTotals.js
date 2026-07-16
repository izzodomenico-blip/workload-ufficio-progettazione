// Gemello server di src/utils/consuntiviCalc.ts (stesso pattern del gemello
// DEFAULT_CONSUNTIVI_CONFIG). Se cambi la semantica qui, cambiala anche nel
// client e aggiorna i test di parita' (stessi numeri attesi in entrambi).
const MATERIALS = ['ferro', 'inox', 'zincato', 'corten']

function num(value) { return Number.isFinite(value) ? value : 0 }
function pieces(n) { return Number.isFinite(n) && n > 0 ? n : 1 }

export function emptyKgByMaterial() { return { ferro: 0, inox: 0, zincato: 0, corten: 0 } }

export function sheetWeightKg(row, densityFactor) {
  return (num(row.lunghezzaMm) / 1000) * (num(row.larghezzaMm) / 1000) * (num(row.spessoreMm) * num(densityFactor))
}
export function laserRowKg(row, densityFactor) {
  return sheetWeightKg(row, densityFactor) * pieces(row.nPezzi)
}
export function tubeWeightKg(row) {
  return num(row.kgPerMeter) * (num(row.lunghezzaMm) / 1000) * num(row.nPezzi)
}
export function laserRowCost(row, pricing) {
  const kg = laserRowKg(row, pricing.densityFactorPerMaterial[row.materiale] ?? 7.85)
  const materialCost = kg * (pricing.materialPricePerKg[row.materiale] ?? 0)
  const gasCost = num(row.tempoMin) * (pricing.gasCostPerMin[row.gas] ?? 0)
  return { kg, materialCost, gasCost, total: materialCost + gasCost }
}
export function parseTubeSides(label) {
  const nums = String(label ?? '').replace(/,/g, '.').match(/\d+(?:\.\d+)?/g)
  if (!nums || nums.length < 2) return null
  return { a: Number(nums[0]), b: Number(nums[1]) }
}
export function tubeShape(label) {
  const s = parseTubeSides(label)
  if (!s) return 'rettangolo'
  if (s.a + s.b <= 60) return 'piccolo'
  if (s.a === s.b) return 'quadro'
  return 'rettangolo'
}
export function tubeRowCost(row, pricing) {
  const kg = tubeWeightKg(row)
  const shape = tubeShape(row.profileLabel)
  const materialCost = kg * (pricing.tubeCoefficientPerKg?.[shape] ?? 0)
  const timeCost = num(row.tempoMin) * num(pricing.tubeLaserRatePerMin)
  return { kg, shape, materialCost, timeCost, total: materialCost + timeCost }
}
export function weldingRowCost(row, pricing) {
  return num(row.people) * num(row.hours) * num(pricing.weldingRatePerHour)
}
export function bendingRowCost(row, pricing) {
  return num(row.hours) * num(pricing.bendingRatePerHour)
}
export function consuntivoTotals(c, pricing) {
  const kgByMaterial = emptyKgByMaterial()
  let totalKg = 0
  let materialCost = 0
  let gasCost = 0
  let timeCost = 0
  for (const row of c.laserRows ?? []) {
    const r = laserRowCost(row, pricing)
    totalKg += r.kg
    kgByMaterial[row.materiale] = (kgByMaterial[row.materiale] ?? 0) + r.kg
    materialCost += r.materialCost
    gasCost += r.gasCost
  }
  for (const row of c.tubeRows ?? []) {
    const r = tubeRowCost(row, pricing)
    totalKg += r.kg
    kgByMaterial[row.materiale] = (kgByMaterial[row.materiale] ?? 0) + r.kg
    materialCost += r.materialCost
    timeCost += r.timeCost
  }
  const weldingCost = (c.weldingRows ?? []).reduce((sum, row) => sum + weldingRowCost(row, pricing), 0)
  const bendingCost = (c.bendingRows ?? []).reduce((sum, row) => sum + bendingRowCost(row, pricing), 0)
  for (const m of MATERIALS) if (!(m in kgByMaterial)) kgByMaterial[m] = 0
  return {
    totalKg, materialCost, gasCost, timeCost, weldingCost, bendingCost,
    total: materialCost + gasCost + timeCost + weldingCost + bendingCost,
    kgByMaterial,
  }
}
