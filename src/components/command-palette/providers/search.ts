import type { CommandProvider, CommandItem } from '@/types/command'
import { Search } from 'lucide-vue-next'
import { useTabStore } from '@/stores/tab'

export function createSearchProvider(): CommandProvider {
  return {
    id: 'search',
    prefix: 'search',
    prefixShort: 's',
    label: '搜索',
    icon: Search,
    async search(query: string): Promise<CommandItem[]> {
      const engines = await window.api.searchEngine.list()
      const q = query.trim()

      // 无关键词时展示所有搜索引擎
      if (!q) {
        return engines.map((engine) => ({
          id: `search-${engine.id}`,
          label: `用 ${engine.name} 搜索`,
          description: engine.url,
          icon: Search,
          keywords: [engine.name],
          run: () => {
            // 无关键词时提示用户输入（这里直接用空字符串打开搜索首页）
            const url = engine.url.replace('%s', '')
            const tabStore = useTabStore()
            tabStore.createTabForSite(url)
          },
        }))
      }

      // 有关键词时展示各引擎搜索结果
      const filtered = q
        ? engines.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()) || true)
        : engines

      return filtered.map((engine) => {
        const searchUrl = engine.url.replace('%s', encodeURIComponent(q))
        return {
          id: `search-${engine.id}-${q}`,
          label: `用 ${engine.name} 搜索「${q}」`,
          description: searchUrl,
          icon: Search,
          keywords: [engine.name, q],
          run: () => {
            const tabStore = useTabStore()
            tabStore.createTabForSite(searchUrl)
          },
        }
      })
    },
  }
}
