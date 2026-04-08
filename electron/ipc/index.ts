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
  listFavoriteSites,
  createFavoriteSite,
  updateFavoriteSite,
  deleteFavoriteSite
} from '../services/store'
import type { Account, Group, FavoriteSite } from '../services/store'
import { registerTabIpcHandlers } from './tab'
import { registerProxyIpcHandlers } from './proxy'

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

  // ====== 代理（详细处理在 ipc/proxy.ts，含热更新） ======
  registerProxyIpcHandlers()

  // ====== Tab（详细处理在 ipc/tab.ts） ======
  registerTabIpcHandlers()

  // ====== 常用网站 ======
  ipcMain.handle('favoriteSite:list', () => listFavoriteSites())

  ipcMain.handle('favoriteSite:create', (_e, data: Omit<FavoriteSite, 'id'>) =>
    createFavoriteSite(data)
  )

  ipcMain.handle('favoriteSite:update', (_e, id: string, data: Partial<Omit<FavoriteSite, 'id'>>) =>
    updateFavoriteSite(id, data)
  )

  ipcMain.handle('favoriteSite:delete', (_e, id: string) => deleteFavoriteSite(id))
}
