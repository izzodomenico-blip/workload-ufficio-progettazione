import type {
  AppData,
  Notification,
  NotificationEntityType,
  NotificationRecipient,
  Status,
  Task,
  WorkItem,
} from '../types'
import { uid } from './format'

// === Costanti ============================================================

export const RESPONSIBLE_EMAIL = 'utm@innotecsrl.eu'
export const DEFAULT_RECIPIENT: NotificationRecipient = 'Domenico'
export const NOTIFICATIONS_LIMIT = 500

// === State helpers ========================================================

export function limitNotifications(arr: Notification[]): Notification[] {
  return arr.length > NOTIFICATIONS_LIMIT ? arr.slice(0, NOTIFICATIONS_LIMIT) : arr
}

export function appendNotification(data: AppData, n: Notification): AppData {
  const existing = Array.isArray(data.notifications) ? data.notifications : []
  return { ...data, notifications: limitNotifications([n, ...existing]) }
}

export function markNotificationAsRead(data: AppData, id: string): AppData {
  return {
    ...data,
    notifications: (data.notifications ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)),
  }
}

export function markAllNotificationsAsRead(data: AppData): AppData {
  return {
    ...data,
    notifications: (data.notifications ?? []).map((n) => ({ ...n, read: true })),
  }
}

export function clearReadNotifications(data: AppData): AppData {
  return { ...data, notifications: (data.notifications ?? []).filter((n) => !n.read) }
}

export function clearAllNotifications(data: AppData): AppData {
  return { ...data, notifications: [] }
}

export function getUnreadNotificationsCount(data: AppData): number {
  return (data.notifications ?? []).filter((n) => !n.read).length
}

// === Email building ======================================================

function fmtDateTimeForEmail(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

export interface StatusChangeEmail {
  subject: string
  body: string
}

export function buildStatusChangeEmail(input: {
  entityType: NotificationEntityType
  itemTitle: string
  beforeStatus: Status
  afterStatus: Status
  timestamp: string
}): StatusChangeEmail {
  const tipo = input.entityType === 'workItem' ? 'Lavoro' : 'Task'
  const subject = `[Aggiornamento stato] ${tipo}: ${input.itemTitle}`
  const body = [
    'Ciao Domenico,',
    '',
    "è stato rilevato un cambio stato nell'app workload ufficio tecnico.",
    '',
    `Elemento: ${input.itemTitle}`,
    `Tipo: ${tipo}`,
    `Cambio stato: ${input.beforeStatus} → ${input.afterStatus}`,
    `Data/ora: ${fmtDateTimeForEmail(input.timestamp)}`,
    '',
    "Questa email è stata preparata automaticamente dall'app, ma deve essere inviata manualmente.",
  ].join('\n')
  return { subject, body }
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
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function buildMailtoFromNotification(n: Notification): string {
  return buildMailtoUrl({ to: RESPONSIBLE_EMAIL, subject: n.emailSubject, body: n.emailBody })
}

// === Notification creation ===============================================

export function createStatusChangeNotification(input: {
  entityType: NotificationEntityType
  entityId: string
  workItemId?: string
  itemTitle: string
  beforeStatus: Status
  afterStatus: Status
  at?: Date
}): Notification {
  const timestamp = (input.at ?? new Date()).toISOString()
  const isWorkItem = input.entityType === 'workItem'
  const title = isWorkItem ? 'Cambio stato lavoro' : 'Cambio stato task'
  const message = isWorkItem
    ? `Il lavoro '${input.itemTitle}' è passato da '${input.beforeStatus}' a '${input.afterStatus}'.`
    : `Il task '${input.itemTitle}' è passato da '${input.beforeStatus}' a '${input.afterStatus}'.`
  const email = buildStatusChangeEmail({
    entityType: input.entityType,
    itemTitle: input.itemTitle,
    beforeStatus: input.beforeStatus,
    afterStatus: input.afterStatus,
    timestamp,
  })
  return {
    id: uid('n'),
    timestamp,
    type: 'status_changed',
    entityType: input.entityType,
    entityId: input.entityId,
    workItemId: input.workItemId,
    title,
    message,
    read: false,
    recipient: DEFAULT_RECIPIENT,
    emailSuggested: true,
    emailSubject: email.subject,
    emailBody: email.body,
    beforeStatus: input.beforeStatus,
    afterStatus: input.afterStatus,
  }
}

// === Future backend dispatcher ===========================================
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
//          body: JSON.stringify({ notification })
//        })
//
//   2. Registrare un dispatcher via `registerNotificationDispatcher(...)` in modo
//      che ad ogni nuova notifica venga tentato l'invio reale, mantenendo
//      sempre disponibile il fallback mailto del centro notifiche.
//
//   3. Il backend si occupa di tenere le credenziali SMTP. Mai esporle qui.

export type NotificationDispatcher = (
  notification: Notification,
) => Promise<{ ok: boolean; error?: string } | void>

const dispatchers: NotificationDispatcher[] = []

export function registerNotificationDispatcher(d: NotificationDispatcher): () => void {
  dispatchers.push(d)
  return () => {
    const i = dispatchers.indexOf(d)
    if (i >= 0) dispatchers.splice(i, 1)
  }
}

export async function dispatchNotification(n: Notification): Promise<void> {
  if (dispatchers.length === 0) return
  await Promise.all(
    dispatchers.map((d) =>
      Promise.resolve()
        .then(() => d(n))
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
 * Per ora il centro notifiche usa solo `buildMailtoFromNotification` + mailto.
 */
export async function sendEmailNotificationViaBackend(
  _notification: Notification,
): Promise<{ ok: boolean; error?: string }> {
  return {
    ok: false,
    error:
      'Backend email non configurato in questa versione locale. Usa "Prepara email" per aprire il client di posta.',
  }
}

// === Lookup helper =======================================================

/** Risolve titolo dell'elemento (workItem o task) per una notifica. */
export function resolveNotificationItem(
  n: Notification,
  data: { workItems: WorkItem[]; tasks: Task[] },
): { workItem?: WorkItem; task?: Task } {
  if (n.entityType === 'workItem') {
    return { workItem: data.workItems.find((w) => w.id === n.entityId) }
  }
  const task = data.tasks.find((t) => t.id === n.entityId)
  const workItem = task ? data.workItems.find((w) => w.id === task.workItemId) : undefined
  return { task, workItem }
}
