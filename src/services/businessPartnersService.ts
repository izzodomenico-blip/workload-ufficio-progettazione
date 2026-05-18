import type { AppData, BusinessPartner, BusinessPartnerType } from '../types'
import { uid } from '../utils/format'

export type CreateBusinessPartnerInput = Omit<BusinessPartner, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateBusinessPartnerInput = Partial<Omit<BusinessPartner, 'id' | 'createdAt' | 'updatedAt'>>

export interface ImportPlanRecord extends Omit<BusinessPartner, 'id' | 'createdAt' | 'updatedAt'> {
  // input record coming from XML/CSV/JSON (no id assigned yet)
}

export interface ImportPlanItem {
  decision: 'create' | 'update' | 'skip'
  reason?: string
  matchedBy?: 'accountCode' | 'vatNumber+name' | 'fiscalCode+name'
  matchedId?: string
  record: ImportPlanRecord
}

export interface ImportPlan {
  filename?: string
  totalRead: number
  toCreate: number
  toUpdate: number
  toSkip: number
  errors: string[]
  items: ImportPlanItem[]
}

function nowISO(): string {
  return new Date().toISOString()
}

function trimOpt(v: string | undefined | null): string | undefined {
  if (v === undefined || v === null) return undefined
  const t = v.toString().trim()
  return t.length > 0 ? t : undefined
}

function sortPartners(arr: BusinessPartner[]): BusinessPartner[] {
  return arr.slice().sort((a, b) => {
    const an = a.name.toLowerCase()
    const bn = b.name.toLowerCase()
    if (an < bn) return -1
    if (an > bn) return 1
    return 0
  })
}

// === CRUD =================================================================

export function createBusinessPartner(
  data: AppData,
  input: CreateBusinessPartnerInput,
): { data: AppData; id: string; partner: BusinessPartner } {
  const id = uid('bp')
  const at = nowISO()
  const partner: BusinessPartner = {
    ...input,
    id,
    name: input.name.trim(),
    accountCode: trimOpt(input.accountCode) ?? '',
    active: input.active !== false,
    createdAt: at,
    updatedAt: at,
  }
  return {
    data: { ...data, businessPartners: sortPartners([...data.businessPartners, partner]) },
    id,
    partner,
  }
}

export function updateBusinessPartner(
  data: AppData,
  id: string,
  patch: UpdateBusinessPartnerInput,
): AppData {
  const at = nowISO()
  return {
    ...data,
    businessPartners: sortPartners(
      data.businessPartners.map((p) =>
        p.id === id ? { ...p, ...patch, id: p.id, createdAt: p.createdAt, updatedAt: at } : p,
      ),
    ),
  }
}

export function setBusinessPartnerActive(
  data: AppData,
  id: string,
  active: boolean,
): AppData {
  return updateBusinessPartner(data, id, { active })
}

/** Soft delete: imposta active=false. */
export function deleteBusinessPartner(data: AppData, id: string): AppData {
  return setBusinessPartnerActive(data, id, false)
}

// === Dedup matching =======================================================

export interface PartnerMatcher {
  byAccountCode: Map<string, BusinessPartner>
  byVatName: Map<string, BusinessPartner>
  byFiscalName: Map<string, BusinessPartner>
}

function vatKey(vat: string | undefined, name: string): string {
  return `${(vat ?? '').trim().toUpperCase()}|${name.trim().toLowerCase()}`
}

function fiscalKey(fiscal: string | undefined, name: string): string {
  return `${(fiscal ?? '').trim().toUpperCase()}|${name.trim().toLowerCase()}`
}

export function buildPartnerMatcher(partners: BusinessPartner[]): PartnerMatcher {
  const byAccountCode = new Map<string, BusinessPartner>()
  const byVatName = new Map<string, BusinessPartner>()
  const byFiscalName = new Map<string, BusinessPartner>()
  for (const p of partners) {
    if (p.accountCode) byAccountCode.set(p.accountCode.trim().toUpperCase(), p)
    if (p.vatNumber) byVatName.set(vatKey(p.vatNumber, p.name), p)
    if (p.fiscalCode) byFiscalName.set(fiscalKey(p.fiscalCode, p.name), p)
  }
  return { byAccountCode, byVatName, byFiscalName }
}

export function planImport(
  data: AppData,
  records: ImportPlanRecord[],
  filename?: string,
): ImportPlan {
  const matcher = buildPartnerMatcher(data.businessPartners)
  const items: ImportPlanItem[] = []
  const errors: string[] = []
  let toCreate = 0
  let toUpdate = 0
  let toSkip = 0

  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx]
    if (!rec.name || !rec.name.trim()) {
      items.push({ decision: 'skip', reason: 'Manca ragione sociale', record: rec })
      toSkip++
      continue
    }
    if (!rec.accountCode && !rec.vatNumber && !rec.fiscalCode) {
      items.push({ decision: 'skip', reason: 'Manca codice conto/P.IVA/CF', record: rec })
      toSkip++
      continue
    }

    let matched: BusinessPartner | undefined
    let matchedBy: ImportPlanItem['matchedBy']

    if (rec.accountCode) {
      const m = matcher.byAccountCode.get(rec.accountCode.trim().toUpperCase())
      if (m) { matched = m; matchedBy = 'accountCode' }
    }
    if (!matched && rec.vatNumber) {
      const m = matcher.byVatName.get(vatKey(rec.vatNumber, rec.name))
      if (m) { matched = m; matchedBy = 'vatNumber+name' }
    }
    if (!matched && rec.fiscalCode) {
      const m = matcher.byFiscalName.get(fiscalKey(rec.fiscalCode, rec.name))
      if (m) { matched = m; matchedBy = 'fiscalCode+name' }
    }

    if (matched) {
      items.push({ decision: 'update', matchedBy, matchedId: matched.id, record: rec })
      toUpdate++
    } else {
      items.push({ decision: 'create', record: rec })
      toCreate++
    }
  }

  return {
    filename,
    totalRead: records.length,
    toCreate,
    toUpdate,
    toSkip,
    errors,
    items,
  }
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
}

export function applyImport(
  data: AppData,
  plan: ImportPlan,
): { data: AppData; result: ImportResult } {
  const at = nowISO()
  let created = 0
  let updated = 0

  const next = new Map<string, BusinessPartner>()
  for (const p of data.businessPartners) next.set(p.id, p)

  for (const item of plan.items) {
    if (item.decision === 'skip') continue
    if (item.decision === 'update' && item.matchedId) {
      const current = next.get(item.matchedId)
      if (!current) continue
      next.set(item.matchedId, {
        ...current,
        ...stripUndefined(item.record),
        id: current.id,
        // keep manual overrides if record value is empty
        name: item.record.name.trim() || current.name,
        accountCode: item.record.accountCode?.trim() || current.accountCode,
        active: item.record.active !== false,
        createdAt: current.createdAt,
        updatedAt: at,
      })
      updated++
      continue
    }
    if (item.decision === 'create') {
      const id = uid('bp')
      const partner: BusinessPartner = {
        ...stripUndefined(item.record),
        id,
        name: item.record.name.trim(),
        accountCode: item.record.accountCode?.trim() ?? '',
        type: item.record.type,
        active: item.record.active !== false,
        createdAt: at,
        updatedAt: at,
      }
      next.set(id, partner)
      created++
    }
  }

  return {
    data: { ...data, businessPartners: sortPartners(Array.from(next.values())) },
    result: { created, updated, skipped: plan.toSkip },
  }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const k in obj) {
    if (obj[k] !== undefined) out[k] = obj[k]
  }
  return out as T
}

// === Lookup / autocomplete ===============================================

export function searchBusinessPartners(
  partners: BusinessPartner[],
  query: string,
  options: { type?: BusinessPartnerType; activeOnly?: boolean; limit?: number } = {},
): BusinessPartner[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return []
  const limit = options.limit ?? 8
  const activeOnly = options.activeOnly !== false

  const matches: { partner: BusinessPartner; score: number }[] = []
  for (const p of partners) {
    if (activeOnly && !p.active) continue
    if (options.type && p.type !== options.type) continue
    const name = p.name.toLowerCase()
    let score = 0
    if (name.startsWith(q)) score = 100
    else if (name.includes(q)) score = 60
    else if ((p.accountCode || '').toLowerCase().includes(q)) score = 40
    else if ((p.vatNumber || '').toLowerCase().includes(q)) score = 30
    else if ((p.fiscalCode || '').toLowerCase().includes(q)) score = 25
    else if ((p.city || '').toLowerCase().includes(q)) score = 15
    else if ((p.email || '').toLowerCase().includes(q)) score = 10
    if (score > 0) {
      // prefer "cliente" type slightly
      if (p.type === 'cliente') score += 5
      matches.push({ partner: p, score })
    }
  }
  matches.sort((a, b) => b.score - a.score || a.partner.name.localeCompare(b.partner.name))
  return matches.slice(0, limit).map((m) => m.partner)
}

export function getWorkItemsForPartner(data: AppData, partnerId: string) {
  return data.workItems.filter((w) => w.customerPartnerId === partnerId)
}

export function countByType(partners: BusinessPartner[]): Record<BusinessPartnerType | 'inactive' | 'total', number> {
  const counts = { cliente: 0, fornitore: 0, personale: 0, altro: 0, inactive: 0, total: partners.length }
  for (const p of partners) {
    if (!p.active) counts.inactive++
    else counts[p.type]++
  }
  return counts
}

// === Auto-link clienti esistenti =========================================
//
// Confronta workItem.customer (testo libero) con businessPartners.name e
// propone collegamenti, senza modificare il testo originale del campo customer
// e senza toccare workItem già collegati.

/**
 * Normalizza una ragione sociale per il confronto. Operazioni:
 *  - lowercase, trim
 *  - "S.R.L." / "S R L" / "SRL" → "srl" (stessa cosa per spa, sas, snc, scarl, scrl)
 *  - rimuove punteggiatura (.,;:'"`()&)
 *  - collapse whitespace multipli
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return ''
  let s = name.trim().toLowerCase()
  // Normalizza suffissi societari italiani PRIMA di rimuovere i punti
  s = s.replace(/\bs\.?\s*r\.?\s*l\.?(?=\s|$|[,;])/g, 'srl')
  s = s.replace(/\bs\.?\s*p\.?\s*a\.?(?=\s|$|[,;])/g, 'spa')
  s = s.replace(/\bs\.?\s*a\.?\s*s\.?(?=\s|$|[,;])/g, 'sas')
  s = s.replace(/\bs\.?\s*n\.?\s*c\.?(?=\s|$|[,;])/g, 'snc')
  s = s.replace(/\bs\.?\s*c\.?\s*a\.?\s*r\.?\s*l\.?(?=\s|$|[,;])/g, 'scarl')
  s = s.replace(/\bs\.?\s*c\.?\s*r\.?\s*l\.?(?=\s|$|[,;])/g, 'scrl')
  // Forme estese
  s = s.replace(/\bsociet[àa']\s+(per\s+azioni|a\s+responsabilit[àa']\s+limitata)\b/g,
    (_, kind: string) => (kind.startsWith('per') ? 'spa' : 'srl'))
  // Rimuove punteggiatura residua
  s = s.replace(/[.,;:'"`()&]/g, ' ')
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export type LinkDecision = 'certain' | 'ambiguous' | 'not-found'

export interface LinkPlanItem {
  workItemId: string
  workItemCode: string
  workItemTitle: string
  originalCustomer: string
  normalizedCustomer: string
  decision: LinkDecision
  candidatePartnerIds: string[]
  /** Match suggerito di default (primo candidato). undefined per 'not-found'. */
  suggestedPartnerId?: string
}

export interface LinkPlan {
  totalWorkItems: number
  alreadyLinked: number
  withoutCustomer: number
  certain: LinkPlanItem[]
  ambiguous: LinkPlanItem[]
  notFound: LinkPlanItem[]
}

export interface LinkSelection {
  workItemId: string
  partnerId: string
}

export interface LinkApplyResult {
  linked: number
  skipped: number
}

/**
 * Costruisce il piano di collegamento. Salta WorkItem già con customerPartnerId
 * o senza customer. Considera solo partner attivi come candidati.
 */
export function planCustomerLinking(data: AppData): LinkPlan {
  // Indicizza partner attivi per chiave normalizzata
  const exactByKey = new Map<string, BusinessPartner[]>()
  const normalizedActive: { partner: BusinessPartner; key: string }[] = []
  for (const p of data.businessPartners) {
    if (!p.active) continue
    const key = normalizeCompanyName(p.name)
    if (!key) continue
    normalizedActive.push({ partner: p, key })
    const arr = exactByKey.get(key) ?? []
    arr.push(p)
    exactByKey.set(key, arr)
  }

  let alreadyLinked = 0
  let withoutCustomer = 0
  const certain: LinkPlanItem[] = []
  const ambiguous: LinkPlanItem[] = []
  const notFound: LinkPlanItem[] = []

  for (const w of data.workItems) {
    if (w.customerPartnerId) { alreadyLinked++; continue }
    if (!w.customer || !w.customer.trim()) { withoutCustomer++; continue }
    const key = normalizeCompanyName(w.customer)
    const base = {
      workItemId: w.id,
      workItemCode: w.code,
      workItemTitle: w.title,
      originalCustomer: w.customer,
      normalizedCustomer: key,
    }
    if (!key) {
      notFound.push({ ...base, decision: 'not-found', candidatePartnerIds: [] })
      continue
    }
    const exact = exactByKey.get(key) ?? []
    if (exact.length === 1) {
      certain.push({
        ...base,
        decision: 'certain',
        candidatePartnerIds: [exact[0].id],
        suggestedPartnerId: exact[0].id,
      })
      continue
    }
    if (exact.length > 1) {
      ambiguous.push({
        ...base,
        decision: 'ambiguous',
        candidatePartnerIds: exact.map((p) => p.id),
        suggestedPartnerId: exact[0].id,
      })
      continue
    }
    // Fuzzy: substring containment (entrambi i versi). Tipico per
    // "Iota Macchine" vs "Iota Macchine SRL", "Beta" vs "Beta Meccanica".
    const fuzzy: BusinessPartner[] = []
    for (const { partner, key: pk } of normalizedActive) {
      if (pk === key) continue // già gestito da exact
      if (pk.includes(key) || key.includes(pk)) fuzzy.push(partner)
      if (fuzzy.length >= 5) break
    }
    if (fuzzy.length === 0) {
      notFound.push({ ...base, decision: 'not-found', candidatePartnerIds: [] })
    } else {
      ambiguous.push({
        ...base,
        decision: 'ambiguous',
        candidatePartnerIds: fuzzy.map((p) => p.id),
        suggestedPartnerId: fuzzy[0].id,
      })
    }
  }

  return {
    totalWorkItems: data.workItems.length,
    alreadyLinked,
    withoutCustomer,
    certain,
    ambiguous,
    notFound,
  }
}

/**
 * Applica i collegamenti selezionati. Non modifica `customer` (testo libero),
 * imposta solo `customerPartnerId` + `customerPartnerName` su workItem ancora
 * non collegati (skip difensivo se nel frattempo un workItem ha già un link).
 */
export function applyCustomerLinking(
  data: AppData,
  selections: LinkSelection[],
): { data: AppData; result: LinkApplyResult } {
  const partnersById = new Map(data.businessPartners.map((p) => [p.id, p]))
  const selectionsById = new Map<string, LinkSelection>()
  for (const sel of selections) {
    if (!sel.partnerId || !sel.workItemId) continue
    selectionsById.set(sel.workItemId, sel)
  }
  let linked = 0
  let skipped = 0
  const nextWorkItems = data.workItems.map((w) => {
    const sel = selectionsById.get(w.id)
    if (!sel) return w
    if (w.customerPartnerId) { skipped++; return w } // già collegato — non sovrascrivere
    const partner = partnersById.get(sel.partnerId)
    if (!partner) { skipped++; return w }
    linked++
    return {
      ...w,
      customerPartnerId: partner.id,
      customerPartnerName: partner.name,
      // `customer` (testo libero) viene volutamente preservato
    }
  })
  return {
    data: { ...data, workItems: nextWorkItems },
    result: { linked, skipped },
  }
}
