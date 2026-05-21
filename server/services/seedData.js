import { REQUIRED_OFFICE_PEOPLE } from './officePeople.js'
import { getDefaultMachineTypes } from './machineTypesSeed.js'

function iso(date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(12, 0, 0, 0)
  return d
}

export function freshSeedData() {
  const monday = startOfWeek(new Date())
  const d = (offset) => iso(addDays(monday, offset))

  const people = REQUIRED_OFFICE_PEOPLE.map((person) => ({
    ...person,
    skills: [...person.skills],
  }))

  const workItems = [
    {
      id: 'w_seed_cm001',
      type: 'commessa',
      code: 'CM-2026-001',
      customer: 'Cliente Demo',
      title: 'Linea assemblaggio demo',
      description: 'Dato demo iniziale creato dal backend SQLite.',
      priority: 'alta',
      status: 'In corso',
      ownerId: 'p_domenico',
      assigneeIds: ['p_camillo', 'p_marco', 'p_nicola', 'p_vincenzo'],
      startDate: d(-7),
      dueDate: d(21),
      estimatedHours: 120,
      loggedHours: 24,
      progressPercent: 25,
      blockers: [],
      technicalPhase: 'Layout',
      commercialPriority: 'alta',
    },
    {
      id: 'w_seed_st001',
      type: 'studio',
      code: 'ST-2026-001',
      customer: 'Prospect Demo',
      title: 'Studio fattibilita demo',
      description: 'Studio demo per verificare import, report e pianificazione.',
      priority: 'media',
      status: 'Da pianificare',
      ownerId: 'p_domenico',
      assigneeIds: ['p_marco'],
      startDate: d(0),
      dueDate: d(28),
      estimatedHours: 40,
      loggedHours: 0,
      progressPercent: 0,
      acquisitionProbability: 50,
      blockers: [],
    },
  ]

  const tasks = [
    {
      id: 't_seed_001',
      workItemId: 'w_seed_cm001',
      title: 'Layout generale',
      assigneeId: 'p_camillo',
      status: 'In corso',
      startDate: d(-3),
      dueDate: d(7),
      estimatedHours: 32,
      loggedHours: 10,
      progressPercent: 35,
      blockers: [],
    },
    {
      id: 't_seed_002',
      workItemId: 'w_seed_cm001',
      title: 'Verifica responsabile',
      assigneeId: 'p_domenico',
      status: 'Da pianificare',
      startDate: d(7),
      dueDate: d(14),
      estimatedHours: 8,
      loggedHours: 0,
      progressPercent: 0,
      blockers: [],
    },
    {
      id: 't_seed_003',
      workItemId: 'w_seed_st001',
      title: 'Raccolta requisiti',
      assigneeId: 'p_marco',
      status: 'Da pianificare',
      startDate: d(0),
      dueDate: d(7),
      estimatedHours: 12,
      loggedHours: 0,
      progressPercent: 0,
      blockers: [],
    },
    {
      id: 't_seed_004',
      workItemId: 'w_seed_cm001',
      title: 'Supporto progettazione',
      assigneeId: 'p_nicola',
      status: 'Da pianificare',
      startDate: d(7),
      dueDate: d(14),
      estimatedHours: 12,
      loggedHours: 0,
      progressPercent: 0,
      blockers: [],
    },
    {
      id: 't_seed_005',
      workItemId: 'w_seed_cm001',
      title: 'Documentazione cliente',
      assigneeId: 'p_vincenzo',
      status: 'Da pianificare',
      startDate: d(14),
      dueDate: d(21),
      estimatedHours: 10,
      loggedHours: 0,
      progressPercent: 0,
      blockers: [],
    },
  ]

  const absences = [
    {
      id: 'ab_seed_001',
      personId: 'p_marco',
      type: 'permesso',
      startDate: d(4),
      endDate: d(4),
      hoursPerDay: 4,
      notes: 'Dato demo',
    },
  ]

  return {
    people,
    workItems,
    tasks,
    absences,
    activityLog: [],
    notifications: [],
    businessPartners: [],
    machineTypes: getDefaultMachineTypes(),
    workshopOutputs: [],
    workshopWorkers: [],
    workshopAssignments: [],
  }
}
