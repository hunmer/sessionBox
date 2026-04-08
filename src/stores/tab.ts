import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Tab, NavState } from '../types'

const api = window.api

export const useTabStore = defineStore('tab', () => {
  // ====== 状态 ======
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const navStates = ref<Map<string, NavState>>(new Map())

  // ====== 计算属性 ======

  /** 排序后的标签列表 */
  const sortedTabs = computed(() => [...tabs.value].sort((a, b) => a.order - b.order))

  /** 当前激活的标签 */
  const activeTab = computed(() =>
    tabs.value.find((t) => t.id === activeTabId.value) ?? null
  )

  /** 当前激活标签的导航状态 */
  const activeNavState = computed((): NavState => {
    if (!activeTabId.value) return { canGoBack: false, canGoForward: false, isLoading: false }
    return navStates.value.get(activeTabId.value) ?? { canGoBack: false, canGoForward: false, isLoading: false }
  })

  // ====== 操作 ======

  async function loadTabs() {
    tabs.value = await api.tab.list()
  }

  async function createTab(accountId: string) {
    const tab = await api.tab.create(accountId)
    tabs.value.push(tab)
    activeTabId.value = tab.id
    return tab
  }

  async function closeTab(tabId: string) {
    await api.tab.close(tabId)
    tabs.value = tabs.value.filter((t) => t.id !== tabId)
    navStates.value.delete(tabId)

    // 如果关闭的是当前激活标签，切换到相邻标签
    if (activeTabId.value === tabId) {
      const remaining = sortedTabs.value
      activeTabId.value = remaining.length > 0 ? remaining[0].id : null
    }
  }

  async function switchTab(tabId: string) {
    activeTabId.value = tabId
    await api.tab.switch(tabId)
  }

  async function updateTab(tabId: string, data: Partial<Omit<Tab, 'id'>>) {
    await api.tab.update(tabId, data)
    const idx = tabs.value.findIndex((t) => t.id === tabId)
    if (idx !== -1) tabs.value[idx] = { ...tabs.value[idx], ...data }
  }

  async function reorderTabs(tabIds: string[]) {
    await api.tab.reorder(tabIds)
    tabIds.forEach((id, order) => {
      const t = tabs.value.find((t) => t.id === id)
      if (t) t.order = order
    })
  }

  async function navigate(tabId: string, url: string) {
    await api.tab.navigate(tabId, url)
  }

  async function goBack(tabId: string) {
    await api.tab.goBack(tabId)
  }

  async function goForward(tabId: string) {
    await api.tab.goForward(tabId)
  }

  async function reload(tabId: string) {
    await api.tab.reload(tabId)
  }

  /** 注册主进程 → 渲染进程事件监听 */
  function setupListeners() {
    api.on('tab:title-updated', (tabId: unknown, title: unknown) => {
      const t = tabs.value.find((t) => t.id === tabId)
      if (t) t.title = title as string
    })

    api.on('tab:url-updated', (tabId: unknown, url: unknown) => {
      const t = tabs.value.find((t) => t.id === tabId)
      if (t) t.url = url as string
    })

    api.on('tab:nav-state', (tabId: unknown, state: unknown) => {
      navStates.value.set(tabId as string, state as NavState)
    })

    api.on('tab:favicon-updated', (tabId: unknown, url: unknown) => {
      // favicon 更新处理，后续阶段扩展
      console.log(`[TabStore] favicon updated: ${tabId} ${url}`)
    })
  }

  /** 初始化 */
  async function init() {
    await loadTabs()
    setupListeners()
    // 恢复时激活第一个标签
    if (tabs.value.length > 0) {
      const sorted = sortedTabs.value
      activeTabId.value = sorted[0].id
    }
  }

  return {
    tabs,
    activeTabId,
    navStates,
    sortedTabs,
    activeTab,
    activeNavState,
    loadTabs,
    createTab,
    closeTab,
    switchTab,
    updateTab,
    reorderTabs,
    navigate,
    goBack,
    goForward,
    reload,
    init
  }
})
