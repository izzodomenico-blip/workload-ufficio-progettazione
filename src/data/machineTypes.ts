import type { MachineComplexity, MachineType } from '../types'

const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z'

interface MachineTypeSeed {
  code: string
  name: string
  family: string
  description?: string
  defaultImpactWeight?: number
  defaultComplexity?: MachineComplexity
  defaultRequiresLaser?: boolean
  defaultRequiresTubeLaser?: boolean
  defaultRequiresBending?: boolean
  defaultRequiresWelding?: boolean
  defaultRequiresAssembly?: boolean
  defaultRequiresPainting?: boolean
  defaultRequiresTesting?: boolean
  typicalAssemblyCount?: number
  typicalPartCount?: number
  notes?: string
}

const BASE_DEFAULTS = {
  defaultImpactWeight: 1,
  defaultComplexity: 'media' as MachineComplexity,
  defaultRequiresLaser: true,
  defaultRequiresTubeLaser: false,
  defaultRequiresBending: true,
  defaultRequiresWelding: true,
  defaultRequiresAssembly: true,
  defaultRequiresPainting: false,
  defaultRequiresTesting: false,
  typicalAssemblyCount: 1,
  typicalPartCount: 10,
}

const SEEDS: MachineTypeSeed[] = [
  { code: 'I.AM', name: 'Automotore', family: 'Manipolazione' },
  { code: 'I.AP', name: 'Attrezzi posizionatori con testaco', family: 'Attrezzature' },
  { code: 'I.AT', name: 'Attrezzi', family: 'Attrezzature' },
  { code: 'I.BM', name: 'Blocco meccanico', family: 'Attrezzature' },
  { code: 'I.BP', name: 'Blocco pneumatico', family: 'Attrezzature', defaultRequiresTesting: true },
  { code: 'I.CA', name: 'Convogliatore aereo scatolato', family: 'Trasportatori' },
  { code: 'I.CF', name: 'Curve a rulli folli', family: 'Rulliere' },
  { code: 'I.CL', name: 'Complesso di montaggio', family: 'Attrezzature' },
  { code: 'I.CM', name: 'Curve a rulli motorizzate', family: 'Rulliere', defaultImpactWeight: 1.2, typicalPartCount: 15 },
  { code: 'I.CP', name: 'Centratore pneumatico', family: 'Manipolazione', defaultRequiresTesting: true },
  { code: 'I.CR', name: 'Carrello', family: 'Manipolazione' },
  { code: 'I.CT', name: 'Centratore motorizzato', family: 'Manipolazione', defaultImpactWeight: 1.2, defaultRequiresTesting: true },
  { code: 'I.DE', name: 'Discensori-Elevatori in genere', family: 'Sollevamento', defaultImpactWeight: 1.7, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 40, defaultRequiresTesting: true },
  { code: 'I.DG', name: 'Disegni in genere', family: 'Generico', defaultImpactWeight: 0.5, defaultComplexity: 'bassa', typicalAssemblyCount: 1, typicalPartCount: 5, defaultRequiresLaser: false, defaultRequiresBending: false, defaultRequiresWelding: false, defaultRequiresAssembly: false },
  { code: 'I.DP', name: 'Depallettizzatore-Pallettizzatore', family: 'Manipolazione', defaultImpactWeight: 2, defaultComplexity: 'alta', typicalAssemblyCount: 4, typicalPartCount: 70, defaultRequiresTesting: true },
  { code: 'I.DS', name: 'Disimpilatore', family: 'Manipolazione', defaultImpactWeight: 1.5, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 35, defaultRequiresTesting: true },
  { code: 'I.EP', name: 'Elevatore a pianali', family: 'Sollevamento', defaultImpactWeight: 1.8, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 45, defaultRequiresTesting: true },
  { code: 'I.ET', name: 'Elevatore a tazze', family: 'Sollevamento', defaultImpactWeight: 1.7, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 45, defaultRequiresTesting: true },
  { code: 'I.GC', name: 'Giostra a carosello', family: 'Manipolazione', defaultImpactWeight: 1.8, defaultComplexity: 'alta', typicalAssemblyCount: 3, typicalPartCount: 55, defaultRequiresTesting: true },
  { code: 'I.IT', name: 'Impianto di trasporto', family: 'Impianti', defaultImpactWeight: 2, defaultComplexity: 'alta', typicalAssemblyCount: 5, typicalPartCount: 80, defaultRequiresTesting: true },
  { code: 'I.LO', name: 'Predisposizione impianti', family: 'Impianti', defaultImpactWeight: 0.8, defaultComplexity: 'bassa', typicalPartCount: 8 },
  { code: 'I.MO', name: 'Modifiche varie', family: 'Generico', defaultImpactWeight: 0.8, defaultComplexity: 'bassa', typicalPartCount: 8 },
  { code: 'I.MP', name: 'Manipolatore', family: 'Manipolazione', defaultImpactWeight: 2, defaultComplexity: 'alta', typicalAssemblyCount: 4, typicalPartCount: 70, defaultRequiresTesting: true },
  { code: 'I.PA', name: 'Piano a sfere', family: 'Trasportatori', defaultImpactWeight: 0.9, defaultComplexity: 'bassa', typicalPartCount: 12 },
  { code: 'I.PG', name: 'Pignoni in genere', family: 'Generico', defaultImpactWeight: 0.5, defaultComplexity: 'bassa', typicalPartCount: 5, defaultRequiresAssembly: false },
  { code: 'I.PS', name: 'Piattaforma di sollevamento', family: 'Sollevamento', defaultImpactWeight: 2.5, defaultComplexity: 'speciale', typicalAssemblyCount: 5, typicalPartCount: 90, defaultRequiresTesting: true },
  { code: 'I.PT', name: 'Piede di sostegno trasportatore', family: 'Trasportatori', defaultImpactWeight: 0.7, defaultComplexity: 'bassa', typicalPartCount: 8 },
  { code: 'I.RB', name: 'Ribaltatori', family: 'Manipolazione', defaultImpactWeight: 1.6, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 35, defaultRequiresTesting: true },
  { code: 'I.RF', name: 'Rulliere folli', family: 'Rulliere', defaultImpactWeight: 1, defaultComplexity: 'media', typicalAssemblyCount: 1, typicalPartCount: 10 },
  { code: 'I.RM', name: 'Rulliere motorizzate', family: 'Rulliere', defaultImpactWeight: 1.2, defaultComplexity: 'media', typicalAssemblyCount: 1, typicalPartCount: 15 },
  { code: 'I.RP', name: 'Ripari antinfortunistici', family: 'Ripari / Sicurezza', defaultImpactWeight: 0.8, defaultComplexity: 'bassa', typicalAssemblyCount: 1, typicalPartCount: 12 },
  { code: 'I.SC', name: 'Scaffalatura', family: 'Tendostrutture / Strutture', defaultImpactWeight: 1.2, typicalAssemblyCount: 2, typicalPartCount: 25 },
  { code: 'I.SD', name: 'Standard design', family: 'Standard', defaultImpactWeight: 0.7, defaultComplexity: 'bassa', typicalPartCount: 8 },
  { code: 'I.SF', name: 'Schemi fondazioni', family: 'Generico', defaultImpactWeight: 0.6, defaultComplexity: 'bassa', defaultRequiresWelding: false, defaultRequiresAssembly: false },
  { code: 'I.SG', name: 'Supporti in genere', family: 'Generico', defaultImpactWeight: 0.7, defaultComplexity: 'bassa', typicalPartCount: 8 },
  { code: 'I.SN', name: 'Spintori', family: 'Manipolazione', defaultImpactWeight: 1.2, defaultComplexity: 'media', typicalPartCount: 18, defaultRequiresTesting: true },
  { code: 'I.SP', name: 'Schemi Pneumatici', family: 'Generico', defaultImpactWeight: 0.6, defaultComplexity: 'bassa', defaultRequiresLaser: false, defaultRequiresBending: false, defaultRequiresWelding: false, defaultRequiresAssembly: false, defaultRequiresTesting: true },
  { code: 'I.SS', name: 'Slitta speciale', family: 'Manipolazione', defaultImpactWeight: 1.4, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 30, defaultRequiresTesting: true },
  { code: 'I.TA', name: 'Trasportatori aerei', family: 'Trasportatori', defaultImpactWeight: 1.6, defaultComplexity: 'alta', typicalAssemblyCount: 3, typicalPartCount: 50 },
  { code: 'I.TB', name: 'Trasbordatore', family: 'Trasportatori', defaultImpactWeight: 1.8, defaultComplexity: 'alta', typicalAssemblyCount: 3, typicalPartCount: 55, defaultRequiresTesting: true },
  { code: 'I.TC', name: 'Trasportatore a catena', family: 'Trasportatori', defaultImpactWeight: 1.5, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 40 },
  { code: 'I.TF', name: 'Trasferitori', family: 'Trasportatori', defaultImpactWeight: 1.4, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 35, defaultRequiresTesting: true },
  { code: 'I.TG', name: 'Trasportatore a cinghia', family: 'Trasportatori', defaultImpactWeight: 1.2, defaultComplexity: 'media', typicalAssemblyCount: 2, typicalPartCount: 25 },
  { code: 'I.TL', name: 'Trasportatori a coclea', family: 'Trasportatori', defaultImpactWeight: 1.3, defaultComplexity: 'media', typicalAssemblyCount: 2, typicalPartCount: 25 },
  { code: 'I.TM', name: 'Tunnel di riscaldamento', family: 'Impianti', defaultImpactWeight: 1.6, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 40, defaultRequiresTesting: true },
  { code: 'I.TN', name: 'Trasportatore a nastro', family: 'Trasportatori', defaultImpactWeight: 1.2, defaultComplexity: 'media', typicalAssemblyCount: 2, typicalPartCount: 24 },
  { code: 'I.TR', name: 'Trasportatore a rulli', family: 'Trasportatori', defaultImpactWeight: 1.3, defaultComplexity: 'media', typicalAssemblyCount: 2, typicalPartCount: 25 },
  { code: 'I.TS', name: 'Tendostrutture', family: 'Tendostrutture / Strutture', defaultImpactWeight: 2.2, defaultComplexity: 'alta', defaultRequiresTubeLaser: true, typicalAssemblyCount: 8, typicalPartCount: 120 },
  { code: 'I.TT', name: 'Trasportatore a tapparelle', family: 'Trasportatori', defaultImpactWeight: 1.8, defaultComplexity: 'alta', typicalAssemblyCount: 3, typicalPartCount: 50 },
  { code: 'I.TZ', name: 'Trasportatore a tazze', family: 'Trasportatori', defaultImpactWeight: 1.5, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 40, defaultRequiresTesting: true },
  { code: 'I.UR', name: 'Unita rotante automatica', family: 'Manipolazione', defaultImpactWeight: 1.6, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 35, defaultRequiresTesting: true },
  { code: 'I.VV', name: 'Vibrovagliatore', family: 'Impianti', defaultImpactWeight: 1.4, defaultComplexity: 'alta', typicalAssemblyCount: 2, typicalPartCount: 30, defaultRequiresTesting: true },
  { code: 'S.SC', name: 'Standard - Scaffalature', family: 'Standard', defaultImpactWeight: 1, defaultComplexity: 'media', typicalAssemblyCount: 2, typicalPartCount: 25 },
  { code: 'S.TS', name: 'Standard - tendostrutture', family: 'Standard', defaultImpactWeight: 1.8, defaultComplexity: 'media', defaultRequiresTubeLaser: true, typicalAssemblyCount: 5, typicalPartCount: 80 },
]

function idFromCode(code: string): string {
  return `mt_${code.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
}

function toMachineType(seed: MachineTypeSeed): MachineType {
  const merged = { ...BASE_DEFAULTS, ...seed }
  return {
    id: idFromCode(seed.code),
    code: seed.code,
    name: seed.name,
    family: seed.family,
    description: seed.description ?? seed.name,
    defaultImpactWeight: merged.defaultImpactWeight,
    defaultComplexity: merged.defaultComplexity,
    defaultRequiresLaser: merged.defaultRequiresLaser,
    defaultRequiresTubeLaser: merged.defaultRequiresTubeLaser,
    defaultRequiresBending: merged.defaultRequiresBending,
    defaultRequiresWelding: merged.defaultRequiresWelding,
    defaultRequiresAssembly: merged.defaultRequiresAssembly,
    defaultRequiresPainting: merged.defaultRequiresPainting,
    defaultRequiresTesting: merged.defaultRequiresTesting,
    typicalAssemblyCount: merged.typicalAssemblyCount,
    typicalPartCount: merged.typicalPartCount,
    active: true,
    notes: seed.notes ?? '',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  }
}

export const DEFAULT_MACHINE_TYPES: MachineType[] = SEEDS.map(toMachineType)

