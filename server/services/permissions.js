export const ROLES = ['amministratore', 'progettista', 'officina', 'sola_lettura']
export const ROLE_LABELS = {
  amministratore: 'Amministratore',
  progettista: 'Progettista',
  officina: 'Officina',
  sola_lettura: 'Sola lettura',
}
export const SECTIONS = [
  'dashboard', 'planning', 'agenda', 'anagrafiche', 'disegni',
  'officina', 'operai', 'officina-planning', 'consuntivi', 'log', 'utenti',
]

function base() {
  return {
    sections: [],
    canCreateWork: false,
    canEditWork: false,
    canDeleteOwnWork: false,
    deleteAny: false,
    manageUsers: false,
    managePeople: false,
    viewConsuntiviPrices: false,
    manageBackups: false,
    viewLog: false,
  }
}

export function requirePermission(permissions, key) {
  if (!permissions || permissions[key] !== true) {
    const err = new Error('Permesso negato.')
    err.statusCode = 403
    err.detail = 'forbidden'
    throw err
  }
}

export function permissionsForRole(role) {
  const p = base()
  if (role === 'amministratore') {
    return {
      sections: [...SECTIONS],
      canCreateWork: true, canEditWork: true, canDeleteOwnWork: true, deleteAny: true,
      manageUsers: true, managePeople: true, viewConsuntiviPrices: true, manageBackups: true, viewLog: true,
    }
  }
  if (role === 'progettista') {
    return { ...p, sections: ['dashboard', 'planning', 'agenda', 'anagrafiche', 'disegni'],
      canCreateWork: true, canEditWork: true, canDeleteOwnWork: true }
  }
  if (role === 'officina') {
    return { ...p, sections: ['officina', 'officina-planning', 'operai', 'consuntivi'],
      canCreateWork: true, canEditWork: true, canDeleteOwnWork: true }
  }
  if (role === 'sola_lettura') {
    return { ...p, sections: ['dashboard', 'officina', 'consuntivi'] }
  }
  return p
}
