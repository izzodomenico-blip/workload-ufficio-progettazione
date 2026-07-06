import type { Role, SectionId } from '../types'
export const ROLE_OPTIONS: Array<[Role, string]> = [
  ['amministratore', 'Amministratore'],
  ['progettista', 'Progettista'],
  ['officina', 'Officina'],
  ['sola_lettura', 'Sola lettura'],
]

export const CONTENT_SECTION_OPTIONS: Array<[SectionId, string]> = [
  ['dashboard', 'Dashboard'],
  ['planning', 'Pianificazione'],
  ['agenda', 'Agenda'],
  ['anagrafiche', 'Anagrafiche'],
  ['disegni', 'Disegni'],
  ['officina', 'Carico officina'],
  ['officina-planning', 'Pian. officina'],
  ['operai', 'Operai'],
  ['consuntivi', 'Consuntivi'],
]
