// src/composables/useCommandPalette.ts

import { ref, shallowRef } from 'vue'
import type { CommandItem, CommandProvider } from '@/types/command'

export interface ParsedQuery {
  /** 匹配到的 Provider（null 表示无匹配或空输入） */
  provider: CommandProvider | null
  /** 搜索关键词 */
  query: string
  /** 是否为未识别的前缀（如 "xyz foo" 中 xyz 不是任何 Provider 的前缀） */
  unknownPrefix: boolean
}

export function useCommandPalette() {
  const providers = shallowRef<CommandProvider[]>([])
  const results = ref<Map<string, CommandItem[]>>(new Map())
  const loading = ref(false)
  const activeProvider = ref<CommandProvider | null>(null)
  const queryText = ref('')

  /** 注册一个 Provider */
  function registerProvider(provider: CommandProvider) {
    providers.value = [...providers.value, provider]
  }

  /** 批量注册 Provider */
  function registerProviders(list: CommandProvider[]) {
    providers.value = [...providers.value, ...list]
  }

  /** 激活某个 Provider */
  function activateProvider(provider: CommandProvider) {
    activeProvider.value = provider
    queryText.value = ''
    searchWithProvider(provider, '')
  }

  /** 取消激活，回到默认状态 */
  function deactivateProvider() {
    activeProvider.value = null
    queryText.value = ''
    search('')
  }

  /** 解析输入的前缀，返回匹配的 Provider 和剩余 query */
  function parseQuery(input: string): ParsedQuery {
    const trimmed = input.trim()
    if (!trimmed) return { provider: null, query: '', unknownPrefix: false }

    const spaceIdx = trimmed.indexOf(' ')
    const firstToken = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase()
    const restQuery = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()

    // 还没有空格，用户还在打字前缀
    if (spaceIdx === -1) {
      return { provider: null, query: trimmed, unknownPrefix: false }
    }

    const matched = providers.value.find(
      (p) => p.prefix.toLowerCase() === firstToken || (p.prefixShort && p.prefixShort.toLowerCase() === firstToken)
    )

    if (matched) {
      return { provider: matched, query: restQuery, unknownPrefix: false }
    }

    // 有空格但前缀不匹配任何 Provider → 未识别前缀
    return { provider: null, query: trimmed, unknownPrefix: true }
  }

  /** 使用指定 Provider 执行搜索 */
  async function searchWithProvider(provider: CommandProvider, query: string) {
    const resultMap = new Map<string, CommandItem[]>()
    loading.value = true
    try {
      const items = await provider.search(query)
      resultMap.set(provider.id, items)
    } finally {
      loading.value = false
    }
    results.value = resultMap
  }

  /** 执行搜索（完整输入，含前缀解析） */
  async function search(input: string) {
    const { provider, query, unknownPrefix } = parseQuery(input)
    const resultMap = new Map<string, CommandItem[]>()
    loading.value = true

    try {
      // 前缀匹配成功时，自动激活对应 Provider
      if (provider) {
        activeProvider.value = provider
        queryText.value = query
        const items = await provider.search(query)
        resultMap.set(provider.id, items)
      } else if (unknownPrefix) {
        // 未识别前缀：不搜索任何 Provider，返回空结果
      } else if (!input.trim()) {
        // 空输入：查找全局命令 Provider
        activeProvider.value = null
        queryText.value = ''
        const globalProvider = providers.value.find((p) => p.prefix === '')
        if (globalProvider) {
          const items = await globalProvider.search('')
          resultMap.set(globalProvider.id, items)
        }
      } else {
        activeProvider.value = null
        queryText.value = input.trim()
        // 无前缀匹配：只展示全局命令 + 匹配的 Provider 工具列表
        const globalProvider = providers.value.find((p) => p.prefix === '')
        if (globalProvider) {
          const items = await globalProvider.search(input.trim())
          if (items.length > 0) {
            resultMap.set(globalProvider.id, items)
          }
        }

        // 过滤匹配输入的 Provider，展示为可选项
        const q = input.trim().toLowerCase()
        const matchedProviders = providers.value.filter(
          (p) =>
            p.prefix !== '' &&
            (p.prefix.toLowerCase().includes(q) ||
              (p.prefixShort && p.prefixShort.toLowerCase().includes(q)) ||
              p.label.toLowerCase().includes(q))
        )
        if (matchedProviders.length > 0) {
          const providerItems: CommandItem[] = matchedProviders.map((p) => ({
            id: `provider-${p.id}`,
            label: `${p.prefix}${p.prefixShort ? ` (${p.prefixShort})` : ''}`,
            description: `搜索${p.label}`,
            icon: p.icon,
            keywords: [p.prefix, p.prefixShort || '', p.label],
            run: () => {},
          }))
          resultMap.set('__providers__', providerItems)
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
    activeProvider,
    queryText,
    registerProvider,
    registerProviders,
    activateProvider,
    deactivateProvider,
    searchWithProvider,
    parseQuery,
    search,
  }
}
