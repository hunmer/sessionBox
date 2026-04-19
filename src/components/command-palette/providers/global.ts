import type { CommandProvider, CommandItem } from '@/types/command'
import { Plus, X, PanelLeft, Settings, Bookmark, History, Download } from 'lucide-vue-next'
import { useTabStore } from '@/stores/tab'

export function createGlobalCommandProvider(
  callbacks: {
    toggleSidebar: () => void
    openSettings: () => void
    openNewTabDialog: () => void
  }
): CommandProvider {
  return {
    id: 'global',
    prefix: '',
    label: '命令',
    icon: Settings,
    async search(query: string): Promise<CommandItem[]> {
      const tabStore = useTabStore()
      const q = query.toLowerCase()

      const commands: CommandItem[] = [
        {
          id: 'cmd-new-tab',
          label: '新建标签页',
          icon: Plus,
          shortcut: '⌘T',
          keywords: ['new', 'tab', '新建', '标签'],
          run: () => {
            const pageId = tabStore.activeTab?.pageId
            if (pageId) tabStore.createTab(pageId)
          },
        },
        {
          id: 'cmd-close-tab',
          label: '关闭当前标签页',
          icon: X,
          shortcut: '⌘W',
          keywords: ['close', 'tab', '关闭', '标签'],
          run: () => {
            const tab = tabStore.activeTab
            if (tab) tabStore.closeTab(tab.id)
          },
        },
        {
          id: 'cmd-toggle-sidebar',
          label: '切换侧边栏',
          icon: PanelLeft,
          shortcut: '⌘B',
          keywords: ['sidebar', 'toggle', '侧边栏'],
          run: () => callbacks.toggleSidebar(),
        },
        {
          id: 'cmd-open-settings',
          label: '打开设置',
          icon: Settings,
          shortcut: '⌘,',
          keywords: ['settings', '设置', '配置'],
          run: () => callbacks.openSettings(),
        },
        {
          id: 'cmd-open-bookmarks',
          label: '打开书签管理',
          icon: Bookmark,
          keywords: ['bookmark', '书签', '管理'],
          run: () => tabStore.openInternalPage('bookmarks'),
        },
        {
          id: 'cmd-open-history',
          label: '打开历史记录',
          icon: History,
          keywords: ['history', '历史', '记录'],
          run: () => tabStore.openInternalPage('history'),
        },
        {
          id: 'cmd-open-downloads',
          label: '打开下载管理',
          icon: Download,
          keywords: ['download', '下载', '管理'],
          run: () => tabStore.openInternalPage('downloads'),
        },
      ]

      if (!q) return commands
      return commands.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          (c.keywords && c.keywords.some((k) => k.toLowerCase().includes(q)))
      )
    },
  }
}
