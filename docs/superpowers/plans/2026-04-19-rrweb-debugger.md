# RRWeb 网页调试工具 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 SessionBox 中集成基于 rrweb 的网页录制/回放调试工具，支持选择目标标签页录制 DOM 操作并在独立窗口中回放。

**Architecture:** 独立 BrowserWindow 加载内联 HTML（不依赖 Vue），rrweb/rrweb-player 通过 CDN 引入。主进程通过 `executeJavaScript` 注入录制脚本，通过 `console-message` 事件拦截录制数据，内存存储 + JSON 导出。

**Tech Stack:** Electron (BrowserWindow, webContents, ipcMain), rrweb + rrweb-player (CDN), TypeScript

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 创建 | `electron/services/debugger.ts` | 录制状态管理：注入 rrweb、启停录制、console-message 监听、事件存储 |
| 创建 | `electron/ipc/debugger.ts` | IPC 处理器：8 个通道注册 |
| 创建 | `electron/debugger-window.html` | 调试窗口 HTML（内联 CSS/JS，上下布局，rrweb-player CDN） |
| 创建 | `electron/debugger-preload.ts` | 调试窗口专用 preload：暴露 debugger IPC API |
| 修改 | `electron/ipc/index.ts` | 在 `registerIpcHandlers()` 中引入 `registerDebuggerIpcHandlers` |
| 修改 | `electron/main.ts` | 注册 debugger IPC handlers |
| 修改 | `src/components/common/RightPanel.vue` | 新增 Bug 图标按钮入口 |

---

## 批次一：主进程服务层

### Task 1: 创建录制状态管理服务

**Files:**
- Create: `electron/services/debugger.ts`

- [ ] **Step 1: 创建 debugger.ts 基础结构和类型定义**

```typescript
// electron/services/debugger.ts
import { webContents, WebContents } from 'electron'

const RRWEB_CDN = 'https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb-all.min.js'
const EVENT_PREFIX = '__RRWEB_EVENT__'
const MAX_EVENTS = 10000
const MAX_EVENT_SIZE = 1024 * 1024 // 1MB
const INJECT_TIMEOUT = 5000

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

  // 验证是否加载成功
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

  // 在目标页面启动 rrweb record
  wc.executeJavaScript(`
    if (window.__rrwebStopFn) { window.__rrwebStopFn(); window.__rrwebStopFn = null }
    window.__rrwebStopFn = rrweb.record({
      emit: event => console.debug('${EVENT_PREFIX}' + JSON.stringify(event))
    })
  `).catch(() => {})

  // 页面销毁时自动清理
  wc.once('destroyed', () => {
    cleanupRecording(wcId)
  })

  // 页面导航时停止录制
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
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/debugger.ts
git commit -m "feat(debugger): add recording state management service"
```

---

### Task 2: 创建 IPC 处理器

**Files:**
- Create: `electron/ipc/debugger.ts`
- Modify: `electron/ipc/index.ts` (添加 import 和注册调用)
- Modify: `electron/main.ts` (如果 index.ts 中的 registerIpcHandlers 已包含则不需要)

- [ ] **Step 1: 创建 debugger IPC 处理器**

```typescript
// electron/ipc/debugger.ts
import { ipcMain, BrowserWindow, dialog, webContents as wcList } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import {
  injectRrweb,
  startRecording,
  stopRecording,
  getRecordedEvents,
  getActiveRecordings,
  getEventCount,
  clearRecording
} from '../services/debugger'
import { webviewManager } from '../services/webview-manager'
import { getTabById } from '../services/store'

let debuggerWindow: BrowserWindow | null = null

export function registerDebuggerIpcHandlers(): void {

  /** 创建调试窗口 */
  ipcMain.handle('debugger:create-window', async () => {
    if (debuggerWindow && !debuggerWindow.isDestroyed()) {
      debuggerWindow.focus()
      return { success: true }
    }

    debuggerWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      show: false,
      autoHideMenuBar: true,
      frame: false,
      title: '调试工具',
      webPreferences: {
        preload: join(__dirname, '../debugger-preload/index.js'),
        sandbox: false,
        webviewTag: true
      }
    })

    // 加载独立 HTML
    debuggerWindow.loadFile(join(__dirname, '../debugger-window.html'))
    debuggerWindow.once('ready-to-show', () => debuggerWindow?.show())

    debuggerWindow.on('closed', () => {
      // 窗口关闭时停止所有录制
      for (const wcId of getActiveRecordings()) {
        stopRecording(wcId)
      }
      debuggerWindow = null
    })

    return { success: true }
  })

  /** 获取当前所有标签页列表 */
  ipcMain.handle('debugger:get-tabs', () => {
    const manager = (global as any).__webviewManager as typeof webviewManager | undefined
    if (!manager) return []

    const tabs = getTabById()
    const result: { tabId: string; title: string; url: string; webContentsId: number }[] = []

    for (const tab of tabs) {
      const wc = manager.getWebContents(tab.id)
      if (wc && !wc.isDestroyed()) {
        result.push({
          tabId: tab.id,
          title: tab.title || tab.url || '未命名',
          url: tab.url || '',
          webContentsId: wc.id
        })
      }
    }
    return result
  })

  /** 注入 rrweb CDN */
  ipcMain.handle('debugger:inject', async (_e, wcId: number) => {
    return injectRrweb(wcId)
  })

  /** 开始录制 */
  ipcMain.handle('debugger:start-record', (_e, wcId: number) => {
    return startRecording(wcId)
  })

  /** 停止录制 */
  ipcMain.handle('debugger:stop-record', (_e, wcId: number) => {
    return stopRecording(wcId)
  })

  /** 获取录制事件 */
  ipcMain.handle('debugger:get-events', (_e, wcId: number) => {
    return getRecordedEvents(wcId)
  })

  /** 导出事件为 JSON 文件 */
  ipcMain.handle('debugger:export-events', async (_e, wcId: number) => {
    const events = getRecordedEvents(wcId)
    if (events.length === 0) return { success: false, error: '没有录制事件' }

    const result = await dialog.showSaveDialog(debuggerWindow!, {
      defaultPath: `rrweb-events-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }

    await writeFile(result.filePath, JSON.stringify(events, null, 2), 'utf-8')
    return { success: true, path: result.filePath }
  })

  /** 内嵌 webview 模式加载 URL */
  ipcMain.handle('debugger:load-url', async (_e, url: string) => {
    if (!debuggerWindow || debuggerWindow.isDestroyed()) return { success: false, error: '调试窗口不存在' }
    // 通过 webContents 发送事件给 HTML 页面
    debuggerWindow.webContents.send('debugger:load-url', url)
    return { success: true }
  })
}
```

- [ ] **Step 2: 在 index.ts 中注册**

在 `electron/ipc/index.ts` 的 import 区域添加：

```typescript
import { registerDebuggerIpcHandlers } from './debugger'
```

在 `registerIpcHandlers()` 函数内的其他 `register*` 调用之后添加：

```typescript
registerDebuggerIpcHandlers()
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/debugger.ts electron/ipc/index.ts
git commit -m "feat(debugger): add IPC handlers for recording/replay"
```

---

## 批次二：调试窗口页面

### Task 3: 创建调试窗口专用 preload

**Files:**
- Create: `electron/debugger-preload.ts`

- [ ] **Step 1: 创建 preload 文件**

```typescript
// electron/debugger-preload.ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getTabs: (): Promise<any[]> => ipcRenderer.invoke('debugger:get-tabs'),
  inject: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:inject', wcId),
  startRecord: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:start-record', wcId),
  stopRecord: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:stop-record', wcId),
  getEvents: (wcId: number): Promise<any[]> => ipcRenderer.invoke('debugger:get-events', wcId),
  exportEvents: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:export-events', wcId),
  loadUrl: (url: string): Promise<any> => ipcRenderer.invoke('debugger:load-url', url),

  on: (channel: string, callback: (...args: any[]) => void) => {
    const handler = (_e: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('debuggerApi', api)
}
```

- [ ] **Step 2: 在 electron.vite.config.ts 中添加 preload 入口**

需要在 `electron.vite.config.ts` 的 preload 配置中添加 `debugger-preload` 作为额外入口。检查当前配置来确定具体修改方式。

> 注意：需要读取 `electron.vite.config.ts` 确认 preload 构建配置，可能需要在 `rollupOptions.input` 中添加多入口，或创建 `electron/debugger-preload/index.ts` 目录结构。

- [ ] **Step 3: Commit**

```bash
git add electron/debugger-preload.ts
git commit -m "feat(debugger): add debugger window preload script"
```

---

### Task 4: 创建调试窗口 HTML

**Files:**
- Create: `electron/debugger-window.html`

- [ ] **Step 1: 创建完整的 HTML 文件**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; img-src * data: blob:;">
  <title>调试工具</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

    /* 标题栏 */
    .titlebar { display: flex; align-items: center; justify-content: space-between; height: 36px; padding: 0 12px; background: #16162a; -webkit-app-region: drag; user-select: none; }
    .titlebar-title { font-size: 13px; font-weight: 500; }
    .titlebar-controls { display: flex; gap: 8px; -webkit-app-region: no-drag; }
    .titlebar-btn { width: 12px; height: 12px; border-radius: 50%; border: none; cursor: pointer; }
    .titlebar-btn.close { background: #ff5f57; }
    .titlebar-btn.minimize { background: #febc2e; }
    .titlebar-btn.maximize { background: #28c840; }
    .titlebar-btn:hover { opacity: 0.8; }

    /* 控制面板 */
    .controls { padding: 10px 16px; background: #1e1e3a; border-bottom: 1px solid #2a2a4a; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .controls select, .controls input { background: #2a2a4a; color: #e0e0e0; border: 1px solid #3a3a5a; border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none; }
    .controls select:focus, .controls input:focus { border-color: #6366f1; }
    .controls select { min-width: 200px; }
    .controls input[type="text"] { flex: 1; min-width: 150px; }
    .controls button { padding: 5px 14px; border-radius: 4px; border: none; font-size: 12px; cursor: pointer; font-weight: 500; transition: opacity 0.15s; }
    .controls button:hover { opacity: 0.85; }
    .controls button:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-inject { background: #6366f1; color: white; }
    .btn-start { background: #22c55e; color: white; }
    .btn-stop { background: #ef4444; color: white; }
    .btn-export { background: #3b82f6; color: white; }
    .btn-refresh { background: #64748b; color: white; }
    .status { font-size: 11px; color: #94a3b8; margin-left: 4px; }
    .status.recording { color: #ef4444; }
    .url-bar { display: none; width: 100%; }
    .url-bar.visible { display: flex; gap: 8px; align-items: center; }

    /* 内嵌 webview */
    .webview-container { display: none; height: 200px; border-bottom: 1px solid #2a2a4a; }
    .webview-container.visible { display: block; }
    .webview-container webview { width: 100%; height: 100%; }

    /* 回放区域 */
    .replayer-wrapper { flex: 1; overflow: hidden; display: flex; flex-direction: column; position: relative; }
    .replayer-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #64748b; font-size: 14px; }
    #replayer { width: 100%; height: 100%; }
    .replayer-wrapper iframe { width: 100% !important; height: 100% !important; }
  </style>
</head>
<body>
  <!-- 标题栏 -->
  <div class="titlebar">
    <span class="titlebar-title">调试工具</span>
    <div class="titlebar-controls">
      <button class="titlebar-btn minimize" onclick="window.minimize()"></button>
      <button class="titlebar-btn maximize" onclick="window.maximize()"></button>
      <button class="titlebar-btn close" onclick="window.close()"></button>
    </div>
  </div>

  <!-- 控制面板 -->
  <div class="controls">
    <select id="targetSelect">
      <option value="">-- 选择目标页面 --</option>
    </select>
    <button class="btn-refresh" id="refreshBtn" title="刷新列表">刷新</button>
    <button class="btn-inject" id="injectBtn" disabled>注入</button>
    <button class="btn-start" id="startBtn" disabled>开始录制</button>
    <button class="btn-stop" id="stopBtn" disabled>停止录制</button>
    <button class="btn-export" id="exportBtn" disabled>导出</button>
    <span class="status" id="status"></span>

    <div class="url-bar" id="urlBar">
      <input type="text" id="urlInput" placeholder="输入 URL..." value="https://example.com">
      <button class="btn-inject" id="loadUrlBtn">加载</button>
    </div>
  </div>

  <!-- 内嵌 webview -->
  <div class="webview-container" id="webviewContainer">
    <webview id="embeddedWebview" src="about:blank"></webview>
  </div>

  <!-- 回放区域 -->
  <div class="replayer-wrapper">
    <div class="replayer-empty" id="replayerEmpty">停止录制后自动回放</div>
    <div id="replayer" style="display:none;"></div>
  </div>

  <!-- rrweb-player CDN -->
  <script src="https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/index.js"></script>

  <script>
    const api = window.debuggerApi
    const EMBEDDED_WC_OPTION = '__embedded__'
    let currentWcId = null
    let isRecording = false
    let embeddedWcId = null

    const targetSelect = document.getElementById('targetSelect')
    const refreshBtn = document.getElementById('refreshBtn')
    const injectBtn = document.getElementById('injectBtn')
    const startBtn = document.getElementById('startBtn')
    const stopBtn = document.getElementById('stopBtn')
    const exportBtn = document.getElementById('exportBtn')
    const statusEl = document.getElementById('status')
    const urlBar = document.getElementById('urlBar')
    const urlInput = document.getElementById('urlInput')
    const loadUrlBtn = document.getElementById('loadUrlBtn')
    const webviewContainer = document.getElementById('webviewContainer')
    const embeddedWebview = document.getElementById('embeddedWebview')
    const replayerEl = document.getElementById('replayer')
    const replayerEmpty = document.getElementById('replayerEmpty')

    // 窗口控制
    window.minimize = () => api.minimize?.()
    window.maximize = () => api.maximize?.()
    window.close = () => api.close?.()

    function setStatus(text, recording = false) {
      statusEl.textContent = text
      statusEl.className = recording ? 'status recording' : 'status'
    }

    function updateButtons() {
      const hasTarget = currentWcId !== null
      injectBtn.disabled = !hasTarget
      startBtn.disabled = !hasTarget || isRecording
      stopBtn.disabled = !isRecording
      exportBtn.disabled = isRecording || !hasTarget
    }

    // 刷新标签页列表
    async function refreshTabs() {
      const tabs = await api.getTabs()
      const prev = targetSelect.value
      targetSelect.innerHTML = '<option value="">-- 选择目标页面 --</option>'

      const embeddedOpt = document.createElement('option')
      embeddedOpt.value = EMBEDDED_WC_OPTION
      embeddedOpt.textContent = '内嵌 WebView'
      targetSelect.appendChild(embeddedOpt)

      for (const tab of tabs) {
        const opt = document.createElement('option')
        opt.value = String(tab.webContentsId)
        opt.textContent = `${tab.title} (ID: ${tab.webContentsId})`
        targetSelect.appendChild(opt)
      }

      if (prev && Array.from(targetSelect.options).some(o => o.value === prev)) {
        targetSelect.value = prev
      }
    }

    targetSelect.addEventListener('change', () => {
      const val = targetSelect.value
      if (val === EMBEDDED_WC_OPTION) {
        urlBar.classList.add('visible')
        webviewContainer.classList.add('visible')
        // 获取内嵌 webview 的 webContentsId
        embeddedWcId = embeddedWebview.getWebContentsId?.() ?? null
        currentWcId = embeddedWcId
      } else if (val) {
        urlBar.classList.remove('visible')
        webviewContainer.classList.remove('visible')
        currentWcId = parseInt(val, 10)
      } else {
        urlBar.classList.remove('visible')
        webviewContainer.classList.remove('visible')
        currentWcId = null
      }
      updateButtons()
    })

    refreshBtn.addEventListener('click', refreshTabs)

    injectBtn.addEventListener('click', async () => {
      if (!currentWcId) return
      setStatus('注入中...')
      injectBtn.disabled = true
      const result = await api.inject(currentWcId)
      if (result.success) {
        setStatus('注入成功')
      } else {
        setStatus('注入失败: ' + (result.error || '未知错误'))
      }
      updateButtons()
    })

    startBtn.addEventListener('click', async () => {
      if (!currentWcId) return
      const result = await api.startRecord(currentWcId)
      if (result.success) {
        isRecording = true
        setStatus('录制中...', true)
        // 清除上次回放
        replayerEl.style.display = 'none'
        replayerEl.innerHTML = ''
        replayerEmpty.style.display = 'flex'
        replayerEmpty.textContent = '录制中...'
      } else {
        setStatus('启动失败: ' + (result.error || '未知错误'))
      }
      updateButtons()
    })

    stopBtn.addEventListener('click', async () => {
      if (!currentWcId) return
      const result = await api.stopRecord(currentWcId)
      if (result.success) {
        isRecording = false
        setStatus('已停止')

        // 获取事件并回放
        const events = await api.getEvents(currentWcId)
        if (events.length > 0) {
          playEvents(events)
        } else {
          replayerEmpty.textContent = '无录制事件'
        }
      } else {
        setStatus('停止失败: ' + (result.error || '未知错误'))
      }
      updateButtons()
    })

    exportBtn.addEventListener('click', async () => {
      if (!currentWcId) return
      const result = await api.exportEvents(currentWcId)
      if (result.success) {
        setStatus('已导出: ' + result.path)
      } else {
        setStatus('导出失败: ' + (result.error || '未知错误'))
      }
    })

    loadUrlBtn.addEventListener('click', async () => {
      const url = urlInput.value.trim()
      if (!url) return
      embeddedWebview.loadURL(url)
    })

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadUrlBtn.click()
    })

    function playEvents(events) {
      replayerEmpty.style.display = 'none'
      replayerEl.style.display = 'block'
      replayerEl.innerHTML = ''

      try {
        new rrwebPlayer({
          target: replayerEl,
          props: {
            events,
            width: replayerEl.offsetWidth,
            height: replayerEl.offsetHeight,
            autoPlay: true
          }
        })
      } catch (err) {
        replayerEl.style.display = 'none'
        replayerEmpty.style.display = 'flex'
        replayerEmpty.textContent = '回放失败: ' + err.message
      }
    }

    // 监听主进程发来的 URL 加载事件
    api.on('debugger:load-url', (url) => {
      if (embeddedWebview) {
        embeddedWebview.loadURL(url)
      }
    })

    // 监听内嵌 webview 获取 webContentsId
    embeddedWebview.addEventListener('did-finish-load', () => {
      embeddedWcId = embeddedWebview.getWebContentsId?.() ?? null
      if (targetSelect.value === EMBEDDED_WC_OPTION) {
        currentWcId = embeddedWcId
      }
    })

    // 初始化
    refreshTabs()
    setStatus('就绪')
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add electron/debugger-window.html
git commit -m "feat(debugger): add debugger window HTML with rrweb-player"
```

---

## 批次三：构建配置与入口集成

### Task 5: 配置构建入口

**Files:**
- Modify: `electron.vite.config.ts` (添加 debugger-preload 构建入口)
- Modify: `electron-builder.json` (如有必要，确保 HTML 文件被包含)

- [ ] **Step 1: 读取 electron.vite.config.ts，确认 preload 构建配置**

需要读取文件后确定具体修改方式。目标是将 `electron/debugger-preload.ts` 编译到 `out/debugger-preload/index.js`。

- [ ] **Step 2: 修改构建配置**

根据 electron-vite 的多入口方式，在 preload 配置中添加额外入口，使 `debugger-preload.ts` 被编译输出。

同时确保 `debugger-window.html` 作为静态资源被复制到输出目录。可能需要在 build 配置中添加 `extraResources` 或使用 `public` 目录。

- [ ] **Step 3: 验证构建**

```bash
pnpm build
```

确认输出目录包含 `debugger-preload/index.js` 和 `debugger-window.html`。

- [ ] **Step 4: Commit**

```bash
git add electron.vite.config.ts
git commit -m "feat(debugger): add build config for debugger preload and HTML"
```

---

## 批次四：UI 入口与集成测试

### Task 6: 在 RightPanel 添加入口按钮

**Files:**
- Modify: `src/components/common/RightPanel.vue`

- [ ] **Step 1: 添加 Bug 图标按钮**

在 `RightPanel.vue` 的 script setup 部分添加导入和函数：

```typescript
// 在 import 区域添加
import { Bug } from 'lucide-vue-next'

// 在 openFullPage 函数后添加
function openDebugger() {
  window.api.debugger?.createWindow?.()
}
```

在模板区域一（区域一底部，AI 聊天按钮之前）添加按钮：

```vue
<!-- 网页调试 -->
<Button
  variant="ghost"
  size="icon"
  class="h-8 w-8"
  @click="openDebugger"
>
  <Bug class="h-4 w-4" />
</Button>
```

- [ ] **Step 2: 在 preload 中暴露 debugger API**

在 `preload/index.ts` 的 `api` 对象中添加：

```typescript
debugger: {
  createWindow: (): Promise<any> => ipcRenderer.invoke('debugger:create-window'),
},
```

- [ ] **Step 3: Commit**

```bash
git add src/components/common/RightPanel.vue preload/index.ts
git commit -m "feat(debugger): add entry button in RightPanel and preload API"
```

---

### Task 7: 端到端验证

- [ ] **Step 1: 启动开发模式**

```bash
pnpm dev
```

- [ ] **Step 2: 验证流程**

1. 点击右侧面板的 Bug 按钮 → 调试窗口应弹出
2. 在 Select 中选择一个已打开的标签页
3. 点击"注入" → 状态显示"注入成功"
4. 点击"开始录制" → 状态显示"录制中"
5. 在目标页面进行操作
6. 点击"停止录制" → 回放区域自动播放
7. 点击"导出" → 弹出文件保存对话框

- [ ] **Step 3: 验证内嵌 WebView 模式**

1. 选择"内嵌 WebView"
2. 输入 URL 并加载
3. 注入 → 开始录制 → 操作 → 停止录制 → 回放

- [ ] **Step 4: 验证边界情况**

1. 目标页面导航 → 录制应自动停止
2. 关闭目标标签页 → 录制应自动停止
3. 重复注入 → 应跳过不报错
4. 调试窗口关闭 → 所有录制应停止
