export const REQUIRED_OFFICE_PEOPLE = [
  {
    id: 'p_domenico',
    name: 'Domenico',
    role: 'Responsabile ufficio tecnico',
    weeklyCapacityHours: 40,
    skills: ['coordinamento', 'priorita', 'verifica tecnica', 'gestione ufficio tecnico'],
    active: true,
    notes: 'Coordina priorita e verifica tecnica.',
  },
  {
    id: 'p_marco',
    name: 'Marco',
    role: 'Tendostrutture, cantilever, linee di montaggio',
    weeklyCapacityHours: 40,
    skills: ['tendostrutture', 'cantilever', 'linee di montaggio', 'layout'],
    active: true,
  },
  {
    id: 'p_camillo',
    name: 'Camillo',
    role: 'Progettazione linee, progettazione varia',
    weeklyCapacityHours: 40,
    skills: ['progettazione linee', 'progettazione varia', 'layout', 'assiemi'],
    active: true,
  },
  {
    id: 'p_nicola',
    name: 'Nicola',
    role: 'Progettazione linee e supporto',
    weeklyCapacityHours: 40,
    skills: ['progettazione linee', 'supporto progettazione', 'dettaglio', 'assiemi'],
    active: true,
  },
  {
    id: 'p_vincenzo',
    name: 'Vincenzo',
    role: 'Rilascio produzione e documentazione cliente',
    weeklyCapacityHours: 40,
    skills: ['rilascio produzione', 'documentazione cliente', 'distinte', 'messe in tavola'],
    active: true,
  },
]

export function repairRequiredOfficePeople(existingPeople) {
  const people = [...existingPeople]
  const changes = []

  for (const required of REQUIRED_OFFICE_PEOPLE) {
    const index = people.findIndex((person) => person.id === required.id)
    if (index < 0) {
      people.push({ ...required, skills: [...required.skills] })
      changes.push({ id: required.id, name: required.name, action: 'added' })
      continue
    }

    const current = people[index]
    const next = {
      ...current,
      name: required.name,
      role: required.role,
      weeklyCapacityHours: required.weeklyCapacityHours,
      active: true,
      skills: Array.isArray(current.skills) && current.skills.length > 0 ? current.skills : [...required.skills],
    }
    if (current.notes === undefined && required.notes !== undefined) {
      next.notes = required.notes
    }

    const changed = (
      current.name !== next.name ||
      current.role !== next.role ||
      current.weeklyCapacityHours !== next.weeklyCapacityHours ||
      current.active !== true ||
      !Array.isArray(current.skills) ||
      current.skills.length === 0 ||
      current.notes !== next.notes
    )

    if (changed) {
      people[index] = next
      changes.push({ id: required.id, name: required.name, action: 'updated' })
    }
  }

  return { people, changes }
}
