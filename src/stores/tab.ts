import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import { type Ref, type ComputedRef } from 'vue'
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
const MAX_RECENTLY_CLOSED = 20

// ====== 类型 ======

export interface TabProxyInfo {
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

interface ClosedTabSnapshot {
  pageId: string
  title: string
  url: string
  order: number
}

type GroupedTab = Tab & { groupName: string; groupColor?: string; isGroupStart: boolean }

// ====== Store 上下文接口 ======

interface TabStoreContext {
  tabs: Ref<Tab[]>
  activeTabId: Ref<string | null>
  tabGroupFilterId: Ref<string | null>
  navStates: Ref<Map<string, NavState>>
  favicons: Ref<Map<string, string>>
  faviconVersions: Ref<Map<string, number>>
  frozenTabIds: Ref<Set<string>>
  proxyInfos: Ref<Map<string, TabProxyInfo>>
  mutedSites: Ref<string[]>
  zoomLevels: Ref<Map<string, number>>
  pendingExternalUrl: Ref<string | null>
  recentlyClosedTabs: Ref<ClosedTabSnapshot[]>
  sortedTabs: ComputedRef<Tab[]>
  workspaceTabs: ComputedRef<Tab[]>
  listenersReady: { value: boolean }
  restoreReady: { value: boolean }
}

// ====== 纯辅助函数（不依赖 store 状态） ======

function loadTabGroupMode(): TabGroupMode {
  const stored = localStorage.getItem(TAB_GROUP_KEY)
  if (stored === 'true') return 'group'
  if (stored === 'group' || stored === 'account') return stored
  return 'none'
}

function getWorkspacePageIds(): Set<string> {
  const pageStore = usePageStore()
  const containerStore = useContainerStore()
  const workspaceStore = useWorkspaceStore()
  const activeId = workspaceStore.activeWorkspaceId
  return new Set(
    pageStore.pages
      .filter((p) => {
        const group = containerStore.getGroup(p.groupId)
        return (group?.workspaceId || '__default__') === activeId
      })
      .map((p) => p.id)
  )
}

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

function cleanupTabState(
  tabId: string,
  ctx: TabStoreContext
) {
  ctx.tabs.value = ctx.tabs.value.filter((t) => t.id !== tabId)
  ctx.navStates.value.delete(tabId)
  ctx.favicons.value.delete(tabId)
  ctx.proxyInfos.value.delete(tabId)
  useSnifferStore().onTabClosed(tabId)
}

// ====== 分组构建 ======

function buildGroupedTabs(tabs: Tab[], groupByContainer: boolean): GroupedTab[] {
  const pageStore = usePageStore()
  const containerStore = useContainerStore()

  const groupMap = new Map<string, { name: string; color?: string; tabs: Tab[] }>()
  const internalTabs: GroupedTab[] = []

  for (const tab of tabs) {
    const page = pageStore.getPage(tab.pageId)
    if (!page) {
      internalTabs.push({ ...tab, groupName: '', groupColor: undefined, isGroupStart: false })
      continue
    }

    let key: string, name: string, color: string | undefined
    if (groupByContainer) {
      key = page.containerId || '__default__'
      const container = page.containerId ? containerStore.getContainer(page.containerId) : undefined
      name = container?.name ?? '默认容器'
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

  const result: GroupedTab[] = []
  for (const [, group] of sortedGroups) {
    group.tabs.forEach((tab, i) => {
      result.push({ ...tab, groupName: group.name, groupColor: group.color, isGroupStart: i === 0 })
    })
  }
  result.push(...internalTabs)
  return result
}

function buildGroupedTabsNoInternal(tabs: Tab[], groupByContainer: boolean): GroupedTab[] {
  const pageStore = usePageStore()
  const containerStore = useContainerStore()

  const groupMap = new Map<string, { name: string; color?: string; tabs: Tab[] }>()
  for (const tab of tabs) {
    const page = pageStore.getPage(tab.pageId)
    if (!page) continue

    let key: string, name: string, color: string | undefined
    if (groupByContainer) {
      key = page.containerId || '__default__'
      const container = page.containerId ? containerStore.getContainer(page.containerId) : undefined
      name = container?.name ?? '默认容器'
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

  const result: GroupedTab[] = []
  for (const [, group] of sortedGroups) {
    group.tabs.forEach((tab, i) => {
      result.push({ ...tab, groupName: group.name, groupColor: group.color, isGroupStart: i === 0 })
    })
  }
  return result
}

// ====== 分离出的 Actions（接收 ctx 参数） ======

async function activateCreatedTab(
  ctx: TabStoreContext,
  tabId: string,
  targetPaneId?: string | null
) {
  const { useSplitStore } = await import('./split')
  const splitStore = useSplitStore()
  if (splitStore.isSplitActive) {
    splitStore.handleTabCreated(tabId, targetPaneId)
    return
  }
  await switchTab(ctx, tabId)
}

async function createTabAction(
  ctx: TabStoreContext,
  pageId: string,
  targetPaneId?: string | null
) {
  const tab = await api.tab.create(pageId)
  await activateCreatedTab(ctx, tab.id, targetPaneId)
  return tab
}

async function createTabForSiteAction(
  ctx: TabStoreContext,
  url: string,
  pageId?: string,
  targetPaneId?: string | null
) {
  const resolvedPageId = pageId || findPageInActiveWorkspace()
  const tab = await api.tab.create(resolvedPageId, url)
  await nextTick()
  await activateCreatedTab(ctx, tab.id, targetPaneId)
  return tab
}

async function createTabWithUrlAction(
  ctx: TabStoreContext,
  pageId: string,
  url: string,
  targetPaneId?: string | null
) {
  const tab = await api.tab.create(pageId, url)
  await activateCreatedTab(ctx, tab.id, targetPaneId)
  return tab
}

async function activateNextTabAfterClose(
  ctx: TabStoreContext,
   
  splitStore: any,
  nextWorkspaceTabId: string | null
) {
  if (splitStore.isSplitActive) {
    const nextSplitTabId = splitStore.focusedPane?.activeTabId
      ?? splitStore.activePanes.find((pane: { activeTabId: string }) => pane.activeTabId)?.activeTabId
      ?? null

    if (nextSplitTabId && ctx.workspaceTabs.value.some((t) => t.id === nextSplitTabId)) {
      await switchTab(ctx, nextSplitTabId)
    } else {
      ctx.activeTabId.value = null
      await api.tab.switch('')
    }
    return
  }

  if (nextWorkspaceTabId && ctx.workspaceTabs.value.some((t) => t.id === nextWorkspaceTabId)) {
    await switchTab(ctx, nextWorkspaceTabId)
  } else {
    ctx.activeTabId.value = null
    await api.tab.switch('')
  }
}

async function closeTabAction(ctx: TabStoreContext, tabId: string) {
  const closingTab = ctx.tabs.value.find((t) => t.id === tabId)
  if (closingTab && closingTab.pageId && !closingTab.url?.startsWith('sessionbox://')) {
    ctx.recentlyClosedTabs.value.unshift({
      pageId: closingTab.pageId,
      title: closingTab.title,
      url: closingTab.url,
      order: closingTab.order
    })
    if (ctx.recentlyClosedTabs.value.length > MAX_RECENTLY_CLOSED) {
      ctx.recentlyClosedTabs.value.pop()
    }
  }

  const closingActive = ctx.activeTabId.value === tabId
  const currentWorkspaceTabs = ctx.workspaceTabs.value
  const currentIndex = currentWorkspaceTabs.findIndex((t) => t.id === tabId)
  const nextWorkspaceTabId = currentIndex === -1
    ? null
    : currentWorkspaceTabs[currentIndex + 1]?.id ?? currentWorkspaceTabs[currentIndex - 1]?.id ?? null

  await api.tab.close(tabId)
  cleanupTabState(tabId, ctx)

  const { useSplitStore } = await import('./split')
  const splitStore = useSplitStore()
  splitStore.handleTabClosed(tabId)

  if (closingActive) {
    await activateNextTabAfterClose(ctx, splitStore, nextWorkspaceTabId)
  }
}

async function switchTab(ctx: TabStoreContext, tabId: string) {
  const { useSplitStore } = await import('./split')
  const splitStore = useSplitStore()
  if (splitStore.isSplitActive) {
    splitStore.handleTabClick(tabId)
    return
  }
  ctx.activeTabId.value = tabId
  await api.tab.switch(tabId)
  fetchZoomLevelAction(ctx, tabId)
}

async function updateTabAction(ctx: TabStoreContext, tabId: string, data: Partial<Omit<Tab, 'id'>>) {
  await api.tab.update(tabId, data)
  const idx = ctx.tabs.value.findIndex((t) => t.id === tabId)
  if (idx !== -1) ctx.tabs.value[idx] = { ...ctx.tabs.value[idx], ...data }
}

async function navigateAction(ctx: TabStoreContext, tabId: string, url: string) {
  if (url.startsWith('sessionbox://')) {
    await updateTabAction(ctx, tabId, { url })
    return
  }
  await api.tab.navigate(tabId, url)
}

async function openInternalPageAction(ctx: TabStoreContext, path: string) {
  const url = `sessionbox://${path}`
  const activeTabVal = ctx.tabs.value.find((t) => t.id === ctx.activeTabId.value) ?? null
  if (activeTabVal) {
    await navigateAction(ctx, activeTabVal.id, url)
  } else {
    await createTabForSiteAction(ctx, url)
  }
}

async function zoomInAction(ctx: TabStoreContext, tabId: string) {
  await api.tab.zoomIn(tabId)
  ctx.zoomLevels.value.set(tabId, await api.tab.getZoomLevel(tabId))
}

async function zoomOutAction(ctx: TabStoreContext, tabId: string) {
  await api.tab.zoomOut(tabId)
  ctx.zoomLevels.value.set(tabId, await api.tab.getZoomLevel(tabId))
}

async function zoomResetAction(ctx: TabStoreContext, tabId: string) {
  await api.tab.zoomReset(tabId)
  ctx.zoomLevels.value.set(tabId, await api.tab.getZoomLevel(tabId))
}

async function fetchZoomLevelAction(ctx: TabStoreContext, tabId: string) {
  ctx.zoomLevels.value.set(tabId, await api.tab.getZoomLevel(tabId))
}

async function toggleMuteAction(ctx: TabStoreContext, tabId: string) {
  const tab = ctx.tabs.value.find((t) => t.id === tabId)
  if (!tab) return
  const muted = !tab.muted
  tab.muted = muted
  await api.tab.setMuted(tabId, muted)
}

async function togglePinAction(ctx: TabStoreContext, tabId: string) {
  const tab = ctx.tabs.value.find((t) => t.id === tabId)
  if (!tab) return
  await updateTabAction(ctx, tabId, { pinned: !tab.pinned })
}

async function restoreTabAction(ctx: TabStoreContext): Promise<boolean> {
  if (ctx.recentlyClosedTabs.value.length === 0) return false
  const snapshot = ctx.recentlyClosedTabs.value.shift()!
  const page = usePageStore().getPage(snapshot.pageId)
  if (!page) return false
  await createTabAction(ctx, snapshot.pageId)
  return true
}

async function openExternalUrlInContainerAction(
  ctx: TabStoreContext,
  url: string,
  containerId: string,
  workspaceId?: string
) {
  const workspaceStore = useWorkspaceStore()
  const containerStore = useContainerStore()
  const targetWorkspaceId = workspaceId === '__active__' || !workspaceId
    ? workspaceStore.activeWorkspaceId
    : workspaceId

  if (targetWorkspaceId !== workspaceStore.activeWorkspaceId) {
    workspaceStore.activate(targetWorkspaceId)
    await nextTick()
  }

  const resolvedContainerId = containerId || containerStore.defaultContainerId
  const tab = await api.tab.create(null, url, resolvedContainerId, targetWorkspaceId)
  await nextTick()
  await activateCreatedTab(ctx, tab.id)
}

// ====== IPC 事件注册 ======

function registerLifecycleListeners(ctx: TabStoreContext) {
  api.on('tab:created', (tab: unknown) => {
    const nextTab = tab as Tab
    if (!ctx.tabs.value.some((item) => item.id === nextTab.id)) {
      ctx.tabs.value.push(nextTab)
      if (nextTab.muted) api.tab.setMuted(nextTab.id, true)
    }
  })

  api.on('tab:removed', async (tabId: unknown) => {
    const id = tabId as string
    const wasActive = ctx.activeTabId.value === id
    const currentWorkspaceTabs = ctx.workspaceTabs.value
    const currentIndex = currentWorkspaceTabs.findIndex((t) => t.id === id)
    const nextWorkspaceTabId = currentIndex === -1
      ? null
      : currentWorkspaceTabs[currentIndex + 1]?.id ?? currentWorkspaceTabs[currentIndex - 1]?.id ?? null

    cleanupTabState(id, ctx)

    const { useSplitStore } = await import('./split')
    const splitStore = useSplitStore()
    splitStore.handleTabClosed(id)

    if (wasActive) {
      await activateNextTabAfterClose(ctx, splitStore, nextWorkspaceTabId)
    }
  })

  api.on('tab:activated', (tabId: unknown) => {
    ctx.activeTabId.value = tabId as string
    fetchZoomLevelAction(ctx, tabId as string)
  })
}

function registerMetadataListeners(ctx: TabStoreContext) {
  api.on('tab:set-group-filter', (groupId: unknown) => {
    ctx.tabGroupFilterId.value = groupId as string | null
  })

  api.on('tab:title-updated', (tabId: unknown, title: unknown) => {
    const t = ctx.tabs.value.find((t) => t.id === tabId)
    if (t) {
      t.title = title as string
      api.tab.update(tabId, { title: title as string })
      useHistoryStore().updateTitle(t.url, title as string)
    }
  })

  api.on('tab:url-updated', (tabId: unknown, url: unknown) => {
    const t = ctx.tabs.value.find((t) => t.id === tabId)
    if (t) {
      t.url = url as string
      api.tab.update(tabId, { url: url as string })
      useHistoryStore().addHistory(url as string, t.title)
    }
  })

  api.on('tab:nav-state', (tabId: unknown, state: unknown) => {
    ctx.navStates.value.set(tabId as string, state as NavState)
  })

  api.on('tab:proxy-info', (tabId: unknown, info: unknown) => {
    const id = tabId as string
    if (!info) { ctx.proxyInfos.value.delete(id); return }
    ctx.proxyInfos.value.set(id, info as TabProxyInfo)
  })

  api.on('tab:favicon-updated', (tabId: unknown, url: unknown) => {
    const faviconUrl = url as string
    ctx.favicons.value.set(tabId as string, faviconUrl)
    if (faviconUrl.startsWith('site-icon://')) {
      const domain = faviconUrl.replace('site-icon://', '').split('?')[0]
      const cur = ctx.faviconVersions.value.get(domain) || 0
      ctx.faviconVersions.value.set(domain, cur + 1)
    }
  })
}

function registerExternalEventListeners(ctx: TabStoreContext) {
  api.on('tab:open-url', async (pageId: unknown, url: unknown) => {
    await createTabWithUrlAction(ctx, pageId as string, url as string)
  })

  api.on('tab:frozen', (tabId: unknown, frozen: unknown) => {
    const id = tabId as string
    if (frozen) { ctx.frozenTabIds.value.add(id) } else { ctx.frozenTabIds.value.delete(id) }
  })

  api.on('tab:auto-muted', (tabId: unknown) => {
    const t = ctx.tabs.value.find((t) => t.id === (tabId as string))
    if (t) t.muted = true
  })

  api.on('open-page', async (pageId: unknown) => {
    const id = pageId as string
    const pageTabs = ctx.sortedTabs.value.filter((t) => t.pageId === id)
    if (pageTabs.length > 0) {
      await switchTab(ctx, pageTabs[pageTabs.length - 1].id)
    } else {
      await createTabAction(ctx, id)
    }
  })

  api.on('tray:openInApp', async (pageId: unknown) => {
    const id = pageId as string
    const existingTab = ctx.sortedTabs.value.find(t => t.pageId === id)
    if (existingTab) {
      await switchTab(ctx, existingTab.id)
    } else {
      await createTabAction(ctx, id)
    }
  })

  api.on('open-external-url', async (url: unknown) => {
    const externalUrl = url as string
    const containerStore = useContainerStore()
    if (containerStore.askContainerOnOpen) {
      ctx.pendingExternalUrl.value = externalUrl
      return
    }
    await openExternalUrlInContainerAction(ctx, externalUrl, containerStore.defaultContainerId, containerStore.defaultWorkspaceId)
  })
}

function setupListeners(ctx: TabStoreContext) {
  if (ctx.listenersReady.value) return
  ctx.listenersReady.value = true
  registerLifecycleListeners(ctx)
  registerMetadataListeners(ctx)
  registerExternalEventListeners(ctx)
}

async function initAction(ctx: TabStoreContext) {
  ctx.tabs.value = await api.tab.list()
  ctx.mutedSites.value = await api.mutedSites.list()
  setupListeners(ctx)

  if (ctx.restoreReady.value) return

  if (ctx.tabs.value.length > 0) {
    await api.tab.restoreAll()
    const savedActiveId = localStorage.getItem(ACTIVE_TAB_KEY)
    const targetTab = savedActiveId
      ? ctx.workspaceTabs.value.find((t) => t.id === savedActiveId)
      : null

    if (targetTab) {
      await switchTab(ctx, targetTab.id)
    } else if (ctx.workspaceTabs.value.length > 0) {
      await switchTab(ctx, ctx.workspaceTabs.value[0].id)
    } else {
      ctx.activeTabId.value = null
      await api.tab.switch('')
    }
  }

  ctx.restoreReady.value = true
}

// ====== Store 定义 ======

export const useTabStore = defineStore('tab', () => {
  // -- 状态 --
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const tabGroupFilterId = ref<string | null>(null)
  const navStates = ref<Map<string, NavState>>(new Map())
  const favicons = ref<Map<string, string>>(new Map())
  const faviconVersions = ref<Map<string, number>>(new Map())
  const frozenTabIds = ref<Set<string>>(new Set())
  const proxyInfos = ref<Map<string, TabProxyInfo>>(new Map())
  const mutedSites = ref<string[]>([])
  const zoomLevels = ref<Map<string, number>>(new Map())
  const pendingExternalUrl = ref<string | null>(null)
  const recentlyClosedTabs = ref<ClosedTabSnapshot[]>([])
  const listenersReady = { value: false }
  const restoreReady = { value: false }

  // -- 布局 --
  const tabLayout = ref<TabLayout>((localStorage.getItem(TAB_LAYOUT_KEY) as TabLayout) || 'horizontal')
  function toggleLayout() {
    tabLayout.value = tabLayout.value === 'horizontal' ? 'vertical' : 'horizontal'
    localStorage.setItem(TAB_LAYOUT_KEY, tabLayout.value)
  }
  const bookmarkBarVisible = ref(localStorage.getItem(BOOKMARK_BAR_KEY) !== 'false')
  function toggleBookmarkBar() {
    bookmarkBarVisible.value = !bookmarkBarVisible.value
    localStorage.setItem(BOOKMARK_BAR_KEY, String(bookmarkBarVisible.value))
  }

  // -- 分组模式 --
  const tabGroupMode = ref<TabGroupMode>(loadTabGroupMode())
  function setTabGroupMode(mode: TabGroupMode) {
    tabGroupMode.value = mode
    localStorage.setItem(TAB_GROUP_KEY, mode)
  }
  function setTabGroupFilter(groupId: string | null) { tabGroupFilterId.value = groupId }
  function clearTabGroupFilter() { tabGroupFilterId.value = null }
  const tabGroupEnabled = computed(() => tabGroupMode.value !== 'none')

  // -- 计算属性 --
  const sortedTabs = computed(() =>
    [...tabs.value].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return a.order - b.order
    })
  )

  const workspaceTabs = computed(() => {
    const pageIds = getWorkspacePageIds()
    let result = sortedTabs.value.filter((t) => {
      if (t.pageId) return pageIds.has(t.pageId)
      if (t.workspaceId) return t.workspaceId === useWorkspaceStore().activeWorkspaceId
      return true
    })
    if (tabGroupFilterId.value) {
      const filteredPageIds = new Set(
        usePageStore().pages.filter((p) => p.groupId === tabGroupFilterId.value).map((p) => p.id)
      )
      result = result.filter((t) => filteredPageIds.has(t.pageId) || !t.pageId)
    }
    return result
  })

  const groupedSortedTabs = computed(() => {
    if (!tabGroupEnabled.value) return sortedTabs.value
    return buildGroupedTabsNoInternal(sortedTabs.value, tabGroupMode.value === 'account')
  })

  const groupedWorkspaceTabs = computed(() => {
    if (!tabGroupEnabled.value) return workspaceTabs.value
    return buildGroupedTabs(workspaceTabs.value, tabGroupMode.value === 'account')
  })

  const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value) ?? null)
  const activeNavState = computed((): NavState => {
    if (!activeTabId.value) return { canGoBack: false, canGoForward: false, isLoading: false }
    return navStates.value.get(activeTabId.value) ?? { canGoBack: false, canGoForward: false, isLoading: false }
  })
  const activeProxyInfo = computed((): TabProxyInfo | null => {
    if (!activeTabId.value) return null
    return proxyInfos.value.get(activeTabId.value) ?? null
  })
  const activeZoomLevel = computed((): number => {
    if (!activeTabId.value) return 0
    return zoomLevels.value.get(activeTabId.value) ?? 0
  })
  const isInternalPage = computed(() => !!activeTab.value?.url?.startsWith('sessionbox://'))
  const internalPagePath = computed(() => {
    const url = activeTab.value?.url
    if (!url?.startsWith('sessionbox://')) return null
    return url.replace('sessionbox://', '')
  })

  // -- Context（传给提取出的外部函数）--
  const ctx: TabStoreContext = {
    tabs, activeTabId, tabGroupFilterId, navStates, favicons, faviconVersions,
    frozenTabIds, proxyInfos, mutedSites, zoomLevels, pendingExternalUrl,
    recentlyClosedTabs, sortedTabs, workspaceTabs, listenersReady, restoreReady
  }

  // -- Actions（委托给外部函数）--
  const loadTabs = () => (ctx.tabs.value = api.tab.list())

  const createTab = (pageId: string, targetPaneId?: string | null) =>
    createTabAction(ctx, pageId, targetPaneId)
  const createTabForSite = (url: string, pageId?: string, targetPaneId?: string | null) =>
    createTabForSiteAction(ctx, url, pageId, targetPaneId)
  const closeTab = (tabId: string) => closeTabAction(ctx, tabId)
  const switchTab_ = (tabId: string) => switchTab(ctx, tabId)
  const updateTab = (tabId: string, data: Partial<Omit<Tab, 'id'>>) => updateTabAction(ctx, tabId, data)
  const reorderTabs = async (tabIds: string[]) => {
    await api.tab.reorder(tabIds)
    tabIds.forEach((id, order) => {
      const t = tabs.value.find((t) => t.id === id)
      if (t) t.order = order
    })
  }
  const navigate = (tabId: string, url: string) => navigateAction(ctx, tabId, url)
  const openInternalPage = (path: string) => openInternalPageAction(ctx, path)
  const goBack = (tabId: string) => api.tab.goBack(tabId)
  const goForward = (tabId: string) => api.tab.goForward(tabId)
  const reload = (tabId: string) => api.tab.reload(tabId)
  const forceReload = (tabId: string) => api.tab.forceReload(tabId)
  const zoomIn = (tabId: string) => zoomInAction(ctx, tabId)
  const zoomOut = (tabId: string) => zoomOutAction(ctx, tabId)
  const zoomReset = (tabId: string) => zoomResetAction(ctx, tabId)
  const fetchZoomLevel = (tabId: string) => fetchZoomLevelAction(ctx, tabId)
  const detectProxy = (tabId: string) => api.tab.detectProxy(tabId)
  const setProxyEnabled = (tabId: string, enabled: boolean) => api.tab.setProxyEnabled(tabId, enabled)
  const applyProxy = (tabId: string, proxyId: string | null) => api.tab.applyProxy(tabId, proxyId)
  const openDevTools = (tabId: string) => api.tab.openDevTools(tabId)
  const openInNewWindow = async (tabId: string) => {
    await api.tab.openInNewWindow(tabId)
    await closeTabAction(ctx, tabId)
  }
  const openInBrowser = (tabId: string) => api.tab.openInBrowser(tabId)
  const toggleMute = (tabId: string) => toggleMuteAction(ctx, tabId)
  const muteSite = async (hostname: string) => {
    await api.mutedSites.add(hostname)
    mutedSites.value = await api.mutedSites.list()
  }
  const unmuteSite = async (hostname: string) => {
    await api.mutedSites.remove(hostname)
    mutedSites.value = await api.mutedSites.list()
  }
  const isSiteMuted = (hostname: string): boolean =>
    mutedSites.value.some((site) => hostname === site || hostname.endsWith(`.${site}`))
  const togglePin = (tabId: string) => togglePinAction(ctx, tabId)
  const restoreTab = () => restoreTabAction(ctx)
  const gotoTab = (index: number): boolean => {
    const currentTabs = workspaceTabs.value
    if (currentTabs.length === 0) return false
    const targetTab = currentTabs[Math.min(index - 1, currentTabs.length - 1)]
    if (targetTab) { switchTab_(targetTab.id); return true }
    return false
  }
  const gotoLastTab = (): boolean => {
    const currentTabs = workspaceTabs.value
    if (currentTabs.length === 0) return false
    const lastTab = currentTabs[currentTabs.length - 1]
    if (lastTab) { switchTab_(lastTab.id); return true }
    return false
  }
  const openExternalUrlInContainer = (url: string, containerId: string, workspaceId?: string) =>
    openExternalUrlInContainerAction(ctx, url, containerId, workspaceId)
  const cancelExternalUrl = () => { pendingExternalUrl.value = null }
  const saveState = () => api.tab.saveAll(tabs.value)
  const init = () => initAction(ctx)

  // -- Watchers --
  watch(activeTabId, (id) => { if (id) localStorage.setItem(ACTIVE_TAB_KEY, id) })
  watch(() => useWorkspaceStore().activeWorkspaceId, () => {
    if (tabs.value.length === 0) return
    if (workspaceTabs.value.some((t) => t.id === activeTabId.value)) return
    if (workspaceTabs.value.length > 0) {
      switchTab_(workspaceTabs.value[0].id)
    } else {
      activeTabId.value = null
      api.tab.switch('')
    }
  })

  return {
    tabs, activeTabId, tabGroupFilterId, navStates, favicons, faviconVersions, frozenTabIds,
    sortedTabs, workspaceTabs, groupedWorkspaceTabs, activeTab, activeNavState, activeProxyInfo,
    isInternalPage, internalPagePath, tabLayout, toggleLayout, bookmarkBarVisible, toggleBookmarkBar,
    tabGroupEnabled, tabGroupMode, setTabGroupMode, setTabGroupFilter, clearTabGroupFilter,
    groupedSortedTabs, loadTabs, createTab, createTabForSite, closeTab, switchTab: switchTab_,
    updateTab, reorderTabs, navigate, openInternalPage, goBack, goForward, reload, forceReload,
    zoomIn, zoomOut, zoomReset, zoomLevels, fetchZoomLevel, activeZoomLevel, detectProxy,
    setProxyEnabled, applyProxy, openDevTools, openInNewWindow, openInBrowser, toggleMute,
    muteSite, unmuteSite, mutedSites, isSiteMuted, togglePin, restoreTab, gotoTab, gotoLastTab,
    pendingExternalUrl, openExternalUrlInContainer, cancelExternalUrl, init, saveState
  }
})
