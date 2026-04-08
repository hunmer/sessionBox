import { ipcMain } from 'electron'
import {
  listProxies,
  createProxy,
  updateProxy,
  deleteProxy,
  getProxyById,
  listAccounts,
  getAccountById,
  getGroupById
} from '../services/store'
import { testProxy, buildProxyRules } from '../services/proxy'
import { webviewManager } from '../services/webview-manager'
import type { Proxy } from '../services/store'

/**
 * 注册代理相关 IPC 处理器
 */
export function registerProxyIpcHandlers(): void {
  // 查询代理列表
  ipcMain.handle('proxy:list', () => listProxies())

  // 创建代理
  ipcMain.handle('proxy:create', (_e, data: Omit<Proxy, 'id'>) => createProxy(data))

  // 更新代理 + 热更新受影响的页面
  ipcMain.handle('proxy:update', async (_e, id: string, data: Partial<Omit<Proxy, 'id'>>) => {
    updateProxy(id, data)
    await hotUpdateProxy(id)
  })

  // 删除代理（store 层已处理引用清除）
  ipcMain.handle('proxy:delete', async (_e, id: string) => {
    // 热更新：清除使用该代理的 session 的代理设置
    await hotUpdateProxy(id, true)
    deleteProxy(id)
  })

  // 测试代理
  ipcMain.handle('proxy:test', async (_e, proxyId: string) => {
    const proxy = getProxyById(proxyId)
    if (!proxy) return { ok: false, error: '代理不存在' }
    return testProxy(proxy)
  })

  // 测试代理配置（新建时还没保存，直接传配置测试）
  ipcMain.handle('proxy:test-config', async (_e, config: Omit<Proxy, 'id'>) => {
    return testProxy({ ...config, id: '__test__' })
  })
}

/**
 * 代理热更新：修改代理后，重新应用所有受影响页面的代理设置
 * @param proxyId 代理 ID
 * @param isDelete 是否为删除操作
 */
async function hotUpdateProxy(proxyId: string, isDelete = false): Promise<void> {
  const proxy = isDelete ? null : getProxyById(proxyId)
  const proxyRules = proxy ? buildProxyRules(proxy) : ''

  // 找出所有使用此代理的账号（直接绑定或通过分组绑定）
  const accounts = listAccounts()
  for (const account of accounts) {
    const effectiveProxyId = account.proxyId ?? getGroupById(account.groupId)?.proxyId
    if (effectiveProxyId !== proxyId) continue

    // 重新设置该账号 session 的代理
    const partition = `persist:account-${account.id}`
    const { session } = await import('electron')
    const ses = session.fromPartition(partition)

    if (isDelete || !proxy) {
      // 清除代理
      await ses.setProxy({ proxyRules: '' })
    } else {
      await ses.setProxy({ proxyRules })
    }

    // 刷新所有使用此账号的活跃 tab
    const tabIds = webviewManager.getTabIdsByAccount(account.id)
    for (const tabId of tabIds) {
      webviewManager.reload(tabId)
    }
  }
}
