import { describe, it, expect } from 'vitest'
import { filterAppDataForUser, authorizeAppDataChange } from './appDataAuthz.js'
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

const EMPTY = {
  people: [], workItems: [], tasks: [], absences: [], notifications: [], activityLog: [],
  businessPartners: [], machineTypes: [], workshopOutputs: [], workshopWorkers: [],
  workshopAssignments: [], calculatedStandardComponents: [], consuntivi: [], tubeProfiles: [],
}
const wi = (id, owner) => ({ id, type: 'commessa', code: id, title: id, status: 'In corso', dueDate: '2026-01-01', createdByUserId: owner })
const progettista = { id: 'u1', permissions: permissionsForRole('progettista') }
const admin = { id: 'a1', permissions: permissionsForRole('amministratore') }

describe('authorizeAppDataChange — proprietà lavoro', () => {
  it('non-admin non elimina lavoro altrui: viene CONSERVATO (non blocca il salvataggio)', () => {
    const current = { ...EMPTY, workItems: [wi('w1', 'u2')] }
    const incoming = { ...EMPTY, workItems: [] } // albero senza w1 (di u2)
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.workItems.length).toBe(1) // conservato, non eliminato
    expect(out.workItems[0].id).toBe('w1')
  })
  it('REGRESSIONE: crea un lavoro con consuntivo altrui assente nell\'albero -> lavoro creato, consuntivo conservato', () => {
    const current = { ...EMPTY, consuntivi: [{ id: 'c1', commessaNumber: 'x', date: '2026-01-01', createdByUserId: 'u2', laserRows: [], tubeRows: [], weldingRows: [], bendingRows: [] }] }
    const incoming = { ...EMPTY, workItems: [{ id: 'wNew', type: 'commessa', code: 'x', title: 'x', status: 'In corso', dueDate: '2026-01-01' }], consuntivi: [] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.workItems.length).toBe(1)
    expect(out.consuntivi.length).toBe(1)
    expect(out.consuntivi[0].id).toBe('c1')
  })
  it('non-admin PUÒ eliminare il proprio lavoro', () => {
    const current = { ...EMPTY, workItems: [wi('w1', 'u1')] }
    const incoming = { ...EMPTY, workItems: [] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.workItems.length).toBe(0)
  })
  it('non-admin che crea un lavoro: il server stampa createdByUserId = utente', () => {
    const current = { ...EMPTY }
    const incoming = { ...EMPTY, workItems: [{ id: 'wNew', type: 'commessa', code: 'x', title: 'x', status: 'In corso', dueDate: '2026-01-01', createdByUserId: 'FALSO' }] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.workItems[0].createdByUserId).toBe('u1')
  })
  it('update non può cambiare createdByUserId (preservato dal DB)', () => {
    const current = { ...EMPTY, workItems: [wi('w1', 'u2')] }
    const incoming = { ...EMPTY, workItems: [{ ...wi('w1', 'HACK'), title: 'modificato' }] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.workItems[0].createdByUserId).toBe('u2') // preservato
    expect(out.workItems[0].title).toBe('modificato') // edit consentito
  })
  it('admin può eliminare lavoro altrui', () => {
    const current = { ...EMPTY, workItems: [wi('w1', 'u2')] }
    const incoming = { ...EMPTY, workItems: [] }
    const out = authorizeAppDataChange(current, incoming, admin)
    expect(out.workItems.length).toBe(0)
  })
})

describe('authorizeAppDataChange — sezioni riservate', () => {
  it('non-managePeople NON può cambiare una persona (403)', () => {
    const current = { ...EMPTY, people: [{ id: 'p1', name: 'A', weeklyCapacityHours: 40 }] }
    const incoming = { ...EMPTY, people: [{ id: 'p1', name: 'MODIFICATO', weeklyCapacityHours: 40 }] }
    expect(() => authorizeAppDataChange(current, incoming, progettista)).toThrow(/permess/i)
  })
  it('non-admin non elimina un\'anagrafica: viene CONSERVATA', () => {
    const current = { ...EMPTY, businessPartners: [{ id: 'bp1', name: 'C' }] }
    const incoming = { ...EMPTY, businessPartners: [] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.businessPartners.length).toBe(1)
    expect(out.businessPartners[0].id).toBe('bp1')
  })
  it('activityLog: client vuoto NON azzera lo storico (append-only)', () => {
    const current = { ...EMPTY, activityLog: [{ id: 'l1', timestamp: 't', entityType: 'system', action: 'created', title: 'x' }] }
    const incoming = { ...EMPTY, activityLog: [] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.activityLog.length).toBe(1)
  })
  it('baseline assente (filtrato) NON azzera il valore in DB', () => {
    const current = { ...EMPTY, people: [{ id: 'p1', name: 'A', weeklyCapacityHours: 40, baselineLoadPercent: 25 }] }
    const incoming = { ...EMPTY, people: [{ id: 'p1', name: 'A', weeklyCapacityHours: 40 }] } // baseline filtrato
    // progettista non può toccare people; ma il campo baseline deve comunque restare 25 se la persona è invariata:
    // qui la persona è "identica" a meno del campo filtrato -> deve risultare autorizzata e baseline preservata
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.people[0].baselineLoadPercent).toBe(25)
  })
})

describe('authorizeAppDataChange — coperture adversariali aggiuntive', () => {
  it('non-admin non elimina task altrui: viene CONSERVATO', () => {
    const current = { ...EMPTY, tasks: [{ id: 't1', workItemId: 'w', title: 't', assigneeId: 'a', status: 'In corso', dueDate: '2026-01-01', createdByUserId: 'u2' }] }
    const out = authorizeAppDataChange(current, { ...EMPTY, tasks: [] }, progettista)
    expect(out.tasks.length).toBe(1)
    expect(out.tasks[0].id).toBe('t1')
  })
  it('non-admin non elimina consuntivo altrui: viene CONSERVATO', () => {
    const current = { ...EMPTY, consuntivi: [{ id: 'c1', commessaNumber: 'x', date: '2026-01-01', createdByUserId: 'u2', laserRows: [], tubeRows: [], weldingRows: [], bendingRows: [] }] }
    const out = authorizeAppDataChange(current, { ...EMPTY, consuntivi: [] }, progettista)
    expect(out.consuntivi.length).toBe(1)
    expect(out.consuntivi[0].id).toBe('c1')
  })
  it('sola_lettura NON può modificare un tubeProfile; officina si', () => {
    const soloLettura = { id: 'r1', permissions: permissionsForRole('sola_lettura') }
    const officina = { id: 'o1', permissions: permissionsForRole('officina') }
    const current = { ...EMPTY, tubeProfiles: [{ id: 'tp1', label: '40x40x3', kgPerMeter: 3.49 }] }
    const incoming = { ...EMPTY, tubeProfiles: [{ id: 'tp1', label: '40x40x3', kgPerMeter: 9 }] }
    expect(() => authorizeAppDataChange(current, incoming, soloLettura)).toThrow(/permess/i)
    expect(authorizeAppDataChange(current, incoming, officina).tubeProfiles[0].kgPerMeter).toBe(9)
  })
  it('editor senza managePeople NON può sovrascrivere i campi finanziari (reintegrati dal DB)', () => {
    const current = { ...EMPTY, businessPartners: [{ id: 'bp1', name: 'C', balance: 100, creditLimit: 50 }] }
    const incoming = { ...EMPTY, businessPartners: [{ id: 'bp1', name: 'C', balance: 999999 }] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.businessPartners[0].balance).toBe(100)
    expect(out.businessPartners[0].creditLimit).toBe(50)
  })
  it('non-managePeople NON può modificare un\'assenza', () => {
    const officina = { id: 'o1', permissions: permissionsForRole('officina') }
    const current = { ...EMPTY, absences: [{ id: 'ab1', personId: 'p1', type: 'ferie', startDate: '2026-01-01', endDate: '2026-01-02', hoursPerDay: 8 }] }
    const incoming = { ...EMPTY, absences: [{ id: 'ab1', personId: 'p1', type: 'permesso', startDate: '2026-01-01', endDate: '2026-01-02', hoursPerDay: 8 }] }
    expect(() => authorizeAppDataChange(current, incoming, officina)).toThrow(/permess/i)
  })
  it('notifications: non-admin puo aggiungere ma NON azzerare/modificare le esistenti', () => {
    const curN = { id: 'n1', timestamp: 't', type: 'status_changed', entityType: 'workItem', entityId: 'w', title: 'x', message: 'x', read: false }
    const current = { ...EMPTY, notifications: [curN] }
    expect(authorizeAppDataChange(current, { ...EMPTY, notifications: [] }, progettista).notifications.length).toBe(1)
    const out = authorizeAppDataChange(current, { ...EMPTY, notifications: [{ ...curN, id: 'n2' }] }, progettista)
    expect(out.notifications.map((n) => n.id).sort()).toEqual(['n1', 'n2'])
  })
  it('notifications: admin ha pieno controllo (puo azzerare)', () => {
    const current = { ...EMPTY, notifications: [{ id: 'n1', timestamp: 't', type: 'status_changed', entityType: 'workItem', entityId: 'w', title: 'x', message: 'x', read: false }] }
    expect(authorizeAppDataChange(current, { ...EMPTY, notifications: [] }, admin).notifications.length).toBe(0)
  })
})

const officina = { id: 'o1', permissions: permissionsForRole('officina') }

describe('authorizeAppDataChange — assenze (manageAbsences)', () => {
  const ab = (id, type) => ({ id, personId: 'p1', type, startDate: '2026-01-01', endDate: '2026-01-02' })
  it('progettista PUÒ modificare le assenze', () => {
    const current = { ...EMPTY, absences: [ab('a1', 'ferie')] }
    const incoming = { ...EMPTY, absences: [ab('a1', 'permesso')] }
    const out = authorizeAppDataChange(current, incoming, progettista)
    expect(out.absences[0].type).toBe('permesso')
  })
  it('progettista NON può modificare le persone', () => {
    const current = { ...EMPTY, people: [{ id: 'p1', name: 'A', baselineLoadPercent: 30 }] }
    const incoming = { ...EMPTY, people: [{ id: 'p1', name: 'MOD', baselineLoadPercent: 30 }] }
    expect(() => authorizeAppDataChange(current, incoming, progettista)).toThrow(/permess/i)
  })
  it('officina NON può modificare le assenze', () => {
    const current = { ...EMPTY, absences: [ab('a1', 'ferie')] }
    const incoming = { ...EMPTY, absences: [ab('a1', 'permesso')] }
    expect(() => authorizeAppDataChange(current, incoming, officina)).toThrow(/permess/i)
  })
  it('admin può tutto (assenze + persone)', () => {
    const current = { ...EMPTY, absences: [ab('a1', 'ferie')], people: [{ id: 'p1', name: 'A', baselineLoadPercent: 30 }] }
    const incoming = { ...EMPTY, absences: [ab('a1', 'permesso')], people: [{ id: 'p1', name: 'MOD', baselineLoadPercent: 50 }] }
    const out = authorizeAppDataChange(current, incoming, admin)
    expect(out.absences[0].type).toBe('permesso')
  })
})

describe('chiusure commesse (consuntiviClosures)', () => {
  const CLOSURE = { id: 'cl1', commessaKey: 'COM9', supplierName: 'F', firstDate: '2026-07-01', lastDate: '2026-07-05', consuntiviCount: 1, closedAt: '2026-07-10T10:00:00Z', closedByUserId: 'u1', closedByUsername: 'admin', snapshot: { total: 111.23, totalKg: 47.1, kgByMaterial: { ferro: 47.1, inox: 0, zincato: 0, corten: 0 }, cats: { material: 61.23, gas: 50, time: 0, welding: 0, bending: 0 } } }
  const consClosed = { id: 'k1', commessaNumber: 'COM9', supplierName: 'F', date: '2026-07-01', laserRows: [], tubeRows: [], weldingRows: [], bendingRows: [], createdByUserId: 'u1' }
  const baseTree = (over = {}) => ({ people: [], workItems: [], tasks: [], absences: [], activityLog: [], notifications: [], businessPartners: [], machineTypes: [], workshopOutputs: [], workshopWorkers: [], workshopAssignments: [], tubeProfiles: [], calculatedStandardComponents: [], consuntivi: [consClosed], consuntiviClosures: [CLOSURE], ...over })
  const fullPerms = { deleteAny: true, canCreateWork: true, canEditWork: true, canDeleteOwnWork: true, managePeople: true, manageAbsences: true, viewLog: true, viewConsuntiviPrices: true }
  const admin = { id: 'u1', permissions: fullPerms }

  it('filtro: senza viewConsuntiviPrices lo snapshot perde total e cats ma tiene i kg', () => {
    const out = filterAppDataForUser(baseTree(), { ...fullPerms, viewConsuntiviPrices: false, managePeople: false })
    expect(out.consuntiviClosures[0].snapshot.total).toBeUndefined()
    expect(out.consuntiviClosures[0].snapshot.cats).toBeUndefined()
    expect(out.consuntiviClosures[0].snapshot.totalKg).toBeCloseTo(47.1, 2)
  })
  it('filtro: con viewConsuntiviPrices lo snapshot resta integro', () => {
    const out = filterAppDataForUser(baseTree(), fullPerms)
    expect(out.consuntiviClosures[0].snapshot.total).toBeCloseTo(111.23, 2)
  })
  it('PUT: consuntiviClosures del client IGNORATE (server-autoritative)', () => {
    const incoming = baseTree({ consuntiviClosures: [{ ...CLOSURE, snapshot: { ...CLOSURE.snapshot, total: 999999 } }] })
    const out = authorizeAppDataChange(baseTree(), incoming, admin)
    expect(out.consuntiviClosures[0].snapshot.total).toBeCloseTo(111.23, 2)
  })
  it('PUT: nuovo consuntivo su commessa chiusa -> 403 anche per admin', () => {
    const nuovo = { ...consClosed, id: 'k2' }
    const incoming = baseTree({ consuntivi: [consClosed, nuovo] })
    expect(() => authorizeAppDataChange(baseTree(), incoming, admin)).toThrow(/chiusa/)
  })
  it('PUT: modifica consuntivo di commessa chiusa -> 403', () => {
    const incoming = baseTree({ consuntivi: [{ ...consClosed, supplierName: 'MODIFICATO' }] })
    expect(() => authorizeAppDataChange(baseTree(), incoming, admin)).toThrow(/chiusa/)
  })
  it('PUT: consuntivo di commessa chiusa assente dal payload -> CONSERVATO', () => {
    const incoming = baseTree({ consuntivi: [] })
    const out = authorizeAppDataChange(baseTree(), incoming, admin)
    expect(out.consuntivi.map((c) => c.id)).toContain('k1')
  })
  it('PUT: consuntivo di commessa chiusa INVARIATO nel payload -> passa (round-trip)', () => {
    const incoming = baseTree({ consuntivi: [JSON.parse(JSON.stringify(consClosed))] })
    const out = authorizeAppDataChange(baseTree(), incoming, admin)
    expect(out.consuntivi.map((c) => c.id)).toContain('k1')
  })
  it('PUT: spostare un consuntivo aperto DENTRO una commessa chiusa -> 403', () => {
    const aperto = { ...consClosed, id: 'k9', commessaNumber: 'APERTA' }
    const spostato = { ...aperto, commessaNumber: 'COM9' }
    const cur = baseTree({ consuntivi: [consClosed, aperto] })
    const incoming = baseTree({ consuntivi: [consClosed, spostato] })
    expect(() => authorizeAppDataChange(cur, incoming, admin)).toThrow(/chiusa/)
  })
})
