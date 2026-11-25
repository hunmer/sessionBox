import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import * as vue from 'vue'

const require = createRequire(import.meta.url)

// 执行真实组合函数，仅替换生命周期与浏览器调度；不依赖额外 DOM 测试库。
function createHarness() {
  const mounted = []
  const unmounted = []
  const frames = new Map()
  let frameId = 0
  let resize
  let disconnected = false
  const window = {
    setTimeout: () => 1,
    clearTimeout() {},
    addEventListener() {},
    removeEventListener() {},
  }
  class ResizeObserver {
    constructor(callback) { resize = callback }
    observe() {}
    disconnect() { disconnected = true }
  }
  const load = (name) => {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    const module = { exports: {} }
    const localRequire = (id) => {
      if (id === 'vue') return {
        ...vue,
        onMounted: (callback) => mounted.push(callback),
        onBeforeUnmount: (callback) => unmounted.push(callback),
      }
      if (id === './types') return load('./types.ts')
      return require(id)
    }
    new Function('require', 'module', 'exports', 'window', 'ResizeObserver',
      'requestAnimationFrame', 'cancelAnimationFrame', 'console', outputText)(
      localRequire, module, module.exports, window, ResizeObserver,
      (callback) => { frames.set(++frameId, callback); return frameId },
      (id) => frames.delete(id), { log() {} },
    )
    return module.exports
  }
  const { useBranchLines } = load('./useBranchLines.ts')
  const { buildInfoMap } = load('./types.ts')
  const nodes = [{ id: 'group', label: '分组', children: [
    { id: 'page', label: '页面', children: [{ id: 'child', label: '子页面' }] },
  ] }]
  let translateX = 0
  let width = 240
  const rowEls = ['group', 'page', 'child'].map((id, index) => ({
    dataset: { ftNodeId: id },
    getBoundingClientRect: () => ({
      left: 8 + (index > 0 ? translateX : 0),
      top: 100 + index * 32,
      bottom: 132 + index * 32,
      width,
      height: 32,
    }),
  }))
  const rowsRoot = { querySelectorAll: () => rowEls }
  const layer = {
    getBoundingClientRect: () => ({ left: 8, top: 100 }),
    get scrollWidth() { return width },
    scrollHeight: 96,
  }
  const scope = vue.effectScope()
  const result = scope.run(() => useBranchLines({
    infoMap: vue.shallowRef(buildInfoMap(nodes)),
    visibleIds: vue.shallowRef(new Set(['group', 'page', 'child'])),
    selectedKey: vue.ref('child'),
    layerRef: vue.shallowRef(layer),
    rowsRef: vue.shallowRef(rowsRoot),
  }))
  return {
    result,
    setTranslate: (x) => { translateX = x },
    setWidth: (value) => { width = value },
    mount: () => mounted.forEach((callback) => callback()),
    resize: () => resize(),
    flush: () => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((callback) => callback())
    },
    dispose: () => {
      unmounted.forEach((callback) => callback())
      scope.stop()
      assert.equal(frames.size, 0)
      assert.equal(disconnected, true)
    },
  }
}

for (const translateX of [-24, -12, 0]) {
  test(`首次测量不受行滑入动画 translateX(${translateX}px) 影响`, () => {
    const harness = createHarness()
    try {
      harness.setTranslate(translateX)
      harness.mount()
      harness.flush()
      const paths = harness.result.paths.value
      assert.equal(paths.length, 2)
      assert.equal(paths[0].d, 'M 17 32 L 17 42 A 6 6 0 0 0 23 48 L 27 48')
      assert.equal(paths[1].d, 'M 37 64 L 37 74 A 6 6 0 0 0 43 80 L 47 80')
      // 动画结束不触发 resize：此前计算的横坐标也必须已经正确。
      harness.setTranslate(0)
      assert.ok(paths.every((path) => !path.d.includes('M -')))
    } finally {
      harness.dispose()
    }
  })
}

test('侧栏变宽后缩进不变，尺寸更新且卸载取消待执行测量', () => {
  const harness = createHarness()
  try {
    harness.mount()
    harness.flush()
    const before = harness.result.paths.value.map((path) => path.d)
    harness.setWidth(320)
    harness.resize()
    harness.flush()
    assert.deepEqual(harness.result.paths.value.map((path) => path.d), before)
    assert.deepEqual(harness.result.size.value, { w: 320, h: 96 })
    assert.deepEqual([...harness.result.activeKeys.value], ['page->child', 'group->page'])
    harness.resize()
  } finally {
    harness.dispose()
  }
})
