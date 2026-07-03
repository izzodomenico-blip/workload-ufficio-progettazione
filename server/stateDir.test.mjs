import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { resolveStateDir, STATE_DIR, ROOT_DIR } from './db.js'
import { BACKUPS_DIR } from './backupService.js'
import { VERIFIED_DIR, OFFSITE_RECEIPT_PATH } from './verifiedBackup.js'

describe('resolveStateDir', () => {
  it('default rootDir senza env', () => {
    expect(resolveStateDir({}, '/root')).toBe('/root')
  })
  it('usa WORKLOAD_STATE_DIR risolto in assoluto', () => {
    expect(resolveStateDir({ WORKLOAD_STATE_DIR: 'some/dir' }, '/root')).toBe(path.resolve('some/dir'))
  })
})

describe('path di stato derivati da STATE_DIR (default = ROOT_DIR nei test)', () => {
  it('STATE_DIR default = ROOT_DIR', () => { expect(STATE_DIR).toBe(ROOT_DIR) })
  it('BACKUPS_DIR = STATE_DIR/backups', () => { expect(BACKUPS_DIR).toBe(path.join(STATE_DIR, 'backups')) })
  it('VERIFIED_DIR = STATE_DIR/backups/verified', () => { expect(VERIFIED_DIR).toBe(path.join(STATE_DIR, 'backups', 'verified')) })
  it('OFFSITE_RECEIPT_PATH = STATE_DIR/backups/offsite-status.json', () => {
    expect(OFFSITE_RECEIPT_PATH).toBe(path.join(STATE_DIR, 'backups', 'offsite-status.json'))
  })
})
