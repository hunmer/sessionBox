import type { CommandProvider, CommandItem } from '@/types/command'
import { Bookmark } from 'lucide-vue-next'
import { useBookmarkStore } from '@/stores/bookmark'
import { useTabStore } from '@/stores/tab'

export function createBookmarkProvider(): CommandProvider {
  return {
    id: 'bookmark',
    prefix: 'bookmark',
    prefixShort: 'bm',
    label: '书签',
    icon: Bookmark,
    async search(query: string): Promise<CommandItem[]> {
      const bookmarkStore = useBookmarkStore()
      const tabStore = useTabStore()
      const q = query.toLowerCase()

      const filtered = q
        ? bookmarkStore.bookmarks.filter(
            (b) =>
              b.title.toLowerCase().includes(q) ||
              b.url.toLowerCase().includes(q)
          )
        : bookmarkStore.bookmarks.slice(0, 20)

      return filtered.map((b) => ({
        id: `bookmark-${b.id}`,
        label: b.title || b.url,
        description: b.url,
        icon: Bookmark,
        keywords: [b.title, b.url],
        run: () => {
          const tab = tabStore.activeTab
          if (tab) {
            tabStore.navigate(tab.id, b.url)
          } else {
            const firstPageId = tabStore.tabs[0]?.pageId
            if (firstPageId) {
              tabStore.createTab(firstPageId).then(() => {
                const newTab = tabStore.activeTab
                if (newTab) tabStore.navigate(newTab.id, b.url)
              })
            }
          }
        },
      }))
    },
  }
}
