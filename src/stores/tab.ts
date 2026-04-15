import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import type { Tab, NavState } from '../types'
import { useContainerStore } from './container'
import { usePageStore } from './page'
import { useSnifferStore } from './sniffer'
import { useWorkspaceStore } from './workspace'
import { useHistoryStore } from './history'

const api = window.api

export type TabLayout = 'horizontal' | 'vertical'
export type TabGroupMode = 'none' | 'group' | 'account'

const TAB_LAYOUT_KEY = 'sessionbox-tab-layout'
const BOOKMARK_BAR_KEY = 'sessionbox-bookmark-bar-visible'
const TAB_GROUP_KEY = 'sessionbox-tab-group-mode'
const ACTIVE_TAB_KEY = 'sessionbox-active-tab-id'

export const useTabStore = defineStore('tab', () => {
  interface TabProxyInfo {
    enabled: boolean
    applied?: boolean
    name?: string
    ip?: string
    text?: string
    error?: string
    status?: 'idle' | 'checking' | 'success' | 'error'
    proxyMode?: 'global' | 'custom' | 'pac_url'
    proxyId?: string
    isOverride?: boolean
  }
  // ====== 状态 ======
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const tabGroupFilterId = ref<string | null>(null)
  const navStates = ref<Map<string, NavState>>(new Map())
  const favicons = ref<Map<string, string>>(new Map())
  const frozenTabIds = ref<Set<string>>(new Set())
  const proxyInfos = ref<Map<string, TabProxyInfo>>(new Map())
  const mutedSites = ref<string[]>([])
  let listenersReady = false
  let restoreReady = false

  // ====== 关闭标签页历史栈（用于 Ctrl+Shift+T 恢复） ======
  const MAX_RECENTLY_CLOSED = 20
  interface ClosedTabSnapshot {
    pageId: string
    title: string
    url: string
    order: number
  }
  const recentlyClosedTabs = ref<ClosedTabSnapshot[]>([])

  // ====== 标签栏布局 ======
  const tabLayout = ref<TabLayout>(
    (localStorage.getItem(TAB_LAYOUT_KEY) as TabLayout) || 'horizontal'
  )

  function toggleLayout() {
    tabLayout.value = tabLayout.value === 'horizontal' ? 'vertical' : 'horizontal'
    localStorage.setItem(TAB_LAYOUT_KEY, tabLayout.value)
  }

  // ====== 快捷网站栏显隐 ======
  const bookmarkBarVisible = ref(localStorage.getItem(BOOKMARK_BAR_KEY) !== 'false')

  function toggleBookmarkBar() {
    bookmarkBarVisible.value = !bookmarkBarVisible.value
    localStorage.setItem(BOOKMARK_BAR_KEY, String(bookmarkBarVisible.value))
  }

  // ====== 标签页分组模式 ======
  function loadTabGroupMode(): TabGroupMode {
    const stored = localStorage.getItem(TAB_GROUP_KEY)
    // 兼容旧版 boolean 值
    if (stored === 'true') return 'group'
    if (stored === 'group' || stored === 'account') return stored
    return 'none'
  }
  const tabGroupMode = ref<TabGroupMode>(loadTabGroupMode())

  function setTabGroupMode(mode: TabGroupMode) {
    tabGroupMode.value = mode
    localStorage.setItem(TAB_GROUP_KEY, mode)
  }

  /** 设置标签分组过滤（仅展示指定分组的标签，null 表示不过滤） */
  function setTabGroupFilter(groupId: string | null) {
    tabGroupFilterId.value = groupId
  }

  /** 清除标签分组过滤 */
  function clearTabGroupFilter() {
    tabGroupFilterId.value = null
  }

  /** 是否启用了任意分组 */
  const tabGroupEnabled = computed(() => tabGroupMode.value !== 'none')

  /** 按 tab 的 order 排列，同组标签聚拢在一起；拖拽 tab 改变 order 即改变位置和分组顺序 */
  const groupedSortedTabs = computed(() => {
    if (!tabGroupEnabled.value) return sortedTabs.value

    const pageStore = usePageStore()
    const containerStore = useContainerStore()
    const groupByContainer = tabGroupMode.value === 'account'

    // 按 tab 原有 order 分组
    const groupMap = new Map<string, { name: string; color?: string; tabs: Tab[] }>()
    for (const tab of sortedTabs.value) {
      const page = pageStore.getPage(tab.pageId)
      if (!page) continue

      let key: string, name: string, color: string | undefined
      if (groupByContainer) {
        key = page.containerId || '__default__'
        const container = page.containerId ? containerStore.getContainer(page.containerId) : undefined
        name = container?.name ?? '默认容器'
        color = undefined
      } else {
        const group = containerStore.getGroup(page.groupId)
        key = group?.id ?? '__ungrouped__'
        name = group?.name ?? '未分组'
        color = group?.color
      }
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
    const pageStore = usePageStore()
    const containerStore = useContainerStore()
    const workspaceStore = useWorkspaceStore()
    const activeId = workspaceStore.activeWorkspaceId
    // 获取当前工作区的所有 page ID（通过 page 的 groupId 找到 group，再匹配 workspaceId）
    const pageIds = new Set(
      pageStore.pages
        .filter((p) => {
          const group = containerStore.getGroup(p.groupId)
          const gWorkspaceId = group?.workspaceId || '__default__'
          return gWorkspaceId === activeId
        })
        .map((p) => p.id)
    )
    // 包含 page 匹配的 tab 以及无 page 的内部页面 tab
    let result = sortedTabs.value.filter((t) => pageIds.has(t.pageId) || !t.pageId)

    // 如果设置了分组过滤，只保留对应分组的标签
    if (tabGroupFilterId.value) {
      const filteredPageIds = new Set(
        pageStore.pages
          .filter((p) => p.groupId === tabGroupFilterId.value)
          .map((p) => p.id)
      )
      result = result.filter((t) => filteredPageIds.has(t.pageId) || !t.pageId)
    }

    return result
  })

  /** 工作区内带分组标记的标签列表 */
  const groupedWorkspaceTabs = computed(() => {
    if (!tabGroupEnabled.value) return workspaceTabs.value

    const pageStore = usePageStore()
    const containerStore = useContainerStore()
    const groupByContainer = tabGroupMode.value === 'account'
    const groupMap = new Map<string, { name: string; color?: string; tabs: Tab[] }>()
    const internalTabs: (Tab & { groupName: string; groupColor?: string; isGroupStart: boolean })[] = []

    for (const tab of workspaceTabs.value) {
      const page = pageStore.getPage(tab.pageId)
      // 内部页面 tab（无 page）单独收集，不显示分组标识
      if (!page) {
        internalTabs.push({ ...tab, groupName: '', groupColor: undefined, isGroupStart: false })
        continue
      }

      let key: string, name: string, color: string | undefined
      if (groupByContainer) {
        key = page.containerId || '__default__'
        const container = page.containerId ? containerStore.getContainer(page.containerId) : undefined
        name = container?.name ?? '默认容器'
        color = undefined
      } else {
        const group = containerStore.getGroup(page.groupId)
        key = group?.id ?? '__ungrouped__'
        name = group?.name ?? '未分组'
        color = group?.color
      }
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

  async function activateCreatedTab(tabId: string, targetPaneId?: string | null) {
    const { useSplitStore } = await import('./split')
    const splitStore = useSplitStore()

    if (splitStore.isSplitActive) {
      splitStore.handleTabCreated(tabId, targetPaneId)
      return
    }

    await switchTab(tabId)
  }

  async function createTab(pageId: string, targetPaneId?: string | null) {
    const tab = await api.tab.create(pageId)
    // tab 由主进程 tab:created 事件添加
    await activateCreatedTab(tab.id, targetPaneId)
    return tab
  }

  /** 找到当前工作区的第一个 page，用于为无 pageId 的 tab 关联工作区 */
  function findPageInActiveWorkspace(): string | null {
    const pageStore = usePageStore()
    const containerStore = useContainerStore()
    const workspaceStore = useWorkspaceStore()
    const activeId = workspaceStore.activeWorkspaceId
    const page = pageStore.pages.find((p) => {
      const group = containerStore.getGroup(p.groupId)
      return (group?.workspaceId || '__default__') === activeId
    })
    return page?.id ?? null
  }

  /** 使用指定 URL 创建新 tab（用于快捷网站 / 新窗口拦截） */
  async function createTabForSite(url: string, pageId?: string, targetPaneId?: string | null) {
    const resolvedPageId = pageId || findPageInActiveWorkspace()
    const tab = await api.tab.create(resolvedPageId, url)
    // tab 由主进程 tab:created 事件添加，或 tab:activated 事件激活已有 tab
    await nextTick() // 确保 tab 先添加到列表再切换
    await activateCreatedTab(tab.id, targetPaneId)
    return tab
  }

  /** 使用指定 URL 创建新 tab（用于新窗口拦截） */
  async function createTabWithUrl(pageId: string, url: string, targetPaneId?: string | null) {
    const tab = await api.tab.create(pageId, url)
    // tab 由主进程 tab:created 事件添加
    await activateCreatedTab(tab.id, targetPaneId)
    return tab
  }

  async function closeTab(tabId: string) {
    // 保存关闭的 tab 快照（用于 Ctrl+Shift+T 恢复）
    const closingTab = tabs.value.find((t) => t.id === tabId)
    if (closingTab && closingTab.pageId && !closingTab.url?.startsWith('sessionbox://')) {
      recentlyClosedTabs.value.unshift({
        pageId: closingTab.pageId,
        title: closingTab.title,
        url: closingTab.url,
        order: closingTab.order
      })
      if (recentlyClosedTabs.value.length > MAX_RECENTLY_CLOSED) {
        recentlyClosedTabs.value.pop()
      }
    }

    const closingActive = activeTabId.value === tabId
    const currentWorkspaceTabs = workspaceTabs.value
    const currentIndex = currentWorkspaceTabs.findIndex((t) => t.id === tabId)
    const nextWorkspaceTabId = currentIndex === -1
      ? null
      : currentWorkspaceTabs[currentIndex + 1]?.id ?? currentWorkspaceTabs[currentIndex - 1]?.id ?? null

    await api.tab.close(tabId)
    tabs.value = tabs.value.filter((t) => t.id !== tabId)
    navStates.value.delete(tabId)

    // 清理嗅探器数据
    useSnifferStore().onTabClosed(tabId)
    favicons.value.delete(tabId)
    proxyInfos.value.delete(tabId)

    // Notify split store
    const { useSplitStore } = await import('./split')
    const splitStore = useSplitStore()
    splitStore.handleTabClosed(tabId)

    if (closingActive && splitStore.isSplitActive) {
      const nextSplitTabId = splitStore.focusedPane?.activeTabId
        ?? splitStore.activePanes.find((pane) => pane.activeTabId)?.activeTabId
        ?? null

      if (nextSplitTabId && workspaceTabs.value.some((t) => t.id === nextSplitTabId)) {
        await switchTab(nextSplitTabId)
      } else {
        activeTabId.value = null
        await api.tab.switch('')
      }
      return
    }

    // 如果关闭的是当前激活标签，只在当前工作区内选择相邻标签
    if (closingActive) {
      if (nextWorkspaceTabId && workspaceTabs.value.some((t) => t.id === nextWorkspaceTabId)) {
        await switchTab(nextWorkspaceTabId)
      } else {
        activeTabId.value = null
        await api.tab.switch('')
      }
    }
  }

  async function switchTab(tabId: string) {
    // Let split store handle tab routing if split is active
    const { useSplitStore } = await import('./split')
    const splitStore = useSplitStore()

    if (splitStore.isSplitActive) {
      splitStore.handleTabClick(tabId)
      return
    }

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

  /** 打开内部页面（如书签管理、下载、历史记录） */
  async function openInternalPage(path: string) {
    const url = `sessionbox://${path}`
    if (activeTab.value) {
      await navigate(activeTab.value.id, url)
    } else {
      // 无活跃标签页时，创建新标签页打开
      await createTabForSite(url)
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

  /** 强制刷新（清除缓存） */
  async function forceReload(tabId: string) {
    await api.tab.forceReload(tabId)
  }

  /** 放大页面 */
  async function zoomIn(tabId: string) {
    await api.tab.zoomIn(tabId)
  }

  /** 缩小页面 */
  async function zoomOut(tabId: string) {
    await api.tab.zoomOut(tabId)
  }

  /** 重置页面缩放 */
  async function zoomReset(tabId: string) {
    await api.tab.zoomReset(tabId)
  }

  async function detectProxy(tabId: string) {
    return await api.tab.detectProxy(tabId)
  }

  async function setProxyEnabled(tabId: string, enabled: boolean) {
    return await api.tab.setProxyEnabled(tabId, enabled)
  }

  async function applyProxy(tabId: string, proxyId: string | null) {
    return await api.tab.applyProxy(tabId, proxyId)
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

  /** 静音指定网站（添加到静音列表） */
  async function muteSite(hostname: string) {
    await api.mutedSites.add(hostname)
    mutedSites.value = await api.mutedSites.list()
  }

  /** 取消静音指定网站（从静音列表移除） */
  async function unmuteSite(hostname: string) {
    await api.mutedSites.remove(hostname)
    mutedSites.value = await api.mutedSites.list()
  }

  /** 判断域名是否在静音列表中（支持子域名匹配） */
  function isSiteMuted(hostname: string): boolean {
    return mutedSites.value.some((site) => hostname === site || hostname.endsWith(`.${site}`))
  }

  /** 切换标签固定状态 */
  async function togglePin(tabId: string) {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (!tab) return
    const pinned = !tab.pinned
    await updateTab(tabId, { pinned })
  }

  /** 恢复最近关闭的标签页（Ctrl+Shift+T） */
  async function restoreTab(): Promise<boolean> {
    if (recentlyClosedTabs.value.length === 0) return false

    const snapshot = recentlyClosedTabs.value.shift()!
    // 验证 pageId 对应的 page 是否仍然存在
    const pageStore = usePageStore()
    const page = pageStore.getPage(snapshot.pageId)
    if (!page) return false

    await createTab(snapshot.pageId)
    return true
  }

  /** 跳转到指定序号的标签页（Ctrl+1~8），index 从 1 开始 */
  function gotoTab(index: number): boolean {
    const currentTabs = workspaceTabs.value
    if (currentTabs.length === 0) return false

    const targetIndex = Math.min(index - 1, currentTabs.length - 1)
    const targetTab = currentTabs[targetIndex]
    if (targetTab) {
      switchTab(targetTab.id)
      return true
    }
    return false
  }

  /** 跳转到最后一个标签页（Ctrl+9） */
  function gotoLastTab(): boolean {
    const currentTabs = workspaceTabs.value
    if (currentTabs.length === 0) return false

    const lastTab = currentTabs[currentTabs.length - 1]
    if (lastTab) {
      switchTab(lastTab.id)
      return true
    }
    return false
  }

  /** 注册主进程 → 渲染进程事件监听 */
  function setupListeners() {
    if (listenersReady) return
    listenersReady = true

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

    api.on('tab:removed', async (tabId: unknown) => {
      const id = tabId as string
      const wasActive = activeTabId.value === id
      const currentWorkspaceTabs = workspaceTabs.value
      const currentIndex = currentWorkspaceTabs.findIndex((t) => t.id === id)
      const nextWorkspaceTabId = currentIndex === -1
        ? null
        : currentWorkspaceTabs[currentIndex + 1]?.id ?? currentWorkspaceTabs[currentIndex - 1]?.id ?? null

      tabs.value = tabs.value.filter((t) => t.id !== id)
      navStates.value.delete(id)
      favicons.value.delete(id)
      proxyInfos.value.delete(id)

      // 清理嗅探器数据
      useSnifferStore().onTabClosed(id)

      // Notify split store
      const { useSplitStore } = await import('./split')
      const splitStore = useSplitStore()
      splitStore.handleTabClosed(id)

      if (wasActive && splitStore.isSplitActive) {
        const nextSplitTabId = splitStore.focusedPane?.activeTabId
          ?? splitStore.activePanes.find((pane) => pane.activeTabId)?.activeTabId
          ?? null

        if (nextSplitTabId && workspaceTabs.value.some((t) => t.id === nextSplitTabId)) {
          await switchTab(nextSplitTabId)
        } else {
          activeTabId.value = null
          await api.tab.switch('')
        }
        return
      }

      // 自动激活同工作区内的相邻标签页
      if (wasActive) {
        if (nextWorkspaceTabId && workspaceTabs.value.some((t) => t.id === nextWorkspaceTabId)) {
          await switchTab(nextWorkspaceTabId)
        } else {
          activeTabId.value = null
          await api.tab.switch('')
        }
      }
    })

    api.on('tab:activated', (tabId: unknown) => {
      activeTabId.value = tabId as string
    })

    // 插件设置的分组过滤
    api.on('tab:set-group-filter', (groupId: unknown) => {
      tabGroupFilterId.value = groupId as string | null
    })

    api.on('tab:title-updated', (tabId: unknown, title: unknown) => {
      const t = tabs.value.find((t) => t.id === tabId)
      if (t) {
        t.title = title as string
        // 实时持久化标题到主进程 store，避免 beforeunload 时 IPC 未完成导致标题丢失
        api.tab.update(tabId, { title: title as string })
        // 更新历史记录中对应 URL 的标题
        const historyStore = useHistoryStore()
        historyStore.updateTitle(t.url, title as string)
      }
    })

    api.on('tab:url-updated', (tabId: unknown, url: unknown) => {
      const t = tabs.value.find((t) => t.id === tabId)
      if (t) {
        t.url = url as string
        // 实时持久化 URL 到主进程 store
        api.tab.update(tabId, { url: url as string })
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
    api.on('tab:open-url', async (pageId: unknown, url: unknown) => {
      await createTabWithUrl(pageId as string, url as string)
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

    // 自动静音匹配（导航到静音网站时触发）
    api.on('tab:auto-muted', (tabId: unknown) => {
      const t = tabs.value.find((t) => t.id === (tabId as string))
      if (t) t.muted = true
    })

    // 深度链接 → 激活或创建对应页面的 tab
    api.on('open-page', async (pageId: unknown) => {
      const id = pageId as string
      const pageTabs = sortedTabs.value.filter((t) => t.pageId === id)
      if (pageTabs.length > 0) {
        await switchTab(pageTabs[pageTabs.length - 1].id)
      } else {
        await createTab(id)
      }
    })

    // Tray 菜单打开页面
    api.on('tray:openInApp', async (pageId: unknown) => {
      const id = pageId as string
      const existingTab = sortedTabs.value.find(t => t.pageId === id)
      if (existingTab) {
        await switchTab(existingTab.id)
      } else {
        await createTab(id)
      }
    })

    // 外部链接 → 使用默认容器在当前工作区打开新 tab
    api.on('open-external-url', async (url: unknown) => {
      const externalUrl = url as string
      const containerStore = useContainerStore()
      const pageStore = usePageStore()
      const workspaceStore = useWorkspaceStore()

      // 找到当前工作区中的一个分组
      const activeWorkspaceId = workspaceStore.activeWorkspaceId
      const targetGroup = containerStore.workspaceGroups.find((g) =>
        (g.workspaceId || '__default__') === activeWorkspaceId
      )

      // 创建临时 page，使用默认容器
      const page = await pageStore.createPage({
        groupId: targetGroup?.id ?? '',
        containerId: containerStore.defaultContainerId,
        name: externalUrl,
        icon: '🌐',
        url: externalUrl,
        order: pageStore.pages.length
      })

      // 基于 page 创建 tab
      await createTab(page.id)
    })
  }

  /** 初始化 */
  async function init() {
    await loadTabs()
    mutedSites.value = await api.mutedSites.list()
    setupListeners()

    if (restoreReady) return

    // 恢复保存的 tab（重建 WebContentsView）
    if (tabs.value.length > 0) {
      await api.tab.restoreAll()
      // 优先恢复上次激活的 tab，否则回退到第一个
      const savedActiveId = localStorage.getItem(ACTIVE_TAB_KEY)
      const targetTab = savedActiveId
        ? workspaceTabs.value.find((t) => t.id === savedActiveId)
        : null

      if (targetTab) {
        await switchTab(targetTab.id)
      } else if (workspaceTabs.value.length > 0) {
        await switchTab(workspaceTabs.value[0].id)
      } else {
        activeTabId.value = null
        await api.tab.switch('')
      }
    }

    restoreReady = true
  }

  // 激活标签变化时持久化，以便重启后恢复
  watch(activeTabId, (id) => {
    if (id) localStorage.setItem(ACTIVE_TAB_KEY, id)
  })

  // 工作区切换时，自动激活当前工作区内的 tab
  watch(() => {
    const workspaceStore = useWorkspaceStore()
    return workspaceStore.activeWorkspaceId
  }, () => {
    // tabs 未加载完成时跳过（初始化期间的 workspace 恢复由 tabStore.init() 处理）
    if (tabs.value.length === 0) return

    const inWorkspace = workspaceTabs.value.some((t) => t.id === activeTabId.value)
    if (inWorkspace) return
    if (workspaceTabs.value.length > 0) {
      switchTab(workspaceTabs.value[0].id)
    } else {
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
    tabGroupFilterId,
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
    bookmarkBarVisible,
    toggleBookmarkBar,
    tabGroupEnabled,
    tabGroupMode,
    setTabGroupMode,
    setTabGroupFilter,
    clearTabGroupFilter,
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
    forceReload,
    zoomIn,
    zoomOut,
    zoomReset,
    detectProxy,
    setProxyEnabled,
    applyProxy,
    openDevTools,
    openInNewWindow,
    openInBrowser,
    toggleMute,
    muteSite,
    unmuteSite,
    mutedSites,
    isSiteMuted,
    togglePin,
    restoreTab,
    gotoTab,
    gotoLastTab,
    init,
    saveState
  }
})
