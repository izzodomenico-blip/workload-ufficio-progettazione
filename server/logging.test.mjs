import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appendLine, rotateIfNeeded } from './logging.js'

let dir
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('appendLine', () => {
  it('crea la cartella mancante e scrive una riga con newline', () => {
    const f = path.join(dir, 'sub', 'a.log')
    appendLine(f, 'ciao')
    expect(fs.readFileSync(f, 'utf8')).toBe('ciao\n')
  })
  it('non duplica il newline se già presente e appende in coda', () => {
    const f = path.join(dir, 'a.log')
    appendLine(f, 'uno\n')
    appendLine(f, 'due')
    expect(fs.readFileSync(f, 'utf8')).toBe('uno\ndue\n')
  })
})

describe('rotateIfNeeded', () => {
  it('no-op se il file non esiste', () => {
    expect(() => rotateIfNeeded(path.join(dir, 'nope.log'), 10)).not.toThrow()
  })
  it('taglia alle ultime maxLines righe', () => {
    const f = path.join(dir, 'a.log')
    for (let i = 1; i <= 5; i++) appendLine(f, `r${i}`)
    rotateIfNeeded(f, 2)
    expect(fs.readFileSync(f, 'utf8')).toBe('r4\nr5\n')
  })
  it('no-op se entro il limite', () => {
    const f = path.join(dir, 'a.log')
    appendLine(f, 'r1'); appendLine(f, 'r2')
    rotateIfNeeded(f, 5)
    expect(fs.readFileSync(f, 'utf8')).toBe('r1\nr2\n')
  })
})
