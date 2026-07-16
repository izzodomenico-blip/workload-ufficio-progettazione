import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const PORT = 3975
const BASE = `http://127.0.0.1:${PORT}/api`
const CONS_PW = 'TestCons1'
let child
let dir
let adminCookie

function cookieOf(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const m = /flowrlink_session=([^;]+)/.exec(c)
    if (m) return `flowrlink_session=${m[1]}`
  }
  return null
}
async function req(method, url, { cookie, body, pw } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(pw ? { 'x-workload-admin-password': pw } : {}),
      'x-workload-mutation-kind': 'normal',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* vuoto */ }
  return { status: res.status, json }
}

const CONS = (id, commessa, extra = {}) => ({
  id, commessaNumber: commessa, supplierName: 'Forn', date: '2026-07-01', operatorName: 'Op',
  laserRows: [{ id: `${id}l`, lunghezzaMm: 1000, larghezzaMm: 500, spessoreMm: 3, materiale: 'ferro', nPezzi: 2, tempoMin: 10, gas: 'ossigeno' }],
  tubeRows: [], weldingRows: [], bendingRows: [], notes: '', ...extra,
})

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'closures-'))
  child = spawn('node', ['server/index.js'], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env, PORT: String(PORT), HOST: '127.0.0.1',
      WORKLOAD_DATA_DIR: dir, WORKLOAD_DB_PATH: path.join(dir, 'w.db'), WORKLOAD_STATE_DIR: dir,
      WORKLOAD_DISABLE_IPV6_LOCALHOST: '1', WORKLOAD_SKIP_AUTO_SEED: '1',
    },
  })
  // attesa server pronto
  let ready = false
  for (let i = 0; i < 100 && !ready; i++) {
    try { const r = await fetch(BASE + '/auth/setup-status'); if (r.ok) ready = true } catch { /* retry */ }
    if (!ready) await new Promise((r) => setTimeout(r, 200))
  }
  expect(ready).toBe(true)
  // admin + password consuntivi + dati
  const setup = await fetch(BASE + '/auth/setup-admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Password1' }) })
  adminCookie = cookieOf(setup)
  expect(adminCookie).toBeTruthy()
  const setPw = await req('POST', '/consuntivi-auth/set-password', { cookie: adminCookie, body: { newPassword: CONS_PW } })
  expect(setPw.status).toBe(200)
  const tree = (await req('GET', '/app-data', { cookie: adminCookie })).json
  const put = await req('PUT', '/app-data', { cookie: adminCookie, body: { ...tree, consuntivi: [CONS('c1', 'COM9'), CONS('c2', 'COM9', { date: '2026-07-05' }), CONS('c3', 'ALTRA')] } })
  expect(put.status).toBe(200)
}, 60_000)

afterAll(() => {
  try { child?.kill() } catch { /* gia' morto */ }
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
})

describe('POST/DELETE /consuntivi-closures', () => {
  let closureId
  it('password errata -> 403', async () => {
    const r = await req('POST', '/consuntivi-closures', { cookie: adminCookie, pw: 'sbagliata', body: { commessaKey: 'COM9' } })
    expect(r.status).toBe(403)
  })
  it('chiusura ok -> 201 con snapshot corretto (2 consuntivi COM9)', async () => {
    const r = await req('POST', '/consuntivi-closures', { cookie: adminCookie, pw: CONS_PW, body: { commessaKey: 'COM9' } })
    expect(r.status).toBe(201)
    expect(r.json.commessaKey).toBe('COM9')
    expect(r.json.consuntiviCount).toBe(2)
    expect(r.json.firstDate).toBe('2026-07-01')
    expect(r.json.lastDate).toBe('2026-07-05')
    expect(r.json.closedByUsername).toBe('admin')
    // per consuntivo: kg 23.55, mat 30.615, gas 25 -> tot 55.615 ; x2 = 111.23
    expect(r.json.snapshot.total).toBeCloseTo(111.23, 2)
    expect(r.json.snapshot.totalKg).toBeCloseTo(47.1, 2)
    expect(r.json.snapshot.kgByMaterial.ferro).toBeCloseTo(47.1, 2)
    closureId = r.json.id
  })
  it('doppia chiusura -> 409', async () => {
    const r = await req('POST', '/consuntivi-closures', { cookie: adminCookie, pw: CONS_PW, body: { commessaKey: 'COM9' } })
    expect(r.status).toBe(409)
  })
  it('commessa inesistente -> 404', async () => {
    const r = await req('POST', '/consuntivi-closures', { cookie: adminCookie, pw: CONS_PW, body: { commessaKey: 'NOPE' } })
    expect(r.status).toBe(404)
  })
  it('GET /app-data include la chiusura', async () => {
    const r = await req('GET', '/app-data', { cookie: adminCookie })
    expect(r.json.consuntiviClosures).toHaveLength(1)
    expect(r.json.consuntiviClosures[0].snapshot.total).toBeCloseTo(111.23, 2)
  })
  it('riapertura id inesistente -> 404', async () => {
    const r = await req('DELETE', '/consuntivi-closures/nope', { cookie: adminCookie, pw: CONS_PW })
    expect(r.status).toBe(404)
  })
  it('riapertura ok -> chiusura rimossa', async () => {
    const r = await req('DELETE', `/consuntivi-closures/${closureId}`, { cookie: adminCookie, pw: CONS_PW })
    expect(r.status).toBe(200)
    const g = await req('GET', '/app-data', { cookie: adminCookie })
    expect(g.json.consuntiviClosures).toHaveLength(0)
  })
})
