import { ipcMain, session, app } from 'electron'
import { join } from 'path'
import { existsSync } from 'node:fs'
import type { Bookmark, BookmarkFolder, Container, Proxy } from '../services/store'
import { upsertContainers, upsertProxies } from '../services/store'
import { upsertBookmarks, upsertBookmarkFolders } from '../services/bookmark-store'
import { getSyncConfig, setSyncConfig, type SyncConfig } from '../services/sync-store'
import {
  containerPartition,
  cookieToSetDetails,
  serializeCookie,
  type SyncCookie,
} from '../services/sync-cookies'

/** 容器图标存储目录（与 ipc/index.ts 一致） */
const iconDir = () => join(app.getPath('userData'), 'container-icons')

/** 远端容器 icon 若为本地图片标识（img:xxx），本机不存在时回落到 emoji */
function localizeContainerIcon(icon: string | undefined): string {
  if (!icon?.startsWith('img:')) return icon || '📦'
  const filePath = join(iconDir(), icon.slice(4))
  return existsSync(filePath) ? icon : '📦'
}

/** 容器同步只接受白名单字段，防止远端数据污染本地结构 */
function sanitizeContainer(item: Container): Container {
  const container: Container = {
    id: item.id,
    name: item.name || '未命名容器',
    icon: localizeContainerIcon(item.icon),
    order: typeof item.order === 'number' ? item.order : 0,
  }
  if (item.proxyId) container.proxyId = item.proxyId
  if (typeof item.autoProxyEnabled === 'boolean') container.autoProxyEnabled = item.autoProxyEnabled
  return container
}

function sanitizeProxy(item: Proxy): Proxy {
  const proxy: Proxy = {
    id: item.id,
    name: item.name || '未命名代理',
    enabled: item.enabled !== false,
  }
  if (item.proxyMode) proxy.proxyMode = item.proxyMode
  if (item.type) proxy.type = item.type
  if (item.host) proxy.host = item.host
  if (typeof item.port === 'number') proxy.port = item.port
  if (item.username) proxy.username = item.username
  if (item.password) proxy.password = item.password
  if (item.pacScript) proxy.pacScript = item.pacScript
  if (item.pacUrl) proxy.pacUrl = item.pacUrl
  return proxy
}

/**
 * 注册数据同步 IPC
 * - 配置存取与连接测试
 * - 容器 cookies 导出/导入（读写对应 partition 的 session）
 * - 容器/代理/书签 保 id upsert 应用
 */
export function registerSyncIpc(): void {
  ipcMain.handle('sync:getConfig', () => getSyncConfig())

  ipcMain.handle('sync:setConfig', (_e, config: SyncConfig) => {
    const merged: SyncConfig = { ...getSyncConfig(), ...config }
    if (!merged.serverUrl) merged.serverUrl = ''
    else merged.serverUrl = merged.serverUrl.trim().replace(/\/+$/, '')
    merged.userId = (merged.userId || '').trim().slice(0, 64)
    setSyncConfig(merged)
    return getSyncConfig()
  })

  /** 测试后端连通性，返回健康信息 */
  ipcMain.handle(
    'sync:testConnection',
    async (_e, serverUrl: string): Promise<{ ok: boolean; version?: number; serverTime?: number; error?: string }> => {
      const base = (serverUrl || '').trim().replace(/\/+$/, '')
      if (!base) return { ok: false, error: '请输入后端地址' }
      try {
        const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8000) })
        const data = (await res.json()) as { ok: boolean; version?: number; serverTime?: number }
        if (!data.ok) return { ok: false, error: '后端响应异常' }
        return { ok: true, version: data.version, serverTime: data.serverTime }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  /** 导出指定容器的全部 cookies（无 domain 的条目无法跨设备还原，跳过） */
  ipcMain.handle('sync:getContainerCookies', async (_e, containerId: string): Promise<SyncCookie[]> => {
    const ses = session.fromPartition(containerPartition(containerId))
    const cookies = await ses.cookies.get({})
    return cookies.filter((cookie) => !!cookie.domain).map(serializeCookie)
  })

  /** 向指定容器导入 cookies（按 domain+path+name 覆盖，不影响其他 cookie） */
  ipcMain.handle(
    'sync:setContainerCookies',
    async (_e, containerId: string, cookies: SyncCookie[]): Promise<{ applied: number; skipped: number }> => {
      const ses = session.fromPartition(containerPartition(containerId))
      let applied = 0
      let skipped = 0
      for (const cookie of cookies) {
        try {
          await ses.cookies.set(cookieToSetDetails(cookie))
          applied++
        } catch {
          skipped++
        }
      }
      return { applied, skipped }
    },
  )

  /** 应用远端容器列表（保 id upsert） */
  ipcMain.handle('sync:applyContainers', (_e, items: Container[]) =>
    upsertContainers((items || []).map(sanitizeContainer)),
  )

  /** 应用远端代理列表（保 id upsert） */
  ipcMain.handle('sync:applyProxies', (_e, items: Proxy[]) =>
    upsertProxies((items || []).map(sanitizeProxy)),
  )

  /** 应用远端书签 + 文件夹（保 id upsert） */
  ipcMain.handle(
    'sync:applyBookmarks',
    (_e, data: { folders: BookmarkFolder[]; bookmarks: Bookmark[] }) => {
      const folders = upsertBookmarkFolders((data?.folders || []).filter((f) => f && f.id))
      const bookmarks = upsertBookmarks((data?.bookmarks || []).filter((b) => b && b.id && b.url))
      return { folders, bookmarks }
    },
  )
}
