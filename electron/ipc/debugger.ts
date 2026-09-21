import { app, ipcMain, dialog, webContents } from 'electron'
import { join } from 'path'
import { mkdir, readdir, readFile, writeFile, unlink } from 'fs/promises'
import {
  injectActionRecorder,
  startActionRecording,
  stopActionRecording,
  getActionRun,
  clearActionRunSteps,
  type ActionRun
} from '../services/action-recorder'
import { playActionRun, stopActionPlay } from '../services/action-player'
import { webviewManager } from '../services/webview-manager'
import { getPageById, listTabs } from '../services/store'

let activePlayId: string | null = null

function sendDebuggerEvent(channel: string, ...args: unknown[]) {
  const mainWindow = webviewManager.getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(`on:${channel}`, ...args)
}

function getActionPresetDir(): string {
  return join(app.getPath('userData'), 'action-presets')
}

function sanitizePresetName(name: string): string {
  return String(name || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'action-preset'
}

function isValidPresetId(id: string): boolean {
  return id.length > 0
    && id.length <= 255
    && id !== '.'
    && id !== '..'
    && !/[<>:"/\\|?*\u0000-\u001f]/u.test(id)
    && !/[. ]$/u.test(id)
}

export function registerDebuggerIpcHandlers(): void {
  function getRuntimeTabTarget(wcId: number) {
    const manager = (global as any).__webviewManager as typeof webviewManager | undefined
    if (!manager) return null

    for (const tab of listTabs()) {
      const wc = manager.getWebContents(tab.id)
      if (!wc || wc.isDestroyed() || wc.id !== wcId) continue
      const viewInfo = manager.getViewInfo(tab.id)
      const page = tab.pageId ? getPageById(tab.pageId) : undefined
      const containerId = viewInfo?.containerId || page?.containerId || ''
      return {
        tab,
        page,
        containerId,
        url: viewInfo?.url || wc.getURL() || tab.url || page?.url || '',
        title: tab.title || wc.getTitle() || tab.url || '未命名',
        partition: containerId ? `persist:container-${containerId}` : 'default'
      }
    }

    return null
  }

  ipcMain.handle('debugger:get-tabs', () => {
    const manager = (global as any).__webviewManager as typeof webviewManager | undefined
    if (!manager) return []

    const tabs = listTabs()
    const result: { tabId: string; title: string; url: string; webContentsId: number; partition: string }[] = []

    for (const tab of tabs) {
      const wc = manager.getWebContents(tab.id)
      const viewInfo = manager.getViewInfo(tab.id)
      const page = tab.pageId ? getPageById(tab.pageId) : undefined
      const containerId = viewInfo?.containerId || page?.containerId || ''
      const partition = containerId ? `persist:container-${containerId}` : 'default'
      if (wc && !wc.isDestroyed()) {
        result.push({
          tabId: tab.id,
          title: tab.title || wc.getTitle() || tab.url || '未命名',
          url: viewInfo?.url || wc.getURL() || tab.url || '',
          webContentsId: wc.id,
          partition
        })
      }
    }
    return result
  })

  ipcMain.handle('debugger:get-target-info', (_e, wcId: number) => {
    const wc = webContents.fromId(wcId)
    if (!wc || wc.isDestroyed()) return { success: false, error: '目标 WebContents 不存在或已销毁' }
    const runtimeTarget = getRuntimeTabTarget(wcId)

    return {
      success: true,
      target: {
        webContentsId: wc.id,
        url: runtimeTarget?.url || wc.getURL() || '',
        title: runtimeTarget?.title || wc.getTitle() || '',
        partition: runtimeTarget?.partition || String((wc.session as any)?.partition || 'default')
      }
    }
  })

  ipcMain.handle('debugger:inject-action-recorder', async (_e, wcId: number) => {
    return injectActionRecorder(wcId)
  })

  ipcMain.handle('debugger:start-action-record', async (_e, wcId: number, options?: { eventTypes?: any[] }) => {
    return startActionRecording(wcId, (step) => {
      sendDebuggerEvent('debugger:action-step', step)
    }, { eventTypes: Array.isArray(options?.eventTypes) ? options.eventTypes as any : undefined })
  })

  ipcMain.handle('debugger:highlight-action-step', async (_e, wcId: number, step?: ActionRun['steps'][number] | null) => {
    const wc = webContents.fromId(wcId)
    if (!wc || wc.isDestroyed()) {
      console.warn('[debugger:highlight] target unavailable', { wcId, stepId: step?.id })
      return { success: false, error: '目标 WebContents 不存在或已销毁' }
    }

    console.info('[debugger:highlight] request', {
      wcId,
      pageUrl: wc.getURL(),
      stepId: step?.id || null,
      stepUrl: step?.url || null,
      locator: step?.locator || null
    })

    try {
      const result = await wc.executeJavaScript(`
        (() => {
          const overlayId = '__sessionbox_action_highlight__';
          document.getElementById(overlayId)?.remove();
          const step = ${JSON.stringify(step || null)};
          if (!step) return { found: false, cleared: true, pageUrl: location.href };
          if (!step.locator) return { found: false, reason: 'missing-locator', pageUrl: location.href, attempts: [] };

          const locator = step.locator;
          let element = null;
          let strategy = '';
          const attempts = [];
          const select = (name, finder) => {
            if (element) return;
            try {
              element = finder();
              attempts.push({ strategy: name, matched: !!element });
              if (element) strategy = name;
            } catch (error) {
              attempts.push({ strategy: name, matched: false, error: String(error) });
            }
          };

          if (locator.css) select('css', () => document.querySelector(locator.css));
          if (locator.testId) select('testId', () => Array.from(document.querySelectorAll('[data-testid], [data-test], [data-cy]'))
            .find((item) => ['data-testid', 'data-test', 'data-cy'].some((name) => item.getAttribute(name) === locator.testId)) || null);
          if (locator.id) select('id', () => document.getElementById(locator.id));
          if (locator.name) select('name', () => Array.from(document.querySelectorAll('[name]')).find((item) => item.getAttribute('name') === locator.name) || null);
          if (locator.xpath) select('xpath', () => document.evaluate(locator.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue);
          if (locator.text) select('text', () => {
            const expected = String(locator.text).trim();
            return Array.from(document.querySelectorAll(locator.tag || 'button, a, input, textarea, select, [role]'))
              .find((item) => String(item.innerText || item.textContent || item.value || '').replace(/\\s+/g, ' ').trim() === expected) || null;
          });
          if (!(element instanceof Element)) return { found: false, reason: 'element-not-found', pageUrl: location.href, attempts };

          element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
          const rect = element.getBoundingClientRect();
          const overlay = document.createElement('div');
          overlay.id = overlayId;
          Object.assign(overlay.style, {
            position: 'fixed',
            left: Math.max(0, rect.left - 2) + 'px',
            top: Math.max(0, rect.top - 2) + 'px',
            width: Math.max(0, rect.width + 4) + 'px',
            height: Math.max(0, rect.height + 4) + 'px',
            border: '2px solid #f59e0b',
            borderRadius: '4px',
            boxSizing: 'border-box',
            background: 'rgba(245, 158, 11, 0.12)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.9), 0 0 0 4px rgba(245,158,11,0.25)',
            pointerEvents: 'none',
            zIndex: '2147483647'
          });
          document.documentElement.appendChild(overlay);
          return {
            found: true,
            strategy,
            pageUrl: location.href,
            attempts,
            tag: element.tagName.toLowerCase(),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          };
        })()
      `)
      console.info('[debugger:highlight] result', { wcId, stepId: step?.id || null, result })
      return { success: true, ...result }
    } catch (error) {
      console.warn('[debugger] highlight action step failed', { wcId, error })
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('debugger:stop-action-record', (_e, wcId: number) => {
    return stopActionRecording(wcId)
  })

  ipcMain.handle('debugger:get-action-run', (_e, wcId: number) => {
    return getActionRun(wcId)
  })

  ipcMain.handle('debugger:clear-action-steps', (_e, wcId: number) => {
    const cleared = clearActionRunSteps(wcId)
    console.info('[debugger:recording] clear steps', { wcId, cleared })
    return { success: true, cleared }
  })

  ipcMain.handle('debugger:export-action-run', async (_e, wcId: number) => {
    const run = getActionRun(wcId)
    if (!run || run.steps.length === 0) return { success: false, error: '没有录制动作' }

    const result = await dialog.showSaveDialog({
      defaultPath: `action-run-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }

    await writeFile(result.filePath, JSON.stringify({
      version: 1,
      type: 'sessionbox-action-run',
      initialUrl: run.initialUrl,
      partition: run.partition,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      steps: run.steps
    }, null, 2), 'utf-8')
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('debugger:play-action-run', async (_e, targetWcId: number, run: ActionRun, options?: { pauseOnError?: boolean; retryCount?: number; retryDelayMs?: number }) => {
    const targetWc = webContents.fromId(targetWcId)
    if (!targetWc || targetWc.isDestroyed()) return { success: false, error: '目标 WebContents 不存在或已销毁' }
    if (!run || !Array.isArray(run.steps)) return { success: false, error: 'ActionRun 无效' }

    playActionRun(targetWc, run, {
      pauseOnError: options?.pauseOnError !== false,
      retryCount: options?.retryCount,
      retryDelayMs: options?.retryDelayMs,
      onState: (state) => {
        activePlayId = state.status === 'running' ? state.playId : activePlayId
        if (state.status !== 'running' && activePlayId === state.playId) activePlayId = null
        sendDebuggerEvent('debugger:action-play-state', state)
      }
    }).catch((error) => {
      sendDebuggerEvent('debugger:action-play-state', {
        playId: activePlayId || '',
        runId: run.id,
        status: 'failed',
        currentIndex: -1,
        total: run.steps.length,
        results: [],
        error: error instanceof Error ? error.message : String(error)
      })
      activePlayId = null
    })

    return { success: true }
  })

  ipcMain.handle('debugger:save-action-preset', async (_e, name: string, run: ActionRun) => {
    if (!run || !Array.isArray(run.steps) || run.steps.length === 0) {
      return { success: false, error: '没有可保存的动作' }
    }

    const safeName = String(name || '').trim()
    if (!safeName) return { success: false, error: '名称不能为空' }

    const dir = getActionPresetDir()
    await mkdir(dir, { recursive: true })
    const now = Date.now()
    const id = `${now}-${sanitizePresetName(safeName)}`
    const filePath = join(dir, `${id}.json`)
    const payload = {
      version: 1,
      type: 'sessionbox-action-preset',
      id,
      name: safeName,
      createdAt: now,
      updatedAt: now,
      initialUrl: run.initialUrl || '',
      partition: run.partition || 'default',
      stepCount: run.steps.length,
      steps: run.steps
    }
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return { success: true, item: { id, name: safeName, createdAt: now, updatedAt: now, stepCount: run.steps.length, path: filePath } }
  })

  ipcMain.handle('debugger:list-action-presets', async () => {
    const dir = getActionPresetDir()
    await mkdir(dir, { recursive: true })
    const entries = await readdir(dir, { withFileTypes: true })
    const items: any[] = []

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const filePath = join(dir, entry.name)
      try {
        const raw = await readFile(filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed.steps)) continue
        items.push({
          id: parsed.id || entry.name.replace(/\.json$/i, ''),
          name: parsed.name || entry.name.replace(/\.json$/i, ''),
          createdAt: Number(parsed.createdAt || 0),
          updatedAt: Number(parsed.updatedAt || parsed.createdAt || 0),
          stepCount: Number(parsed.stepCount || parsed.steps.length || 0),
          initialUrl: parsed.initialUrl || '',
          path: filePath
        })
      } catch (error) {
        console.warn('[debugger-main] failed to read action preset:', filePath, error)
      }
    }

    items.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
    return items
  })

  ipcMain.handle('debugger:update-action-preset', async (_e, id: string, patch: { name?: string; steps?: unknown[]; initialUrl?: string }) => {
    if (!isValidPresetId(id)) return { success: false, error: '录制 ID 无效' }
    const filePath = join(getActionPresetDir(), `${id}.json`)
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf-8'))
      if (patch?.name !== undefined) parsed.name = String(patch.name).trim() || parsed.name
      if (Array.isArray(patch?.steps)) {
        parsed.steps = patch.steps
        parsed.stepCount = patch.steps.length
      }
      if (patch?.initialUrl !== undefined) parsed.initialUrl = String(patch.initialUrl)
      parsed.updatedAt = Date.now()
      await writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf-8')
      return { success: true, item: { id: parsed.id || id, name: parsed.name, updatedAt: parsed.updatedAt, stepCount: parsed.stepCount || parsed.steps.length, initialUrl: parsed.initialUrl || '' } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('debugger:delete-action-preset', async (_e, id: string) => {
    if (!isValidPresetId(id)) return { success: false, error: '录制 ID 无效' }
    try {
      await unlink(join(getActionPresetDir(), `${id}.json`))
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('debugger:load-action-preset', async (_e, id: string) => {
    if (!isValidPresetId(id)) return { success: false, error: '录制 ID 无效' }
    const dir = getActionPresetDir()
    const filePath = join(dir, `${id}.json`)

    try {
      const raw = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed.steps)) return { success: false, error: '动作文件无效' }
      const run: ActionRun = {
        id: parsed.id || `preset_${Date.now()}`,
        partition: parsed.partition || 'default',
        startedAt: Number(parsed.createdAt || Date.now()),
        endedAt: Number(parsed.updatedAt || parsed.createdAt || Date.now()),
        initialUrl: parsed.initialUrl || parsed.steps[0]?.url || '',
        steps: parsed.steps
      }
      return {
        success: true,
        item: {
          id: parsed.id || id,
          name: parsed.name || id,
          createdAt: Number(parsed.createdAt || 0),
          updatedAt: Number(parsed.updatedAt || parsed.createdAt || 0),
          stepCount: Number(parsed.stepCount || parsed.steps.length || 0),
          initialUrl: parsed.initialUrl || ''
        },
        run
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('debugger:stop-action-play', (_e, playId?: string) => {
    if (playId) return stopActionPlay(playId)
    if (!activePlayId) return { success: false, error: '没有正在执行的复原任务' }
    return stopActionPlay(activePlayId)
  })

}
