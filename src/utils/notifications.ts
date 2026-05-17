import type {
  AppData,
  NotificationEntry,
  Person,
  Task,
  WorkItem,
} from '../types'
import { uid } from './format'

export const RESPONSIBLE_EMAIL = 'utm@innotecsrl.eu'
export const NOTIFICATIONS_LIMIT = 200

export interface NotificationContext {
  workItem?: WorkItem
  task?: Task
  person?: Person
}

export function createNotification(
  input: Omit<NotificationEntry, 'id' | 'timestamp' | 'read'>,
  at: Date = new Date(),
): NotificationEntry {
  return {
    id: uid('n'),
    timestamp: at.toISOString(),
    read: false,
    ...input,
  }
}

export function appendNotification(data: AppData, n: NotificationEntry): AppData {
  const existing = Array.isArray(data.notifications) ? data.notifications : []
  const next = [n, ...existing]
  if (next.length > NOTIFICATIONS_LIMIT) next.length = NOTIFICATIONS_LIMIT
  return { ...data, notifications: next }
}

export function markNotificationRead(data: AppData, id: string): AppData {
  return {
    ...data,
    notifications: (data.notifications ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)),
  }
}

export function markAllNotificationsRead(data: AppData): AppData {
  return {
    ...data,
    notifications: (data.notifications ?? []).map((n) => ({ ...n, read: true })),
  }
}

export function clearAllNotifications(data: AppData): AppData {
  return { ...data, notifications: [] }
}

export function unreadCount(data: AppData): number {
  return (data.notifications ?? []).filter((n) => !n.read).length
}

// === Email preparation ====================================================

export interface EmailDraft {
  to: string
  subject: string
  body: string
  mailto: string
}

function encodeMailtoComponent(s: string): string {
  // encodeURIComponent + RFC 6068 tweaks for `?` and `&` in body
  return encodeURIComponent(s)
}

export function buildMailtoUrl({
  to,
  subject,
  body,
}: {
  to: string
  subject: string
  body: string
}): string {
  return `mailto:${encodeMailtoComponent(to)}?subject=${encodeMailtoComponent(subject)}&body=${encodeMailtoComponent(body)}`
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Costruisce una bozza email a partire da una notifica.
 * Sincrono, basato su `mailto:` — non invia nulla davvero, prepara solo il messaggio.
 *
 * In futuro questa funzione può essere AFFIANCATA (non rimossa) da
 * `sendEmailNotificationViaBackend(...)` per invio reale via backend.
 */
export function prepareEmailNotification(
  n: NotificationEntry,
  ctx: NotificationContext = {},
): EmailDraft {
  const wi = ctx.workItem
  const task = ctx.task
  const isWorkItem = n.kind === 'workitem_status'

  const codePart = wi?.code ? `${wi.code} · ` : ''
  const subject = isWorkItem
    ? `[Workload] ${codePart}${wi?.title ?? n.title} — stato: ${n.afterStatus ?? '—'}`
    : `[Workload] Task "${task?.title ?? n.title}" — stato: ${n.afterStatus ?? '—'}`

  const lines: string[] = []
  lines.push('Notifica generata localmente da Workload — Ufficio Progettazione Meccanica.')
  lines.push('')
  lines.push(`Evento: ${n.title}`)
  lines.push(`Data: ${fmtDateTime(n.timestamp)}`)
  lines.push('')

  if (wi) {
    lines.push('— Lavoro —')
    lines.push(`Codice: ${wi.code || '—'}`)
    lines.push(`Titolo: ${wi.title}`)
    if (wi.customer) lines.push(`Cliente: ${wi.customer}`)
    lines.push(`Tipo: ${wi.type}`)
    if (wi.technicalPhase) lines.push(`Fase tecnica: ${wi.technicalPhase}`)
    lines.push(`Scadenza: ${wi.dueDate}`)
    if (wi.plannedProductionReleaseDate) {
      lines.push(`Rilascio produzione previsto: ${wi.plannedProductionReleaseDate}`)
    }
    if (wi.actualProductionReleaseDate) {
      lines.push(`Rilascio produzione effettivo: ${wi.actualProductionReleaseDate}`)
    }
    if (wi.offerReference) lines.push(`Riferimento offerta: ${wi.offerReference}`)
    lines.push('')
  }

  if (task) {
    lines.push('— Task —')
    lines.push(`Titolo: ${task.title}`)
    if (wi) lines.push(`Sul lavoro: ${wi.code || wi.title}`)
    if (ctx.person) lines.push(`Assegnato a: ${ctx.person.name}`)
    lines.push(`Periodo: ${task.startDate} → ${task.dueDate}`)
    lines.push(`Avanzamento: ${task.progressPercent}%`)
    lines.push('')
  }

  if (n.beforeStatus && n.afterStatus) {
    lines.push(`Cambio stato: ${n.beforeStatus} → ${n.afterStatus}`)
  } else if (n.afterStatus) {
    lines.push(`Nuovo stato: ${n.afterStatus}`)
  }

  if (n.message) {
    lines.push('')
    lines.push(n.message)
  }

  lines.push('')
  lines.push('—')
  lines.push('Nota: questa email è stata composta dall\'app Workload (versione locale).')
  lines.push('L\'invio è manuale — confermalo dal tuo client email.')

  const body = lines.join('\n')

  return {
    to: RESPONSIBLE_EMAIL,
    subject,
    body,
    mailto: buildMailtoUrl({ to: RESPONSIBLE_EMAIL, subject, body }),
  }
}

// === Future-proof backend dispatcher =======================================
//
// In questa versione frontend-only NON inviamo email reali — le credenziali
// SMTP Aruba non devono mai vivere nel browser.
//
// Quando in futuro sarà disponibile un backend locale o un servizio dedicato:
//
//   1. Implementare sendEmailNotificationViaBackend (sostituire lo stub sotto)
//      con una chiamata POST verso il backend, es:
//        fetch('/api/notifications/email', {
//          method: 'POST',
//          headers: { 'content-type': 'application/json' },
//          body: JSON.stringify({ notification, draft: prepareEmailNotification(...) })
//        })
//
//   2. Registrare un dispatcher via `registerNotificationDispatcher(...)` in modo
//      che ad ogni nuova notifica venga tentato l'invio reale, mantenendo
//      sempre disponibile il fallback mailto del centro notifiche.
//
//   3. Il backend si occupa di tenere le credenziali SMTP. Mai esporle qui.

export type NotificationDispatcher = (
  notification: NotificationEntry,
  ctx?: NotificationContext,
) => Promise<{ ok: boolean; error?: string } | void>

const dispatchers: NotificationDispatcher[] = []

export function registerNotificationDispatcher(d: NotificationDispatcher): () => void {
  dispatchers.push(d)
  return () => {
    const i = dispatchers.indexOf(d)
    if (i >= 0) dispatchers.splice(i, 1)
  }
}

export async function dispatchNotification(
  n: NotificationEntry,
  ctx?: NotificationContext,
): Promise<void> {
  if (dispatchers.length === 0) return
  await Promise.all(
    dispatchers.map((d) =>
      Promise.resolve()
        .then(() => d(n, ctx))
        .catch(() => undefined),
    ),
  )
}

/**
 * STUB — non invia nulla finché un backend non è disponibile.
 *
 * In futuro: sostituire con una vera chiamata fetch verso un endpoint backend
 * che gestirà le credenziali SMTP (es. Aruba) lato server.
 *
 * Per ora il centro notifiche usa solo `prepareEmailNotification` + mailto.
 */
export async function sendEmailNotificationViaBackend(
  _notification: NotificationEntry,
  _ctx?: NotificationContext,
): Promise<{ ok: boolean; error?: string }> {
  return {
    ok: false,
    error:
      'Backend email non configurato in questa versione locale. Usa "Prepara email" per aprire il client di posta.',
  }
}
