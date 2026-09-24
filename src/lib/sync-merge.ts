/**
 * 数据同步的合并纯函数（无副作用，便于单元测试）
 *
 * 合并策略（MVP）：
 * - 各类型按 id 做并集；同 id 冲突时，若远端快照比本机上次同步新（preferRemote），取远端版本，否则保留本地
 * - 历史记录按 url+time 去重合并，按时间倒序，超出上限截断
 * - cookies 按 容器 → domain|path|name 合并，冲突同样按 preferRemote 决定
 * - 不做删除传播：任一端删除的项目会在下次同步时被另一端"补回"
 */
import type { Bookmark, BookmarkFolder, Container, Proxy } from '../types'

/** 同步用历史条目（本地自增 id 不跨设备稳定，同步时剔除） */
export interface SyncHistoryEntry {
  url: string
  title: string
  time: number
}

export interface SyncExtensionItem {
  id: string
  name: string
  enabled: boolean
}

export interface SyncCookieItem {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  hostOnly?: boolean
  session?: boolean
  expirationDate?: number
  sameSite?: string
}

export interface BookmarksPayload {
  folders: BookmarkFolder[]
  bookmarks: Bookmark[]
}

export interface ContainersPayload {
  containers: Container[]
  cookies: Record<string, SyncCookieItem[]>
}

/** 按 id 并集合并；同 id 冲突按 preferRemote 取舍 */
export function mergeById<T extends { id: string }>(local: T[], remote: T[], preferRemote: boolean): T[] {
  const map = new Map<string, T>()
  for (const item of local) map.set(item.id, item)
  for (const item of remote) {
    if (!map.has(item.id) || preferRemote) map.set(item.id, item)
  }
  return [...map.values()]
}

/** 历史记录按 url+time 去重，时间倒序，限制条数 */
export function mergeHistory(local: SyncHistoryEntry[], remote: SyncHistoryEntry[], limit: number): SyncHistoryEntry[] {
  const seen = new Set<string>()
  const merged: SyncHistoryEntry[] = []
  for (const entry of [...local, ...remote]) {
    const key = `${entry.url}|${entry.time}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({ url: entry.url, title: entry.title, time: entry.time })
  }
  return merged.sort((a, b) => b.time - a.time).slice(0, limit)
}

export function cookieItemKey(cookie: Pick<SyncCookieItem, 'domain' | 'path' | 'name'>): string {
  return `${cookie.domain}|${cookie.path}|${cookie.name}`
}

/** 各容器 cookies 合并：容器取并集，容器内 cookie 按键合并 */
export function mergeContainerCookies(
  local: Record<string, SyncCookieItem[]>,
  remote: Record<string, SyncCookieItem[]>,
  preferRemote: boolean,
): Record<string, SyncCookieItem[]> {
  const result: Record<string, SyncCookieItem[]> = {}
  const containerIds = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const containerId of containerIds) {
    const map = new Map<string, SyncCookieItem>()
    for (const cookie of local[containerId] ?? []) map.set(cookieItemKey(cookie), cookie)
    for (const cookie of remote[containerId] ?? []) {
      const key = cookieItemKey(cookie)
      if (!map.has(key) || preferRemote) map.set(key, cookie)
    }
    result[containerId] = [...map.values()]
  }
  return result
}
