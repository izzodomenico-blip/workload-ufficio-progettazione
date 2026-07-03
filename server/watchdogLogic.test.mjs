import { describe, it, expect } from 'vitest'
import { recordResult, shouldRestart } from './watchdogLogic.js'

describe('recordResult', () => {
  it('appende e limita la finestra a threshold', () => {
    let h = []
    h = recordResult(h, false, 3) // [F]
    h = recordResult(h, false, 3) // [F,F]
    h = recordResult(h, false, 3) // [F,F,F]
    h = recordResult(h, false, 3) // [F,F,F] (scorre)
    expect(h).toEqual([false, false, false])
  })
  it('un esito healthy entra nella finestra', () => {
    let h = recordResult([false, false], true, 3)
    expect(h).toEqual([false, false, true])
  })
})

describe('shouldRestart', () => {
  it('false se meno di threshold esiti', () => {
    expect(shouldRestart([false, false], 3)).toBe(false)
  })
  it('true con threshold fallimenti consecutivi', () => {
    expect(shouldRestart([false, false, false], 3)).toBe(true)
  })
  it('false se un healthy è negli ultimi threshold', () => {
    expect(shouldRestart([false, true, false], 3)).toBe(false)
  })
  it('un recupero azzera di fatto (via recordResult+shouldRestart)', () => {
    let h = recordResult(recordResult(recordResult([], false, 3), false, 3), true, 3)
    expect(shouldRestart(h, 3)).toBe(false)
  })
})
