import { defineStore } from 'pinia'
import { db, MAX_HISTORY, type HistoryEntry } from '@/lib/db'

export const useHistoryStore = defineStore('history', () => {
  /** 添加一条浏览历史记录 */
  async function addHistory(url: string, title: string): Promise<void> {
    // 过滤非网页 URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) return

    await db.history.add({ url, title, time: Date.now() })

    // 超限时删除最早的记录
    const count = await db.history.count()
    if (count > MAX_HISTORY) {
      const oldest = await db.history.orderBy('id').limit(count - MAX_HISTORY).toArray()
      await db.history.bulkDelete(oldest.map((e) => e.id!))
    }
  }

  /** 更新最新一条匹配 URL 记录的标题 */
  async function updateTitle(url: string, title: string): Promise<void> {
    const entry = await db.history.where('url').equals(url).reverse().first()
    if (entry && entry.id) {
      await db.history.update(entry.id, { title })
    }
  }

  /** 删除单条记录 */
  async function removeHistory(id: number): Promise<void> {
    await db.history.delete(id)
  }

  /** 清空所有历史记录 */
  async function clearHistory(): Promise<void> {
    await db.history.clear()
  }

  /** 获取指定日期范围的历史记录（按时间倒序） */
  async function getHistoryByRange(startMs: number, endMs: number): Promise<HistoryEntry[]> {
    return db.history.where('time').between(startMs, endMs, true, false).reverse().toArray()
  }

  /** 搜索历史记录（按标题和 URL 模糊匹配，限制返回数量） */
  async function searchHistory(query: string, limit = 100): Promise<HistoryEntry[]> {
    const q = query.toLowerCase()
    const all = await db.history.orderBy('time').reverse().limit(MAX_HISTORY).toArray()
    return all.filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)).slice(0, limit)
  }

  /** 获取最近的历史记录 */
  async function getRecentHistory(limit = 100): Promise<HistoryEntry[]> {
    return db.history.orderBy('time').reverse().limit(limit).toArray()
  }

  return {
    addHistory,
    updateTitle,
    removeHistory,
    clearHistory,
    getHistoryByRange,
    searchHistory,
    getRecentHistory
  }
})
