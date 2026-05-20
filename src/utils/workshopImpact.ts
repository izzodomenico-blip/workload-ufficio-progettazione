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
  | 'requiresAssembly'
  | 'requiresPainting'
  | 'requiresTesting'
>

const COMPLEXITY_FACTOR: Record<MachineComplexity, number> = {
  bassa: 0.8,
  media: 1,
  alta: 1.4,
  speciale: 2,
}

export const WORKSHOP_IMPACT_EXPLANATION =
  "L'indice non rappresenta ore, ma un peso relativo per aiutare la produzione a pianificare il carico."

export function calculateWorkshopImpact(
  output: WorkshopImpactInput,
  machineType?: Pick<MachineType, 'defaultImpactWeight'> | null,
): number {
  const base = Math.max(0, output.quantity) * (machineType?.defaultImpactWeight ?? 1)
  const complexityFactor = COMPLEXITY_FACTOR[output.complexity] ?? 1
  const processFactor =
    1 +
    (output.requiresLaser ? 0.15 : 0) +
    (output.requiresTubeLaser ? 0.25 : 0) +
    (output.requiresBending ? 0.15 : 0) +
    (output.requiresWelding ? 0.30 : 0) +
    (output.requiresAssembly ? 0.25 : 0) +
    (output.requiresPainting ? 0.10 : 0) +
    (output.requiresTesting ? 0.10 : 0)
  const assemblyFactor = 1 + Math.max(0, output.assemblyCount) * 0.08
  const partFactor = 1 + (Math.max(0, output.estimatedPartCount) / 100) * 0.15
  return Math.round(base * complexityFactor * processFactor * assemblyFactor * partFactor * 10) / 10
}

export function getWorkshopImpactLevel(score: number): WorkshopImpactLevel {
  if (score <= 10) return 'basso'
  if (score <= 25) return 'medio'
  if (score <= 50) return 'alto'
  return 'critico'
}

