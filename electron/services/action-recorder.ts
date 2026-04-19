import { webContents, WebContents } from 'electron'
import { randomUUID } from 'node:crypto'

export type ActionStepType = 'navigate' | 'click' | 'input' | 'change' | 'scroll' | 'keydown' | 'hover' | 'file'

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
  enabledEventTypes?: Set<ActionStepType>
  destroyedListener?: () => void
  domReadyListener?: () => void
  didFinishLoadListener?: () => void
}

export interface ActionRecorderOptions {
  eventTypes?: ActionStepType[]
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

function normalizeEventTypes(eventTypes?: ActionStepType[]): ActionStepType[] {
  const supported: ActionStepType[] = ['click', 'input', 'change', 'scroll', 'keydown', 'hover', 'file']
  if (!Array.isArray(eventTypes) || eventTypes.length === 0) return supported
  const selected = supported.filter(type => eventTypes.includes(type))
  return selected.length > 0 ? selected : supported
}

export function buildRecorderScript(options: ActionRecorderOptions = {}): string {
  const prefix = JSON.stringify(ACTION_PREFIX)
  const enabledEventTypes = JSON.stringify(normalizeEventTypes(options.eventTypes))

  return `
(() => {
  const ACTION_PREFIX = ${prefix};
  const ENABLED_EVENT_TYPES = new Set(${enabledEventTypes});
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
    if (el.type === 'file') {
      return Array.from(el.files || []).map(file => file.path || file.name || '').filter(Boolean);
    }
    if (el.type === 'checkbox') return !!el.checked;
    if (el.type === 'radio') return !!el.checked;
    if (el.isContentEditable) return el.innerText || el.textContent || '';
    return el.value;
  }

  function isTextValueControl(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    const type = String(el.type || 'text').toLowerCase();
    return [
      'text', 'search', 'url', 'tel', 'email', 'password', 'number',
      'date', 'datetime-local', 'month', 'time', 'week'
    ].includes(type);
  }

  function findRelatedFileInput(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    if (el.matches && el.matches('input[type="file"]')) return el;
    if (el.querySelector) {
      const child = el.querySelector('input[type="file"]');
      if (child) return child;
    }
    if (el.tagName === 'LABEL') {
      const forId = el.getAttribute('for');
      if (forId) {
        const input = document.getElementById(forId);
        if (input && input.matches && input.matches('input[type="file"]')) return input;
      }
    }
    const closestLabel = el.closest ? el.closest('label') : null;
    if (closestLabel) {
      const nested = closestLabel.querySelector('input[type="file"]');
      if (nested) return nested;
      const forId = closestLabel.getAttribute('for');
      if (forId) {
        const input = document.getElementById(forId);
        if (input && input.matches && input.matches('input[type="file"]')) return input;
      }
    }
    return null;
  }

  function emit(type, target, payload, meta) {
    if (!ENABLED_EVENT_TYPES.has(type)) return;
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

  let lastFileEmitSignature = '';
  let lastFileEmitAt = 0;
  const pendingTextInputs = new Map();
  let lastTextEmitSignature = '';

  function emitFile(target) {
    const payload = {
      files: valueFor(target),
      multiple: !!target.multiple,
      accept: target.accept || ''
    };
    const locator = locatorFor(target);
    const signature = JSON.stringify({
      type: 'file',
      url: location.href,
      locator,
      payload
    });
    const now = Date.now();
    if (signature === lastFileEmitSignature && now - lastFileEmitAt < 1000) return;
    lastFileEmitSignature = signature;
    lastFileEmitAt = now;
    emit('file', target, payload, { sensitive: true });
  }

  function targetKey(target) {
    const locator = locatorFor(target);
    return JSON.stringify({ url: location.href, locator });
  }

  function rememberTextInput(target) {
    if (!target || !isTextValueControl(target)) return;
    pendingTextInputs.set(targetKey(target), {
      target,
      value: valueFor(target),
      locator: locatorFor(target),
      url: location.href
    });
  }

  function emitTextFinal(target) {
    if (!target || !isTextValueControl(target)) return false;
    const key = targetKey(target);
    const pending = pendingTextInputs.get(key);
    const value = valueFor(target);
    const locator = locatorFor(target);
    const signature = JSON.stringify({ type: 'change', url: location.href, locator, value });
    pendingTextInputs.delete(key);
    if (!pending && !value) return true;
    if (signature === lastTextEmitSignature) return true;
    lastTextEmitSignature = signature;
    emit('change', target, { value }, { sensitive: false, final: true });
    return true;
  }

  function onClick(event) {
    if (event.button !== 0) return;
    const fileInput = findRelatedFileInput(event.target);
    emit('click', event.target, {
      button: event.button,
      clientX: event.clientX,
      clientY: event.clientY,
      opensFilePicker: !!fileInput
    });
  }

  function onInput(event) {
    const target = event.target;
    if (target && target.type === 'file') {
      emitFile(target);
      return;
    }
    if (isTextValueControl(target)) {
      rememberTextInput(target);
      return;
    }
    emit('input', target, { value: valueFor(target) }, { sensitive: false });
  }

  function onChange(event) {
    const target = event.target;
    if (target && target.type === 'file') {
      emitFile(target);
      return;
    }
    if (emitTextFinal(target)) return;
    emit('change', target, { value: valueFor(target) }, { sensitive: false });
  }

  function onBlur(event) {
    emitTextFinal(event.target);
  }

  let lastHoverTarget = null;
  let lastHoverAt = 0;
  function findPointerHoverTarget(target) {
    let node = target && target.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    while (node && node !== document.documentElement) {
      try {
        if (window.getComputedStyle(node).cursor === 'pointer') return node;
      } catch {}
      node = node.parentElement;
    }
    return null;
  }

  function onHover(event) {
    const target = findPointerHoverTarget(event.target);
    const now = Date.now();
    if (!target || target === lastHoverTarget && now - lastHoverAt < 600) return;
    lastHoverTarget = target;
    lastHoverAt = now;
    emit('hover', target, { clientX: event.clientX, clientY: event.clientY });
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

  document.addEventListener('click', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('blur', onBlur, true);
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('mouseover', onHover, true);
  document.addEventListener('scroll', onScroll, true);

  window.__actionRecorderReady = true;
  window.__actionRecorderStopFn = () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('blur', onBlur, true);
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('mouseover', onHover, true);
    document.removeEventListener('scroll', onScroll, true);
    window.__actionRecorderReady = false;
  };

  return true;
})();
`
}

export async function injectActionRecorder(wcId: number, options: ActionRecorderOptions = {}): Promise<{ success: boolean; error?: string }> {
  const wc = getWebContents(wcId)
  if (!wc) return { success: false, error: 'WebContents 不存在或已销毁' }

  try {
    const enabledEventTypes = normalizeEventTypes(options.eventTypes)
    const desiredSignature = JSON.stringify(enabledEventTypes)
    const currentSignature = await wc.executeJavaScript('window.__actionRecorderEventTypesSignature || ""').catch(() => '')
    const alreadyReady = await wc.executeJavaScript('!!window.__actionRecorderReady').catch(() => false)
    if (!alreadyReady || currentSignature !== desiredSignature) {
      await wc.executeJavaScript(buildRecorderScript({ eventTypes: enabledEventTypes }))
      await wc.executeJavaScript(`window.__actionRecorderEventTypesSignature = ${JSON.stringify(desiredSignature)}`)
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
  onStep?: (step: ActionStep) => void,
  options: ActionRecorderOptions = {}
): Promise<{ success: boolean; error?: string; run?: ActionRun }> {
  const wc = getWebContents(wcId)
  if (!wc) return { success: false, error: 'WebContents 不存在或已销毁' }
  if (activeRuns.has(wcId)) return { success: false, error: '该页面已在动作录制中' }

  const enabledEventTypes = normalizeEventTypes(options.eventTypes)
  const enabledEventTypeSet = new Set(enabledEventTypes)
  const injected = await injectActionRecorder(wcId, { eventTypes: enabledEventTypes })
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
      if (!enabledEventTypeSet.has(parsed.type)) return
      pushStep(wcId, parsed)
    } catch {
      // ignore malformed page messages
    }
  }

  const destroyedListener = () => cleanupActionRecording(wcId, true)
  const domReadyListener = () => {
    if (activeRuns.has(wcId)) {
      injectActionRecorder(wcId, { eventTypes: enabledEventTypes }).catch(() => {})
    }
  }
  const didFinishLoadListener = () => {
    if (activeRuns.has(wcId)) {
      injectActionRecorder(wcId, { eventTypes: enabledEventTypes }).catch(() => {})
    }
  }

  const state: RecorderState = {
    run,
    listener,
    onStep,
    enabledEventTypes: enabledEventTypeSet,
    destroyedListener,
    domReadyListener,
    didFinishLoadListener
  }

  activeRuns.set(wcId, state)
  wc.on('console-message', listener)
  wc.once('destroyed', destroyedListener)
  wc.on('dom-ready', domReadyListener)
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
    if (state.domReadyListener) wc.off('dom-ready', state.domReadyListener)
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
