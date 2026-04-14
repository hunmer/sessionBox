import type { CommandProvider, CommandItem } from '@/types/command'
import { AppWindow } from 'lucide-vue-next'
import { useTabStore } from '@/stores/tab'

export function createTabProvider(): CommandProvider {
  return {
    id: 'tab',
    prefix: 'tab',
    prefixShort: 't',
    label: '标签页',
    icon: AppWindow,
    async search(query: string): Promise<CommandItem[]> {
      const tabStore = useTabStore()
      const q = query.toLowerCase()

      const filtered = q
        ? tabStore.tabs.filter(
            (t) =>
              t.title.toLowerCase().includes(q) ||
              t.url.toLowerCase().includes(q)
          )
        : tabStore.tabs.slice(0, 20)

      return filtered.map((t) => ({
        id: `tab-${t.id}`,
        label: t.title || t.url,
        description: t.url,
        icon: AppWindow,
        keywords: [t.title, t.url],
        run: () => {
          tabStore.switchTab(t.id)
        },
      }))
    },
  }
}
