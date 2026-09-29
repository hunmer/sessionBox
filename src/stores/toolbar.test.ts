import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeToolbarConfig, TOOLBAR_ITEMS } from './toolbar.ts'

test('null or corrupted input falls back to defaults (all visible, default order)', () => {
  for (const input of [null, undefined, 42, 'x', [], [{ id: 1 }, null, { visible: true }]]) {
    const merged = mergeToolbarConfig(input)
    assert.equal(merged.length, TOOLBAR_ITEMS.length)
    assert.deepEqual(
      merged.map((e) => e.id),
      TOOLBAR_ITEMS.map((d) => d.id),
    )
    assert.ok(merged.every((e) => e.visible === true))
  }
})

test('custom order is preserved and visibility respected', () => {
  const merged = mergeToolbarConfig([
    { id: 'chat', visible: true },
    { id: 'bookmark', visible: false },
    { id: 'history' },
  ])
  assert.deepEqual(
    merged.map((e) => e.id),
    ['chat', 'bookmark', 'history', ...TOOLBAR_ITEMS.map((d) => d.id).filter((id) => !['chat', 'bookmark', 'history'].includes(id))],
  )
  assert.equal(merged[0].visible, true)
  assert.equal(merged[1].visible, false)
  assert.equal(merged[2].visible, true)
})

test('unknown ids are dropped and duplicates removed', () => {
  const merged = mergeToolbarConfig([
    { id: 'gone', visible: true },
    { id: 'plugin' },
    { id: 'plugin', visible: false },
  ])
  assert.equal(merged.filter((e) => e.id === 'plugin').length, 1)
  assert.ok(!merged.some((e) => e.id === 'gone'))
  assert.equal(merged.length, TOOLBAR_ITEMS.length)
})
