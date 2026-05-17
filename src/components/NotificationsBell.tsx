import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../state/DataProvider'
import { useToast } from '../state/ToastProvider'
import type { Notification, Status } from '../types'
import {
  buildMailtoFromNotification,
  DEFAULT_RECIPIENT,
  getUnreadNotificationsCount,
  RESPONSIBLE_EMAIL,
} from '../utils/notifications'

export function NotificationsBell() {
  const { data, markAllNotificationsAsRead, clearReadNotifications, clearAllNotifications } = useData()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Mostra solo notifiche per Domenico (in attesa di multi-recipient).
  const myNotifications = useMemo(
    () => (data.notifications ?? []).filter((n) => n.recipient === DEFAULT_RECIPIENT),
    [data.notifications],
  )
  const unread = getUnreadNotificationsCount({ ...data, notifications: myNotifications })

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
        title={
          unread > 0
            ? `${unread} notifich${unread === 1 ? 'a' : 'e'} non lett${unread === 1 ? 'a' : 'e'}`
            : 'Notifiche'
        }
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
                {myNotifications.length === 0
                  ? 'Nessuna notifica.'
                  : `${myNotifications.length} total${myNotifications.length === 1 ? 'e' : 'i'} · ${unread} non lett${unread === 1 ? 'a' : 'e'}`}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAllNotificationsAsRead}
                  className="rounded px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                  title="Segna tutte come lette"
                >
                  ✓ tutte
                </button>
              )}
              {myNotifications.some((n) => n.read) && (
                <button
                  onClick={clearReadNotifications}
                  className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  title="Rimuovi quelle già lette"
                >
                  rimuovi lette
                </button>
              )}
              {myNotifications.length > 0 && (
                <button
                  onClick={clearAllNotifications}
                  className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-red-500/10 hover:text-red-300"
                  title="Svuota tutte le notifiche"
                >
                  svuota
                </button>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto scroll-thin">
            {myNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-slate-500">
                Nessuna notifica.
                <div className="mt-1 text-[11px] text-slate-600">
                  Compariranno qui quando cambierà lo stato di un lavoro o di un task.
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800/60">
                {myNotifications.map((n) => (
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
              Destinatario: <span className="font-mono text-slate-300">{RESPONSIBLE_EMAIL}</span>
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
  notification: Notification
  onAfterAction: () => void
}) {
  const { markNotificationAsRead } = useData()
  const toast = useToast()

  const time = useMemo(() => fmtTime(notification.timestamp), [notification.timestamp])

  function handlePrepareEmail() {
    const mailto = buildMailtoFromNotification(notification)
    try {
      window.location.href = mailto
      toast.success('Bozza email aperta nel client di posta (invio manuale).')
    } catch {
      toast.error('Impossibile aprire il client email. Copia oggetto/corpo manualmente.')
    }
    if (!notification.read) markNotificationAsRead(notification.id)
  }

  function handleMarkRead() {
    if (!notification.read) markNotificationAsRead(notification.id)
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
          title={notification.read ? 'Letta' : 'Non letta'}
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
                Segna come letto
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
