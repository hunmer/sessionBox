import type { Session, WebContentsView } from 'electron'

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
  view: WebContentsView
  tabId: string
  pageId: string
  containerId: string
  lastActiveAt: number
  willDownloadHandler?: (...args: any[]) => void
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
}
