import { webContents, WebContents } from 'electron'

const RRWEB_CDN = 'https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb-all.min.js'
const EVENT_PREFIX = '__RRWEB_EVENT__'
const MAX_EVENTS = 10000
const MAX_EVENT_SIZE = 1024 * 1024 // 1MB

interface RecordingState {
  events: any[]
  listener: ((event: Electron.Event, level: number, message: string, line: number, sourceId: string) => void) | null
}

const recordings = new Map<number, RecordingState>()

function getWebContents(id: number): WebContents | null {
  const wc = webContents.fromId(id)
  if (!wc || wc.isDestroyed()) return null
  return wc
}

/** 注入 rrweb CDN 到目标页面 */
export async function injectRrweb(wcId: number): Promise<{ success: boolean; error?: string }> {
  const wc = getWebContents(wcId)
  if (!wc) return { success: false, error: 'WebContents 不存在或已销毁' }

  const alreadyReady = await wc.executeJavaScript('!!window.__rrwebReady')
  if (alreadyReady) return { success: true }

  await wc.executeJavaScript(`
    new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = '${RRWEB_CDN}'
      script.onload = () => { window.__rrwebReady = true; resolve(true) }
      script.onerror = () => reject(new Error('CDN 加载失败'))
      document.head.appendChild(script)
    })
  `).catch(() => null)

  const ready = await wc.executeJavaScript('!!window.__rrwebReady')
  if (!ready) return { success: false, error: 'rrweb CDN 加载超时或失败' }
  return { success: true }
}

/** 启动录制 */
export function startRecording(wcId: number): { success: boolean; error?: string } {
  const wc = getWebContents(wcId)
  if (!wc) return { success: false, error: 'WebContents 不存在或已销毁' }
  if (recordings.has(wcId)) return { success: false, error: '该页面已在录制中' }

  const events: any[] = []

  const listener = (_event: Electron.Event, _level: number, message: string) => {
    if (!message.startsWith(EVENT_PREFIX)) return
    const json = message.slice(EVENT_PREFIX.length)
    if (json.length > MAX_EVENT_SIZE) return
    try {
      events.push(JSON.parse(json))
    } catch { /* ignore malformed */ }

    if (events.length >= MAX_EVENTS) {
      stopRecording(wcId)
    }
  }

  wc.on('console-message', listener)

  wc.executeJavaScript(`
    if (window.__rrwebStopFn) { window.__rrwebStopFn(); window.__rrwebStopFn = null }
    window.__rrwebStopFn = rrweb.record({
      emit: event => console.debug('${EVENT_PREFIX}' + JSON.stringify(event))
    })
  `).catch(() => {})

  wc.once('destroyed', () => {
    cleanupRecording(wcId)
  })

  wc.once('did-navigate', () => {
    stopRecording(wcId)
  })

  recordings.set(wcId, { events, listener })
  return { success: true }
}

/** 停止录制 */
export function stopRecording(wcId: number): { success: boolean; error?: string } {
  const state = recordings.get(wcId)
  if (!state) return { success: false, error: '该页面未在录制中' }

  cleanupRecording(wcId)

  const wc = getWebContents(wcId)
  if (wc) {
    wc.executeJavaScript('window.__rrwebStopFn?.(); window.__rrwebStopFn = null').catch(() => {})
  }

  return { success: true }
}

function cleanupRecording(wcId: number) {
  const state = recordings.get(wcId)
  if (!state) return

  const wc = getWebContents(wcId)
  if (wc && state.listener) {
    wc.off('console-message', state.listener)
  }

  recordings.delete(wcId)
}

/** 获取录制事件 */
export function getRecordedEvents(wcId: number): any[] {
  const state = recordings.get(wcId)
  if (state) return state.events
  return []
}

/** 获取所有正在录制的 wcId 列表 */
export function getActiveRecordings(): number[] {
  return Array.from(recordings.keys())
}

/** 获取录制事件数量 */
export function getEventCount(wcId: number): number {
  return recordings.get(wcId)?.events.length ?? 0
}

/** 清理指定 wcId 的录制数据 */
export function clearRecording(wcId: number) {
  cleanupRecording(wcId)
}
