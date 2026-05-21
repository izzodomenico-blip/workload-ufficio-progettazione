import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

const PROCESS_ROWS = [
  ['Laser piano', 'Taglio lamiere e particolari piani', 'Peso processo configurabile per tipologia e output'],
  ['Laser tubo', 'Taglio profili e tubolari', 'Di solito pesa di piu quando la macchina e strutturale'],
  ['Piega', 'Piegatura lamiera', 'Incide su ripari, carter, staffe e carpenterie leggere'],
  ['Saldatura', 'Carpenteria e assemblaggi saldati', 'Spesso e collo di bottiglia produttivo'],
  ['Tornitura', 'Particolari torniti', 'Da usare quando l output richiede lavorazioni meccaniche dedicate'],
  ['Fresatura', 'Particolari fresati', 'Da usare per piastre, supporti e componenti lavorati'],
  ['Montaggio', 'Assemblaggio meccanico', 'Cresce con complessivi e quantita'],
  ['Verniciatura', 'Trattamento o finitura', 'Utile per anticipare vincoli esterni o interni'],
  ['Collaudo', 'Verifica funzionale', 'Da attivare su macchine con prova finale significativa'],
]

export function CoefficientsGuideReportModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="report-print-root fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Guida coefficienti officina">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm print:hidden" onClick={onClose} aria-hidden />

      <div className="relative z-20 mx-auto flex max-w-[230mm] items-center justify-between gap-3 px-4 pt-4 print:hidden">
        <span className="hidden rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-200 ring-1 ring-inset ring-sky-500/30 sm:inline-flex">
          Guida coefficienti - pronta per stampa o PDF
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Chiudi</button>
          <button type="button" onClick={() => window.print()} className="btn-primary">
            <PrinterIcon /> Stampa / Salva PDF
          </button>
        </div>
      </div>

      <article className="report-print-area relative z-10 mx-auto my-6 max-w-[210mm] bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200 print:m-0 print:max-w-none print:shadow-none print:ring-0">
        <div className="px-9 pt-8 pb-9 print:px-0 print:pt-2 print:pb-0">
          <header className="border-b border-slate-200 pb-5 print-keep">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">workload ufficio progettazione</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Guida coefficienti officina</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Documento operativo per leggere, usare e calibrare MachineType, WorkshopOutput, impactScore, loadPoints e saturazione 0-10.
            </p>
          </header>

          <ReportSection title="1. Introduzione">
            <p>
              I coefficienti non sono ore e non sostituiscono preventivi o consuntivi. Sono indici relativi per confrontare il peso degli output,
              capire dove si formano picchi e aiutare produzione e ufficio tecnico a pianificare priorita e saturazione.
            </p>
            <p>
              Il modello parte da valori indicativi: va letto, confrontato con l esperienza reale dell officina e corretto nel tempo.
            </p>
          </ReportSection>

          <ReportSection title="2. MachineType">
            <p>
              La Libreria disegni contiene i valori default per ogni codice registro: peso base, complessita, processi tipici,
              numero indicativo di complessivi e particolari. Quando si crea un output, questi valori precompilano il lavoro ma restano modificabili.
            </p>
            <table className="mt-3 w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  <th className="border border-slate-200 px-2 py-1.5">Processo</th>
                  <th className="border border-slate-200 px-2 py-1.5">Cosa rappresenta</th>
                  <th className="border border-slate-200 px-2 py-1.5">Come tararlo</th>
                </tr>
              </thead>
              <tbody>
                {PROCESS_ROWS.map(([process, meaning, calibration]) => (
                  <tr key={process}>
                    <td className="border border-slate-200 px-2 py-1.5 font-medium text-slate-800">{process}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-slate-600">{meaning}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-slate-600">{calibration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ReportSection>

          <ReportSection title="3. WorkshopOutput">
            <p>
              L output verso officina rappresenta cosa arrivera in produzione: quantita, complessita, complessivi, particolari e processi selezionati.
              I componenti standard anticipabili hanno un impatto separato e una data propria di producibilita. I componenti commerciali sono un promemoria operativo
              per non chiudere output o commesse senza aver verificato l acquisto.
            </p>
          </ReportSection>

          <ReportSection title="4. Formula impactScore">
            <Formula>
              base = quantita x peso base tipologia
              {'\n'}impactScore = base x fattore complessita x fattore processi x fattore complessivi x fattore particolari
            </Formula>
            <p>
              impactScore e un indice relativo: due output con impatto 40 e 20 indicano che il primo pesa circa il doppio del secondo nel modello,
              non che richieda il doppio delle ore.
            </p>
          </ReportSection>

          <ReportSection title="5. Formula loadPoints">
            <p>
              loadPoints distribuisce l impactScore sui processi richiesti. Ogni assegnazione operaio riceve un carico relativo modificabile,
              utile per confrontare saturazione e disponibilita senza trasformare il modello in ore officina.
            </p>
          </ReportSection>

          <ReportSection title="6. Saturazione 0-10">
            <p>
              La scala 0-10 rende piu immediata la lettura del carico: 10 significa capacita piena, valori oltre 10 indicano sovraccarico.
              La vista puo mostrare anche percentuale e punti per mantenere il dettaglio.
            </p>
          </ReportSection>

          <ReportSection title="7. Come calibrare il modello">
            <ul className="list-disc space-y-1 pl-5">
              <li>Partire dai valori indicativi e confrontarli ogni settimana con la percezione reale dell officina.</li>
              <li>Se una tipologia risulta sempre sottostimata, aumentare defaultImpactWeight.</li>
              <li>Se una tipologia risulta sempre sovrastimata, ridurre defaultImpactWeight.</li>
              <li>Se un processo diventa collo di bottiglia, aumentare il peso percentuale del processo per quella tipologia.</li>
              <li>Se i particolari pesano troppo o troppo poco, tarare typicalPartCount e il fattore particolari.</li>
              <li>Nei primi mesi rivedere i coefficienti ogni 1-2 mesi, poi stabilizzarli.</li>
            </ul>
          </ReportSection>

          <ReportSection title="8. Esempi pratici">
            <div className="grid gap-3 md:grid-cols-3">
              <Example title="Tendostruttura" text="Alta complessita, molti complessivi e particolari, laser tubo, laser piano, saldatura e montaggio: impatto alto." />
              <Example title="Rulliera" text="Complessita media, meno complessivi, laser piano, piega, saldatura e montaggio: impatto medio." />
              <Example title="Riparo" text="Complessita bassa, pochi particolari e processi piu semplici: impatto basso o medio." />
            </div>
          </ReportSection>

          <ReportSection title="9. Avvertenze">
            <p>
              Non usare impactScore o loadPoints come preventivo ore, consuntivo o misura contabile. Il loro scopo e pianificare flusso,
              priorita, colli di bottiglia e saturazione relativa, con un modello da affinare usando dati e confronto operativo.
            </p>
          </ReportSection>
        </div>
      </article>
    </div>
  )
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="print-keep mt-6">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  )
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
      {children}
    </pre>
  )
}

function Example({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{text}</p>
    </div>
  )
}

function PrinterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" />
    </svg>
  )
}
