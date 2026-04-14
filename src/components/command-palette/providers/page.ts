import type { CommandProvider, CommandItem } from '@/types/command'
import { LayoutGrid } from 'lucide-vue-next'
import { usePageStore } from '@/stores/page'
import { useTabStore } from '@/stores/tab'

export function createPageProvider(): CommandProvider {
  return {
    id: 'page',
    prefix: 'page',
    prefixShort: 'p',
    label: '页面',
    icon: LayoutGrid,
    async search(query: string): Promise<CommandItem[]> {
      const pageStore = usePageStore()
      const tabStore = useTabStore()
      const q = query.toLowerCase()

      const filtered = q
        ? pageStore.pages.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.url.toLowerCase().includes(q)
          )
        : pageStore.pages.slice(0, 20)

      return filtered.map((p) => ({
        id: `page-${p.id}`,
        label: p.name,
        description: p.url,
        icon: LayoutGrid,
        keywords: [p.name, p.url],
        run: () => {
          const tab = tabStore.activeTab
          if (tab) tabStore.navigate(tab.id, p.url)
        },
      }))
    },
  }
}
