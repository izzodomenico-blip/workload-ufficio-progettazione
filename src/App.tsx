import { useState } from 'react'
import { DataProvider } from './state/DataProvider'
import { ToastProvider } from './state/ToastProvider'
import { Dashboard } from './components/Dashboard'
import { WorkItemFormModal } from './components/WorkItemFormModal'
import { PeopleSettingsModal } from './components/PeopleSettingsModal'
import { AbsencesCalendarModal } from './components/AbsencesCalendarModal'
import { NotificationsBell } from './components/NotificationsBell'

export function App() {
  return (
    <ToastProvider>
      <DataProvider>
        <Shell />
      </DataProvider>
    </ToastProvider>
  )
}

function Shell() {
  const [createOpen, setCreateOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [absencesOpen, setAbsencesOpen] = useState(false)

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-slate-800/70 bg-[color:var(--color-bg)]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight text-slate-100">Workload</div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
                Ufficio Progettazione Meccanica
              </div>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-lg border border-slate-800/80 bg-[color:var(--color-surface-1)]/80 px-1.5 py-1 md:flex">
              <NotificationsBell />
              <span className="h-5 w-px bg-slate-800" aria-hidden />
              <button
                onClick={() => setAbsencesOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-300 transition hover:bg-slate-800/70 hover:text-slate-100"
                title="Calendario ferie, permessi, malattie e trasferte"
              >
                <Icon path="M8 7V3M16 7V3M3 11h18M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
                Ferie e permessi
              </button>
              <button
                onClick={() => setPeopleOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-300 transition hover:bg-slate-800/70 hover:text-slate-100"
                title="Modifica persone, capacità e skill"
              >
                <Icon path="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-2.67 0-8 1.34-8 4v3h10v-3a4.7 4.7 0 0 1 2-3.74A12.7 12.7 0 0 0 8 13Zm8 0c-.29 0-.62 0-1 .05A5.65 5.65 0 0 1 18 17v3h6v-3c0-2.66-5.33-4-8-4Z" />
                Persone
              </button>
            </div>

            <div className="flex items-center gap-1.5 md:hidden">
              <NotificationsBell />
              <button
                onClick={() => setAbsencesOpen(true)}
                className="btn-ghost"
                title="Calendario ferie, permessi, malattie e trasferte"
                aria-label="Ferie e permessi"
              >
                <Icon path="M8 7V3M16 7V3M3 11h18M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
              </button>
              <button
                onClick={() => setPeopleOpen(true)}
                className="btn-ghost"
                title="Persone, capacità e skill"
                aria-label="Persone"
              >
                <Icon path="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-2.67 0-8 1.34-8 4v3h10v-3a4.7 4.7 0 0 1 2-3.74A12.7 12.7 0 0 0 8 13Zm8 0c-.29 0-.62 0-1 .05A5.65 5.65 0 0 1 18 17v3h6v-3c0-2.66-5.33-4-8-4Z" />
              </button>
            </div>

            <button
              onClick={() => setCreateOpen(true)}
              className="btn-primary"
              title="Crea un nuovo lavoro (commessa, studio o interno)"
            >
              <Icon path="M12 5v14M5 12h14" />
              Nuovo lavoro
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-6">
        <Dashboard />
      </main>

      <footer className="mx-auto max-w-[1600px] px-5 py-6 text-center text-[11px] text-slate-600">
        v1.1 · SQLite locale condiviso · backend <code className="text-slate-400">Node/Express</code>
      </footer>

      <WorkItemFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
      />
      <PeopleSettingsModal
        open={peopleOpen}
        onClose={() => setPeopleOpen(false)}
      />
      <AbsencesCalendarModal
        open={absencesOpen}
        onClose={() => setAbsencesOpen(false)}
      />
    </div>
  )
}

function Logo() {
  return (
    <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 ring-1 ring-sky-500/30 shadow-[0_4px_14px_-4px_rgba(56,189,248,0.45)]">
      <svg viewBox="0 0 64 64" className="h-5 w-5">
        <path
          d="M14 44 L24 24 L32 36 L40 20 L50 44"
          stroke="url(#logoGradient)"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="logoGradient" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" />
            <stop offset="1" stopColor="#818cf8" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

function Icon({ path }: { path: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  )
}
