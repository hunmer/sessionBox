import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SniffedResource } from '@/types'

const MAX_RESOURCES_PER_TAB = 500

export const useSnifferStore = defineStore('sniffer', () => {
  /** 每个标签页的资源列表 */
  const resources = reactive(new Map<string, SniffedResource[]>())

  /** 每个标签页的嗅探启用状态 */
  const enabled = reactive(new Map<string, boolean>())

  /** 过滤器：显示哪些类型 */
  const filterTypes = ref<Set<'video' | 'audio' | 'image'>>(new Set(['video', 'audio', 'image']))

  /** 自动启用域名列表 */
  const domains = ref<string[]>([])

  /** 是否已初始化（防止重复注册 IPC listener） */
  let initialized = false

  /** 初始化：加载域名列表 + 注册 IPC 监听 */
  async function init() {
    if (initialized) return
    initialized = true
    domains.value = await window.api.sniffer.getDomainList()
    setupListeners()
  }

  /** 注册 IPC 事件监听 */
  function setupListeners() {
    window.api.on('sniffer:resource', (tabId: unknown, resource: unknown) => {
      const tid = tabId as string
      const res = resource as SniffedResource
      if (!resources.has(tid)) {
        resources.set(tid, [])
      }
      const list = resources.get(tid)!
      list.unshift(res)
      // FIFO 淘汰
      if (list.length > MAX_RESOURCES_PER_TAB) {
        list.splice(MAX_RESOURCES_PER_TAB)
      }
    })

    window.api.on('tab:removed', (tabId: unknown) => {
      onTabClosed(tabId as string)
    })
  }

  /** 获取指定标签页的过滤后资源列表 */
  function getFilteredResources(tabId: string): SniffedResource[] {
    const list = resources.get(tabId) ?? []
    const filters = filterTypes.value
    if (filters.size === 3) return list
    return list.filter(r => filters.has(r.type))
  }

  /** 获取指定标签页的资源总数 */
  function getResourceCount(tabId: string): number {
    return resources.get(tabId)?.length ?? 0
  }

  /** 切换嗅探开关 */
  async function toggle(tabId: string, isEnabled: boolean) {
    enabled.set(tabId, isEnabled)
    await window.api.sniffer.toggle(tabId, isEnabled)
  }

  /** 切换域名自动启用规则 */
  async function toggleDomain(domain: string, isEnabled: boolean) {
    await window.api.sniffer.setDomainEnabled(domain, isEnabled)
    if (isEnabled) {
      if (!domains.value.includes(domain)) {
        domains.value.push(domain)
      }
    } else {
      domains.value = domains.value.filter(d => d !== domain)
    }
  }

  /** 检查域名是否在自动启用列表中 */
  function isDomainEnabled(domain: string): boolean {
    return domains.value.includes(domain)
  }

  /** 清空指定标签页的资源 */
  function clearResources(tabId: string) {
    resources.set(tabId, [])
  }

  /** 标签关闭时清理 */
  function onTabClosed(tabId: string) {
    resources.delete(tabId)
    enabled.delete(tabId)
  }

  /** 切换过滤器类型 */
  function toggleFilter(type: 'video' | 'audio' | 'image') {
    const filters = new Set(filterTypes.value)
    if (filters.has(type)) {
      if (filters.size > 1) {
        filters.delete(type)
      }
    } else {
      filters.add(type)
    }
    filterTypes.value = filters
  }

  return {
    resources,
    enabled,
    filterTypes,
    domains,
    init,
    getFilteredResources,
    getResourceCount,
    toggle,
    toggleDomain,
    isDomainEnabled,
    clearResources,
    onTabClosed,
    toggleFilter
  }
})
