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
