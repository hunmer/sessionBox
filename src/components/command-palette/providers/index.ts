import type { CommandProvider } from '@/types/command'
import { createBookmarkProvider } from './bookmark'
import { createPageProvider } from './page'
import { createTabProvider } from './tab'
import { createHistoryProvider } from './history'
import { createGlobalCommandProvider } from './global'

interface GlobalCallbacks {
  toggleSidebar: () => void
  openSettings: () => void
}

/** 创建并返回所有已注册的 Provider 列表 */
export function createAllProviders(callbacks: GlobalCallbacks): CommandProvider[] {
  return [
    createGlobalCommandProvider(callbacks),
    createBookmarkProvider(),
    createPageProvider(),
    createTabProvider(),
    createHistoryProvider(),
  ]
}
