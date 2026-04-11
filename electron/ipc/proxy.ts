import { ipcMain } from 'electron'
import {
  listProxies,
  createProxy,
  updateProxy,
  deleteProxy,
  getProxyById,
  listContainers,
  getGroupById
} from '../services/store'
import { testProxy, applyProxyToSession } from '../services/proxy'
import { webviewManager } from '../services/webview-manager'
import type { Proxy } from '../services/store'

function describeProxy(proxy: Omit<Proxy, 'id'> | Proxy): Record<string, unknown> {
  return {
    name: proxy.name,
    proxyMode: proxy.proxyMode ?? 'global',
    type: proxy.type ?? '',
    host: proxy.host ?? '',
    port: proxy.port ?? '',
    username: proxy.username ?? '',
    passwordLength: proxy.password?.length ?? 0,
    pacScriptLength: proxy.pacScript?.length ?? 0,
    pacUrl: proxy.pacUrl ?? ''
  }
}

export function registerProxyIpcHandlers(): void {
  ipcMain.handle('proxy:list', () => listProxies())

  ipcMain.handle('proxy:create', (_e, data: Omit<Proxy, 'id'>) => createProxy(data))

  ipcMain.handle('proxy:update', async (_e, id: string, data: Partial<Omit<Proxy, 'id'>>) => {
    updateProxy(id, data)
    await hotUpdateProxy(id)
  })

  ipcMain.handle('proxy:delete', async (_e, id: string) => {
    await hotUpdateProxy(id, true)
    deleteProxy(id)
  })

  ipcMain.handle('proxy:test', async (_e, proxyId: string) => {
    const proxy = getProxyById(proxyId)
    if (!proxy) return { ok: false, error: '代理不存在' }

    console.log('[ProxyIPC] test saved proxy', {
      proxyId,
      ...describeProxy(proxy)
    })

    return testProxy(proxy)
  })

  ipcMain.handle('proxy:test-config', async (_e, config: Omit<Proxy, 'id'>) => {
    console.log('[ProxyIPC] test transient proxy config', describeProxy(config))
    return testProxy({ ...config, id: '__test__' })
  })
}

async function hotUpdateProxy(proxyId: string, isDelete = false): Promise<void> {
  const proxy = isDelete ? null : getProxyById(proxyId)
  const containers = listContainers()

  for (const container of containers) {
    const effectiveProxyId = container.proxyId ?? getGroupById(container.groupId)?.proxyId
    if (effectiveProxyId !== proxyId) continue

    const partition = `persist:container-${container.id}`
    const { session } = await import('electron')
    const ses = session.fromPartition(partition)

    // 代理被禁用、被删除、或容器未开启自动代理 → 移除代理
    const shouldApply = proxy && proxy.enabled !== false && container.autoProxyEnabled === true

    console.log('[ProxyIPC] hot update decision', {
      proxyId,
      containerId: container.id,
      'proxy.enabled': proxy?.enabled,
      'container.autoProxyEnabled': container.autoProxyEnabled,
      shouldApply
    })

    console.log('[ProxyIPC] hot update proxy', {
      proxyId,
      containerId: container.id,
      partition,
      isDelete,
      hasProxy: !!proxy,
      proxyEnabled: proxy?.enabled !== false,
      autoProxyEnabled: container.autoProxyEnabled ?? false,
      shouldApply
    })

    await applyProxyToSession(ses, shouldApply ? proxy : null)

    const tabIds = webviewManager.getTabIdsByContainer(container.id)
    for (const tabId of tabIds) {
      void webviewManager.refreshProxyInfo(tabId)
      webviewManager.reload(tabId)
    }
  }
}
