import type { TubeProfile } from '../types'

/** kg/m nominali (area sezione × 0.00785). Editabili dall'admin nella libreria. */
const RAW: Array<Pick<TubeProfile, 'id' | 'categoria' | 'label' | 'kgPerMeter'>> = [
  { id: 'tp_def_quad_20x20x2', categoria: 'tubolari', label: '20x20x2', kgPerMeter: 1.13 },
  { id: 'tp_def_quad_25x25x2', categoria: 'tubolari', label: '25x25x2', kgPerMeter: 1.44 },
  { id: 'tp_def_quad_30x30x2', categoria: 'tubolari', label: '30x30x2', kgPerMeter: 1.76 },
  { id: 'tp_def_quad_40x40x2', categoria: 'tubolari', label: '40x40x2', kgPerMeter: 2.39 },
  { id: 'tp_def_quad_40x40x3', categoria: 'tubolari', label: '40x40x3', kgPerMeter: 3.49 },
  { id: 'tp_def_quad_50x50x3', categoria: 'tubolari', label: '50x50x3', kgPerMeter: 4.43 },
  { id: 'tp_def_quad_60x60x3', categoria: 'tubolari', label: '60x60x3', kgPerMeter: 5.37 },
  { id: 'tp_def_quad_80x80x4', categoria: 'tubolari', label: '80x80x4', kgPerMeter: 9.55 },
  { id: 'tp_def_rett_40x20x2', categoria: 'tubolari', label: '40x20x2', kgPerMeter: 1.76 },
  { id: 'tp_def_rett_60x40x3', categoria: 'tubolari', label: '60x40x3', kgPerMeter: 4.43 },
  { id: 'tp_def_rett_80x40x3', categoria: 'tubolari', label: '80x40x3', kgPerMeter: 5.37 },
  { id: 'tp_def_tondo_33x2_6', categoria: 'tubi', label: 'Ø33.7x2.6', kgPerMeter: 1.99 },
  { id: 'tp_def_tondo_42x2_6', categoria: 'tubi', label: 'Ø42.4x2.6', kgPerMeter: 2.55 },
  { id: 'tp_def_tondo_48x2_9', categoria: 'tubi', label: 'Ø48.3x2.9', kgPerMeter: 3.25 },
  { id: 'tp_def_tondo_60x2_9', categoria: 'tubi', label: 'Ø60.3x2.9', kgPerMeter: 4.10 },
]

export const DEFAULT_TUBE_PROFILES: TubeProfile[] = RAW.map((p) => ({
  ...p,
  active: true,
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}))

/** Unisce i profili di default con quelli personalizzati salvati (custom vincono per id). */
export function mergeTubeProfiles(custom: TubeProfile[]): TubeProfile[] {
  const byId = new Map<string, TubeProfile>()
  for (const p of DEFAULT_TUBE_PROFILES) byId.set(p.id, p)
  for (const p of custom) byId.set(p.id, p)
  return Array.from(byId.values()).filter((p) => p.active)
}
