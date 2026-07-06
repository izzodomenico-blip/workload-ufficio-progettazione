import { describe, it, expect } from 'vitest'
import { permissionsForRole, requirePermission, effectiveSections, CONTENT_SECTIONS, applyGrants, GRANTABLE_PERMISSIONS } from './permissions.js'

describe('permissionsForRole', () => {
  it('amministratore: tutto', () => {
    const p = permissionsForRole('amministratore')
    expect(p.deleteAny).toBe(true)
    expect(p.manageUsers).toBe(true)
    expect(p.viewConsuntiviPrices).toBe(true)
    expect(p.sections).toContain('utenti')
    expect(p.sections).toContain('consuntivi')
  })
  it('progettista: ufficio tecnico, niente riservati', () => {
    const p = permissionsForRole('progettista')
    expect(p.canCreateWork).toBe(true)
    expect(p.deleteAny).toBe(false)
    expect(p.manageUsers).toBe(false)
    expect(p.viewConsuntiviPrices).toBe(false)
    expect(p.sections).toEqual(expect.arrayContaining(['dashboard', 'planning', 'agenda', 'anagrafiche', 'disegni']))
    expect(p.sections).not.toContain('utenti')
  })
  it('officina: sezioni officina + consuntivi data-entry', () => {
    const p = permissionsForRole('officina')
    expect(p.sections).toEqual(expect.arrayContaining(['officina', 'officina-planning', 'operai', 'consuntivi']))
    expect(p.viewConsuntiviPrices).toBe(false)
  })
  it('sola_lettura: nessuna scrittura', () => {
    const p = permissionsForRole('sola_lettura')
    expect(p.canCreateWork).toBe(false)
    expect(p.canEditWork).toBe(false)
    expect(p.canDeleteOwnWork).toBe(false)
  })
  it('ruolo sconosciuto → permessi minimi (sola lettura vuota)', () => {
    const p = permissionsForRole('xxx')
    expect(p.canEditWork).toBe(false)
    expect(p.sections).toEqual([])
  })
})

describe('requirePermission', () => {
  it('permesso concesso: non lancia', () => {
    expect(() => requirePermission({ manageBackups: true }, 'manageBackups')).not.toThrow()
  })
  it('permesso esplicitamente false: lancia 403 forbidden', () => {
    try {
      requirePermission({ manageBackups: false }, 'manageBackups')
      throw new Error('avrebbe dovuto lanciare')
    } catch (err) {
      expect(err.statusCode).toBe(403)
      expect(err.detail).toBe('forbidden')
    }
  })
  it('chiave mancante nell\'oggetto permessi: nega (403)', () => {
    try {
      requirePermission({}, 'manageBackups')
      throw new Error('avrebbe dovuto lanciare')
    } catch (err) {
      expect(err.statusCode).toBe(403)
      expect(err.detail).toBe('forbidden')
    }
  })
  it('permissions null: nega (403)', () => {
    try {
      requirePermission(null, 'x')
      throw new Error('avrebbe dovuto lanciare')
    } catch (err) {
      expect(err.statusCode).toBe(403)
      expect(err.detail).toBe('forbidden')
    }
  })
})

describe('effectiveSections', () => {
  it('nessun override o vuoto -> sezioni del ruolo', () => {
    expect(effectiveSections('progettista', [])).toEqual(permissionsForRole('progettista').sections)
    expect(effectiveSections('progettista', null)).toEqual(permissionsForRole('progettista').sections)
  })
  it('override contenuto per non-admin -> esattamente quelle', () => {
    expect(effectiveSections('progettista', ['consuntivi'])).toEqual(['consuntivi'])
  })
  it('admin mantiene utenti anche con override senza utenti', () => {
    const r = effectiveSections('amministratore', ['dashboard'])
    expect(r).toContain('dashboard')
    expect(r).toContain('utenti')
    expect(r).toContain('log')
  })
  it('voci invalide o speciali nell override vengono ignorate', () => {
    expect(effectiveSections('officina', ['consuntivi', 'utenti', 'inesistente'])).toEqual(['consuntivi'])
  })
})

describe('applyGrants', () => {
  it('concede viewConsuntiviPrices', () => {
    const p = permissionsForRole('officina')
    expect(p.viewConsuntiviPrices).toBe(false)
    applyGrants(p, ['viewConsuntiviPrices'])
    expect(p.viewConsuntiviPrices).toBe(true)
  })
  it('nessun grant -> invariato', () => {
    const p = permissionsForRole('officina')
    applyGrants(p, [])
    expect(p.viewConsuntiviPrices).toBe(false)
  })
  it('ignora voci fuori whitelist', () => {
    const p = permissionsForRole('officina')
    applyGrants(p, ['manageUsers', 'deleteAny'])
    expect(p.manageUsers).toBe(false)
    expect(p.deleteAny).toBe(false)
  })
})
describe('manageAbsences nella matrice', () => {
  it('admin e progettista true; officina e sola_lettura false', () => {
    expect(permissionsForRole('amministratore').manageAbsences).toBe(true)
    expect(permissionsForRole('progettista').manageAbsences).toBe(true)
    expect(permissionsForRole('officina').manageAbsences).toBe(false)
    expect(permissionsForRole('sola_lettura').manageAbsences).toBe(false)
  })
})
