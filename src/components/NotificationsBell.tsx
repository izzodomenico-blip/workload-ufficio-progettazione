import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import type { NotificationEntry, Status } from '../types'
import {
  prepareEmailNotification,
  RESPONSIBLE_EMAIL,
  unreadCount,
} from '../utils/notifications'

export function NotificationsBell() {
  const { data, markAllNotificationsRead, clearAllNotifications } = useData()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const notifications = data.notifications ?? []
  const unread = unreadCount(data)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center justify-center rounded-md border border-slate-700 px-2.5 py-1.5 text-slate-200 transition hover:bg-slate-800"
        title={unread > 0 ? `${unread} notifich${unread === 1 ? 'a' : 'e'} non lett${unread === 1 ? 'a' : 'e'}` : 'Notifiche'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notifiche${unread > 0 ? `, ${unread} non lette` : ''}`}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[color:var(--color-bg)]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Centro notifiche"
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[80vh] w-[380px] flex-col overflow-hidden rounded-lg border border-slate-700 bg-[color:var(--color-panel)] shadow-2xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Notifiche</div>
              <div className="text-[11px] text-slate-500">
                {notifications.length === 0
                  ? 'Nessuna notifica'
                  : `${notifications.length} total${notifications.length === 1 ? 'e' : 'i'} · ${unread} non lett${unread === 1 ? 'a' : 'e'}`}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAllNotificationsRead}
                  className="rounded px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                  title="Segna tutte come lette"
                >
                  ✓ tutte
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAllNotifications}
                  className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-red-500/10 hover:text-red-300"
                  title="Svuota notifiche"
                >
                  svuota
                </button>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto scroll-thin">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-slate-500">
                Le notifiche compariranno qui quando cambierà lo stato di un lavoro o di un task.
              </div>
            ) : (
              <ul className="divide-y divide-slate-800/60">
                {notifications.map((n) => (
                  <NotificationRow key={n.id} notification={n} onAfterAction={() => setOpen(false)} />
                ))}
              </ul>
            )}
          </div>

          <footer className="border-t border-slate-800 bg-slate-900/50 px-4 py-2.5">
            <p className="text-[10px] leading-snug text-slate-500">
              <span className="font-semibold text-slate-400">Versione locale:</span> le notifiche sono interne all'app.
              L'invio email automatico richiederà un backend locale o un servizio dedicato.{' '}
              <span className="text-amber-300/80">Non inserire credenziali email nel frontend.</span>
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              Destinatario predefinito: <span className="font-mono text-slate-300">{RESPONSIBLE_EMAIL}</span>
            </p>
          </footer>
        </div>
      )}
    </div>
  )
}

// ===== Notification row =====

function NotificationRow({
  notification,
  onAfterAction,
}: {
  notification: NotificationEntry
  onAfterAction: () => void
}) {
  const { data, markNotificationRead } = useData()
  const toast = useToast()

  const workItem = notification.workItemId
    ? data.workItems.find((w) => w.id === notification.workItemId)
    : undefined
  const task = notification.kind === 'task_status'
    ? data.tasks.find((t) => t.id === notification.entityId)
    : undefined
  const person = task ? data.people.find((p) => p.id === task.assigneeId) : undefined

  const time = useMemo(() => fmtTime(notification.timestamp), [notification.timestamp])

  function handlePrepareEmail() {
    const draft = prepareEmailNotification(notification, { workItem, task, person })
    try {
      window.location.href = draft.mailto
      toast.success('Bozza email aperta nel client di posta.')
    } catch {
      toast.error('Impossibile aprire il client email. Copia oggetto/corpo manualmente.')
    }
    if (!notification.read) markNotificationRead(notification.id)
  }

  function handleMarkRead() {
    if (!notification.read) markNotificationRead(notification.id)
  }

  return (
    <li
      className={`px-4 py-3 transition ${notification.read ? '' : 'bg-sky-500/5'}`}
      onClick={handleMarkRead}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            notification.read ? 'bg-slate-700' : 'bg-sky-400'
          }`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0 text-sm font-medium text-slate-100 truncate">{notification.title}</div>
            <div className="shrink-0 text-[10px] tabular-nums text-slate-500">{time}</div>
          </div>
          {notification.beforeStatus && notification.afterStatus && (
            <StatusChangePill before={notification.beforeStatus} after={notification.afterStatus} />
          )}
          {notification.message && (
            <p className="mt-1 text-[11px] text-slate-400">{notification.message}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handlePrepareEmail()
                onAfterAction()
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-200 transition hover:bg-sky-500/20"
              title={`Prepara email per ${RESPONSIBLE_EMAIL}`}
            >
              <MailIcon /> Prepara email
            </button>
            {!notification.read && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleMarkRead()
                }}
                className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                Segna come letta
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

// ===== Bits =====

function StatusChangePill({ before, after }: { before: Status; after: Status }) {
  return (
    <div className="mt-1 inline-flex items-center gap-1.5 text-[10px]">
      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">{before}</span>
      <span className="text-slate-500">→</span>
      <span className="rounded bg-slate-700 px-1.5 py-0.5 font-semibold text-slate-100">{after}</span>
    </div>
  )
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay) return `oggi ${hhmm}`
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm} ${hhmm}`
}

function BellIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}
