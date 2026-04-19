import { dialog, WebContents } from 'electron'
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

function normalizeUrlForMatch(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString()
  } catch {
    return value
  }
}

function urlsMatch(currentUrl: string, expectedUrl: string): boolean {
  if (!expectedUrl || expectedUrl === 'about:blank') return true
  return normalizeUrlForMatch(currentUrl) === normalizeUrlForMatch(expectedUrl)
}

async function waitForSourceUrl(targetWc: WebContents, expectedUrl: string, timeoutMs: number, pollIntervalMs: number): Promise<void> {
  if (!expectedUrl || expectedUrl === 'about:blank') return
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const currentUrl = targetWc.getURL()
    if (urlsMatch(currentUrl, expectedUrl)) return
    await delay(pollIntervalMs)
  }
  throw new Error(`页面地址未匹配: 当前 ${targetWc.getURL()}，期望 ${expectedUrl}`)
}

async function attachDebugger(targetWc: WebContents): Promise<void> {
  try {
    const result = targetWc.debugger.attach('1.3') as unknown
    if (result && typeof (result as Promise<void>).then === 'function') {
      await (result as Promise<void>)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('already attached')) throw error
  }
}

function detachDebugger(targetWc: WebContents): void {
  try {
    targetWc.debugger.detach()
  } catch {
    // The debugger may already be detached by Electron or another caller.
  }
}

function filtersFromAccept(accept: unknown): Electron.FileFilter[] {
  if (typeof accept !== 'string' || !accept.trim()) {
    return [{ name: 'All Files', extensions: ['*'] }]
  }

  const extensions = new Set<string>()
  const mimeGroups = new Set<string>()

  for (const rawPart of accept.split(',')) {
    const part = rawPart.trim().toLowerCase()
    if (!part) continue

    if (part.startsWith('.')) {
      const ext = part.slice(1).trim()
      if (ext) extensions.add(ext)
      continue
    }

    if (part === 'image/*') {
      mimeGroups.add('Images')
      ;['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].forEach(ext => extensions.add(ext))
      continue
    }

    if (part === 'video/*') {
      mimeGroups.add('Videos')
      ;['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].forEach(ext => extensions.add(ext))
      continue
    }

    if (part === 'audio/*') {
      mimeGroups.add('Audio')
      ;['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].forEach(ext => extensions.add(ext))
      continue
    }

    const subtype = part.split('/')[1]
    if (subtype && !subtype.includes('*')) {
      const normalized = subtype.split('+').pop() || subtype
      if (/^[a-z0-9]+$/.test(normalized)) extensions.add(normalized)
    }
  }

  if (extensions.size === 0) {
    return [{ name: 'All Files', extensions: ['*'] }]
  }

  const name = mimeGroups.size > 0 ? Array.from(mimeGroups).join(' / ') : 'Accepted Files'
  return [
    { name, extensions: Array.from(extensions) },
    { name: 'All Files', extensions: ['*'] }
  ]
}

async function chooseFilesForStep(step: ActionStep): Promise<string[]> {
  const multiple = !!step.payload?.multiple
  const result = await dialog.showOpenDialog({
    title: '选择要上传的文件',
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: filtersFromAccept(step.payload?.accept)
  })

  if (result.canceled || result.filePaths.length === 0) {
    throw new Error('用户取消了文件选择')
  }

  return result.filePaths
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

  await waitForSourceUrl(targetWc, step.url, options.timeoutMs, options.pollIntervalMs)

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
    const opensFilePicker = !!step.payload?.opensFilePicker
    const clickResult = await targetWc.executeJavaScript(`
(() => {
  const originalEl = window.__actionPlayerElement;
  const opensFilePicker = ${literal(opensFilePicker)};
  if (!originalEl) return { ok: false, error: '元素不存在' };

  function clickableElement(target) {
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return target;
    if (typeof target.click === 'function') return target;
    const parent = target.closest && target.closest('button, a, input, select, textarea, label, [role="button"], [onclick], [tabindex]');
    return parent || target;
  }

  function isFileControl(target) {
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return false;
    if (target.matches && target.matches('input[type="file"]')) return true;
    if (target.querySelector && target.querySelector('input[type="file"]')) return true;
    if (target.tagName === 'LABEL') {
      const forId = target.getAttribute('for');
      if (forId) {
        const input = document.getElementById(forId);
        if (input && input.matches && input.matches('input[type="file"]')) return true;
      }
    }
    return false;
  }

  const el = clickableElement(originalEl);
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  if (typeof el.focus === 'function') el.focus({ preventScroll: true });
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const options = { bubbles: true, cancelable: true, view: window, clientX, clientY, button: 0 };
  el.dispatchEvent(new MouseEvent('mousedown', options));
  el.dispatchEvent(new MouseEvent('mouseup', options));

  if (opensFilePicker || isFileControl(el)) {
    return { ok: true, skippedNativeClick: true, reason: 'file-control' };
  }

  try {
    if (typeof el.click !== 'function') {
      const clickEvent = new MouseEvent('click', options);
      const dispatched = el.dispatchEvent(clickEvent);
      return { ok: dispatched !== false, fallbackDispatch: true };
    }
    el.click();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
})();
`)
    if (!clickResult?.ok && !String(clickResult?.error || '').includes('File chooser')) {
      throw new Error(`点击失败: ${clickResult?.error || '未知错误'}`)
    }
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
      await attachDebugger(targetWc)
      try {
        await targetWc.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: point.x,
          y: point.y,
          button: 'none'
        })
      } finally {
        detachDebugger(targetWc)
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
    const files = await chooseFilesForStep(step)

    await attachDebugger(targetWc)

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
      detachDebugger(targetWc)
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
