// src/composables/useCommandPalette.ts

import { ref, shallowRef } from 'vue'
import type { CommandItem, CommandProvider } from '@/types/command'

export interface ParsedQuery {
  /** 匹配到的 Provider（null 表示无匹配或空输入） */
  provider: CommandProvider | null
  /** 搜索关键词 */
  query: string
}

export function useCommandPalette() {
  const providers = shallowRef<CommandProvider[]>([])
  const results = ref<Map<string, CommandItem[]>>(new Map())
  const loading = ref(false)

  /** 注册一个 Provider */
  function registerProvider(provider: CommandProvider) {
    providers.value = [...providers.value, provider]
  }

  /** 批量注册 Provider */
  function registerProviders(list: CommandProvider[]) {
    providers.value = [...providers.value, ...list]
  }

  /** 解析输入的前缀，返回匹配的 Provider 和剩余 query */
  function parseQuery(input: string): ParsedQuery {
    const trimmed = input.trim()
    if (!trimmed) return { provider: null, query: '' }

    const spaceIdx = trimmed.indexOf(' ')
    const firstToken = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase()
    const restQuery = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()

    // 前缀完全匹配时，空 query 也算有效（用户输入 "bookmark " 后等待输入关键词）
    // 但如果 firstToken 后面没有空格（用户还在打字前缀），不触发匹配
    if (spaceIdx === -1) {
      return { provider: null, query: trimmed }
    }

    const matched = providers.value.find(
      (p) => p.prefix.toLowerCase() === firstToken || (p.prefixShort && p.prefixShort.toLowerCase() === firstToken)
    )

    if (matched) {
      return { provider: matched, query: restQuery }
    }

    return { provider: null, query: trimmed }
  }

  /** 执行搜索 */
  async function search(input: string) {
    const { provider, query } = parseQuery(input)
    const resultMap = new Map<string, CommandItem[]>()
    loading.value = true

    try {
      if (provider) {
        // 单一 Provider 搜索
        const items = await provider.search(query)
        resultMap.set(provider.id, items)
      } else if (!input.trim()) {
        // 空输入：查找全局命令 Provider
        const globalProvider = providers.value.find((p) => p.prefix === '')
        if (globalProvider) {
          const items = await globalProvider.search('')
          resultMap.set(globalProvider.id, items)
        }
      } else {
        // 无前缀匹配：跨所有 Provider 搜索
        const settled = await Promise.allSettled(
          providers.value
            .filter((p) => p.prefix !== '') // 排除全局命令 Provider
            .map(async (p) => {
              const items = await p.search(input.trim())
              return { id: p.id, items }
            })
        )
        for (const r of settled) {
          if (r.status === 'fulfilled' && r.value.items.length > 0) {
            resultMap.set(r.value.id, r.value.items)
          }
        }
      }
    } finally {
      loading.value = false
    }

    results.value = resultMap
  }

  return {
    providers,
    results,
    loading,
    registerProvider,
    registerProviders,
    parseQuery,
    search,
  }
}
