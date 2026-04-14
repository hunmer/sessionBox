import type { CommandProvider, CommandItem } from '@/types/command'
import { History } from 'lucide-vue-next'
import { useHistoryStore } from '@/stores/history'
import { useTabStore } from '@/stores/tab'

function navigateToUrl(url: string) {
  const tabStore = useTabStore()
  const tab = tabStore.activeTab
  if (tab) {
    tabStore.navigate(tab.id, url)
  } else {
    const firstPageId = tabStore.tabs[0]?.pageId
    if (firstPageId) {
      tabStore.createTab(firstPageId).then(() => {
        const newTab = tabStore.activeTab
        if (newTab) tabStore.navigate(newTab.id, url)
      })
    }
  }
}

function toCommandItem(e: { id?: number; title: string; url: string }): CommandItem {
  return {
    id: `history-${e.id}`,
    label: e.title || e.url,
    description: e.url,
    icon: History,
    keywords: [e.title, e.url],
    run: () => navigateToUrl(e.url),
  }
}

export function createHistoryProvider(): CommandProvider {
  return {
    id: 'history',
    prefix: 'history',
    prefixShort: 'h',
    label: '历史记录',
    icon: History,
    async search(query: string): Promise<CommandItem[]> {
      const historyStore = useHistoryStore()

      if (!query) {
        const recent = await historyStore.getRecentHistory(20)
        return recent.map(toCommandItem)
      }

      const entries = await historyStore.searchHistory(query, 20)
      return entries.map(toCommandItem)
    },
  }
}
