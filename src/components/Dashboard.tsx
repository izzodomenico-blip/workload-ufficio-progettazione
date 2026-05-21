import { lazy, Suspense, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Filters, WorkItem } from '../types'
import { EMPTY_FILTERS, isOpen } from '../types'
import { useData } from '../state/DataProvider'
import { HeroStats } from './HeroStats'
import { WorkloadPersonCard } from './WorkloadPersonCard'
import { FiltersBar } from './FiltersBar'
import { WorkItemsTable } from './WorkItemsTable'
import { WorkloadKanban } from './WorkloadKanban'
import { WorkItemDetailDrawer } from './WorkItemDetailDrawer'
import { ImportExportPanel } from './ImportExportPanel'

// Viste non-default caricate on-demand (code-splitting): riducono il bundle
// iniziale e vengono scaricate solo quando si apre la relativa tab.
const PlanningMatrix = lazy(() => import('./PlanningMatrix').then((m) => ({ default: m.PlanningMatrix })))
const PersonAgendaView = lazy(() => import('./PersonAgendaView').then((m) => ({ default: m.PersonAgendaView })))
const ActivityLogView = lazy(() => import('./ActivityLogView').then((m) => ({ default: m.ActivityLogView })))
const BusinessPartnersView = lazy(() => import('./BusinessPartnersView').then((m) => ({ default: m.BusinessPartnersView })))
const MachineTypesLibraryView = lazy(() => import('./MachineTypesLibraryView').then((m) => ({ default: m.MachineTypesLibraryView })))
const WorkshopLoadView = lazy(() => import('./WorkshopLoadView').then((m) => ({ default: m.WorkshopLoadView })))
const WorkshopPlanningView = lazy(() => import('./WorkshopPlanningView').then((m) => ({ default: m.WorkshopPlanningView })))
const WorkshopWorkersView = lazy(() => import('./WorkshopWorkersView').then((m) => ({ default: m.WorkshopWorkersView })))

type ViewMode = 'table' | 'kanban'
type MainTab = 'dashboard' | 'planning' | 'agenda' | 'log' | 'anagrafiche' | 'disegni' | 'officina' | 'operai' | 'officina-planning'
type TabGroup = 'ufficio' | 'tabelle' | 'officina' | 'sistema'

interface TabDef {
  id: MainTab
  label: string
  icon: string
  hint: string
  group: TabGroup
}

const TABS: TabDef[] = [
  // Ufficio tecnico
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 12h4l3-9 4 18 3-9h4', hint: 'Carico settimana e lavori aperti', group: 'ufficio' },
  { id: 'planning', label: 'Pianificazione', icon: 'M3 5h18M3 12h18M3 19h18', hint: 'Matrice carico 4–8 settimane', group: 'ufficio' },
  { id: 'agenda', label: 'Agenda persone', icon: 'M8 7V3M16 7V3M3 11h18M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z', hint: 'Vista singola persona', group: 'ufficio' },
  // Anagrafiche / tabelle
  { id: 'anagrafiche', label: 'Anagrafiche', icon: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', hint: 'Clienti, fornitori, personale', group: 'tabelle' },
  { id: 'disegni', label: 'Libreria disegni', icon: 'M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v17.5A2.5 2.5 0 0 1 17.5 22H6.5A2.5 2.5 0 0 1 4 19.5ZM8 6h8M8 10h8M8 14h5', hint: 'Registro disegni e tipologie macchina', group: 'tabelle' },
  { id: 'operai', label: 'Operai officina', icon: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21h16', hint: 'Anagrafica dipendenti officina e mansioni', group: 'tabelle' },
  // Officina
  { id: 'officina', label: 'Carico officina', icon: 'M14.7 6.3a4 4 0 0 0-5.6 5.6L3 18v3h3l6.1-6.1a4 4 0 0 0 5.6-5.6l-2.5 2.5-2.1-2.1z', hint: 'Cosa arriva in officina dopo il rilascio progettazione', group: 'officina' },
  { id: 'officina-planning', label: 'Pianificazione officina', icon: 'M4 5h16M4 12h16M4 19h16M8 3v18M16 3v18', hint: 'Assegnazioni operai e saturazione punti', group: 'officina' },
  // Sistema
  { id: 'log', label: 'Storico', icon: 'M3 3v18h18M7 13l3-3 3 3 5-5', hint: 'Cronologia modifiche', group: 'sistema' },
]

const GROUP_LABEL: Record<TabGroup, string> = {
  ufficio: 'Ufficio tecnico',
  tabelle: 'Anagrafiche e tabelle',
  officina: 'Officina',
  sistema: 'Sistema',
}

export function Dashboard() {
  const { data } = useData()
  const [tab, setTab] = useState<MainTab>('dashboard')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [view, setView] = useState<ViewMode>('table')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [agendaPersonId, setAgendaPersonId] = useState<string | null>(null)

  function jumpToAgenda(personId: string) {
    setAgendaPersonId(personId)
    setTab('agenda')
  }

  const filteredItems = useMemo<WorkItem[]>(() => {
    const q = filters.search.trim().toLowerCase()
    return data.workItems
      .filter((w) => {
        if (filters.type && w.type !== filters.type) return false
        if (filters.priority && w.priority !== filters.priority) return false
        if (filters.status && w.status !== filters.status) return false
        if (filters.customer && w.customer !== filters.customer) return false
        if (filters.technicalPhase && w.technicalPhase !== filters.technicalPhase) return false
        if (filters.commercialPriority && w.commercialPriority !== filters.commercialPriority) return false
        if (filters.personId) {
          if (w.ownerId !== filters.personId && !w.assigneeIds.includes(filters.personId)) return false
        }
        if (q) {
          const hay = `${w.code} ${w.title} ${w.customer} ${w.description} ${w.offerReference ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const ao = isOpen(a.status) ? 0 : 1
        const bo = isOpen(b.status) ? 0 : 1
        if (ao !== bo) return ao - bo
        return a.dueDate.localeCompare(b.dueDate)
      })
  }, [data.workItems, filters])

  return (
    <div className="space-y-6">
      <div className="sticky top-[var(--app-header-h)] z-20 -mx-5 border-b border-slate-800/60 bg-[color:var(--color-bg)]/85 px-5 pb-3 pt-2 backdrop-blur-xl shadow-[0_10px_24px_-18px_rgba(0,0,0,0.85)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav
            role="tablist"
            aria-label="Sezione principale"
            className="tabs-track overflow-x-auto scroll-thin"
          >
            {TABS.map((t, i) => {
              const active = tab === t.id
              const newGroup = i > 0 && TABS[i - 1].group !== t.group
              return (
                <div key={t.id} className="flex items-center">
                  {newGroup && (
                    <span
                      className="mx-1 h-5 w-px shrink-0 bg-[color:var(--color-edge-strong)]"
                      role="separator"
                      aria-label={GROUP_LABEL[t.group]}
                      title={GROUP_LABEL[t.group]}
                    />
                  )}
                  <button
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.id)}
                    title={`${GROUP_LABEL[t.group]} · ${t.hint}`}
                    className={`tab-item ${active ? 'tab-item-active' : 'hover:text-slate-200 hover:bg-slate-800/40'}`}
                  >
                    <TabIcon path={t.icon} />
                    {t.label}
                  </button>
                </div>
              )
            })}
          </nav>
          <ImportExportPanel />
        </div>
      </div>

      <Suspense fallback={<ViewLoading />}>
      {tab === 'dashboard' ? (
        <>
          <HeroStats data={data} />

          <section>
            <SectionHeader
              accent="sky"
              title="Workload per persona"
              subtitle="Carico settimana corrente · calcolato sulle ore residue"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {data.people.filter((p) => p.active).map((p) => (
                <WorkloadPersonCard
                  key={p.id}
                  person={p}
                  tasks={data.tasks}
                  workItems={data.workItems}
                  absences={data.absences}
                  onTaskClick={(workItemId) => setSelectedId(workItemId)}
                  onPersonClick={jumpToAgenda}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader
              accent="violet"
              title="Lavori"
              subtitle="Tabella e kanban filtrabili — clic su una riga per il dettaglio"
              right={
                <div className="inline-flex rounded-lg border border-slate-800 bg-[color:var(--color-surface-1)] p-0.5 text-xs">
                  <button
                    onClick={() => setView('table')}
                    aria-pressed={view === 'table'}
                    className={`rounded-md px-3 py-1.5 font-medium transition ${view === 'table' ? 'bg-slate-700/80 text-slate-100 shadow-inner' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Tabella
                  </button>
                  <button
                    onClick={() => setView('kanban')}
                    aria-pressed={view === 'kanban'}
                    className={`rounded-md px-3 py-1.5 font-medium transition ${view === 'kanban' ? 'bg-slate-700/80 text-slate-100 shadow-inner' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Kanban
                  </button>
                </div>
              }
            />
            <FiltersBar data={data} filters={filters} onChange={setFilters} />
            {view === 'table'
              ? <WorkItemsTable data={data} items={filteredItems} onSelect={setSelectedId} />
              : <WorkloadKanban data={data} items={filteredItems} onSelect={setSelectedId} />
            }
          </section>

          <WorkItemDetailDrawer
            workItemId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        </>
      ) : tab === 'planning' ? (
        <PlanningMatrix />
      ) : tab === 'agenda' ? (
        <PersonAgendaView initialPersonId={agendaPersonId} />
      ) : tab === 'anagrafiche' ? (
        <BusinessPartnersView
          onWorkItemClick={(id) => { setSelectedId(id); setTab('dashboard') }}
        />
      ) : tab === 'disegni' ? (
        <MachineTypesLibraryView />
      ) : tab === 'officina' ? (
        <WorkshopLoadView />
      ) : tab === 'operai' ? (
        <WorkshopWorkersView />
      ) : tab === 'officina-planning' ? (
        <WorkshopPlanningView />
      ) : (
        <ActivityLogView />
      )}
      </Suspense>
    </div>
  )
}

function ViewLoading() {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-400" role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" aria-hidden />
      Caricamento vista…
    </div>
  )
}

function TabIcon({ path }: { path: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  )
}

type Accent = 'sky' | 'violet' | 'emerald' | 'amber'
const ACCENT_BAR: Record<Accent, string> = {
  sky: 'bg-gradient-to-b from-sky-400 to-sky-600',
  violet: 'bg-gradient-to-b from-violet-400 to-violet-600',
  emerald: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
  amber: 'bg-gradient-to-b from-amber-400 to-amber-600',
}

function SectionHeader({
  title,
  subtitle,
  right,
  accent = 'sky',
}: { title: string; subtitle?: string; right?: ReactNode; accent?: Accent }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-7 w-1 rounded-full ${ACCENT_BAR[accent]}`} aria-hidden />
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}
