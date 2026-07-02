import type {
  CalculatedStandardComponent,
  StandardComponentsCalculationStatus,
  StandardComponentsCalculationType,
  StandardComponentsSubcategory,
  WorkshopOutput,
  WorkshopWorkerSkill,
} from '../types'
import { STANDARD_COMPONENTS_SUBCATEGORIES_BY_TYPE } from '../types'

export const I_TS_CODE = 'I.TS'
export const I_SC_CODE = 'I.SC'

const SUPPORTED_CODE_TO_TYPE: Record<string, StandardComponentsCalculationType> = {
  [I_TS_CODE]: 'I_TS',
  [I_SC_CODE]: 'I_SC',
}

export const STANDARD_CALCULATION_TYPE_LABELS: Record<StandardComponentsCalculationType, string> = {
  none: 'Nessun calcolo standard',
  I_TS: 'Tendostruttura (I.TS)',
  I_SC: 'Scaffalatura / struttura (I.SC)',
}

export const STANDARD_CALCULATION_STATUS_LABELS: Record<StandardComponentsCalculationStatus, string> = {
  not_configured: 'Non configurato',
  missing_parameters: 'Parametri mancanti',
  ready: 'Parametri completi',
  calculated: 'Calcolato',
  manual_override: 'Modificato manualmente',
}

export interface StandardParameterDescriptor {
  key: keyof StandardParametersInput
  label: string
  required: boolean
}

const REQUIRED_BY_TYPE: Record<StandardComponentsCalculationType, StandardParameterDescriptor[]> = {
  none: [],
  I_TS: [
    { key: 'machineLengthMm', label: 'Lunghezza (mm)', required: true },
    { key: 'machineWidthMm', label: 'Larghezza (mm)', required: true },
    { key: 'machineHeightMm', label: 'Altezza (mm)', required: true },
  ],
  I_SC: [
    { key: 'machineLengthMm', label: 'Lunghezza (mm)', required: true },
    { key: 'machineWidthMm', label: 'Larghezza (mm)', required: true },
    { key: 'machineHeightMm', label: 'Altezza (mm)', required: true },
  ],
}

const OPTIONAL_BY_TYPE: Record<StandardComponentsCalculationType, StandardParameterDescriptor[]> = {
  none: [],
  I_TS: [
    { key: 'machineSpanMm', label: 'Luce / span (mm)', required: false },
    { key: 'machineModuleCount', label: 'Numero moduli', required: false },
    { key: 'machineBayCount', label: 'Numero campate', required: false },
    { key: 'machineSlopePercent', label: 'Pendenza (%)', required: false },
  ],
  I_SC: [
    { key: 'machineModuleCount', label: 'Numero moduli', required: false },
    { key: 'machineBayCount', label: 'Numero campate', required: false },
  ],
}

export interface StandardParametersInput {
  machineLengthMm?: number | null
  machineWidthMm?: number | null
  machineHeightMm?: number | null
  machineSpanMm?: number | null
  machineModuleCount?: number | null
  machineBayCount?: number | null
  machineSlopePercent?: number | null
  machineNotes?: string
}

export interface StandardParametersValidation {
  status: StandardComponentsCalculationStatus
  missing: StandardParameterDescriptor[]
  optional: StandardParameterDescriptor[]
  message: string
}

export type StandardCalculationPreviewStatus =
  | 'not_supported'
  | 'missing_parameters'
  | 'ready'

export interface StandardCalculationPreview {
  status: StandardCalculationPreviewStatus
  calculationType: StandardComponentsCalculationType
  missing: StandardParameterDescriptor[]
  message: string
  /**
   * Quando la formula sarà configurata in futuro, qui verranno popolati i componenti
   * generati. Per ora resta sempre vuoto: nessuna formula viene inventata.
   */
  components: CalculatedStandardComponent[]
}

export function isStandardCalculationSupported(machineTypeCode: string | undefined | null): boolean {
  if (!machineTypeCode) return false
  return Boolean(SUPPORTED_CODE_TO_TYPE[machineTypeCode.trim().toUpperCase()])
}

export function getStandardCalculationType(
  machineTypeCode: string | undefined | null,
): StandardComponentsCalculationType {
  if (!machineTypeCode) return 'none'
  return SUPPORTED_CODE_TO_TYPE[machineTypeCode.trim().toUpperCase()] ?? 'none'
}

export function getStandardParameterDescriptors(
  calculationType: StandardComponentsCalculationType,
): { required: StandardParameterDescriptor[]; optional: StandardParameterDescriptor[] } {
  return {
    required: REQUIRED_BY_TYPE[calculationType] ?? [],
    optional: OPTIONAL_BY_TYPE[calculationType] ?? [],
  }
}

function isPositiveNumber(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function validateStandardParameters(
  output: Pick<WorkshopOutput, 'machineTypeCode'> & StandardParametersInput,
): StandardParametersValidation {
  const calculationType = getStandardCalculationType(output.machineTypeCode)
  if (calculationType === 'none') {
    return {
      status: 'not_configured',
      missing: [],
      optional: [],
      message: 'Calcolo standard non previsto per questa tipologia macchina.',
    }
  }
  const { required, optional } = getStandardParameterDescriptors(calculationType)
  const missing = required.filter((descriptor) => !isPositiveNumber(output[descriptor.key] as number | null | undefined))
  if (missing.length > 0) {
    return {
      status: 'missing_parameters',
      missing,
      optional,
      message: `Parametri mancanti: ${missing.map((m) => m.label).join(', ')}.`,
    }
  }
  return {
    status: 'ready',
    missing: [],
    optional,
    message: 'Parametri completi. Formula di calcolo da configurare.',
  }
}

export function calculateStandardComponentsPreview(
  output: Pick<WorkshopOutput, 'machineTypeCode'> & StandardParametersInput & {
    standardComponentsSubcategory?: StandardComponentsSubcategory
  },
): StandardCalculationPreview {
  const calculationType = getStandardCalculationType(output.machineTypeCode)
  if (calculationType === 'none') {
    return {
      status: 'not_supported',
      calculationType,
      missing: [],
      message: 'Tipologia non supportata dal calcolo standard.',
      components: [],
    }
  }
  const validation = validateStandardParameters(output)
  if (validation.status === 'missing_parameters') {
    return {
      status: 'missing_parameters',
      calculationType,
      missing: validation.missing,
      message: validation.message,
      components: [],
    }
  }
  const subcategory = output.standardComponentsSubcategory ?? 'none'
  if (subcategory === 'TS_DOPPIA_PENDENZA') {
    const lunghezza = Number(output.machineLengthMm) || 0
    const larghezza = Number(output.machineWidthMm) || 0
    const altezza = Number(output.machineHeightMm) || 0
    const base = computeDoppiaPendenzaBase({ lunghezza, larghezza, altezza })
    const components = buildDoppiaPendenzaStandards(base, { lunghezza, larghezza, altezza })
    return {
      status: 'ready',
      calculationType,
      missing: [],
      message: `Calcolo doppia pendenza completato (${base.colonne} colonne, ${base.capriate} capriate).`,
      components,
    }
  }
  return {
    status: 'ready',
    calculationType,
    missing: [],
    message: 'Parametri completi. Formula di calcolo per questa sottocategoria non ancora configurata.',
    components: [],
  }
}

// ===== Calcoli base I.TS DOPPIA PENDENZA =====

export interface DoppiaPendenzaBaseInput {
  lunghezza: number
  larghezza: number
  altezza: number
}

export interface DoppiaPendenzaBaseCounts {
  colonne: number
  collegaColonne: number
  ruoteColonne: number
  collegaCapriate: number
  binarioATerra: number
  capriate: number
}

/**
 * Implementa le formule dell'Excel `doppia pendenza_regole.xlsx`:
 * - COLONNA: CEILING(lunghezza/2000) * 2
 * - COLLEGA COLONNE: (colonne - 2) * 4
 * - RUOTE COLONNE: colonne
 * - COLLEGA CAPRIATE: (colonne - 2) * 4
 * - BINARIO A TERRA: CEILING(lunghezza/1500) * 2
 * - CAPRIATA: CEILING(lunghezza/2000)
 */
export function computeDoppiaPendenzaBase({
  lunghezza,
  larghezza: _larghezza,
  altezza: _altezza,
}: DoppiaPendenzaBaseInput): DoppiaPendenzaBaseCounts {
  const safeLunghezza = Math.max(0, Number.isFinite(lunghezza) ? lunghezza : 0)
  const colonne = Math.ceil(safeLunghezza / 2000) * 2
  const capriate = Math.ceil(safeLunghezza / 2000)
  const binarioATerra = Math.ceil(safeLunghezza / 1500) * 2
  const collegaColonne = Math.max(0, colonne - 2) * 4
  const collegaCapriate = Math.max(0, colonne - 2) * 4
  const ruoteColonne = colonne
  return { colonne, collegaColonne, ruoteColonne, collegaCapriate, binarioATerra, capriate }
}

interface StandardComponentSpec {
  componentCode: string
  componentName: string
  description: string
  quantity: number
  process: WorkshopWorkerSkill
  notes?: string
}

/**
 * Specifiche degli standard del DOPPIA PENDENZA (vedi punti 5 e 6 delle regole).
 * - punto 5: dipendono dal numero di colonne calcolato.
 * - punto 6: dipendono da larghezza e lunghezza (capriata).
 */
export function buildDoppiaPendenzaStandards(
  base: DoppiaPendenzaBaseCounts,
  context?: { lunghezza?: number; larghezza?: number; altezza?: number },
): CalculatedStandardComponent[] {
  const specs: StandardComponentSpec[] = []
  const colonne = Math.max(0, base.colonne)
  const altezza = context?.altezza ?? 0
  // STS027000: appartiene sia alle colonne che alle capriate -> 4 + 4 = 8 (fisso)
  specs.push(spec('STS027000', 'Standard STS027000', 8, 'saldatura', 'Fisso, 4 colonne + 4 capriate'))
  specs.push(spec('STS041000', 'Standard STS041000', 2 * colonne, 'saldatura'))
  // STS019000: dipende dall'altezza.
  // - altezza <= 5000: 6 pz/colonna, poi -12 dal totale
  // - altezza > 5000: 8 pz/colonna, poi -16 dal totale
  const sts019PerColonna = altezza > 5000 ? 8 : 6
  const sts019Subtract = altezza > 5000 ? 16 : 12
  const sts019Qty = Math.max(0, sts019PerColonna * colonne - sts019Subtract)
  specs.push(spec('STS019000', 'Standard STS019000', sts019Qty, 'saldatura', `${sts019PerColonna} pz/colonna - ${sts019Subtract} (altezza ${altezza > 5000 ? '> 5000' : '<= 5000'})`))
  // STS028000: appartiene sia alle colonne che alle capriate -> (colonne - 4) x 2
  specs.push(spec('STS028000', 'Standard STS028000', Math.max(0, colonne - 4) * 2, 'saldatura', '(colonne - 4) x 2 (colonne + capriate)'))
  specs.push(spec('STS026000_6', 'Standard STS026000_6', 2 * colonne, 'saldatura'))
  specs.push(spec('STS026000_5', 'Standard STS026000_5', 1 * colonne, 'saldatura'))
  specs.push(spec('STS026000_4', 'Standard STS026000_4', 1 * colonne, 'saldatura'))
  specs.push(spec('STS026000_3', 'Standard STS026000_3', 4 * colonne, 'saldatura'))
  specs.push(spec('STS026000_2', 'Standard STS026000_2', 1 * colonne, 'saldatura'))

  // Dalla larghezza / capriata
  const capriate = Math.max(0, base.capriate)
  specs.push(spec('STS030000', 'Standard STS030000', 10 * capriate, 'saldatura', '10 pz per capriata'))
  const larghezza = context?.larghezza ?? 0
  if (larghezza / 2 > 5800) {
    specs.push(spec('STS003000', 'Standard STS003000', 8 * capriate, 'saldatura', '8 pz per capriata (meta larghezza > 5800mm)'))
  }
  const lunghezza = context?.lunghezza ?? 0
  const its002012Qty = Math.ceil(Math.max(0, lunghezza) / 1500) * 2
  specs.push(spec('ITS002012', 'Standard ITS002012', its002012Qty, 'saldatura', 'CEILING(lunghezza/1500) x 2'))

  return specs
    .filter((spec) => spec.quantity > 0)
    .map((spec, index) => ({
      id: `preview_${index}_${spec.componentCode}`,
      workshopOutputId: '',
      workItemId: '',
      machineTypeCode: I_TS_CODE,
      componentCode: spec.componentCode,
      componentName: spec.componentName,
      description: spec.description,
      quantity: spec.quantity,
      process: spec.process,
      readyFromDate: '',
      impactScore: 0,
      notes: spec.notes ?? '',
      source: 'calculated',
      createdAt: '',
      updatedAt: '',
    }))
}

function spec(
  componentCode: string,
  componentName: string,
  quantity: number,
  process: WorkshopWorkerSkill,
  notes?: string,
): StandardComponentSpec {
  return {
    componentCode,
    componentName,
    description: '',
    quantity: Math.max(0, Math.round(quantity)),
    process,
    notes,
  }
}

export function getAvailableSubcategories(
  calculationType: StandardComponentsCalculationType,
): StandardComponentsSubcategory[] {
  return STANDARD_COMPONENTS_SUBCATEGORIES_BY_TYPE[calculationType] ?? []
}
