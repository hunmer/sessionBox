import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import type { Tab, NavState } from '../types'
import { useAccountStore } from './account'
import { useWorkspaceStore } from './workspace'
import { useHistoryStore } from './history'

const api = window.api

export type TabLayout = 'horizontal' | 'vertical'

const TAB_LAYOUT_KEY = 'sessionbox-tab-layout'
const FAVORITE_BAR_KEY = 'sessionbox-favorite-bar-visible'
const TAB_GROUP_KEY = 'sessionbox-tab-group-enabled'

export const useTabStore = defineStore('tab', () => {
  interface TabProxyInfo {
    enabled: boolean
    name?: string
    ip?: string
    text?: string
    error?: string
    status?: 'idle' | 'checking' | 'success' | 'error'
    proxyMode?: 'global' | 'custom' | 'pac_url'
  }
  // ====== 状态 ======
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const navStates = ref<Map<string, NavState>>(new Map())
  const favicons = ref<Map<string, string>>(new Map())
  const frozenTabIds = ref<Set<string>>(new Set())
  const proxyInfos = ref<Map<string, TabProxyInfo>>(new Map())

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
  const tabGroupEnabled = ref(localStorage.getItem(TAB_GROUP_KEY) === 'true')

  function toggleTabGroup() {
    tabGroupEnabled.value = !tabGroupEnabled.value
    localStorage.setItem(TAB_GROUP_KEY, String(tabGroupEnabled.value))
  }

  /** 按 tab 的 order 排列，同组标签聚拢在一起；拖拽 tab 改变 order 即改变位置和分组顺序 */
  const groupedSortedTabs = computed(() => {
    if (!tabGroupEnabled.value) return sortedTabs.value

    const accountStore = useAccountStore()

    // 按 tab 原有 order 分组
    const groupMap = new Map<string, { name: string; color?: string; tabs: Tab[] }>()
    for (const tab of sortedTabs.value) {
      const account = accountStore.getAccount(tab.accountId)
      if (!account) continue
      const group = accountStore.getGroup(account.groupId)
      const key = group?.id ?? '__ungrouped__'
      const name = group?.name ?? '未分组'
      const color = group?.color
      if (!groupMap.has(key)) groupMap.set(key, { name, color, tabs: [] })
      groupMap.get(key)!.tabs.push(tab)
    }

    // 按 tabs 数组中第一个 tab 的 order 决定分组间排序
    const sortedGroups = [...groupMap.entries()].sort((a, b) => {
      const orderA = a[1].tabs[0]?.order ?? 0
      const orderB = b[1].tabs[0]?.order ?? 0
      return orderA - orderB
    })

    // 扁平化为带分组标记的列表
    const result: (Tab & { groupName: string; groupColor?: string; isGroupStart: boolean })[] = []
    for (const [, group] of sortedGroups) {
      group.tabs.forEach((tab, i) => {
        result.push({ ...tab, groupName: group.name, groupColor: group.color, isGroupStart: i === 0 })
      })
    }
    return result
  })

  // ====== 计算属性 ======

  /** 排序后的标签列表（固定标签排在最前） */
  const sortedTabs = computed(() =>
    [...tabs.value].sort((a, b) => {
      // 固定标签优先
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return a.order - b.order
    })
  )

  /** 根据当前工作区过滤的标签列表 */
  const workspaceTabs = computed(() => {
    const accountStore = useAccountStore()
    const workspaceStore = useWorkspaceStore()
    const activeId = workspaceStore.activeWorkspaceId
    // 获取当前工作区的所有账号 ID
    const accountIds = new Set(
      accountStore.accounts
        .filter((a) => {
          const group = accountStore.getGroup(a.groupId)
          const gWorkspaceId = group?.workspaceId || '__default__'
          return gWorkspaceId === activeId
        })
        .map((a) => a.id)
    )
    // 包含账号匹配的 tab 以及无账号的内部页面 tab
    return sortedTabs.value.filter((t) => accountIds.has(t.accountId) || t.accountId === '')
  })

  /** 工作区内带分组标记的标签列表 */
  const groupedWorkspaceTabs = computed(() => {
    if (!tabGroupEnabled.value) return workspaceTabs.value

    const accountStore = useAccountStore()
    const groupMap = new Map<string, { name: string; color?: string; tabs: Tab[] }>()
    const internalTabs: (Tab & { groupName: string; groupColor?: string; isGroupStart: boolean })[] = []

    for (const tab of workspaceTabs.value) {
      const account = accountStore.getAccount(tab.accountId)
      // 内部页面 tab（无账号）单独收集，不显示分组标识
      if (!account) {
        internalTabs.push({ ...tab, groupName: '', groupColor: undefined, isGroupStart: false })
        continue
      }
      const group = accountStore.getGroup(account.groupId)
      const key = group?.id ?? '__ungrouped__'
      const name = group?.name ?? '未分组'
      const color = group?.color
      if (!groupMap.has(key)) groupMap.set(key, { name, color, tabs: [] })
      groupMap.get(key)!.tabs.push(tab)
    }

    const sortedGroups = [...groupMap.entries()].sort((a, b) => {
      const orderA = a[1].tabs[0]?.order ?? 0
      const orderB = b[1].tabs[0]?.order ?? 0
      return orderA - orderB
    })

    const result: (Tab & { groupName: string; groupColor?: string; isGroupStart: boolean })[] = []
    for (const [, group] of sortedGroups) {
      group.tabs.forEach((tab, i) => {
        result.push({ ...tab, groupName: group.name, groupColor: group.color, isGroupStart: i === 0 })
      })
    }
    // 内部页面 tab 放在最后
    result.push(...internalTabs)
    return result
  })

  /** 当前激活的标签 */
  const activeTab = computed(() =>
    tabs.value.find((t) => t.id === activeTabId.value) ?? null
  )

  /** 当前激活标签的导航状态 */
  const activeNavState = computed((): NavState => {
    if (!activeTabId.value) return { canGoBack: false, canGoForward: false, isLoading: false }
    return navStates.value.get(activeTabId.value) ?? { canGoBack: false, canGoForward: false, isLoading: false }
  })

  const activeProxyInfo = computed((): TabProxyInfo | null => {
    if (!activeTabId.value) return null
    return proxyInfos.value.get(activeTabId.value) ?? null
  })

  /** 当前激活标签是否为内部页面 */
  const isInternalPage = computed(() => {
    const url = activeTab.value?.url
    return !!url?.startsWith('sessionbox://')
  })

  /** 内部页面的路径（如 'bookmarks'） */
  const internalPagePath = computed(() => {
    const url = activeTab.value?.url
    if (!url?.startsWith('sessionbox://')) return null
    return url.replace('sessionbox://', '')
  })

  // ====== 操作 ======

  async function loadTabs() {
    tabs.value = await api.tab.list()
  }

  async function createTab(accountId: string) {
    const tab = await api.tab.create(accountId)
    // tab 由主进程 tab:created 事件添加
    await switchTab(tab.id)
    return tab
  }

  /** 使用指定 URL 创建新 tab（用于快捷网站 / 新窗口拦截） */
  async function createTabForSite(url: string, accountId?: string) {
    const tab = await api.tab.create(accountId || null, url)
    // tab 由主进程 tab:created 事件添加，或 tab:activated 事件激活已有 tab
    await nextTick() // 确保 tab 先添加到列表再切换
    await switchTab(tab.id)
    return tab
  }

  /** 使用指定 URL 创建新 tab（用于新窗口拦截） */
  async function createTabWithUrl(accountId: string, url: string) {
    const tab = await api.tab.create(accountId, url)
    // tab 由主进程 tab:created 事件添加
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
    // 内部页面只更新元数据，不走 WebContentsView
    if (url.startsWith('sessionbox://')) {
      await updateTab(tabId, { url })
      return
    }
    await api.tab.navigate(tabId, url)
  }

  /** 打开内部页面（如书签管理） */
  async function openInternalPage(path: string) {
    const url = `sessionbox://${path}`
    if (activeTab.value) {
      await navigate(activeTab.value.id, url)
    }
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

  async function detectProxy(tabId: string) {
    return await api.tab.detectProxy(tabId)
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

  /** 切换标签静音状态 */
  async function toggleMute(tabId: string) {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (!tab) return
    const muted = !tab.muted
    tab.muted = muted
    await api.tab.setMuted(tabId, muted)
  }

  /** 切换标签固定状态 */
  async function togglePin(tabId: string) {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (!tab) return
    const pinned = !tab.pinned
    await updateTab(tabId, { pinned })
  }

  /** 注册主进程 → 渲染进程事件监听 */
  function setupListeners() {
    api.on('tab:created', (tab: unknown) => {
      const nextTab = tab as Tab
      if (!tabs.value.some((item) => item.id === nextTab.id)) {
        tabs.value.push(nextTab)
        // 新建标签恢复静音状态（账号被静音时新建的标签自动静音）
        if (nextTab.muted) {
          api.tab.setMuted(nextTab.id, true)
        }
      }
    })

    api.on('tab:removed', (tabId: unknown) => {
      const id = tabId as string
      tabs.value = tabs.value.filter((t) => t.id !== id)
      navStates.value.delete(id)
      favicons.value.delete(id)
      proxyInfos.value.delete(id)
      if (activeTabId.value === id) {
        activeTabId.value = null
      }
    })

    api.on('tab:activated', (tabId: unknown) => {
      activeTabId.value = tabId as string
    })

    api.on('tab:title-updated', (tabId: unknown, title: unknown) => {
      const t = tabs.value.find((t) => t.id === tabId)
      if (t) {
        t.title = title as string
        // 更新历史记录中对应 URL 的标题
        const historyStore = useHistoryStore()
        historyStore.updateTitle(t.url, title as string)
      }
    })

    api.on('tab:url-updated', (tabId: unknown, url: unknown) => {
      const t = tabs.value.find((t) => t.id === tabId)
      if (t) {
        t.url = url as string
        // 记录浏览历史（仅 http/https）
        const historyStore = useHistoryStore()
        historyStore.addHistory(url as string, t.title)
      }
    })

    api.on('tab:nav-state', (tabId: unknown, state: unknown) => {
      navStates.value.set(tabId as string, state as NavState)
    })

    api.on('tab:proxy-info', (tabId: unknown, info: unknown) => {
      const id = tabId as string
      if (!info) {
        proxyInfos.value.delete(id)
        return
      }

      proxyInfos.value.set(id, info as TabProxyInfo)
    })

    api.on('tab:favicon-updated', (tabId: unknown, url: unknown) => {
      favicons.value.set(tabId as string, url as string)
    })

    // 新窗口打开 → 在新 tab 中加载
    api.on('tab:open-url', async (accountId: unknown, url: unknown) => {
      await createTabWithUrl(accountId as string, url as string)
    })

    // 标签冻结/解冻状态
    api.on('tab:frozen', (tabId: unknown, frozen: unknown) => {
      const id = tabId as string
      if (frozen) {
        frozenTabIds.value.add(id)
      } else {
        frozenTabIds.value.delete(id)
      }
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

  // 工作区切换时，自动激活当前工作区内的 tab
  watch(() => {
    const workspaceStore = useWorkspaceStore()
    return workspaceStore.activeWorkspaceId
  }, () => {
    // 如果当前是内部页面 tab，不自动切换
    const currentTab = tabs.value.find((t) => t.id === activeTabId.value)
    if (currentTab?.url.startsWith('sessionbox://')) return

    const inWorkspace = workspaceTabs.value.some((t) => t.id === activeTabId.value)
    if (inWorkspace) return
    if (workspaceTabs.value.length > 0) {
      switchTab(workspaceTabs.value[0].id)
    } else {
      // 新工作区无 tab，隐藏当前 browserview
      activeTabId.value = null
      api.tab.switch('')
    }
  })

  /** 保存当前所有 tab 状态到主进程（退出前调用） */
  async function saveState() {
    await api.tab.saveAll(tabs.value)
  }

  return {
    tabs,
    activeTabId,
    navStates,
    favicons,
    frozenTabIds,
    sortedTabs,
    workspaceTabs,
    groupedWorkspaceTabs,
    activeTab,
    activeNavState,
    activeProxyInfo,
    isInternalPage,
    internalPagePath,
    tabLayout,
    toggleLayout,
    favoriteBarVisible,
    toggleFavoriteBar,
    tabGroupEnabled,
    toggleTabGroup,
    groupedSortedTabs,
    loadTabs,
    createTab,
    createTabForSite,
    closeTab,
    switchTab,
    updateTab,
    reorderTabs,
    navigate,
    openInternalPage,
    goBack,
    goForward,
    reload,
    detectProxy,
    openDevTools,
    openInNewWindow,
    openInBrowser,
    toggleMute,
    togglePin,
    init,
    saveState
  }
})
