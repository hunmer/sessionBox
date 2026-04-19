import { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import type { ActionRun, ActionStep } from './action-recorder'

export interface ActionStepResult {
  stepId: string
  index: number
  type: ActionStep['type']
  status: 'success' | 'failed' | 'skipped'
  startedAt: number
  endedAt: number
  error?: string
}

export interface ActionPlayState {
  playId: string
  runId: string
  status: 'running' | 'completed' | 'failed' | 'stopped'
  currentIndex: number
  total: number
  results: ActionStepResult[]
  error?: string
}

export interface ActionPlayOptions {
  timeoutMs?: number
  pollIntervalMs?: number
  settleMs?: number
  onState?: (state: ActionPlayState) => void
  onStepResult?: (result: ActionStepResult, state: ActionPlayState) => void
}

interface ActivePlay {
  state: ActionPlayState
  stopped: boolean
}

const activePlays = new Map<string, ActivePlay>()

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function emitState(active: ActivePlay, options?: ActionPlayOptions): void {
  options?.onState?.({ ...active.state, results: [...active.state.results] })
}

function literal(value: unknown): string {
  return JSON.stringify(value)
}

function buildElementExpression(step: ActionStep): string {
  const locator = step.locator ?? null
  return `
(() => {
  const locator = ${literal(locator)};
  if (!locator) return false;

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  }

  function visible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width >= 0 && rect.height >= 0;
  }

  function byText() {
    if (!locator.text) return null;
    const tag = locator.tag || '*';
    const wanted = String(locator.text).trim();
    const nodes = Array.from(document.querySelectorAll(tag));
    return nodes.find(el => visible(el) && String(el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().includes(wanted)) || null;
  }

  function byXPath() {
    if (!locator.xpath) return null;
    try {
      return document.evaluate(locator.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } catch {
      return null;
    }
  }

  const attempts = [
    () => locator.testId ? document.querySelector('[data-testid="' + cssEscape(locator.testId) + '"], [data-test="' + cssEscape(locator.testId) + '"], [data-cy="' + cssEscape(locator.testId) + '"]') : null,
    () => locator.id ? document.getElementById(locator.id) : null,
    () => locator.name ? document.querySelector((locator.tag || '*') + '[name="' + cssEscape(locator.name) + '"]') : null,
    () => locator.css ? document.querySelector(locator.css) : null,
    byText,
    byXPath
  ];

  for (const find of attempts) {
    try {
      const el = find();
      if (el && visible(el)) {
        window.__actionPlayerElement = el;
        return true;
      }
    } catch {}
  }

  window.__actionPlayerElement = null;
  return false;
})();
`
}

async function waitForElement(targetWc: WebContents, step: ActionStep, timeoutMs: number, pollIntervalMs: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const found = await targetWc.executeJavaScript(buildElementExpression(step)).catch(() => false)
    if (found) return
    await delay(pollIntervalMs)
  }
  throw new Error(`元素未找到: ${step.locator?.primary || 'unknown'}`)
}

async function waitForLoad(targetWc: WebContents, timeoutMs: number): Promise<void> {
  if (targetWc.isDestroyed()) throw new Error('目标 WebContents 已销毁')

  await new Promise<void>((resolve) => {
    let settled = false
    const timer = setTimeout(done, timeoutMs)

    function done() {
      if (settled) return
      settled = true
      clearTimeout(timer)
      targetWc.off('did-finish-load', done)
      targetWc.off('did-stop-loading', done)
      resolve()
    }

    targetWc.once('did-finish-load', done)
    targetWc.once('did-stop-loading', done)
    if (!targetWc.isLoading()) setTimeout(done, 50)
  })
}

async function waitForNavigationOrSettled(targetWc: WebContents, previousUrl: string, settleMs: number, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false
    const settleTimer = setTimeout(done, settleMs)
    const timeoutTimer = setTimeout(done, timeoutMs)

    function done() {
      if (settled) return
      settled = true
      clearTimeout(settleTimer)
      clearTimeout(timeoutTimer)
      targetWc.off('did-navigate', onNavigate)
      targetWc.off('did-navigate-in-page', onNavigateInPage)
      targetWc.off('did-finish-load', onFinishLoad)
      resolve()
    }

    function onNavigate() {
      waitForLoad(targetWc, timeoutMs).then(done).catch(done)
    }

    function onNavigateInPage() {
      done()
    }

    function onFinishLoad() {
      if (targetWc.getURL() !== previousUrl) done()
    }

    targetWc.once('did-navigate', onNavigate)
    targetWc.once('did-navigate-in-page', onNavigateInPage)
    targetWc.once('did-finish-load', onFinishLoad)
  })
}

async function executeStep(targetWc: WebContents, step: ActionStep, options: Required<Pick<ActionPlayOptions, 'timeoutMs' | 'pollIntervalMs' | 'settleMs'>>): Promise<void> {
  if (targetWc.isDestroyed()) throw new Error('目标 WebContents 已销毁')

  if (step.type === 'navigate') {
    const url = String(step.payload?.url || step.url || '')
    if (!url) throw new Error('navigate 缺少 URL')
    await targetWc.loadURL(url)
    await waitForLoad(targetWc, options.timeoutMs)
    return
  }

  if (step.type === 'scroll' && step.payload?.page !== false) {
    const x = Number(step.payload?.x || 0)
    const y = Number(step.payload?.y || 0)
    await targetWc.executeJavaScript(`window.scrollTo(${literal(x)}, ${literal(y)}); true;`)
    await delay(options.settleMs)
    return
  }

  await waitForElement(targetWc, step, options.timeoutMs, options.pollIntervalMs)

  if (step.type === 'click') {
    const previousUrl = targetWc.getURL()
    await targetWc.executeJavaScript(`
(() => {
  const el = window.__actionPlayerElement;
  if (!el) return false;
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  if (typeof el.focus === 'function') el.focus({ preventScroll: true });
  el.click();
  return true;
})();
`)
    await waitForNavigationOrSettled(targetWc, previousUrl, options.settleMs, options.timeoutMs)
    return
  }

  if (step.type === 'hover') {
    const point = await targetWc.executeJavaScript(`
(() => {
  const el = window.__actionPlayerElement;
  if (!el) return null;
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const options = { bubbles: true, cancelable: true, view: window, clientX, clientY };
  el.dispatchEvent(new MouseEvent('mouseover', options));
  el.dispatchEvent(new MouseEvent('mouseenter', options));
  el.dispatchEvent(new MouseEvent('mousemove', options));
  return { x: Math.round(clientX), y: Math.round(clientY) };
})();
`)
    if (point && typeof point.x === 'number' && typeof point.y === 'number') {
      await targetWc.debugger.attach('1.3').catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('already attached')) throw error
      })
      try {
        await targetWc.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: point.x,
          y: point.y,
          button: 'none'
        })
      } finally {
        targetWc.debugger.detach()
      }
    }
    await delay(Math.max(options.settleMs, 500))
    return
  }

  if (step.type === 'input' || step.type === 'change') {
    await targetWc.executeJavaScript(`
(() => {
  const el = window.__actionPlayerElement;
  const value = ${literal(step.payload?.value ?? '')};
  const eventType = ${literal(step.type)};
  if (!el) return false;
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  if (typeof el.focus === 'function') el.focus({ preventScroll: true });
  if (el.type === 'checkbox' || el.type === 'radio') {
    el.checked = !!value;
  } else if (el.isContentEditable) {
    el.textContent = value == null ? '' : String(value);
  } else {
    el.value = value == null ? '' : String(value);
  }
  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  if (eventType === 'change') el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  return true;
})();
`)
    await delay(options.settleMs)
    return
  }

  if (step.type === 'file') {
    const files = Array.isArray(step.payload?.files)
      ? step.payload.files.map(file => String(file)).filter(Boolean)
      : []
    if (files.length === 0) throw new Error('file 动作缺少文件路径')

    await targetWc.debugger.attach('1.3').catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('already attached')) throw error
    })

    try {
      const documentResult = await targetWc.debugger.sendCommand('DOM.getDocument', { depth: -1, pierce: true }) as any
      const rootNodeId = documentResult?.root?.nodeId
      if (!rootNodeId) throw new Error('无法获取 DOM root')
      const selector = step.locator?.css || (step.locator?.id ? `#${step.locator.id}` : '')
      if (!selector) throw new Error('file 动作缺少可用于 CDP 的 CSS locator')
      const queryResult = await targetWc.debugger.sendCommand('DOM.querySelector', {
        nodeId: rootNodeId,
        selector
      }) as any
      const nodeId = queryResult?.nodeId
      if (!nodeId) throw new Error('文件输入元素未找到')
      await targetWc.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files })
    } finally {
      targetWc.debugger.detach()
    }

    await targetWc.executeJavaScript(`
(() => {
  const el = window.__actionPlayerElement;
  if (!el) return false;
  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  return true;
})();
`).catch(() => {})
    await delay(options.settleMs)
    return
  }

  if (step.type === 'scroll') {
    await targetWc.executeJavaScript(`
(() => {
  const el = window.__actionPlayerElement;
  if (!el) return false;
  el.scrollLeft = ${literal(Number(step.payload?.x || 0))};
  el.scrollTop = ${literal(Number(step.payload?.y || 0))};
  el.dispatchEvent(new Event('scroll', { bubbles: true }));
  return true;
})();
`)
    await delay(options.settleMs)
    return
  }

  if (step.type === 'keydown') {
    const key = String(step.payload?.key || '')
    if (!['Enter', 'Tab', 'Escape'].includes(key)) throw new Error(`不支持的按键: ${key}`)
    await targetWc.executeJavaScript(`
(() => {
  const el = window.__actionPlayerElement || document.activeElement || document.body;
  const key = ${literal(key)};
  if (typeof el.focus === 'function') el.focus({ preventScroll: true });
  const options = { key, code: key, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent('keydown', options));
  el.dispatchEvent(new KeyboardEvent('keyup', options));
  if (key === 'Enter' && typeof el.click === 'function' && (el.tagName === 'BUTTON' || el.type === 'submit')) el.click();
  return true;
})();
`)
    await delay(options.settleMs)
  }
}

export async function playActionRun(
  targetWc: WebContents,
  run: ActionRun,
  options: ActionPlayOptions = {}
): Promise<ActionPlayState> {
  const playId = `play_${randomUUID()}`
  const resolvedOptions = {
    timeoutMs: options.timeoutMs ?? 5000,
    pollIntervalMs: options.pollIntervalMs ?? 100,
    settleMs: options.settleMs ?? 300
  }

  const active: ActivePlay = {
    stopped: false,
    state: {
      playId,
      runId: run.id,
      status: 'running',
      currentIndex: -1,
      total: run.steps.length,
      results: []
    }
  }

  activePlays.set(playId, active)
  emitState(active, options)

  try {
    for (let index = 0; index < run.steps.length; index++) {
      if (active.stopped) {
        active.state.status = 'stopped'
        break
      }

      const step = run.steps[index]
      active.state.currentIndex = index
      emitState(active, options)

      const result: ActionStepResult = {
        stepId: step.id,
        index,
        type: step.type,
        status: 'success',
        startedAt: Date.now(),
        endedAt: Date.now()
      }

      try {
        await executeStep(targetWc, step, resolvedOptions)
      } catch (error) {
        result.status = 'failed'
        result.error = error instanceof Error ? error.message : String(error)
        active.state.status = 'failed'
        active.state.error = result.error
      } finally {
        result.endedAt = Date.now()
        active.state.results.push(result)
        options.onStepResult?.(result, { ...active.state, results: [...active.state.results] })
        emitState(active, options)
      }

      if (result.status === 'failed') break
    }

    if (active.state.status === 'running') {
      active.state.status = active.stopped ? 'stopped' : 'completed'
    }
  } finally {
    activePlays.delete(playId)
    emitState(active, options)
  }

  return { ...active.state, results: [...active.state.results] }
}

export function stopActionPlay(playId: string): { success: boolean; error?: string } {
  const active = activePlays.get(playId)
  if (!active) return { success: false, error: '执行任务不存在或已结束' }
  active.stopped = true
  active.state.status = 'stopped'
  return { success: true }
}
