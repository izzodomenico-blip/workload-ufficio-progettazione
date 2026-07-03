import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { formatCrash, installProcessGuards } from './hardening.js'

describe('formatCrash', () => {
  it('include timestamp, tipo e stack', () => {
    const err = new Error('boom')
    const line = formatCrash('uncaughtException', err, '2026-07-03T10:00:00.000Z')
    expect(line).toContain('2026-07-03T10:00:00.000Z')
    expect(line).toContain('[uncaughtException]')
    expect(line).toContain('boom')
  })
  it('gestisce valori non-Error', () => {
    const line = formatCrash('unhandledRejection', 'stringa', '2026-07-03T10:00:00.000Z')
    expect(line).toContain('stringa')
  })
})

describe('installProcessGuards', () => {
  it('invoca onFatal su uncaughtException con tipo ed errore', () => {
    const proc = new EventEmitter()
    const onFatal = vi.fn()
    installProcessGuards(proc, { onFatal })
    const err = new Error('x')
    proc.emit('uncaughtException', err)
    expect(onFatal).toHaveBeenCalledWith('uncaughtException', err)
  })
  it('invoca onFatal su unhandledRejection', () => {
    const proc = new EventEmitter()
    const onFatal = vi.fn()
    installProcessGuards(proc, { onFatal })
    proc.emit('unhandledRejection', 'motivo')
    expect(onFatal).toHaveBeenCalledWith('unhandledRejection', 'motivo')
  })
})
