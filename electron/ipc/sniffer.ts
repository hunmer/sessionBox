import { ipcMain } from 'electron'
import { webviewManager } from '../services/webview-manager'
import { getSnifferDomains, addSnifferDomain, removeSnifferDomain } from '../services/store'

export function registerSnifferIpcHandlers(): void {
  // 切换标签页嗅探开关
  ipcMain.handle('sniffer:toggle', (_e, tabId: string, enabled: boolean) => {
    webviewManager.toggleSniffer(tabId, enabled)
  })

  // 添加/移除自动启用域名
  ipcMain.handle('sniffer:setDomainEnabled', (_e, domain: string, enabled: boolean) => {
    if (enabled) {
      addSnifferDomain(domain)
    } else {
      removeSnifferDomain(domain)
    }
  })

  // 获取自动启用域名列表
  ipcMain.handle('sniffer:getDomainList', () => {
    return getSnifferDomains()
  })

  // 清空指定标签页的捕获资源（资源在渲染进程 store，主进程侧无操作）
  ipcMain.handle('sniffer:clearResources', (_e, _tabId: string) => {
    // 资源存储在渲染进程 store 中
  })

  // 获取标签页嗅探状态
  ipcMain.handle('sniffer:getState', (_e, tabId: string) => {
    return {
      enabled: webviewManager.isSnifferEnabled(tabId)
    }
  })
}
