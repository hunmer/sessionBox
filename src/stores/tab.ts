import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Tab, NavState } from '../types'

const api = window.api

export const useTabStore = defineStore('tab', () => {
  // ====== 状态 ======
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const navStates = ref<Map<string, NavState>>(new Map())
  const favicons = ref<Map<string, string>>(new Map())

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
    await switchTab(tab.id)
    return tab
  }

  /** 使用指定 URL 创建新 tab（用于新窗口拦截） */
  async function createTabWithUrl(accountId: string, url: string) {
    const tab = await api.tab.create(accountId, url)
    tabs.value.push(tab)
    await switchTab(tab.id)
    return tab
  }

  async function closeTab(tabId: string) {
    await api.tab.close(tabId)
    tabs.value = tabs.value.filter((t) => t.id !== tabId)
    navStates.value.delete(tabId)
    favicons.value.delete(tabId)

    // 如果关闭的是当前激活标签，切换到相邻标签
    if (activeTabId.value === tabId) {
      const remaining = sortedTabs.value
      if (remaining.length > 0) {
        await switchTab(remaining[0].id)
      } else {
        activeTabId.value = null
      }
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
      favicons.value.set(tabId as string, url as string)
    })

    // 新窗口打开 → 在新 tab 中加载
    api.on('tab:open-url', async (accountId: unknown, url: unknown) => {
      await createTabWithUrl(accountId as string, url as string)
    })

    // 深度链接 → 激活或创建对应账号的 tab
    api.on('open-account', async (accountId: unknown) => {
      const id = accountId as string
      const accountTabs = sortedTabs.value.filter((t) => t.accountId === id)
      if (accountTabs.length > 0) {
        await switchTab(accountTabs[accountTabs.length - 1].id)
      } else {
        await createTab(id)
      }
    })
  }

  /** 初始化 */
  async function init() {
    await loadTabs()
    setupListeners()

    // 恢复保存的 tab（重建 WebContentsView）
    if (tabs.value.length > 0) {
      await api.tab.restoreAll()
      const sorted = sortedTabs.value
      await switchTab(sorted[0].id)
    }
  }

  /** 保存当前所有 tab 状态到主进程（退出前调用） */
  async function saveState() {
    await api.tab.saveAll(tabs.value)
  }

  return {
    tabs,
    activeTabId,
    navStates,
    favicons,
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
    init,
    saveState
  }
})
