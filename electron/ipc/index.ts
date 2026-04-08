import { ipcMain } from 'electron'
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  listProxies,
  createProxy,
  updateProxy,
  deleteProxy,
  listTabs,
  createTab,
  updateTab,
  deleteTab,
  reorderTabs,
  saveTabs
} from '../services/store'
import type { Account, Group, Proxy, Tab } from '../services/store'

/**
 * 注册所有 IPC 处理器
 * 在 app ready 后调用
 */
export function registerIpcHandlers(): void {
  // ====== 分组 ======
  ipcMain.handle('group:list', () => listGroups())

  ipcMain.handle('group:create', (_e, name: string) => createGroup(name))

  ipcMain.handle('group:update', (_e, id: string, data: Partial<Omit<Group, 'id'>>) =>
    updateGroup(id, data)
  )

  ipcMain.handle('group:delete', (_e, id: string) => deleteGroup(id))

  ipcMain.handle('group:reorder', (_e, groupIds: string[]) => reorderGroups(groupIds))

  // ====== 账号 ======
  ipcMain.handle('account:list', () => listAccounts())

  ipcMain.handle('account:create', (_e, data: Omit<Account, 'id'>) => createAccount(data))

  ipcMain.handle('account:update', (_e, id: string, data: Partial<Omit<Account, 'id'>>) =>
    updateAccount(id, data)
  )

  ipcMain.handle('account:delete', (_e, id: string) => deleteAccount(id))

  // ====== 代理 ======
  ipcMain.handle('proxy:list', () => listProxies())

  ipcMain.handle('proxy:create', (_e, data: Omit<Proxy, 'id'>) => createProxy(data))

  ipcMain.handle('proxy:update', (_e, id: string, data: Partial<Omit<Proxy, 'id'>>) =>
    updateProxy(id, data)
  )

  ipcMain.handle('proxy:delete', (_e, id: string) => deleteProxy(id))

  // ====== Tab（基础 CRUD，WebContentsView 相关在 Phase 6 扩展） ======
  ipcMain.handle('tab:list', () => listTabs())

  ipcMain.handle('tab:create', (_e, data: Omit<Tab, 'id'>) => createTab(data))

  ipcMain.handle('tab:update', (_e, id: string, data: Partial<Omit<Tab, 'id'>>) =>
    updateTab(id, data)
  )

  ipcMain.handle('tab:delete', (_e, id: string) => deleteTab(id))

  ipcMain.handle('tab:reorder', (_e, tabIds: string[]) => reorderTabs(tabIds))

  ipcMain.handle('tab:save-all', (_e, tabs: Tab[]) => saveTabs(tabs))
}
