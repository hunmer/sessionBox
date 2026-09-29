import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import test from 'node:test'

import { pluginLogPath, writePluginLog } from './plugin-log.ts'

test('plugin logs are isolated, timestamped, and redact common credentials', () => {
  const root = mkdtempSync(join(tmpdir(), 'sessionbox-plugin-log-'))
  try {
    writePluginLog(root, 'plugin.a', 'INFO', 'started %s', 'Bearer abcdefgh12345678')
    writePluginLog(root, 'plugin.b', 'ERROR', 'failed')

    const a = readFileSync(pluginLogPath(root, 'plugin.a'), 'utf8')
    const b = readFileSync(pluginLogPath(root, 'plugin.b'), 'utf8')
    assert.match(a, /^\d{4}-\d{2}-\d{2}T.* \[INFO\] started Bearer \*\*\*/)
    assert.doesNotMatch(a, /abcdefgh12345678|failed/)
    assert.match(b, /\[ERROR\] failed/)
    assert.doesNotMatch(b, /started/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('untrusted plugin IDs cannot escape the log directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'sessionbox-plugin-log-'))
  try {
    const path = pluginLogPath(root, '../../outside')
    assert.equal(relative(join(root, 'logs', 'plugins'), path).startsWith('..'), false)
    writePluginLog(root, '../../outside', 'WARN', 'safe')
    assert.match(readFileSync(path, 'utf8'), /safe/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
