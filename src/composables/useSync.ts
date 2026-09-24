/**
 * 数据同步编排（渲染进程执行，因为历史记录存于渲染进程 IndexedDB）
 *
 * 流程：对每个启用的类型 —— 采集本地 → 拉取远端 → 合并 → 应用本地 → 推回远端。
 * 类型间互不影响，单个失败不中断其他类型。
 */
import { db, MAX_HISTORY } from '@/lib/db'
import {
  mergeById,
  mergeContainerCookies,
  mergeHistory,
  type BookmarksPayload,
  type ContainersPayload,
  type SyncCookieItem,
  type SyncExtensionItem,
  type SyncHistoryEntry,
} from '@/lib/sync-merge'

const api = window.api

export type SyncTypeKey = 'bookmarks' | 'history' | 'extensions' | 'plugins' | 'proxies' | 'containers'

export interface SyncTypeResult {
  type: SyncTypeKey
  status: 'ok' | 'error'
  message: string
}

export interface SyncRunResult {
  ok: boolean
  results: SyncTypeResult[]
}

interface RemoteRecord {
  ok: boolean
  updatedAt: number
  payload: unknown
}

const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function remoteUrl(config: { serverUrl: string; userId: string }, type: SyncTypeKey): string {
  return `${config.serverUrl}/api/${encodeURIComponent(config.userId)}/${type}`
}

async function fetchRemote(config: { serverUrl: string; userId: string }, type: SyncTypeKey): Promise<RemoteRecord | null> {
  const res = await fetch(remoteUrl(config, type), { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`服务端返回 ${res.status}`)
  return (await res.json()) as RemoteRecord
}

async function pushRemote(config: { serverUrl: string; userId: string }, type: SyncTypeKey, payload: unknown): Promise<void> {
  const res = await fetch(remoteUrl(config, type), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`服务端返回 ${res.status}`)
}

/** 各类型同步实现，返回人类可读的结果描述 */
const typeSyncers: Record<SyncTypeKey, (config: { serverUrl: string; userId: string }, lastSyncAt: number) => Promise<string>> = {
  async bookmarks(config, lastSyncAt) {
    const remote = await fetchRemote(config, 'bookmarks')
    const remotePayload = (remote?.payload ?? { folders: [], bookmarks: [] }) as BookmarksPayload
    const localFolders = await api.bookmarkFolder.list()
    const localBookmarks = await api.bookmark.list()
    const preferRemote = (remote?.updatedAt ?? 0) > lastSyncAt

    const merged = {
      folders: mergeById(localFolders, remotePayload.folders ?? [], preferRemote),
      bookmarks: mergeById(localBookmarks, remotePayload.bookmarks ?? [], preferRemote),
    }
    await api.sync.applyBookmarks(merged)
    await pushRemote(config, 'bookmarks', merged)
    return `书签 ${merged.bookmarks.length} 条 / 文件夹 ${merged.folders.length} 个`
  },

  async history(config, lastSyncAt) {
    const remote = await fetchRemote(config, 'history')
    const remotePayload = ((remote?.payload ?? []) as SyncHistoryEntry[])
    const localEntries = await db.history.orderBy('time').reverse().limit(MAX_HISTORY).toArray()
    const local = localEntries.map(({ url, title, time }) => ({ url, title, time }))
    void lastSyncAt // 历史按 url+time 去重合并，无需冲突取舍

    const merged = mergeHistory(local, remotePayload, MAX_HISTORY)
    await db.history.clear()
    if (merged.length) await db.history.bulkAdd(merged)
    await pushRemote(config, 'history', merged)
    return `历史记录 ${merged.length} 条`
  },

  async extensions(config, lastSyncAt) {
    const remote = await fetchRemote(config, 'extensions')
    const remotePayload = ((remote?.payload ?? []) as SyncExtensionItem[])
    const localList = await api.extension.list()
    const localItems: SyncExtensionItem[] = localList.map((e) => ({ id: e.id, name: e.name, enabled: e.enabled }))
    const preferRemote = (remote?.updatedAt ?? 0) > lastSyncAt

    const merged = mergeById(localItems, remotePayload, preferRemote)
    const localById = new Map(localList.map((e) => [e.id, e]))
    let applied = 0
    const missing: string[] = []
    for (const item of merged) {
      const local = localById.get(item.id)
      if (!local) {
        missing.push(item.name)
        continue
      }
      if (local.enabled !== item.enabled) await api.extension.update(item.id, { enabled: item.enabled })
      applied++
    }
    await pushRemote(config, 'extensions', merged)
    return `扩展 ID ${merged.length} 个（本机 ${applied}）${missing.length ? `，缺失 ${missing.length} 个：${missing.join('、')}` : ''}`
  },

  async plugins(config, lastSyncAt) {
    const remote = await fetchRemote(config, 'plugins')
    const remotePayload = ((remote?.payload ?? []) as SyncExtensionItem[])
    const localList = await api.plugin.list()
    const localItems: SyncExtensionItem[] = localList.map((p) => ({ id: p.id, name: p.name, enabled: p.enabled }))
    const preferRemote = (remote?.updatedAt ?? 0) > lastSyncAt

    const merged = mergeById(localItems, remotePayload, preferRemote)
    const localById = new Map(localList.map((p) => [p.id, p]))
    let applied = 0
    const missing: string[] = []
    for (const item of merged) {
      const local = localById.get(item.id)
      if (!local) {
        missing.push(item.name)
        continue
      }
      if (local.enabled !== item.enabled) {
        if (item.enabled) await api.plugin.enable(item.id)
        else await api.plugin.disable(item.id)
      }
      applied++
    }
    await pushRemote(config, 'plugins', merged)
    return `插件 ID ${merged.length} 个（本机 ${applied}）${missing.length ? `，缺失 ${missing.length} 个：${missing.join('、')}` : ''}`
  },

  async proxies(config, lastSyncAt) {
    const remote = await fetchRemote(config, 'proxies')
    const remotePayload = ((remote?.payload ?? []) as Array<{ id: string }>)
    const localList = await api.proxy.list()
    const preferRemote = (remote?.updatedAt ?? 0) > lastSyncAt

    const merged = mergeById(localList, remotePayload, preferRemote)
    await api.sync.applyProxies(merged)
    await pushRemote(config, 'proxies', merged)
    return `代理 ${merged.length} 条`
  },

  async containers(config, lastSyncAt) {
    const remote = await fetchRemote(config, 'containers')
    const remotePayload = (remote?.payload ?? { containers: [], cookies: {} }) as ContainersPayload
    const localContainers = await api.container.list()
    const preferRemote = (remote?.updatedAt ?? 0) > lastSyncAt

    const localCookies: Record<string, SyncCookieItem[]> = {}
    for (const container of localContainers) {
      localCookies[container.id] = await api.sync.getContainerCookies(container.id)
    }

    const mergedContainers = mergeById(localContainers, remotePayload.containers ?? [], preferRemote)
    const mergedCookies = mergeContainerCookies(localCookies, remotePayload.cookies ?? {}, preferRemote)

    await api.sync.applyContainers(mergedContainers)
    let cookieApplied = 0
    for (const container of mergedContainers) {
      const cookies = mergedCookies[container.id] ?? []
      if (!cookies.length) continue
      const { applied } = await api.sync.setContainerCookies(container.id, cookies)
      cookieApplied += applied
    }
    await pushRemote(config, 'containers', { containers: mergedContainers, cookies: mergedCookies })
    return `容器 ${mergedContainers.length} 个 / Cookies ${cookieApplied} 条`
  },
}

/** 执行一次完整同步，返回逐类型结果 */
export async function runSync(config: {
  serverUrl: string
  userId: string
  types: Record<SyncTypeKey, boolean>
  lastSyncAt: number
}): Promise<SyncRunResult> {
  if (!config.serverUrl || !config.userId) {
    throw new Error('请先填写后端地址和用户标识符')
  }
  if (!USER_ID_RE.test(config.userId)) {
    throw new Error('用户标识符只能包含字母、数字、下划线和连字符（最长 64 位）')
  }

  const results: SyncTypeResult[] = []
  for (const [type, enabled] of Object.entries(config.types) as Array<[SyncTypeKey, boolean]>) {
    if (!enabled) continue
    try {
      const message = await typeSyncers[type](config, config.lastSyncAt)
      results.push({ type, status: 'ok', message })
    } catch (error) {
      results.push({
        type,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const hasError = results.some((r) => r.status === 'error')
  if (results.length && !hasError) {
    await api.sync.setConfig({ ...config, lastSyncAt: Date.now() })
  }
  return { ok: !hasError, results }
}
