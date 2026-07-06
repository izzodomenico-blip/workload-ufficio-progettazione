const FINANCIAL_FIELDS = ['balance', 'exposure', 'creditLimit', 'overCreditLimit', 'risk']

export function filterAppDataForUser(tree, perms) {
  const out = { ...tree }
  if (!perms.viewLog) out.activityLog = []
  if (!perms.managePeople) {
    out.people = (tree.people || []).map((p) => {
      const { baselineLoadPercent, ...rest } = p
      return rest
    })
    out.businessPartners = (tree.businessPartners || []).map((bp) => {
      const copy = { ...bp }
      for (const f of FINANCIAL_FIELDS) delete copy[f]
      return copy
    })
  }
  return out
}

// Collezioni la cui eliminazione è ammessa solo ad admin (deleteAny).
const ADMIN_DELETE_ONLY = [
  'businessPartners', 'machineTypes', 'workshopWorkers',
  'workshopOutputs', 'workshopAssignments', 'tubeProfiles', 'calculatedStandardComponents',
]
// Collezioni con proprietà (creatore): delete = creatore o admin.
const OWNED = ['workItems', 'tasks', 'consuntivi']

function byId(list) {
  const m = new Map()
  for (const x of list || []) m.set(x.id, x)
  return m
}
function forbid(msg) { const e = new Error(msg); e.statusCode = 403; e.detail = 'permission-denied'; throw e }

export function authorizeAppDataChange(current, incoming, user) {
  const perms = user.permissions
  const out = { ...incoming }

  // 1) Collezioni con proprietà (workItems/tasks/consuntivi)
  for (const key of OWNED) {
    const cur = byId(current[key])
    const inc = incoming[key] || []
    const incIds = new Set(inc.map((x) => x.id))
    // eliminazioni: un elemento presente in current ma assente nell'incoming.
    // Se l'utente NON è autorizzato a eliminarlo, lo si CONSERVA (si tiene la copia
    // del server) invece di bloccare l'intero salvataggio: un albero client incompleto
    // o stantìo non deve impedire operazioni non correlate (es. creare un lavoro), né
    // può cancellare dati altrui. Solo chi è autorizzato lo elimina davvero.
    const preserved = []
    for (const [id, item] of cur) {
      if (!incIds.has(id)) {
        const owner = item.createdByUserId || ''
        const canDelete = perms.deleteAny || (perms.canDeleteOwnWork && owner === user.id)
        if (!canDelete) preserved.push(item)
      }
    }
    // create/update
    const processed = inc.map((item) => {
      const before = cur.get(item.id)
      if (!before) {
        if (!perms.canCreateWork) forbid(`Non hai i permessi per creare in ${key}.`)
        return { ...item, createdByUserId: user.id } // stampa creatore
      }
      // update: consentito con canEditWork; preserva createdByUserId
      if (!perms.canEditWork && JSON.stringify(before) !== JSON.stringify(item)) {
        forbid(`Non hai i permessi per modificare ${key}.`)
      }
      return { ...item, createdByUserId: before.createdByUserId || '' }
    })
    out[key] = [...processed, ...preserved]
  }

  // 2) Collezioni admin-delete-only + edit con canEditWork
  for (const key of ADMIN_DELETE_ONLY) {
    const cur = byId(current[key])
    const inc = incoming[key] || []
    const incIds = new Set(inc.map((x) => x.id))
    // eliminazioni: senza deleteAny gli elementi assenti vengono CONSERVATI (stessa logica
    // di sopra: un albero incompleto non blocca il salvataggio né cancella dati altrui).
    const preserved = []
    for (const [id, item] of cur) {
      if (!incIds.has(id) && !perms.deleteAny) preserved.push(item)
    }
    for (const item of inc) {
      const before = cur.get(item.id)
      const changed = !before || JSON.stringify(before) !== JSON.stringify(item)
      if (changed && !perms.canEditWork && !perms.deleteAny) forbid(`Non hai i permessi per modificare ${key}.`)
    }
    out[key] = [...inc, ...preserved]
  }

  // 3) people (managePeople) + absences (manageAbsences): se non hai il permesso relativo,
  //    devono risultare INVARIATE (a meno dei campi filtrati, reintegrati dal DB).
  const canWrite = { people: perms.managePeople, absences: perms.manageAbsences }
  for (const key of ['people', 'absences']) {
    if (canWrite[key]) { out[key] = incoming[key]; continue }
    const cur = byId(current[key])
    const inc = incoming[key] || []
    if (inc.length !== cur.size) forbid(`Non hai i permessi per modificare ${key}.`)
    const merged = []
    for (const item of inc) {
      const before = cur.get(item.id)
      if (!before) forbid(`Non hai i permessi per modificare ${key}.`)
      // reintegra i campi filtrati (baseline, finanziari) dal DB e confronta il resto
      const reintegrated = key === 'people'
        ? { ...item, baselineLoadPercent: before.baselineLoadPercent }
        : item
      if (JSON.stringify(before) !== JSON.stringify({ ...before, ...reintegrated })) {
        forbid(`Non hai i permessi per modificare ${key}.`)
      }
      merged.push(reintegrated)
    }
    out[key] = merged
  }

  // 4) businessPartners: reintegra i campi finanziari filtrati (se non managePeople)
  if (!perms.managePeople) {
    const cur = byId(current.businessPartners)
    out.businessPartners = (out.businessPartners || []).map((bp) => {
      const before = cur.get(bp.id)
      if (!before) return bp
      const fin = {}
      for (const f of FINANCIAL_FIELDS) if (before[f] !== undefined) fin[f] = before[f]
      return { ...bp, ...fin }
    })
  }

  // 5) activityLog append-only: parti dal log corrente, aggiungi solo le voci con id nuovo
  {
    const curLog = current.activityLog || []
    const seen = new Set(curLog.map((e) => e.id))
    const additions = (incoming.activityLog || []).filter((e) => e && e.id && !seen.has(e.id))
    out.activityLog = [...additions, ...curLog]
  }

  // 6) notifications: admin (deleteAny) pieno controllo; gli altri append-only
  //    (possono generare nuove notifiche dalle proprie azioni, non modificare/azzerare le esistenti).
  if (perms.deleteAny) {
    out.notifications = incoming.notifications || []
  } else {
    const curN = current.notifications || []
    const seenN = new Set(curN.map((n) => n.id))
    const addN = (incoming.notifications || []).filter((n) => n && n.id && !seenN.has(n.id))
    out.notifications = [...addN, ...curN]
  }

  return out
}
