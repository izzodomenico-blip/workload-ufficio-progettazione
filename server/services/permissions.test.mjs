import { describe, it, expect } from 'vitest'
import { permissionsForRole, requirePermission } from './permissions.js'

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
