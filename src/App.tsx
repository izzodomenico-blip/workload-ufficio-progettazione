import { useCallback, useEffect, useState } from 'react'
import type { AppData, Filters, WorkItem } from './types'
import { EMPTY_FILTERS } from './types'
import { freshDemoData } from './data/demoData'
import { loadFromStorage, saveToStorage } from './storage/localStorage'
import { Dashboard } from './components/Dashboard'

export function App() {
  const [data, setData] = useState<AppData>(() => loadFromStorage() ?? freshDemoData())
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  useEffect(() => {
    saveToStorage(data)
  }, [data])

  const handleImport = useCallback((next: AppData) => {
    setData(next)
  }, [])

  const handleReset = useCallback(() => {
    setData(freshDemoData())
  }, [])

  const handleConvertStudio = useCallback((id: string, newCode?: string) => {
    setData((prev) => ({
      ...prev,
      workItems: prev.workItems.map<WorkItem>((w) => {
        if (w.id !== id || w.type !== 'studio') return w
        const converted: WorkItem = {
          id: w.id,
          type: 'commessa',
          code: newCode && newCode.length > 0 ? newCode : w.code,
          customer: w.customer,
          title: w.title,
          description: w.description,
          priority: w.priority,
          status: w.status,
          ownerId: w.ownerId,
          assigneeIds: w.assigneeIds,
          startDate: w.startDate,
          dueDate: w.dueDate,
          estimatedHours: w.estimatedHours,
          loggedHours: w.loggedHours,
          progressPercent: w.progressPercent,
          blockers: w.blockers,
          notes: w.notes,
        }
        return converted
      }),
    }))
  }, [])

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[color:var(--color-bg)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-5 py-3">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-100">Workload</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Ufficio Progettazione Meccanica</div>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
            <span className="hidden sm:inline">dati locali (browser) · v0.1</span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">live</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-5">
        <Dashboard
          data={data}
          filters={filters}
          onFiltersChange={setFilters}
          onImport={handleImport}
          onReset={handleReset}
          onConvertStudio={handleConvertStudio}
        />
      </main>

      <footer className="mx-auto max-w-[1600px] px-5 py-6 text-center text-[11px] text-slate-600">
        Prima versione frontend-only · dati persistiti in localStorage
      </footer>
    </div>
  )
}

function Logo() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 ring-1 ring-slate-700">
      <svg viewBox="0 0 64 64" className="h-5 w-5">
        <path d="M14 44 L24 24 L32 36 L40 20 L50 44" stroke="#38bdf8" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
