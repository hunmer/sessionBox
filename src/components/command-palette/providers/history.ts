import type { CommandProvider, CommandItem } from '@/types/command'
import { History } from 'lucide-vue-next'
import { useHistoryStore } from '@/stores/history'
import { useTabStore } from '@/stores/tab'

export function createHistoryProvider(): CommandProvider {
  return {
    id: 'history',
    prefix: 'history',
    prefixShort: 'h',
    label: '历史记录',
    icon: History,
    async search(query: string): Promise<CommandItem[]> {
      const historyStore = useHistoryStore()
      const tabStore = useTabStore()

      if (!query) {
        const recent = await historyStore.getRecentHistory(20)
        return recent.map((e) => ({
          id: `history-${e.id}`,
          label: e.title || e.url,
          description: e.url,
          icon: History,
          keywords: [e.title, e.url],
          run: () => {
            const tab = tabStore.activeTab
            if (tab) tabStore.navigate(tab.id, e.url)
          },
        }))
      }

      const entries = await historyStore.searchHistory(query, 20)
      return entries.map((e) => ({
        id: `history-${e.id}`,
        label: e.title || e.url,
        description: e.url,
        icon: History,
        keywords: [e.title, e.url],
        run: () => {
          const tab = tabStore.activeTab
          if (tab) tabStore.navigate(tab.id, e.url)
        },
      }))
    },
  }
}
