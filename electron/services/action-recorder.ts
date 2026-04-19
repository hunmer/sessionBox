import { webContents, WebContents } from 'electron'
import { randomUUID } from 'node:crypto'

export type ActionStepType = 'navigate' | 'click' | 'input' | 'change' | 'scroll' | 'keydown'

export interface ActionLocator {
  primary: 'testId' | 'id' | 'name' | 'css' | 'text' | 'xpath'
  css: string
  xpath: string
  text: string
  id: string
  name: string
  testId: string
  tag: string
}

export interface ActionStep {
  id: string
  type: ActionStepType
  timestamp: number
  url: string
  locator?: ActionLocator
  payload?: Record<string, any>
  meta?: {
    sensitive?: boolean
    source?: string
  }
}

export interface ActionRun {
  id: string
  tabId?: string
  pageId?: string
  partition: string
  startedAt: number
  endedAt: number | null
  initialUrl: string
  steps: ActionStep[]
}

export interface RecorderState {
  run: ActionRun
  listener: ((event: Electron.Event, level: number, message: string, line: number, sourceId: string) => void) | null
  onStep?: (step: ActionStep) => void
  destroyedListener?: () => void
  didNavigateListener?: (_event: Electron.Event, url: string) => void
  didNavigateInPageListener?: (_event: Electron.Event, url: string, isMainFrame: boolean) => void
  didFinishLoadListener?: () => void
}

const activeRuns = new Map<number, RecorderState>()
const finishedRuns = new Map<number, ActionRun>()

export const MAX_STEPS = 5000
export const MAX_STEP_SIZE = 128 * 1024
export const ACTION_PREFIX = '__ACTION_RECORDER__'

function getWebContents(id: number): WebContents | null {
  const wc = webContents.fromId(id)
  if (!wc || wc.isDestroyed()) return null
  return wc
}

function getPartition(wc: WebContents): string {
  return String((wc.session as any)?.partition || 'default')
}

function pushStep(wcId: number, step: ActionStep): void {
  const state = activeRuns.get(wcId)
  if (!state) return

  state.run.steps.push(step)
  state.onStep?.(step)

  if (state.run.steps.length >= MAX_STEPS) {
    stopActionRecording(wcId)
  }
}

function createNavigationStep(url: string, source: string): ActionStep {
  return {
    id: `step_${randomUUID()}`,
    type: 'navigate',
    timestamp: Date.now(),
    url,
    payload: { url },
    meta: { source }
  }
}

export function buildRecorderScript(): string {
  const prefix = JSON.stringify(ACTION_PREFIX)

  return `
(() => {
  const ACTION_PREFIX = ${prefix};
  const IMPORTANT_KEYS = new Set(['Enter', 'Tab', 'Escape']);
  const MAX_TEXT = 120;

  if (window.__actionRecorderStopFn) {
    window.__actionRecorderStopFn();
    window.__actionRecorderStopFn = null;
  }

  function makeId() {
    return 'step_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function safeString(value, limit) {
    return String(value || '').replace(/\\s+/g, ' ').trim().slice(0, limit || MAX_TEXT);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  }

  function textFor(el) {
    if (!el) return '';
    return safeString(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '', MAX_TEXT);
  }

  function getXPath(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === node.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(node.tagName.toLowerCase() + '[' + index + ']');
      node = node.parentElement;
    }
    return parts.length ? '/' + parts.join('/') : '';
  }

  function uniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function stableCss(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = el.tagName.toLowerCase();
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy');
    if (testId) {
      const selector = '[data-testid="' + cssEscape(testId) + '"]';
      if (uniqueSelector(selector)) return selector;
    }
    if (el.id) {
      const selector = '#' + cssEscape(el.id);
      if (uniqueSelector(selector)) return selector;
    }
    const name = el.getAttribute('name');
    if (name) {
      const selector = tag + '[name="' + cssEscape(name) + '"]';
      if (uniqueSelector(selector)) return selector;
    }
    const attrs = ['type', 'role', 'aria-label', 'placeholder', 'href'];
    for (const attr of attrs) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const selector = tag + '[' + attr + '="' + cssEscape(value) + '"]';
      if (uniqueSelector(selector)) return selector;
    }
    const path = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (!parent) break;
      const siblings = Array.from(parent.children).filter(child => child.tagName === node.tagName);
      if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      path.unshift(part);
      const selector = path.join(' > ');
      if (uniqueSelector(selector)) return selector;
      node = parent;
    }
    return path.join(' > ');
  }

  function locatorFor(target) {
    const el = target && target.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    if (!el) return undefined;
    const tag = el.tagName.toLowerCase();
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy') || '';
    const id = el.id || '';
    const name = el.getAttribute('name') || '';
    const css = stableCss(el);
    const text = textFor(el);
    const xpath = getXPath(el);
    const primary = testId ? 'testId' : id ? 'id' : name ? 'name' : css ? 'css' : text ? 'text' : 'xpath';
    return { primary, css, xpath, text, id, name, testId, tag };
  }

  function valueFor(el) {
    if (!el) return '';
    if (el.type === 'checkbox') return !!el.checked;
    if (el.type === 'radio') return !!el.checked;
    if (el.isContentEditable) return el.innerText || el.textContent || '';
    return el.value;
  }

  function emit(type, target, payload, meta) {
    const step = {
      id: makeId(),
      type,
      timestamp: Date.now(),
      url: location.href,
      locator: target ? locatorFor(target) : undefined,
      payload: payload || {},
      meta: meta || {}
    };
    try {
      console.debug(ACTION_PREFIX + JSON.stringify(step));
    } catch {}
  }

  function onClick(event) {
    if (event.button !== 0) return;
    emit('click', event.target, { button: event.button, clientX: event.clientX, clientY: event.clientY });
  }

  function onInput(event) {
    const target = event.target;
    emit('input', target, { value: valueFor(target) }, { sensitive: false });
  }

  function onChange(event) {
    const target = event.target;
    emit('change', target, { value: valueFor(target) }, { sensitive: false });
  }

  let lastScrollAt = 0;
  function onScroll(event) {
    const now = Date.now();
    if (now - lastScrollAt < 150) return;
    lastScrollAt = now;
    const target = event.target === document ? document.scrollingElement || document.documentElement : event.target;
    const isPage = target === document.body || target === document.documentElement || target === document.scrollingElement;
    emit('scroll', isPage ? null : target, {
      x: isPage ? window.scrollX : target.scrollLeft,
      y: isPage ? window.scrollY : target.scrollTop,
      page: isPage
    });
  }

  function onKeydown(event) {
    if (!IMPORTANT_KEYS.has(event.key)) return;
    emit('keydown', event.target, { key: event.key });
  }

  function onLocationChange(source) {
    emit('navigate', null, { url: location.href }, { source });
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('hashchange', () => onLocationChange('hashchange'), true);
  window.addEventListener('popstate', () => onLocationChange('popstate'), true);
  window.addEventListener('beforeunload', () => onLocationChange('beforeunload'), true);

  window.__actionRecorderReady = true;
  window.__actionRecorderStopFn = () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('scroll', onScroll, true);
    window.__actionRecorderReady = false;
  };

  return true;
})();
`
}

export async function injectActionRecorder(wcId: number): Promise<{ success: boolean; error?: string }> {
  const wc = getWebContents(wcId)
  if (!wc) return { success: false, error: 'WebContents 不存在或已销毁' }

  try {
    const alreadyReady = await wc.executeJavaScript('!!window.__actionRecorderReady').catch(() => false)
    if (!alreadyReady) {
      await wc.executeJavaScript(buildRecorderScript())
    }
    const ready = await wc.executeJavaScript('!!window.__actionRecorderReady').catch(() => false)
    if (!ready) return { success: false, error: '动作录制器注入失败' }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function startActionRecording(
  wcId: number,
  onStep?: (step: ActionStep) => void
): Promise<{ success: boolean; error?: string; run?: ActionRun }> {
  const wc = getWebContents(wcId)
  if (!wc) return { success: false, error: 'WebContents 不存在或已销毁' }
  if (activeRuns.has(wcId)) return { success: false, error: '该页面已在动作录制中' }

  const injected = await injectActionRecorder(wcId)
  if (!injected.success) return injected

  const run: ActionRun = {
    id: `run_${randomUUID()}`,
    partition: getPartition(wc),
    startedAt: Date.now(),
    endedAt: null,
    initialUrl: wc.getURL(),
    steps: []
  }

  const listener = (_event: Electron.Event, _level: number, message: string) => {
    if (!message.startsWith(ACTION_PREFIX)) return
    const json = message.slice(ACTION_PREFIX.length)
    if (json.length > MAX_STEP_SIZE) return
    try {
      const parsed = JSON.parse(json) as ActionStep
      if (!parsed || typeof parsed.type !== 'string') return
      pushStep(wcId, parsed)
    } catch {
      // ignore malformed page messages
    }
  }

  const destroyedListener = () => cleanupActionRecording(wcId, true)
  const didNavigateListener = (_event: Electron.Event, url: string) => {
    pushStep(wcId, createNavigationStep(url, 'did-navigate'))
  }
  const didNavigateInPageListener = (_event: Electron.Event, url: string, isMainFrame: boolean) => {
    if (isMainFrame) pushStep(wcId, createNavigationStep(url, 'did-navigate-in-page'))
  }
  const didFinishLoadListener = () => {
    if (activeRuns.has(wcId)) {
      injectActionRecorder(wcId).catch(() => {})
    }
  }

  const state: RecorderState = {
    run,
    listener,
    onStep,
    destroyedListener,
    didNavigateListener,
    didNavigateInPageListener,
    didFinishLoadListener
  }

  activeRuns.set(wcId, state)
  wc.on('console-message', listener)
  wc.once('destroyed', destroyedListener)
  wc.on('did-navigate', didNavigateListener)
  wc.on('did-navigate-in-page', didNavigateInPageListener)
  wc.on('did-finish-load', didFinishLoadListener)

  return { success: true, run }
}

export function stopActionRecording(wcId: number): { success: boolean; error?: string; run?: ActionRun } {
  const state = activeRuns.get(wcId)
  if (!state) return { success: false, error: '该页面未在动作录制中' }

  cleanupActionRecording(wcId, true)

  const wc = getWebContents(wcId)
  if (wc) {
    wc.executeJavaScript('window.__actionRecorderStopFn?.(); window.__actionRecorderStopFn = null; window.__actionRecorderReady = false').catch(() => {})
  }

  return { success: true, run: state.run }
}

function cleanupActionRecording(wcId: number, keepRun = false): void {
  const state = activeRuns.get(wcId)
  if (!state) return

  const wc = getWebContents(wcId)
  if (wc) {
    if (state.listener) wc.off('console-message', state.listener)
    if (state.didNavigateListener) wc.off('did-navigate', state.didNavigateListener)
    if (state.didNavigateInPageListener) wc.off('did-navigate-in-page', state.didNavigateInPageListener)
    if (state.didFinishLoadListener) wc.off('did-finish-load', state.didFinishLoadListener)
  }

  state.run.endedAt = Date.now()
  if (keepRun) finishedRuns.set(wcId, state.run)
  activeRuns.delete(wcId)
}

export function getActionRun(wcId: number): ActionRun | null {
  return activeRuns.get(wcId)?.run ?? finishedRuns.get(wcId) ?? null
}

export function getActiveActionRuns(): number[] {
  return Array.from(activeRuns.keys())
}

export function clearActionRun(wcId: number): void {
  cleanupActionRecording(wcId)
  finishedRuns.delete(wcId)
}
