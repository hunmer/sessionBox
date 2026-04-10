import Dexie, { type Table } from 'dexie'

/** 浏览历史记录条目 */
export interface HistoryEntry {
  id?: number
  url: string
  title: string
  time: number
}

class HistoryDB extends Dexie {
  history!: Table<HistoryEntry, number>

  constructor() {
    super('sessionbox-history')
    this.version(1).stores({
      history: '++id, url, time'
    })
  }
}

export const db = new HistoryDB()

/** 历史记录最大条数 */
export const MAX_HISTORY = 10000
