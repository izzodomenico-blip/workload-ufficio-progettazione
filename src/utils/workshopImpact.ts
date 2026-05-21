import type { MachineComplexity, MachineType, WorkshopOutput } from '../types'

export type WorkshopImpactLevel = 'basso' | 'medio' | 'alto' | 'critico'

type WorkshopImpactInput = Pick<
  WorkshopOutput,
  | 'quantity'
  | 'complexity'
  | 'assemblyCount'
  | 'estimatedPartCount'
  | 'requiresLaser'
  | 'requiresTubeLaser'
  | 'requiresBending'
  | 'requiresWelding'
  | 'requiresTurning'
  | 'requiresMilling'
  | 'requiresAssembly'
  | 'requiresPainting'
  | 'requiresTesting'
  | 'laserWeightPercent'
  | 'tubeLaserWeightPercent'
  | 'bendingWeightPercent'
  | 'weldingWeightPercent'
  | 'turningWeightPercent'
  | 'millingWeightPercent'
  | 'assemblyWeightPercent'
  | 'paintingWeightPercent'
  | 'testingWeightPercent'
>

const COMPLEXITY_FACTOR: Record<MachineComplexity, number> = {
  bassa: 0.8,
  media: 1,
  alta: 1.4,
  speciale: 2,
}

const PROCESS_FACTORS = [
  { flag: 'requiresLaser', weight: 'laserWeightPercent', coefficient: 0.15 },
  { flag: 'requiresTubeLaser', weight: 'tubeLaserWeightPercent', coefficient: 0.25 },
  { flag: 'requiresBending', weight: 'bendingWeightPercent', coefficient: 0.15 },
  { flag: 'requiresWelding', weight: 'weldingWeightPercent', coefficient: 0.30 },
  { flag: 'requiresTurning', weight: 'turningWeightPercent', coefficient: 0.20 },
  { flag: 'requiresMilling', weight: 'millingWeightPercent', coefficient: 0.20 },
  { flag: 'requiresAssembly', weight: 'assemblyWeightPercent', coefficient: 0.25 },
  { flag: 'requiresPainting', weight: 'paintingWeightPercent', coefficient: 0.10 },
  { flag: 'requiresTesting', weight: 'testingWeightPercent', coefficient: 0.10 },
] as const

export const WORKSHOP_IMPACT_EXPLANATION =
  "L'indice non rappresenta ore, ma un peso relativo per aiutare la produzione a pianificare il carico. Le percentuali indicano quanto pesa ogni processo dentro la singola tipologia/output."

export function calculateWorkshopImpact(
  output: WorkshopImpactInput,
  machineType?: Pick<MachineType, 'defaultImpactWeight'> | null,
): number {
  const base = Math.max(0, output.quantity) * (machineType?.defaultImpactWeight ?? 1)
  const complexityFactor = COMPLEXITY_FACTOR[output.complexity] ?? 1
  const processFactor = 1 + PROCESS_FACTORS.reduce((sum, process) => {
    if (!output[process.flag]) return sum
    return sum + process.coefficient * (normalizePercent(output[process.weight]) / 100)
  }, 0)
  const assemblyFactor = 1 + Math.max(0, output.assemblyCount) * 0.08
  const partFactor = 1 + (Math.max(0, output.estimatedPartCount) / 100) * 0.15
  return Math.round(base * complexityFactor * processFactor * assemblyFactor * partFactor * 10) / 10
}

function normalizePercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100
  return Math.max(0, Math.min(100, value))
}

export function getWorkshopImpactLevel(score: number): WorkshopImpactLevel {
  if (score <= 10) return 'basso'
  if (score <= 25) return 'medio'
  if (score <= 50) return 'alto'
  return 'critico'
}
