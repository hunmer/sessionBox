import { ipcMain, BrowserWindow } from 'electron'
import { proxyChatCompletions } from '../services/ai-proxy'

export function registerChatIpcHandlers(): void {
  ipcMain.handle('chat:completions', async (event, params) => {
    const mainWindow = BrowserWindow.fromWebContents(event.sender)
    if (!mainWindow) {
      throw new Error('No main window found')
    }
    // 异步代理，不阻塞 IPC response
    proxyChatCompletions(mainWindow, params).catch((err) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('on:chat:error', {
          requestId: params._requestId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
    return { started: true }
  })

  // ===== 浏览器交互工具（CDP） =====
  ipcMain.handle('browser:click', async (_event, args: { selector?: string; x?: number; y?: number; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    if (args.selector) {
      await wc.executeJavaScript(`document.querySelector('${cssEscape(args.selector)}')?.click()`)
    } else if (args.x !== undefined && args.y !== undefined) {
      await wc.executeJavaScript(`
        const el = document.elementFromPoint(${args.x}, ${args.y})
        if (el) el.click()
      `)
    }
    return { success: true }
  })

  ipcMain.handle('browser:type', async (_event, args: { text: string; selector?: string; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    if (args.selector) {
      const escaped = args.text.replace(/'/g, "\\'")
      await wc.executeJavaScript(`
        const el = document.querySelector('${cssEscape(args.selector!)}')
        if (el) { el.focus(); el.value = '${escaped}'; el.dispatchEvent(new Event('input', { bubbles: true })) }
      `)
    } else {
      const escaped = args.text.replace(/'/g, "\\'")
      await wc.executeJavaScript(`
        const el = document.activeElement
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
          if (el.isContentEditable) { el.textContent += '${escaped}' }
          else { el.value += '${escaped}'; el.dispatchEvent(new Event('input', { bubbles: true })) }
        }
      `)
    }
    return { success: true }
  })

  ipcMain.handle('browser:scroll', async (_event, args: { direction: 'up' | 'down' | 'left' | 'right'; amount: number; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    const scrollMap: Record<string, string> = {
      up: `window.scrollBy(0, -${args.amount})`,
      down: `window.scrollBy(0, ${args.amount})`,
      left: `window.scrollBy(-${args.amount}, 0)`,
      right: `window.scrollBy(${args.amount}, 0)`,
    }
    await wc.executeJavaScript(scrollMap[args.direction] ?? '')
    return { success: true }
  })

  ipcMain.handle('browser:select', async (_event, args: { selector: string; value: string; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    const escapedValue = args.value.replace(/'/g, "\\'")
    await wc.executeJavaScript(`
      const el = document.querySelector('${cssEscape(args.selector)}')
      if (el) { el.value = '${escapedValue}'; el.dispatchEvent(new Event('change', { bubbles: true })) }
    `)
    return { success: true }
  })

  ipcMain.handle('browser:hover', async (_event, args: { selector: string; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    await wc.executeJavaScript(`
      const el = document.querySelector('${cssEscape(args.selector)}')
      if (el) { el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) }
    `)
    return { success: true }
  })

  ipcMain.handle('browser:get-content', async (_event, args: { tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    const content = await wc.executeJavaScript('document.body.innerText')
    return { content }
  })

  ipcMain.handle('browser:get-dom', async (_event, args: { selector: string; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    const html = await wc.executeJavaScript(`
      const el = document.querySelector('${cssEscape(args.selector)}')
      el ? el.outerHTML : null
    `)
    return { html }
  })

  ipcMain.handle('browser:screenshot', async (_event, args: { tabId?: string; format?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    const image = await wc.capturePage()
    const base64 = image.toPNG().toString('base64')
    return { data: base64, format: 'png' }
  })
}

/** CSS 选择器中的特殊字符转义 */
function cssEscape(selector: string): string {
  return selector.replace(/'/g, "\\'")
}

/** 获取指定 tabId 的 webContents */
function getWebContents(tabId?: string): Electron.WebContents | null {
  if (!tabId) return null
  const manager = (global as any).__webviewManager
  if (!manager) return null
  return manager.getWebContents?.(tabId) ?? null
}
