// Rigenera la tabella calculated_standard_components partendo dagli output gia salvati.
// Eseguire con: node server/regenerateCalculatedStandards.js
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'workload.db')

const I_TS = 'I.TS'
const I_SC = 'I.SC'

function computeDoppiaPendenzaBase(L) {
  const lunghezza = Math.max(0, Number(L) || 0)
  const colonne = Math.ceil(lunghezza / 2000) * 2
  const capriate = Math.ceil(lunghezza / 2000)
  const binarioATerra = Math.ceil(lunghezza / 1500) * 2
  return { colonne, capriate, binarioATerra }
}

function buildDoppiaPendenzaStandards(L, W, H) {
  const { colonne, capriate } = computeDoppiaPendenzaBase(L)
  const altezza = Number(H) || 0
  const specs = []
  specs.push({ code: 'STS027000', name: 'Standard STS027000', qty: 8, notes: 'Fisso, 4 colonne + 4 capriate' })
  specs.push({ code: 'STS041000', name: 'Standard STS041000', qty: 2 * colonne })
  const sts019PerColonna = altezza > 5000 ? 8 : 6
  const sts019Subtract = altezza > 5000 ? 16 : 12
  specs.push({ code: 'STS019000', name: 'Standard STS019000', qty: Math.max(0, sts019PerColonna * colonne - sts019Subtract), notes: `${sts019PerColonna} pz/colonna - ${sts019Subtract}` })
  specs.push({ code: 'STS028000', name: 'Standard STS028000', qty: Math.max(0, colonne - 4) * 2, notes: '(colonne - 4) x 2 (colonne + capriate)' })
  specs.push({ code: 'STS026000_6', name: 'Standard STS026000_6', qty: 2 * colonne })
  specs.push({ code: 'STS026000_5', name: 'Standard STS026000_5', qty: 1 * colonne })
  specs.push({ code: 'STS026000_4', name: 'Standard STS026000_4', qty: 1 * colonne })
  specs.push({ code: 'STS026000_3', name: 'Standard STS026000_3', qty: 4 * colonne })
  specs.push({ code: 'STS026000_2', name: 'Standard STS026000_2', qty: 1 * colonne })
  specs.push({ code: 'STS030000', name: 'Standard STS030000', qty: 10 * capriate, notes: '10 pz per capriata' })
  if (Number(W) / 2 > 5800) {
    specs.push({ code: 'STS003000', name: 'Standard STS003000', qty: 8 * capriate, notes: '8 pz per capriata (meta larghezza > 5800mm)' })
  }
  specs.push({ code: 'ITS002012', name: 'Standard ITS002012', qty: Math.ceil(Math.max(0, Number(L) || 0) / 1500) * 2, notes: 'CEILING(lunghezza/1500) x 2' })
  return specs.filter((s) => s.qty > 0)
}

const db = new DatabaseSync(DB_PATH)
const outputs = db.prepare(`
  SELECT id, work_item_id, machine_type_code,
    json_extract(data, '$.standardComponentsSubcategory') as sub,
    json_extract(data, '$.machineLengthMm') as L,
    json_extract(data, '$.machineWidthMm') as W,
    json_extract(data, '$.machineHeightMm') as H,
    json_extract(data, '$.standardComponentsReadyFromDate') as readyFromDate
  FROM workshop_outputs
  WHERE machine_type_code IN ('I.TS', 'I.SC')
`).all()

const insert = db.prepare(`
  INSERT INTO calculated_standard_components
    (id, workshop_output_id, work_item_id, machine_type_code, component_code, process, quantity, source, ready_from_date, data, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const deleteForOutput = db.prepare('DELETE FROM calculated_standard_components WHERE workshop_output_id = ?')

let totalInserted = 0
const now = new Date().toISOString()
for (const output of outputs) {
  if (output.sub !== 'TS_DOPPIA_PENDENZA') continue
  if (!output.L || !output.W || !output.H) continue
  deleteForOutput.run(output.id)
  const specs = buildDoppiaPendenzaStandards(output.L, output.W, output.H)
  specs.forEach((spec, index) => {
    const id = `csc_regen_${output.id.replace(/^wo_?/, '')}_${index}_${spec.code}`
    const row = {
      id,
      workshopOutputId: output.id,
      workItemId: output.work_item_id,
      machineTypeCode: output.machine_type_code,
      componentCode: spec.code,
      componentName: spec.name,
      description: '',
      quantity: spec.qty,
      process: 'saldatura',
      readyFromDate: output.readyFromDate || now.slice(0, 10),
      impactScore: 0,
      notes: spec.notes || '',
      source: 'calculated',
      createdAt: now,
      updatedAt: now,
    }
    insert.run(
      row.id,
      row.workshopOutputId,
      row.workItemId,
      row.machineTypeCode,
      row.componentCode,
      row.process,
      row.quantity,
      row.source,
      row.readyFromDate,
      JSON.stringify(row),
      now,
    )
    totalInserted++
  })
  console.log(`Output ${output.id}: ${specs.length} componenti rigenerati`)
}
console.log(`Totale componenti inseriti: ${totalInserted}`)
