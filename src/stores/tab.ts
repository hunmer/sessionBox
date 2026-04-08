import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Tab, NavState } from '../types'
import { useAccountStore } from './account'

const api = window.api

export type TabLayout = 'horizontal' | 'vertical'

const TAB_LAYOUT_KEY = 'sessionbox-tab-layout'
const FAVORITE_BAR_KEY = 'sessionbox-favorite-bar-visible'
const TAB_GROUP_KEY = 'sessionbox-tab-group-enabled'

export const useTabStore = defineStore('tab', () => {
  // ====== 状态 ======
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const navStates = ref<Map<string, NavState>>(new Map())
  const favicons = ref<Map<string, string>>(new Map())

  // ====== 标签栏布局 ======
  const tabLayout = ref<TabLayout>(
    (localStorage.getItem(TAB_LAYOUT_KEY) as TabLayout) || 'horizontal'
  )

  function toggleLayout() {
    tabLayout.value = tabLayout.value === 'horizontal' ? 'vertical' : 'horizontal'
    localStorage.setItem(TAB_LAYOUT_KEY, tabLayout.value)
  }

  // ====== 快捷网站栏显隐 ======
  const favoriteBarVisible = ref(localStorage.getItem(FAVORITE_BAR_KEY) !== 'false')

  function toggleFavoriteBar() {
    favoriteBarVisible.value = !favoriteBarVisible.value
    localStorage.setItem(FAVORITE_BAR_KEY, String(favoriteBarVisible.value))
  }

  // ====== 标签页自动分组 ======
  const TAB_GROUP_ORDER_KEY = 'sessionbox-tab-group-order'
  const tabGroupEnabled = ref(localStorage.getItem(TAB_GROUP_KEY) === 'true')

  function toggleTabGroup() {
    tabGroupEnabled.value = !tabGroupEnabled.value
    localStorage.setItem(TAB_GROUP_KEY, String(tabGroupEnabled.value))
  }

  /** 按分组聚合标签页（返回有序数组，支持自定义排序） */
  const groupedTabs = computed(() => {
    const accountStore = useAccountStore()
    const map = new Map<string, { group: { id: string; name: string }; tabs: Tab[] }>()

    for (const tab of sortedTabs.value) {
      const account = accountStore.getAccount(tab.accountId)
      if (!account) continue
      const group = accountStore.getGroup(account.groupId)
      const groupKey = group?.id ?? '__ungrouped__'
      const groupName = group?.name ?? '未分组'

      if (!map.has(groupKey)) {
        map.set(groupKey, { group: { id: groupKey, name: groupName }, tabs: [] })
      }
      map.get(groupKey)!.tabs.push(tab)
    }

    // 按保存的排序顺序排列，未保存过的排在末尾
    const savedOrder: string[] = JSON.parse(localStorage.getItem(TAB_GROUP_ORDER_KEY) || '[]')
    const entries = [...map.entries()]
    entries.sort((a, b) => {
      const idxA = savedOrder.indexOf(a[0])
      const idxB = savedOrder.indexOf(b[0])
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
    return entries
  })

  /** 保存分组排序 */
  function reorderTabGroups(groupIds: string[]) {
    localStorage.setItem(TAB_GROUP_ORDER_KEY, JSON.stringify(groupIds))
  }

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

  /** 使用指定 URL 创建新 tab（用于快捷网站 / 新窗口拦截） */
  async function createTabForSite(url: string, accountId?: string) {
    const tab = await api.tab.create(accountId || null, url)
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

  async function openDevTools(tabId: string) {
    await api.tab.openDevTools(tabId)
  }

  async function openInNewWindow(tabId: string) {
    await api.tab.openInNewWindow(tabId)
    await closeTab(tabId)
  }

  async function openInBrowser(tabId: string) {
    await api.tab.openInBrowser(tabId)
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
    tabLayout,
    toggleLayout,
    favoriteBarVisible,
    toggleFavoriteBar,
    tabGroupEnabled,
    toggleTabGroup,
    groupedTabs,
    reorderTabGroups,
    loadTabs,
    createTab,
    createTabForSite,
    closeTab,
    switchTab,
    updateTab,
    reorderTabs,
    navigate,
    goBack,
    goForward,
    reload,
    openDevTools,
    openInNewWindow,
    openInBrowser,
    init,
    saveState
  }
})
