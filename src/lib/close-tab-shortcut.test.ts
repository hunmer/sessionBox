import assert from 'node:assert/strict'
import test from 'node:test'
import { createCloseTabShortcutHandler } from './close-tab-shortcut.ts'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

test('连续关闭在删除和下一标签激活完成前不关闭窗口', async () => {
  const activation = deferred()
  let activeTab: { id: string } | null = { id: 'first' }
  let tabCount = 2
  let closedTabs = 0
  let closedWindows = 0
  const close = createCloseTabShortcutHandler({
    getActiveTab: () => activeTab,
    getTabCount: () => tabCount,
    isClosing: () => false,
    closeTab: async () => {
      closedTabs++
      activeTab = null
      tabCount = 0
      await activation.promise
      tabCount = 1
      activeTab = { id: 'next' }
    },
    closeWindow: () => { closedWindows++ }
  })
  const first = close()
  await close()
  assert.equal(closedTabs, 1)
  assert.equal(closedWindows, 0)
  activation.resolve()
  await first
  await close()
  assert.equal(closedTabs, 2)
  assert.equal(closedWindows, 0)
})

test('没有激活标签但还有标签或关闭动画时保留窗口', async () => {
  let count = 1
  let closing = false
  let closed = 0
  const close = createCloseTabShortcutHandler({
    getActiveTab: () => null,
    getTabCount: () => count,
    isClosing: () => closing,
    closeTab: async () => {},
    closeWindow: () => { closed++ }
  })
  await close()
  count = 0
  closing = true
  await close()
  assert.equal(closed, 0)
  closing = false
  await close()
  assert.equal(closed, 1)
})

test('关闭失败后释放保护，允许重试', async () => {
  let attempts = 0
  const close = createCloseTabShortcutHandler({
    getActiveTab: () => ({ id: 'tab' }),
    getTabCount: () => 1,
    isClosing: () => false,
    closeTab: async () => { if (++attempts === 1) throw new Error('关闭失败') },
    closeWindow: () => assert.fail('不应关闭窗口')
  })
  await assert.rejects(close(), /关闭失败/)
  await close()
  assert.equal(attempts, 2)
})
