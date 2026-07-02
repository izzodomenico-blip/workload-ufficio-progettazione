export const DEFAULT_CONSUNTIVI_CONFIG = {
  materialPricePerKg: { ferro: 1.3, inox: 4.5, zincato: 2, corten: 3 },
  gasCostPerMin: { ossigeno: 2.5, azoto: 3 },
  tubeLaserRatePerMin: 2.5,
  weldingRatePerHour: 35,
  bendingRatePerHour: 60,
  densityFactorPerMaterial: { ferro: 7.85, inox: 8.0, zincato: 7.85, corten: 7.85 },
}

const MATERIALS = ['ferro', 'inox', 'zincato', 'corten']
const GASES = ['ossigeno', 'azoto']

function nonNegativeNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function numberMap(raw, keys, defaults) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const out = {}
  for (const key of keys) out[key] = nonNegativeNumber(source[key], defaults[key])
  return out
}

export function normalizeConsuntiviConfig(input) {
  const o = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const d = DEFAULT_CONSUNTIVI_CONFIG
  return {
    materialPricePerKg: numberMap(o.materialPricePerKg, MATERIALS, d.materialPricePerKg),
    gasCostPerMin: numberMap(o.gasCostPerMin, GASES, d.gasCostPerMin),
    tubeLaserRatePerMin: nonNegativeNumber(o.tubeLaserRatePerMin, d.tubeLaserRatePerMin),
    weldingRatePerHour: nonNegativeNumber(o.weldingRatePerHour, d.weldingRatePerHour),
    bendingRatePerHour: nonNegativeNumber(o.bendingRatePerHour, d.bendingRatePerHour),
    densityFactorPerMaterial: numberMap(o.densityFactorPerMaterial, MATERIALS, d.densityFactorPerMaterial),
  }
}
