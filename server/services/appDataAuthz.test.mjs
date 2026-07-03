import { describe, it, expect } from 'vitest'
import { filterAppDataForUser } from './appDataAuthz.js'
import { permissionsForRole } from './permissions.js'

const tree = () => ({
  people: [{ id: 'p1', name: 'A', baselineLoadPercent: 30 }],
  workItems: [], tasks: [], absences: [], notifications: [],
  activityLog: [{ id: 'l1', timestamp: 't', entityType: 'system', action: 'created', title: 'x' }],
  businessPartners: [{ id: 'bp1', name: 'Cli', balance: 999, exposure: 5, creditLimit: 10, risk: 2 }],
  machineTypes: [], workshopOutputs: [], workshopWorkers: [], workshopAssignments: [],
  calculatedStandardComponents: [], consuntivi: [], tubeProfiles: [],
})

describe('filterAppDataForUser', () => {
  it('non-admin: rimuove log, baseline, campi finanziari', () => {
    const out = filterAppDataForUser(tree(), permissionsForRole('progettista'))
    expect(out.activityLog).toEqual([])
    expect(out.people[0]).not.toHaveProperty('baselineLoadPercent')
    expect(out.businessPartners[0]).not.toHaveProperty('balance')
    expect(out.businessPartners[0]).not.toHaveProperty('exposure')
    expect(out.businessPartners[0].name).toBe('Cli')
  })
  it('admin: lascia tutto', () => {
    const out = filterAppDataForUser(tree(), permissionsForRole('amministratore'))
    expect(out.activityLog.length).toBe(1)
    expect(out.people[0].baselineLoadPercent).toBe(30)
    expect(out.businessPartners[0].balance).toBe(999)
  })
  it('non muta l\'albero originale', () => {
    const t = tree()
    filterAppDataForUser(t, permissionsForRole('progettista'))
    expect(t.people[0].baselineLoadPercent).toBe(30)
  })
})
