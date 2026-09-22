import assert from 'node:assert/strict'
import test from 'node:test'

import { parseWindowsProcessIds, windowsProcessTreeKillArgs } from './external-auth-process.ts'
import { isGoogleLoginHost } from './external-auth-domains.ts'

test('Windows terminates the complete dedicated browser process tree', () => {
  assert.deepEqual(windowsProcessTreeKillArgs(4321), ['/PID', '4321', '/T', '/F'])
})

test('Windows profile process query ignores invalid and duplicate process ids', () => {
  assert.deepEqual(parseWindowsProcessIds('4321\r\ninvalid\r\n4322\r\n4321\r\n'), [4321, 4322])
})

test('Gemini is a target site, not a Google login host', () => {
  assert.equal(isGoogleLoginHost('accounts.google.com'), true)
  assert.equal(isGoogleLoginHost('gemini.google.com'), false)
})
