/**
 * ai-proxy-tools.ts -- 从 ai-proxy.ts 提取的工具执行子函数。
 * 包含窗口操作、浏览器交互、页面感知、技能管理、标签页创建等工具实现。
 */
import { BrowserWindow, app, webContents } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { listTabs, createTab, listPages, getPageById, getGroupById } from './store'
import { webviewManager } from './webview-manager'
import { extractPageSummary, extractPageMarkdown, extractInteractiveNodes, extractInteractiveNodeDetail } from './page-extractor'
import { writeSkill, readSkill, listSkills, searchSkill } from './skill-store'

/** 获取 webContents */
function getWebContentsFromManager(tabId?: string): Electron.WebContents | null {
  if (!tabId) {
    tabId = webviewManager.getActiveTabId() ?? undefined
  }
  if (!tabId) return null
  return webviewManager.getWebContents?.(tabId) ?? null
}

/** 检查页面是否可用于内容提取（内部页面、未加载完成） */
export function checkPageAvailable(wc: Electron.WebContents): { error: string } | null {
  const url = wc.getURL()
  if (
    url.startsWith('sessionbox://') ||
    url === 'about:blank' ||
    url.startsWith('chrome-error://') ||
    url === ''
  ) {
    return { error: 'Cannot extract content from internal pages' }
  }
  if (wc.isLoading()) {
    return { error: 'Page is still loading' }
  }
  return null
}

/** CSS 选择器转义 */
export function cssEscape(selector: string): string {
  return selector.replace(/'/g, "\\'")
}

/** 执行创建标签页工具 */
export function executeCreateTab(args: Record<string, unknown>): Record<string, unknown> {
  const url = (args.url as string) || 'https://www.baidu.com'
  const active = args.active !== false
  const pageId = (args.pageId as string) || null
  let workspaceId = args.workspaceId as string | undefined
  const tabs = listTabs()
  if (!workspaceId) {
    const activeTabId = webviewManager.getActiveTabId()
    if (activeTabId) {
      const activeTab = tabs.find((t) => t.id === activeTabId)
      if (activeTab?.pageId) {
        const page = getPageById(activeTab.pageId)
        if (page?.groupId) {
          const group = getGroupById(page.groupId)
          workspaceId = group?.workspaceId
        }
      }
    }
  }
  const order = tabs.reduce((max, t) => Math.max(max, t.order), -1) + 1
  const mainWindow = webviewManager.getMainWindow()
  if (pageId) {
    const page = getPageById(pageId)
    if (!page) return { error: `页面 ${pageId} 不存在` }
    const tabUrl = url || page.url
    const tab = createTab({ pageId, title: page.name, url: tabUrl, order })
    webviewManager.registerPendingView(tab.id, pageId, page.containerId || '', tabUrl)
    mainWindow?.webContents.send('on:tab:created', tab)
    if (active) webviewManager.switchView(tab.id)
    return {
      success: true, mode: 'tab', tabId: tab.id, pageId,
      containerId: page.containerId || undefined, title: tab.title, url: tabUrl, workspaceId,
    }
  }
  const containerId = (args.containerId as string) || ''
  const tab = createTab({ pageId: '', title: '新标签页', url, order, workspaceId })
  webviewManager.registerPendingView(tab.id, '', containerId, url)
  mainWindow?.webContents.send('on:tab:created', tab)
  if (active) webviewManager.switchView(tab.id)
  return {
    success: true, mode: 'tab', tabId: tab.id, pageId: '',
    containerId: containerId || undefined, title: tab.title, url, workspaceId,
  }
}

/** 执行窗口操作工具 */
export async function executeWindowTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'create_window': {
      const url = (args.url as string) || 'about:blank'
      const pageId = (args.pageId as string) || null
      const containerId = (args.containerId as string) || ''
      const title = (args.title as string) || (pageId ? (getPageById(pageId)?.name ?? '新窗口') : '新窗口')
      const width = (args.width as number) || 1280
      const height = (args.height as number) || 800
      const resolvedContainerId = pageId ? (getPageById(pageId)?.containerId || '') : containerId
      const partition = resolvedContainerId ? `persist:container-${resolvedContainerId}` : undefined
      const win = new BrowserWindow({
        width, height, show: false, autoHideMenuBar: true, title,
        webPreferences: { partition, sandbox: false },
      })
      win.loadURL(url)
      win.once('ready-to-show', () => win.show())
      return { success: true, windowId: win.id, title, url, containerId: resolvedContainerId || undefined }
    }
    case 'navigate_window': {
      const windowId = args.windowId as number | undefined
      const url = args.url as string
      if (windowId == null || !url) return { error: 'windowId and url are required' }
      const win = BrowserWindow.getAllWindows().find(w => w.id === windowId)
      if (!win || win.isDestroyed()) return { error: `Window ${windowId} not found` }
      void win.webContents.loadURL(url)
      return { success: true, windowId, url }
    }
    case 'close_window': {
      const windowId = args.windowId as number | undefined
      if (windowId == null) return { error: 'windowId is required' }
      const win = BrowserWindow.getAllWindows().find(w => w.id === windowId)
      if (!win || win.isDestroyed()) return { error: `Window ${windowId} not found` }
      win.close()
      return { success: true, windowId }
    }
    case 'list_windows':
      return BrowserWindow.getAllWindows().map(w => ({
        windowId: w.id, title: w.getTitle(), url: w.webContents.getURL(),
        width: w.getBounds().width, height: w.getBounds().height,
        isMaximized: w.isMaximized(), isMain: w === webviewManager.getMainWindow(),
      }))
    case 'focus_window': {
      const windowId = args.windowId as number | undefined
      if (windowId == null) return { error: 'windowId is required' }
      const win = BrowserWindow.getAllWindows().find(w => w.id === windowId)
      if (!win || win.isDestroyed()) return { error: `Window ${windowId} not found` }
      if (win.isMinimized()) win.restore()
      win.focus()
      return { success: true, windowId }
    }
    case 'screenshot_window': {
      const windowId = args.windowId as number | undefined
      if (windowId == null) return { error: 'windowId is required' }
      const win = BrowserWindow.getAllWindows().find(w => w.id === windowId)
      if (!win || win.isDestroyed()) return { error: `Window ${windowId} not found` }
      try {
        const image = await win.webContents.capturePage()
        if (image.isEmpty()) return { error: 'Window content is empty' }
        const jpeg = image.toJPEG(80)
        const size = image.getSize()
        const filename = `screenshot-window-${windowId}-${Date.now()}.jpg`
        const screenshotDir = join(app.getPath('userData'), 'ai-screenshots')
        mkdirSync(screenshotDir, { recursive: true })
        writeFileSync(join(screenshotDir, filename), jpeg)
        return {
          _isImageContent: true, url: `screenshot://${filename}`,
          mediaType: 'image/jpeg', data: jpeg.toString('base64'), width: size.width, height: size.height,
        }
      } catch (err) {
        return { error: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
    case 'get_window_detail': {
      const windowId = args.windowId as number | undefined
      if (windowId == null) return { error: 'windowId is required' }
      const win = BrowserWindow.getAllWindows().find(w => w.id === windowId)
      if (!win || win.isDestroyed()) return { error: `Window ${windowId} not found` }
      return {
        windowId: win.id, title: win.getTitle(), url: win.webContents.getURL(), bounds: win.getBounds(),
        isMaximized: win.isMaximized(), isMinimized: win.isMinimized(),
        isFullScreen: win.isFullScreen(), isFocused: win.isFocused(),
        isMain: win === webviewManager.getMainWindow(),
      }
    }
  }
}

/** 执行浏览器交互工具（需要 CDP / executeJavaScript） */
export async function executeBrowserTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const wc = getWebContentsFromManager(args.tabId as string | undefined)
  if (!wc) return { error: 'Tab not found' }
  switch (name) {
    case 'click_element': {
      if (!args.selector || typeof args.selector !== 'string') return { error: 'selector is required' }
      await wc.executeJavaScript(`document.querySelector('${cssEscape(args.selector)}')?.click()`)
      return { success: true }
    }
    case 'input_text': {
      if (!args.text || typeof args.text !== 'string') return { error: 'text is required' }
      const text = (args.text as string).replace(/'/g, "\\'")
      const selector = args.selector as string | undefined
      if (selector) {
        await wc.executeJavaScript(`const el = document.querySelector('${cssEscape(selector)}'); if (el) { el.focus(); el.value = '${text}'; el.dispatchEvent(new Event('input', { bubbles: true })) }`)
      } else {
        await wc.executeJavaScript(`const el = document.activeElement; if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) { if (el.isContentEditable) { el.textContent += '${text}' } else { el.value += '${text}'; el.dispatchEvent(new Event('input', { bubbles: true })) } }`)
      }
      return { success: true }
    }
    case 'scroll_page': {
      const amount = (args.amount as number) || 300
      const scrollMap: Record<string, string> = {
        up: `window.scrollBy(0, -${amount})`, down: `window.scrollBy(0, ${amount})`,
        left: `window.scrollBy(-${amount}, 0)`, right: `window.scrollBy(${amount}, 0)`,
      }
      await wc.executeJavaScript(scrollMap[args.direction as string] ?? '')
      return { success: true }
    }
    case 'get_page_content': {
      try {
        const content = await wc.executeJavaScript('document.body.innerText')
        return { content }
      } catch (err) {
        return { error: `Failed to get page content: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
    case 'get_dom': {
      const selector = args.selector as string
      if (!selector) return { error: 'selector is required' }
      try {
        const html = await wc.executeJavaScript(`
          (function() {
            const el = document.querySelector('${cssEscape(selector)}');
            if (!el) return null;
            const clone = el.cloneNode(true);
            clone.querySelectorAll('script, style, noscript, svg, path').forEach(n => n.remove());
            const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
            const comments = [];
            while (walker.nextNode()) comments.push(walker.currentNode);
            comments.forEach(n => n.remove());
            const keepAttrs = {
              '*': ['id', 'class', 'role', 'aria-label', 'aria-expanded', 'aria-selected', 'aria-checked', 'aria-disabled', 'placeholder', 'type', 'name', 'value', 'href', 'src', 'alt', 'title', 'disabled', 'readonly', 'required', 'checked', 'selected'],
              'input': ['type', 'name', 'value', 'placeholder', 'disabled', 'readonly', 'required', 'checked'],
              'a': ['href', 'target'], 'img': ['src', 'alt'], 'form': ['action', 'method'], 'option': ['value', 'selected'],
            };
            const globalSet = new Set(keepAttrs['*']);
            clone.querySelectorAll('*').forEach(node => {
              const tagAttrs = keepAttrs[node.tagName.toLowerCase()] || [];
              const allowed = new Set([...globalSet, ...tagAttrs]);
              [...node.attributes].forEach(attr => { if (!allowed.has(attr.name)) node.removeAttribute(attr.name); });
            });
            let raw = clone.outerHTML;
            const txt = document.createElement('textarea');
            for (let i = 0; i < 2; i++) { txt.innerHTML = raw; raw = txt.value; }
            raw = raw.replace(/\\s+/g, ' ').replace(/\\s*>/g, '>').replace(/<\\s*/g, '<');
            return raw;
          })()
        `)
        if (!html) return { error: `Element not found: ${selector}` }
        return { html }
      } catch (err) {
        return { error: `Failed to get DOM: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
    case 'get_page_screenshot': {
      try {
        const image = await wc.capturePage()
        if (image.isEmpty()) return { error: 'Page is empty or not loaded' }
        const jpeg = image.toJPEG(80)
        const size = image.getSize()
        const filename = `screenshot-${Date.now()}.jpg`
        const screenshotDir = join(app.getPath('userData'), 'ai-screenshots')
        mkdirSync(screenshotDir, { recursive: true })
        writeFileSync(join(screenshotDir, filename), jpeg)
        return {
          _isImageContent: true, url: `screenshot://${filename}`,
          mediaType: 'image/jpeg', data: jpeg.toString('base64'), width: size.width, height: size.height,
        }
      } catch (err) {
        return { error: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
    case 'select_option': {
      if (!args.selector || typeof args.selector !== 'string') return { error: 'selector is required' }
      if (!args.value || typeof args.value !== 'string') return { error: 'value is required' }
      const selector = args.selector as string
      const value = (args.value as string).replace(/'/g, "\\'")
      await wc.executeJavaScript(`const el = document.querySelector('${cssEscape(selector)}'); if (el) { el.value = '${value}'; el.dispatchEvent(new Event('change', { bubbles: true })) }`)
      return { success: true }
    }
    case 'hover_element': {
      if (!args.selector || typeof args.selector !== 'string') return { error: 'selector is required' }
      const selector = args.selector as string
      await wc.executeJavaScript(`const el = document.querySelector('${cssEscape(selector)}'); if (el) { el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) }`)
      return { success: true }
    }
  }
}

/** 执行页面感知工具 */
export async function executePageTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const wc = getWebContentsFromManager(args.tabId as string | undefined)
  if (!wc) return { error: 'Tab not found' }
  const pageCheck = checkPageAvailable(wc)
  if (pageCheck) return pageCheck
  try {
    switch (name) {
      case 'get_page_summary':
        return await extractPageSummary(wc)
      case 'get_page_markdown':
        return await extractPageMarkdown(wc, (args.maxLength as number) || 10000)
      case 'get_interactive_nodes':
        return await extractInteractiveNodes(wc, args.viewportOnly !== false)
      case 'get_interactive_node_detail': {
        const selector = args.selector as string
        if (!selector) return { error: 'selector is required' }
        return await extractInteractiveNodeDetail(wc, selector)
      }
    }
  } catch (err) {
    return { error: `Failed to ${name}: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** 执行技能管理工具 */
export function executeSkillTool(name: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (name) {
    case 'write_skill': {
      const skillName = args.name as string, skillDesc = args.description as string, skillContent = args.content as string
      if (!skillName || !skillDesc || !skillContent) return { error: 'name, description, content 均为必填' }
      try {
        const skill = writeSkill(skillName, skillDesc, skillContent)
        return { success: true, name: skill.name, message: `Skill "${skill.name}" 已保存` }
      } catch (err) {
        return { error: `保存失败: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
    case 'read_skill': {
      const skillName = args.name as string
      if (!skillName) return { error: 'name 为必填' }
      const skill = readSkill(skillName)
      if (!skill) return { error: `Skill "${skillName}" 不存在` }
      return { name: skill.name, description: skill.description, content: skill.content, updated: skill.updated }
    }
    case 'list_skills':
      return { skills: listSkills(), total: listSkills().length }
    case 'search_skill': {
      const query = args.name as string
      if (!query) return { error: 'name (搜索关键词) 为必填' }
      const results = searchSkill(query)
      return { skills: results, total: results.length }
    }
  }
  return { error: `Unknown skill tool: ${name}` }
}

/** 执行 JS 注入工具 */
export async function executeInjectJs(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const wcId = args.webContentId as number
  if (!wcId) return { error: 'webContentId is required' }
  if (!args.code || typeof args.code !== 'string') return { error: 'code is required' }
  try {
    const wc = webContents.fromId(wcId)
    if (!wc || wc.isDestroyed()) return { error: `WebContents not found or destroyed: ${wcId}` }
    const result = await wc.executeJavaScript(args.code as string)
    return { success: true, result }
  } catch (err) {
    return { error: `JS execution failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}
