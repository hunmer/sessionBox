import type { Session } from 'electron'
import type { BaseTabView } from './tab-view'

export const BLOCKED_SCHEMES = [
  'bitbrowser',
  'microsoft-edge',
  'thunder',
  'xunlei',
  'ed2k',
  'flashget',
  'qqdl',
  'baidubar',
  'alipays',
  'weixin',
  'tg',
  'zoommtg',
  'teams',
  'slack',
  'discord',
  'spotify',
  'steam',
  'skype',
  'magnet',
  'vb-hyperlink'
]

export interface ViewEntry {
  view: BaseTabView
  tabId: string
  pageId: string
  containerId: string
  lastActiveAt: number
  lastNonAuthUrl?: string
}

export interface FrozenTabInfo {
  url: string
  pageId: string
  containerId: string
  snifferEnabled?: boolean
}

export interface PendingViewInfo {
  url: string
  pageId: string
  containerId: string
  lastNonAuthUrl?: string
}
