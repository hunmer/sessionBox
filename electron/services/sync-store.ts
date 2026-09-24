import { join } from 'path'
import { app } from 'electron'
import { JsonStore } from '../utils/json-store'

/** 各数据类型的同步开关 */
export interface SyncTypes {
  bookmarks: boolean
  history: boolean
  extensions: boolean
  plugins: boolean
  proxies: boolean
  /** 容器元数据 + 各容器 cookies */
  containers: boolean
}

export interface SyncConfig {
  /** 后端地址，如 http://192.168.1.5:37400 */
  serverUrl: string
  /** 用户标识符（免密） */
  userId: string
  types: SyncTypes
  /** 上次成功同步时间戳 */
  lastSyncAt: number
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  serverUrl: '',
  userId: '',
  types: {
    bookmarks: true,
    history: true,
    extensions: true,
    plugins: true,
    proxies: true,
    containers: true,
  },
  lastSyncAt: 0,
}

const store = new JsonStore<{ config?: SyncConfig }>(
  join(app.getPath('userData'), 'sync-config.json'),
  {},
)

export function getSyncConfig(): SyncConfig {
  const saved = store.get('config')
  return { ...DEFAULT_SYNC_CONFIG, ...saved, types: { ...DEFAULT_SYNC_CONFIG.types, ...saved?.types } }
}

export function setSyncConfig(config: SyncConfig): void {
  store.set('config', { ...config, types: { ...config.types } })
}
