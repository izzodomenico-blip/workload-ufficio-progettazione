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
    manageAbsences: false,
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
      manageUsers: true, managePeople: true, manageAbsences: true, viewConsuntiviPrices: true, manageBackups: true, viewLog: true,
    }
  }
  if (role === 'progettista') {
    return { ...p, sections: ['dashboard', 'planning', 'agenda', 'anagrafiche', 'disegni'],
      canCreateWork: true, canEditWork: true, canDeleteOwnWork: true, manageAbsences: true }
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

export const CONTENT_SECTIONS = [
  'dashboard', 'planning', 'agenda', 'anagrafiche', 'disegni',
  'officina', 'officina-planning', 'operai', 'consuntivi',
]

export function effectiveSections(role, override) {
  const roleSections = permissionsForRole(role).sections
  if (!Array.isArray(override) || override.length === 0) return roleSections
  const content = new Set(CONTENT_SECTIONS)
  const fromOverride = override.filter((s) => content.has(s))
  const specials = roleSections.filter((s) => s === 'utenti' || s === 'log')
  return [...new Set([...fromOverride, ...specials])]
}

export const GRANTABLE_PERMISSIONS = ['viewConsuntiviPrices']

export function applyGrants(permissions, grants) {
  if (Array.isArray(grants)) {
    for (const p of GRANTABLE_PERMISSIONS) {
      if (grants.includes(p)) permissions[p] = true
    }
  }
  return permissions
}
