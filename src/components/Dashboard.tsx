import { useMemo, useState } from 'react'
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
import { PlanningMatrix } from './PlanningMatrix'
import { PersonAgendaView } from './PersonAgendaView'
import { ActivityLogView } from './ActivityLogView'

type ViewMode = 'table' | 'kanban'
type MainTab = 'dashboard' | 'planning' | 'agenda' | 'log'

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
        if (filters.personId) {
          if (w.ownerId !== filters.personId && !w.assigneeIds.includes(filters.personId)) return false
        }
        if (q) {
          const hay = `${w.code} ${w.title} ${w.customer} ${w.description}`.toLowerCase()
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Sezione principale"
          className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-sm"
        >
          <button
            role="tab"
            aria-selected={tab === 'dashboard'}
            onClick={() => setTab('dashboard')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${tab === 'dashboard' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Dashboard
          </button>
          <button
            role="tab"
            aria-selected={tab === 'planning'}
            onClick={() => setTab('planning')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${tab === 'planning' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Pianificazione
          </button>
          <button
            role="tab"
            aria-selected={tab === 'agenda'}
            onClick={() => setTab('agenda')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${tab === 'agenda' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Agenda persone
          </button>
          <button
            role="tab"
            aria-selected={tab === 'log'}
            onClick={() => setTab('log')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${tab === 'log' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Storico
          </button>
        </div>
        <ImportExportPanel />
      </div>

      {tab === 'dashboard' ? (
        <>
          <HeroStats data={data} />

          <section>
            <SectionHeader
              title="Workload per persona"
              subtitle="Carico settimana corrente, capacità e principali task"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {data.people.filter((p) => p.active).map((p) => (
                <WorkloadPersonCard
                  key={p.id}
                  person={p}
                  tasks={data.tasks}
                  absences={data.absences}
                  onTaskClick={(workItemId) => setSelectedId(workItemId)}
                  onPersonClick={jumpToAgenda}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Lavori"
              subtitle="Tabella e Kanban filtrabili"
              right={
                <div className="inline-flex rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs">
                  <button
                    onClick={() => setView('table')}
                    className={`rounded px-2.5 py-1 transition ${view === 'table' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                  >Tabella</button>
                  <button
                    onClick={() => setView('kanban')}
                    className={`rounded px-2.5 py-1 transition ${view === 'kanban' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                  >Kanban</button>
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
      ) : (
        <ActivityLogView />
      )}
    </div>
  )
}

function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}
