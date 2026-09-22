<script setup lang="ts">
import { onMounted, onUnmounted, nextTick, ref, watch, computed } from 'vue'
import { Info, Loader2, RotateCw } from 'lucide-vue-next'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { SidebarProvider } from '@/components/ui/sidebar'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import TabBar from '@/components/tabs/TabBar.vue'
import TabBarVertical from '@/components/tabs/TabBarVertical.vue'
import BookmarkBar from '@/components/bookmarks/BookmarkBar.vue'
import ProxyDialog from '@/components/proxy/ProxyDialog.vue'
import SettingsDialog from '@/components/settings/SettingsDialog.vue'
import UpdateNotification from '@/components/common/UpdateNotification.vue'
import RightPanel from '@/components/common/RightPanel.vue'
import InternalPageHost from '@/components/common/InternalPageHost.vue'
import WindowResizeHandles from '@/components/common/WindowResizeHandles.vue'
import SplitView from '@/components/tabs/SplitView.vue'
import WebviewHost from '@/components/tabs/WebviewHost.vue'
import SiteDataPopover from '@/components/toolbar/SiteDataPopover.vue'
import TabOverviewDialog from '@/components/tabs/TabOverviewDialog.vue'
import NewTabDialog from '@/components/tabs/NewTabDialog.vue'
import CommandPaletteDialog from '@/components/command-palette/CommandPaletteDialog.vue'
import ContainerSelectDialog from '@/components/containers/ContainerSelectDialog.vue'
import { useSplitStore } from '@/stores/split'
import { useWallpaperStore } from '@/stores/wallpaper'
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
import { useTabStore } from '@/stores/tab'
import { useProxyStore } from '@/stores/proxy'
import { useBookmarkStore } from '@/stores/bookmark'
import { useWorkspaceStore } from '@/stores/workspace'
import { useHomepageStore } from '@/stores/homepage'
import { usePasswordStore } from '@/stores/password'
import { useMcpStore } from '@/stores/mcp'
import { createChatStore } from '@/stores/chat'
import { useChatUIStore } from '@/stores/chat-ui'
import { useAIProviderStore } from '@/stores/ai-provider'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import DebuggerPage from '@/components/debugger/DebuggerPage.vue'
import { useIpcEvent } from '@/composables/useIpc'
import { isOverlayActive, isWebviewBlocked, setForcedWebviewBlocked, startWebviewOverlayDetection, stopWebviewOverlayDetection } from '@/lib/webview-overlay'
import type { TabImplementation } from '../preload'

type ImmersiveEdge = 'top' | 'left' | 'right' | 'bottom'

const containerStore = useContainerStore()
const wallpaperStore = useWallpaperStore()
const pageStore = usePageStore()
const tabStore = useTabStore()
const proxyStore = useProxyStore()
const bookmarkStore = useBookmarkStore()
const workspaceStore = useWorkspaceStore()
const homepageStore = useHomepageStore()
const passwordStore = usePasswordStore()
const splitStore = useSplitStore()
const mcpStore = useMcpStore()
const chatStore = createChatStore('agent')
const chatUIStore = useChatUIStore()
const aiProviderStore = useAIProviderStore()

const proxyDialogOpen = ref(false)
const settingsDialogOpen = ref(false)
const settingsInitialTab = ref('general')
const ready = ref(false)
const isMaximized = ref(false)
const IMMERSIVE_STORAGE_KEY = 'sessionbox-immersive-mode'
const immersiveMode = ref(localStorage.getItem(IMMERSIVE_STORAGE_KEY) === '1')
const verticalTabAddDialog = ref(false)
const tabOverviewOpen = ref(false)
const commandPaletteOpen = ref(false)
const newTabDialogOpen = ref(false)
const siteDataPopoverOpen = ref(false)
const tabImplementation = ref<TabImplementation>('webview')
const activeProxyBadgeText = computed(() => tabStore.activeProxyInfo?.text || '')
const shouldShowWebContentsView = computed(() =>
  !!tabStore.activeTab
  && !tabStore.isInternalPage
  && (tabImplementation.value === 'webview' || !isWebviewBlocked.value)
)
const shouldPauseWebContentsView = computed(() =>
  tabImplementation.value === 'browsercontent' && isOverlayActive.value
)
const proxyApplied = computed(() => {
  const info = tabStore.activeProxyInfo
  if (!info) return false
  // 代理配置启用 且 容器自动开启 → Switch 显示 ON
  return info.enabled && info.applied
})
const activeProxyBadgeClass = computed(() => {
  const status = tabStore.activeProxyInfo?.status
  if (status === 'success') {
    return 'cursor-pointer border-transparent bg-green-600 text-white hover:bg-green-600'
  }
  if (status === 'error') {
    return 'cursor-pointer border-transparent bg-red-600 text-white hover:bg-red-600'
  }
  if (status === 'checking') {
    return 'cursor-pointer border-transparent bg-amber-500 text-white hover:bg-amber-500'
  }
  return 'cursor-pointer'
})

function syncWebContentsViewVisibility() {
  const visible = shouldShowWebContentsView.value
  if (visible) {
    sendBounds()
  }
  window.api.tab.setOverlayVisible(visible)
}

function handleBeforeUnload() {
  void splitStore.persistState()
}

// 刷新当前激活标签页（状态栏左侧按钮）
function reloadActiveTab() {
  if (tabStore.activeTabId) tabStore.reload(tabStore.activeTabId)
}

async function handleDetectProxy(): Promise<void> {
  if (!tabStore.activeTabId || !tabStore.activeProxyInfo?.enabled) return
  if (tabStore.activeProxyInfo?.status === 'checking') return
  await tabStore.detectProxy(tabStore.activeTabId)
}

async function handleToggleProxy(enabled: boolean): Promise<void> {
  if (!tabStore.activeTabId) return
  const tab = tabStore.activeTab
  if (!tab) return
  const page = pageStore.getPage(tab.pageId)
  const container = page?.containerId ? containerStore.getContainer(page.containerId) : undefined
  if (!container) return
  const previousEnabled = container.autoProxyEnabled === true
  console.log('[App] handleToggleProxy', {
    tabId: tabStore.activeTabId,
    pageId: tab.pageId,
    containerId: container.id,
    previousEnabled,
    nextEnabled: enabled
  })
  // 1. 更新容器的 autoProxyEnabled（持久化）
  await containerStore.updateContainer(container.id, { autoProxyEnabled: enabled })
  // 2. 立即生效：对当前 session 应用/移除代理
  await containerStore.updateContainer(container.id, { autoProxyEnabled: enabled })
  const result = await tabStore.setProxyEnabled(tabStore.activeTabId, enabled)
  if (!result.ok) {
    console.error('[App] handleToggleProxy failed', {
      tabId: tabStore.activeTabId,
      containerId: container.id,
      enabled,
      error: result.error
    })
    await containerStore.updateContainer(container.id, { autoProxyEnabled: previousEnabled })
  }
}

// ====== 页面加载进度条 ======
const loadingProgress = ref(0)
const showProgress = ref(false)
let progressTimer: ReturnType<typeof setInterval> | null = null

/** 模拟进度条：加载时递增到 ~90%，完成后跳到 100% 后淡出 */
watch(() => tabStore.activeNavState.isLoading, (loading) => {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null }
  if (loading) {
    showProgress.value = true
    loadingProgress.value = 0
    progressTimer = setInterval(() => {
      // 快速到 30，然后逐步减速到 90
      if (loadingProgress.value < 30) loadingProgress.value += 10
      else if (loadingProgress.value < 70) loadingProgress.value += 4
      else if (loadingProgress.value < 90) loadingProgress.value += 1
      if (loadingProgress.value >= 90) {
        clearInterval(progressTimer!)
        progressTimer = null
      }
    }, 80)
  } else {
    loadingProgress.value = 100
    setTimeout(() => { showProgress.value = false }, 300)
  }
})

// ====== 侧边栏面板控制 ======
const SIDEBAR_STORAGE_KEY = 'sessionbox-sidebar-width' // 折叠宽度（受 collapsed-size 约束）
const SIDEBAR_EXPANDED_STORAGE_KEY = 'sessionbox-sidebar-expanded-width' // 展开宽度（受 min-size 约束）
const SIDEBAR_COLLAPSED_SIZE = 55 // 折叠态宽度：collapse() 跳到这里，绕过 min-size
const SIDEBAR_MIN_SIZE = 200 // 展开态下手动拖拽的最小宽度限制（折叠态不受此限制）
const SIDEBAR_COLLAPSE_THRESHOLD = 120 // 小于此值视为已折叠（介于折叠宽度与展开最小宽度之间）
const SIDEBAR_DEFAULT_SIZE = 260

// ====== 垂直标签栏面板控制 ======
const VERTICAL_TAB_STORAGE_KEY = 'sessionbox-vertical-tab-width'
const VERTICAL_TAB_DEFAULT_SIZE = 180
const CHAT_PANEL_STORAGE_KEY = 'sessionbox-chat-panel-width'
const CHAT_PANEL_DEFAULT_SIZE = 380
const CHAT_PANEL_MIN_SIZE = 280
const CHAT_PANEL_MAX_SIZE = 600
const IMMERSIVE_HIDE_DELAY = 900
const IMMERSIVE_EDGE_TRIGGER_SIZE = 16
const RIGHT_PANEL_WIDTH = 50
const TAB_BAR_HEIGHT = 42
const TOOLBAR_HEIGHT = 42
const BOOKMARK_BAR_HEIGHT = 34
const BOTTOM_PANEL_HEIGHT = 30

// ====== 浮动卡片布局 ======
// 区域卡片：圆角描边 + 柔和阴影，配合 bg-backdrop 底色与 8px 间距形成悬浮效果
// 暗色下阴影加深，避免卡片浮起感消失
const CARD_CLASSES = 'h-full overflow-hidden rounded-xl border border-border/60 shadow-card dark:shadow-lg dark:shadow-black/20'
// 分隔条隐形化为 8px 间隙，悬停时微微提亮提示可拖拽
const HANDLE_CLASSES = 'w-2 rounded-full bg-transparent transition-colors hover:bg-border/40'

const sidebarPanelRef = ref<InstanceType<typeof ResizablePanel>>()

// 从 localStorage 恢复侧边栏宽度
const savedWidth = localStorage.getItem(SIDEBAR_STORAGE_KEY)
const savedExpandedWidth = localStorage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)
const isInitiallyCollapsed = savedWidth ? Number(savedWidth) <= SIDEBAR_COLLAPSE_THRESHOLD : false
// 展开宽度：优先用单独持久化的值，其次回退到当前宽度，最后用默认值。始终不低于展开最小宽度。
const sidebarExpandedSize = ref(
  Math.max(
    savedExpandedWidth ? Number(savedExpandedWidth) : (savedWidth && Number(savedWidth) > SIDEBAR_COLLAPSE_THRESHOLD ? Number(savedWidth) : SIDEBAR_DEFAULT_SIZE),
    SIDEBAR_MIN_SIZE
  )
)
// 初始尺寸：折叠态走 collapsed-size，展开态走展开宽度
const sidebarDefaultSize = isInitiallyCollapsed ? SIDEBAR_COLLAPSED_SIZE : sidebarExpandedSize.value
// 折叠状态由当前宽度推导
const sidebarCollapsed = ref(isInitiallyCollapsed)
// min-size 响应式：展开态=200（限制手动拖拽），折叠态=折叠宽度（允许缩到小尺寸）
// 这样 reka-ui 的 clamp 不会阻止折叠，且无需依赖 collapse() 的转发
const sidebarMinSize = computed(() => (sidebarCollapsed.value ? SIDEBAR_COLLAPSED_SIZE : SIDEBAR_MIN_SIZE))

// 从 localStorage 恢复垂直标签栏宽度
const savedVerticalTabWidth = localStorage.getItem(VERTICAL_TAB_STORAGE_KEY)
const verticalTabDefaultSize = savedVerticalTabWidth ? Number(savedVerticalTabWidth) : VERTICAL_TAB_DEFAULT_SIZE
const sidebarCurrentSize = ref(sidebarDefaultSize)
const verticalTabCurrentSize = ref(verticalTabDefaultSize)
// 程序化折叠/展开期间，布局事件可能先于 resize 到达，暂时锁定目标状态
const sidebarToggleTarget = ref<boolean | null>(null)

// 从 localStorage 恢复聊天面板宽度
const savedChatPanelWidth = localStorage.getItem(CHAT_PANEL_STORAGE_KEY)
const chatPanelDefaultSize = savedChatPanelWidth
  ? Math.min(Math.max(Number(savedChatPanelWidth), CHAT_PANEL_MIN_SIZE), CHAT_PANEL_MAX_SIZE)
  : CHAT_PANEL_DEFAULT_SIZE
const immersivePanelVisible = ref<Record<ImmersiveEdge, boolean>>({
  top: false,
  left: false,
  right: false,
  bottom: false
})
const immersiveHideTimers: Partial<Record<ImmersiveEdge, ReturnType<typeof setTimeout>>> = {}
const immersiveSidebarSize = computed(() => Math.max(sidebarExpandedSize.value, SIDEBAR_MIN_SIZE)) // 沉浸态始终用展开宽度
const immersiveVerticalTabSize = computed(() => Math.max(verticalTabCurrentSize.value, 120))
const immersiveLeftPanelWidth = computed(() =>
  immersiveSidebarSize.value + (tabStore.tabLayout === 'vertical' ? immersiveVerticalTabSize.value : 0)
)
const immersiveContentInsetStyle = computed(() => {
  if (!immersiveMode.value) return undefined

  const baseInset = IMMERSIVE_EDGE_TRIGGER_SIZE
  const topInset = baseInset + (immersivePanelVisible.value.top
    ? TAB_BAR_HEIGHT + (tabStore.activeTab ? TOOLBAR_HEIGHT : 0) + (tabStore.bookmarkBarVisible ? BOOKMARK_BAR_HEIGHT : 0)
    : 0)
  const rightInset = baseInset + (immersivePanelVisible.value.right ? RIGHT_PANEL_WIDTH : 0)
  const bottomInset = baseInset + (immersivePanelVisible.value.bottom ? BOTTOM_PANEL_HEIGHT : 0)
  const leftInset = baseInset + (immersivePanelVisible.value.left ? immersiveLeftPanelWidth.value : 0)

  return {
    top: `${topInset}px`,
    right: `${rightInset}px`,
    bottom: `${bottomInset}px`,
    left: `${leftInset}px`
  }
})

/** 节流保存面板宽度 + 同步 webview bounds */
let saveTimer: ReturnType<typeof setTimeout> | null = null
function clearImmersiveHideTimer(edge: ImmersiveEdge) {
  const timer = immersiveHideTimers[edge]
  if (timer) {
    clearTimeout(timer)
    delete immersiveHideTimers[edge]
  }
}

function setImmersivePanelVisible(edge: ImmersiveEdge, visible: boolean) {
  immersivePanelVisible.value = {
    ...immersivePanelVisible.value,
    [edge]: visible
  }
}

function showImmersivePanel(edge: ImmersiveEdge) {
  if (!immersiveMode.value) return
  clearImmersiveHideTimer(edge)
  setImmersivePanelVisible(edge, true)
}

function hideImmersivePanel(edge: ImmersiveEdge) {
  clearImmersiveHideTimer(edge)
  setImmersivePanelVisible(edge, false)
}

function scheduleHideImmersivePanel(edge: ImmersiveEdge, delay = IMMERSIVE_HIDE_DELAY) {
  if (!immersiveMode.value) return
  clearImmersiveHideTimer(edge)
  immersiveHideTimers[edge] = setTimeout(() => {
    hideImmersivePanel(edge)
  }, delay)
}

function closeAllImmersivePanels() {
  ;(['top', 'left', 'right', 'bottom'] as ImmersiveEdge[]).forEach((edge) => {
    clearImmersiveHideTimer(edge)
  })
  immersivePanelVisible.value = {
    top: false,
    left: false,
    right: false,
    bottom: false
  }
}

function handleImmersiveModeChange(enabled: boolean) {
  immersiveMode.value = enabled
  if (enabled) {
    showImmersivePanel('top')
    scheduleHideImmersivePanel('top', 1500)
  } else {
    closeAllImmersivePanels()
  }
}
function handleLayout(sizes: number[]) {
  // 从布局尺寸变化同步侧边栏折叠状态（比依赖 collapse/expand 事件更可靠）
  if (sizes.length > 0) {
    const sidebarWidth = Math.round(sizes[0])
    sidebarCurrentSize.value = sidebarWidth
    const isCollapsed = sidebarWidth <= SIDEBAR_COLLAPSE_THRESHOLD
    // 仅在展开态下记录展开宽度，并保证不低于展开最小宽度
    if (!isCollapsed) {
      sidebarExpandedSize.value = Math.max(sidebarWidth, SIDEBAR_MIN_SIZE)
    }
    if (sidebarToggleTarget.value !== null) {
      sidebarCollapsed.value = sidebarToggleTarget.value
      // resize 已达到目标尺寸后，恢复由实际布局尺寸驱动状态
      const reachedTarget = sidebarToggleTarget.value ? isCollapsed : !isCollapsed
      if (reachedTarget) sidebarToggleTarget.value = null
    } else {
      sidebarCollapsed.value = isCollapsed
    }
  }
  if (tabStore.tabLayout === 'vertical' && sizes.length >= 3) {
    verticalTabCurrentSize.value = Math.max(Math.round(sizes[1]), 120)
  }
  nextTick(() => sendBounds())
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (sizes.length > 0) {
      const sidebarWidth = Math.round(sizes[0])
      // sizes[0] 是侧边栏面板的像素宽度（折叠态=collapsed-size，展开态=展开宽度）
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth))
      // 展开宽度单独持久化，确保重载后展开仍能恢复到原宽度
      if (sidebarWidth > SIDEBAR_COLLAPSE_THRESHOLD) {
        localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, String(Math.max(sidebarWidth, SIDEBAR_MIN_SIZE)))
      }
    }
    // 垂直模式下 sizes[1] 是垂直标签栏面板的像素宽度
    if (tabStore.tabLayout === 'vertical' && sizes.length >= 3) {
      localStorage.setItem(VERTICAL_TAB_STORAGE_KEY, String(Math.round(sizes[1])))
    }
    // 右侧工具面板始终是最后一个面板
    if (chatUIStore.isPanelVisible || chatUIStore.isDebuggerPanelVisible) {
      const chatWidth = Math.round(sizes[sizes.length - 1])
      if (chatWidth >= CHAT_PANEL_MIN_SIZE && chatWidth <= CHAT_PANEL_MAX_SIZE) {
        localStorage.setItem(CHAT_PANEL_STORAGE_KEY, String(chatWidth))
      }
    }
  }, 300)
}

/** 折叠/展开侧边栏 */
function toggleSidebar() {
  const panel = sidebarPanelRef.value as any
  if (!panel) return
  if (sidebarCollapsed.value) {
    // 展开：先置为展开态，让 min-size 回到 200，再恢复记忆宽度
    sidebarToggleTarget.value = false
    sidebarCollapsed.value = false
    nextTick(() => panel.resize(Math.max(sidebarExpandedSize.value, SIDEBAR_MIN_SIZE)))
    return
  }
  // 折叠：先置为折叠态，让 min-size 降到折叠宽度，再缩到 collapsed-size
  sidebarToggleTarget.value = true
  sidebarCollapsed.value = true
  nextTick(() => panel.resize(SIDEBAR_COLLAPSED_SIZE))
}

// 窗口最大化状态
useIpcEvent('window:maximized', () => { isMaximized.value = true })
useIpcEvent('window:unmaximized', () => { isMaximized.value = false })
window.api.window.isMaximized().then((m: boolean) => { isMaximized.value = m })


/** 向主进程同步 webview 容器的位置和大小 */
function sendBounds() {
  if (splitStore.isSplitActive) {
    // Multi-pane mode: bounds are handled by SplitView component
    return
  }
  const container = document.getElementById('webview-container')
  if (!container || !tabStore.activeTabId) return
  const rect = container.getBoundingClientRect()
  window.api.tab.updateBounds({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  })
}

let resizeObserver: ResizeObserver | null = null

function bindWebviewContainerObserver() {
  resizeObserver?.disconnect()
  resizeObserver = null

  const container = document.getElementById('webview-container')
  if (!container) return

  resizeObserver = new ResizeObserver(() => sendBounds())
  resizeObserver.observe(container)
}

onMounted(async () => {
  startWebviewOverlayDetection()
  window.addEventListener('beforeunload', handleBeforeUnload)
  tabImplementation.value = await window.api.settings.getTabImplementation()

  await Promise.all([
    workspaceStore.init(),
    containerStore.init(),
    pageStore.loadPages(),
    tabStore.init(),
    proxyStore.init(),
    bookmarkStore.init(),
    splitStore.loadSchemes(),
    passwordStore.init()
  ])
  await splitStore.restoreState()
  await mcpStore.init()
  void chatStore.init()
  void aiProviderStore.init()
  ready.value = true

  // 启动时自动打开主页（默认 session，不挂账号容器）
  if (homepageStore.settings.autoOpen && homepageStore.hasHomepage()) {
    tabStore.createTabInDefaultSession(homepageStore.settings.url)
  }

  // 监听 webview 容器尺寸变化
  await nextTick()
  bindWebviewContainerObserver()

  // reka-ui 初始化时 layout 计算可能因 groupSizeInPixels 未就绪而跳过，
  // 导致 handleLayout 不被调用。主动同步一次侧边栏折叠状态。
  nextTick(() => {
    setTimeout(() => {
      const panel = sidebarPanelRef.value as any
      if (panel) {
        const size = panel.getSize?.()
        if (size != null) {
          const sidebarWidth = Math.round(size)
          const isCollapsed = sidebarWidth <= SIDEBAR_COLLAPSE_THRESHOLD
          sidebarCurrentSize.value = sidebarWidth
          if (!isCollapsed) {
            sidebarExpandedSize.value = Math.max(sidebarWidth, SIDEBAR_MIN_SIZE)
          }
          sidebarCollapsed.value = isCollapsed
        }
      }
      sendBounds()
    }, 100)
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null }
  closeAllImmersivePanels()
  setForcedWebviewBlocked(false)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  stopWebviewOverlayDetection()
})

// 主进程切换 view、内部页面切换、覆盖层显隐时统一同步 WebContentsView 状态
watch([() => tabStore.activeTabId, shouldShowWebContentsView], () => {
  nextTick(() => syncWebContentsViewVisibility())
}, { immediate: true, flush: 'post' })

watch(() => splitStore.layoutRevision, () => {
  if (!ready.value) return

  nextTick(() => {
    bindWebviewContainerObserver()
    syncWebContentsViewVisibility()
  })
}, { flush: 'post' })

// 快捷网站栏显隐时同步 bounds
watch(() => tabStore.bookmarkBarVisible, () => {
  nextTick(() => sendBounds())
})

watch(immersiveMode, (enabled) => {
  localStorage.setItem(IMMERSIVE_STORAGE_KEY, enabled ? '1' : '0')
  if (!enabled) {
    closeAllImmersivePanels()
  }
  nextTick(() => sendBounds())
}, { flush: 'post' })

watch(() => ({
  top: immersivePanelVisible.value.top,
  right: immersivePanelVisible.value.right,
  bottom: immersivePanelVisible.value.bottom,
  left: immersivePanelVisible.value.left
}), () => {
  setForcedWebviewBlocked(false)
  nextTick(() => syncWebContentsViewVisibility())
}, { flush: 'post' })

useIpcEvent('tab:request-bounds', () => {
  nextTick(() => syncWebContentsViewVisibility())
})

useIpcEvent('shortcut', (actionId) => {
  const action = actionId as string
  console.log('[App] 收到快捷键事件:', action)
  const tab = tabStore.activeTab
  switch (action) {
    case 'new-tab': {
      newTabDialogOpen.value = true
      break
    }
    case 'close-tab':
      if (tab) tabStore.closeTab(tab.id)
      break
    case 'next-tab': {
      const tabs = tabStore.workspaceTabs
      if (tabs.length < 2) break
      const idx = tabs.findIndex(t => t.id === tabStore.activeTabId)
      const next = tabs[(idx + 1) % tabs.length]
      if (next) tabStore.switchTab(next.id)
      break
    }
    case 'prev-tab': {
      const tabs = tabStore.workspaceTabs
      if (tabs.length < 2) break
      const idx = tabs.findIndex(t => t.id === tabStore.activeTabId)
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length]
      if (prev) tabStore.switchTab(prev.id)
      break
    }
    case 'toggle-sidebar':
      if (immersiveMode.value) {
        if (immersivePanelVisible.value.left) {
          hideImmersivePanel('left')
        } else {
          showImmersivePanel('left')
        }
      } else {
        toggleSidebar()
      }
      break
    case 'new-container':
      // 由 Sidebar 内部处理，此处通过全局事件通知
      window.dispatchEvent(new CustomEvent('shortcut:new-container'))
      break
    case 'reload-tab':
      if (tab) tabStore.reload(tab.id)
      else window.location.reload()
      break
    case 'go-back':
      if (tab) tabStore.goBack(tab.id)
      break
    case 'go-forward':
      if (tab) tabStore.goForward(tab.id)
      break
    case 'focus-address': {
      const input = document.querySelector<HTMLInputElement>('[data-address-input]')
      input?.focus()
      break
    }
    case 'toggle-fullscreen':
      window.api.window.toggleFullscreen()
      break
    case 'tab-overview':
      tabOverviewOpen.value = !tabOverviewOpen.value
      break
    case 'command-palette':
      commandPaletteOpen.value = !commandPaletteOpen.value
      break
    case 'restore-tab':
      tabStore.restoreTab()
      break
    case 'goto-tab-1': tabStore.gotoTab(1); break
    case 'goto-tab-2': tabStore.gotoTab(2); break
    case 'goto-tab-3': tabStore.gotoTab(3); break
    case 'goto-tab-4': tabStore.gotoTab(4); break
    case 'goto-tab-5': tabStore.gotoTab(5); break
    case 'goto-tab-6': tabStore.gotoTab(6); break
    case 'goto-tab-7': tabStore.gotoTab(7); break
    case 'goto-tab-8': tabStore.gotoTab(8); break
    case 'goto-tab-last':
      tabStore.gotoLastTab()
      break
    case 'reload-tab-f5':
      if (tab) tabStore.reload(tab.id)
      else window.location.reload()
      break
    case 'force-reload':
      if (tab) tabStore.forceReload(tab.id)
      break
    case 'toggle-bookmark-bar':
      tabStore.toggleBookmarkBar()
      break
    case 'open-downloads':
      tabStore.openInternalPage('downloads')
      break
    case 'open-history':
      tabStore.openInternalPage('history')
      break
    case 'prev-workspace': {
      const sorted = workspaceStore.sortedWorkspaces
      if (sorted.length < 2) break
      const curIdx = sorted.findIndex(w => w.id === workspaceStore.activeWorkspaceId)
      const prev = sorted[(curIdx - 1 + sorted.length) % sorted.length]
      if (prev) workspaceStore.activate(prev.id)
      break
    }
    case 'next-workspace': {
      const sorted = workspaceStore.sortedWorkspaces
      if (sorted.length < 2) break
      const curIdx = sorted.findIndex(w => w.id === workspaceStore.activeWorkspaceId)
      const next = sorted[(curIdx + 1) % sorted.length]
      if (next) workspaceStore.activate(next.id)
      break
    }
    case 'zoom-in':
      if (tab) tabStore.zoomIn(tab.id)
      break
    case 'zoom-out':
      if (tab) tabStore.zoomOut(tab.id)
      break
    case 'zoom-reset':
      if (tab) tabStore.zoomReset(tab.id)
      break
    case 'open-devtools':
    case 'open-devtools-alt':
      // 快捷键打开的是 Electron 应用自身的开发者工具；网页的开发者工具唯一入口在 TabLayoutMenu 菜单
      window.api.window.toggleDevTools()
      break
    case 'focus-address-f6': {
      const input = document.querySelector<HTMLInputElement>('[data-address-input]')
      input?.focus()
      break
    }
  }
})
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div
      class="relative h-screen w-screen overflow-hidden bg-backdrop text-foreground transition-all duration-150"
      :class="[
        isMaximized ? '' : 'rounded-lg border border-border/60 shadow-2xl dark:shadow-black/50',
        // isolate 建立层叠上下文，让壁纸层(-z-10)压在窗口底色之上、所有内容之下
        wallpaperStore.activeUrl ? 'isolate' : ''
      ]"
    >
      <!-- 壁纸层 -->
      <div
        v-if="wallpaperStore.activeUrl"
        class="absolute inset-0 -z-10 overflow-hidden pointer-events-none"
      >
        <!-- 模糊时图层向外扩 blur+4px：blur 采样越界产生的透明边缘被容器裁掉，
             避免出现描边式透明带，也不需要放大图片 -->
        <div
          class="absolute bg-cover bg-center"
          :style="{
            inset: wallpaperStore.blur > 0 ? `${-(wallpaperStore.blur + 4)}px` : '0',
            backgroundImage: `url(${wallpaperStore.activeUrl})`,
            filter: wallpaperStore.blur > 0 ? `blur(${wallpaperStore.blur}px)` : undefined
          }"
        />
      </div>
      <!-- 全宽窗口悬浮拖拽条 -->
      <div
        class="absolute top-0 inset-x-0 h-[12px] z-50"
        style="-webkit-app-region: drag"
      />
      <!-- 透明窗口手动缩放把手（Windows 上无原生 resize 边框） -->
      <WindowResizeHandles v-if="!isMaximized" />
      <WebviewHost />
      <ResizablePanelGroup
        v-if="!immersiveMode"
        :key="tabStore.tabLayout"
        direction="horizontal"
        class="p-2"
        @layout="handleLayout"
      >
        <template v-if="!immersiveMode">
          <!-- 侧边栏面板：min-size 响应式 —— 展开态 200 限制拖拽，折叠态 55 允许缩到小尺寸 -->
          <ResizablePanel
            ref="sidebarPanelRef"
            size-unit="px"
            :default-size="sidebarDefaultSize"
            :min-size="sidebarMinSize"
          >
            <div
              class="bg-sidebar"
              :class="CARD_CLASSES"
            >
              <SidebarProvider
                :open="!sidebarCollapsed"
                @update:open="sidebarCollapsed = !$event"
              >
                <Sidebar
                  :collapsed="sidebarCollapsed"
                  @open-settings="settingsDialogOpen = true; settingsInitialTab = $event || 'general'"
                />
              </SidebarProvider>
            </div>
          </ResizablePanel>

          <!-- 侧边栏分隔条：折叠态禁用拖拽并隐藏（min-size 已随状态切换，折叠态固定为 collapsed-size） -->
          <ResizableHandle
            :disabled="sidebarCollapsed"
            :class="[HANDLE_CLASSES, sidebarCollapsed && 'pointer-events-none opacity-0']"
          />

          <!-- 垂直标签栏面板（仅垂直模式） -->
          <template v-if="tabStore.tabLayout === 'vertical'">
            <ResizablePanel
              size-unit="px"
              :default-size="verticalTabDefaultSize"
              :min-size="120"
              :max-size="320"
            >
              <div
                class="bg-background"
                :class="CARD_CLASSES"
              >
                <TabBarVertical
                  v-model:show-add-dialog="verticalTabAddDialog"
                  :immersive-mode="immersiveMode"
                  @update:immersive-mode="handleImmersiveModeChange"
                />
              </div>
            </ResizablePanel>
            <ResizableHandle :class="HANDLE_CLASSES" />
          </template>

        <!-- 主内容区面板 -->
        </template>
        <ResizablePanel>
          <div
            class="flex flex-col h-full min-w-0 bg-background"
            :class="CARD_CLASSES"
          >
            <template v-if="ready">
              <!-- 水平标签栏 -->
              <TabBar
                v-if="!immersiveMode"
                :is-maximized="isMaximized"
                :immersive-mode="immersiveMode"
                :sidebar-collapsed="sidebarCollapsed"
                @toggle-sidebar="toggleSidebar"
                @update:immersive-mode="handleImmersiveModeChange"
              />

              <!-- 工具栏已合并至标签栏：导航按钮在左侧，其余功能在"更多"菜单 -->

              <!-- 快捷网站栏 -->
              <BookmarkBar
                v-if="tabStore.bookmarkBarVisible && !immersiveMode"
                @open-settings="settingsDialogOpen = true; settingsInitialTab = $event || 'general'"
              />
             
              <!-- WebContentsView 占位区域 -->
              <div class="flex-1 relative bg-background">
                <InternalPageHost
                  :content-inset-style="immersiveContentInsetStyle"
                  @open-download-settings="settingsDialogOpen = true; settingsInitialTab = 'download'"
                />
                <!-- 无标签页时的空状态 -->
                <div
                  v-if="!tabStore.activeTab"
                  class="flex flex-col items-center justify-center h-full gap-4"
                >
                  <div class="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <svg
                      class="w-8 h-8 text-muted-foreground/60"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.466.73-3.555"
                      />
                    </svg>
                  </div>
                  <div class="text-center">
                    <p class="text-sm text-muted-foreground">
                      点击左侧容器或使用标签栏 + 按钮打开新标签页
                    </p>
                  </div>
                </div>
                <!-- WebContentsView 被覆盖层（dialog/dropdown）隐藏时的兜底 -->
                <div
                  v-else-if="shouldPauseWebContentsView"
                  class="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center"
                >
                  <p class="text-sm text-muted-foreground/60">
                    页面已暂停
                  </p>
                </div>
                <!-- 主进程在此区域叠加 WebContentsView -->
                <div
                  class="absolute inset-x-0 top-0"
                  :class="immersiveMode ? 'bottom-0' : 'bottom-7'"
                  :style="immersiveContentInsetStyle"
                >
                  <SplitView
                    :key="splitStore.layoutRevision"
                    class="absolute inset-0"
                  />
                </div>
                <!-- 页面加载进度条 -->
                <div
                  v-if="!immersiveMode"
                  class="absolute bottom-[3px] inset-x-0 z-20"
                >
                  <div class="h-6 w-full border-t bg-background/95 backdrop-blur-sm px-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <div class="flex items-center gap-2 min-w-0">
                      <!-- 刷新/加载中 -->
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-5 w-5 shrink-0 rounded-sm text-muted-foreground"
                        :disabled="!tabStore.activeTabId"
                        @mousedown.prevent
                        @click="reloadActiveTab"
                      >
                        <Loader2
                          v-if="tabStore.activeNavState.isLoading"
                          class="w-3 h-3 animate-spin"
                        />
                        <RotateCw
                          v-else
                          class="w-3 h-3"
                        />
                      </Button>
                      <span class="truncate">
                        {{ tabStore.activeTab?.url || '就绪' }}
                      </span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0 min-w-0 max-w-[45%]">
                      <template v-if="tabStore.activeProxyInfo">
                        <Switch
                          :model-value="proxyApplied"
                          :disabled="!tabStore.activeProxyInfo?.enabled"
                          @update:model-value="handleToggleProxy"
                        />
                        <Badge
                          v-if="activeProxyBadgeText"
                          variant="outline"
                          class="max-w-full truncate select-none"
                          :class="activeProxyBadgeClass"
                          :title="tabStore.activeProxyInfo?.error || tabStore.activeProxyInfo?.ip || activeProxyBadgeText"
                          @click="handleDetectProxy"
                        >
                          {{ activeProxyBadgeText }}
                        </Badge>
                      </template>
                      <!-- 站点数据 -->
                      <Popover v-model:open="siteDataPopoverOpen">
                        <PopoverTrigger as-child>
                          <Button
                            variant="ghost"
                            size="icon"
                            class="h-5 w-5 shrink-0 rounded-sm text-muted-foreground"
                            :disabled="!tabStore.activeTabId || tabStore.isInternalPage"
                            @mousedown.prevent
                          >
                            <Info class="w-3 h-3" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="top"
                          :side-offset="4"
                          align="end"
                          class="w-80 p-0"
                        >
                          <SiteDataPopover @cleared="siteDataPopoverOpen = false" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
                <Transition
                  enter-active-class="transition-opacity duration-200"
                  leave-active-class="transition-opacity duration-300"
                >
                  <div
                    v-if="showProgress && !immersiveMode"
                    class="absolute bottom-0 inset-x-0 z-30"
                  >
                    <Progress
                      :model-value="loadingProgress"
                      class="h-[3px] rounded-none"
                    />
                  </div>
                </Transition>
              </div>
            </template>

            <!-- 加载态 -->
            <div
              v-else
              class="flex items-center justify-center flex-1"
            >
              <p class="text-muted-foreground text-sm">
                加载中...
              </p>
            </div>
          </div>
        </ResizablePanel>

        <!-- 聊天 / 网页调试面板（互斥，可调整宽度） -->
        <template v-if="chatUIStore.isPanelVisible || chatUIStore.isDebuggerPanelVisible">
          <ResizableHandle :class="HANDLE_CLASSES" />
          <ResizablePanel
            size-unit="px"
            :default-size="chatPanelDefaultSize"
            :min-size="280"
            :max-size="600"
          >
            <div
              class="bg-background"
              :class="CARD_CLASSES"
            >
              <ChatPanel
                v-if="chatUIStore.isPanelVisible"
                :chat="chatStore"
              />
              <DebuggerPage v-else />
            </div>
          </ResizablePanel>
        </template>

        <!-- 右侧面板（固定 50px） -->
        <div
          v-if="!immersiveMode"
          class="ml-2 w-[50px] shrink-0 bg-background"
          :class="CARD_CLASSES"
        >
          <RightPanel
            @open-settings="settingsDialogOpen = true; settingsInitialTab = $event || 'general'"
            @open-proxy="proxyDialogOpen = true"
          />
        </div>
      </ResizablePanelGroup>

      <div
        v-else
        class="flex h-full min-w-0 flex-col"
      >
        <template v-if="ready">
          <div class="relative flex-1 bg-background">
            <InternalPageHost
              :content-inset-style="immersiveContentInsetStyle"
              @open-download-settings="settingsDialogOpen = true; settingsInitialTab = 'download'"
            />

            <div
              v-if="!tabStore.activeTab"
              class="flex h-full flex-col items-center justify-center gap-4"
            >
              <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                <svg
                  class="h-8 w-8 text-muted-foreground/60"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.466.73-3.555"
                  />
                </svg>
              </div>
              <div class="text-center">
                <p class="text-sm text-muted-foreground">
                  点击左侧容器或使用标签栏 + 按钮打开新标签页
                </p>
              </div>
            </div>

            <div
              v-else-if="shouldPauseWebContentsView"
              class="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            >
              <p class="text-sm text-muted-foreground/60">
                页面已暂停
              </p>
            </div>

            <div
              class="absolute inset-0"
              :style="immersiveContentInsetStyle"
            >
              <SplitView
                :key="splitStore.layoutRevision"
                class="absolute inset-0"
              />
            </div>
          </div>
        </template>

        <div
          v-else
          class="flex flex-1 items-center justify-center"
        >
          <p class="text-sm text-muted-foreground">
            加载中...
          </p>
        </div>
      </div>

      <template v-if="ready && immersiveMode">
        <div
          class="absolute left-0 top-0 bottom-0 z-30"
          :style="{ width: `${IMMERSIVE_EDGE_TRIGGER_SIZE}px` }"
          @mouseenter="showImmersivePanel('left')"
        />
        <div
          class="absolute right-0 top-0 bottom-0 z-30"
          :style="{ width: `${IMMERSIVE_EDGE_TRIGGER_SIZE}px` }"
          @mouseenter="showImmersivePanel('right')"
        />
        <div
          class="absolute left-0 right-0 z-30"
          :style="{ top: '12px', height: `${IMMERSIVE_EDGE_TRIGGER_SIZE}px` }"
          @mouseenter="showImmersivePanel('top')"
        />
        <div
          class="absolute bottom-0 left-0 right-0 z-30"
          :style="{ height: `${IMMERSIVE_EDGE_TRIGGER_SIZE}px` }"
          @mouseenter="showImmersivePanel('bottom')"
        />

        <div
          class="absolute inset-x-0 top-0 z-40 overflow-hidden rounded-b-xl shadow-lg transition-all duration-300 ease-out"
          :class="immersivePanelVisible.top ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'"
          @mouseenter="showImmersivePanel('top')"
          @mouseleave="scheduleHideImmersivePanel('top')"
        >
          <TabBar
            :is-maximized="isMaximized"
            :immersive-mode="immersiveMode"
            :sidebar-collapsed="sidebarCollapsed"
            @toggle-sidebar="showImmersivePanel('left')"
            @update:immersive-mode="handleImmersiveModeChange"
          />
          <BookmarkBar
            v-if="tabStore.bookmarkBarVisible"
            @open-settings="settingsDialogOpen = true; settingsInitialTab = $event || 'general'"
          />
        </div>

        <div
          class="absolute left-0 top-0 bottom-0 z-40 flex overflow-hidden rounded-r-xl shadow-2xl transition-all duration-300 ease-out"
          :class="immersivePanelVisible.left ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'"
          :style="{ width: `${immersiveLeftPanelWidth}px` }"
          @mouseenter="showImmersivePanel('left')"
          @mouseleave="scheduleHideImmersivePanel('left')"
        >
          <div
            class="h-full border-r border-border bg-background/96 backdrop-blur-sm"
            :style="{ width: `${immersiveSidebarSize}px` }"
          >
            <SidebarProvider :open="true">
              <Sidebar
                :collapsed="false"
                @open-settings="settingsDialogOpen = true; settingsInitialTab = $event || 'general'"
              />
            </SidebarProvider>
          </div>
          <div
            v-if="tabStore.tabLayout === 'vertical'"
            class="h-full border-r border-border bg-background/96 backdrop-blur-sm"
            :style="{ width: `${immersiveVerticalTabSize}px` }"
          >
            <TabBarVertical
              v-model:show-add-dialog="verticalTabAddDialog"
              :immersive-mode="immersiveMode"
              @update:immersive-mode="handleImmersiveModeChange"
            />
          </div>
        </div>

        <div
          class="absolute right-0 top-0 bottom-0 z-40 overflow-hidden rounded-l-xl shadow-2xl transition-all duration-300 ease-out"
          :class="immersivePanelVisible.right ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'"
          :style="{ width: `${RIGHT_PANEL_WIDTH}px` }"
          @mouseenter="showImmersivePanel('right')"
          @mouseleave="scheduleHideImmersivePanel('right')"
        >
          <div class="h-full border-l border-border bg-background/96 backdrop-blur-sm">
            <RightPanel
              @open-settings="settingsDialogOpen = true; settingsInitialTab = $event || 'general'"
              @open-proxy="proxyDialogOpen = true"
            />
          </div>
        </div>

        <div
          class="absolute inset-x-0 bottom-0 z-40 overflow-hidden rounded-t-xl shadow-lg transition-all duration-300 ease-out"
          :class="immersivePanelVisible.bottom ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'"
          @mouseenter="showImmersivePanel('bottom')"
          @mouseleave="scheduleHideImmersivePanel('bottom')"
        >
          <div class="relative pb-[3px]">
            <div class="h-6 w-full border-t bg-background/95 px-3 text-[11px] text-muted-foreground backdrop-blur-sm flex items-center justify-between gap-2">
              <span class="truncate">
                {{ tabStore.activeTab?.url || '就绪' }}
              </span>
              <div
                v-if="tabStore.activeProxyInfo"
                class="flex max-w-[45%] shrink-0 items-center gap-2"
              >
                <Switch
                  :model-value="proxyApplied"
                  :disabled="!tabStore.activeProxyInfo?.enabled"
                  @update:model-value="handleToggleProxy"
                />
                <Badge
                  v-if="activeProxyBadgeText"
                  variant="outline"
                  class="max-w-full truncate select-none"
                  :class="activeProxyBadgeClass"
                  :title="tabStore.activeProxyInfo?.error || tabStore.activeProxyInfo?.ip || activeProxyBadgeText"
                  @click="handleDetectProxy"
                >
                  {{ activeProxyBadgeText }}
                </Badge>
              </div>
            </div>
          </div>
          <Transition
            enter-active-class="transition-opacity duration-200"
            leave-active-class="transition-opacity duration-300"
          >
            <div
              v-if="showProgress"
              class="absolute bottom-0 inset-x-0"
            >
              <Progress
                :model-value="loadingProgress"
                class="h-[3px] rounded-none"
              />
            </div>
          </Transition>
        </div>
      </template>
    </div>

    <!-- 代理管理弹窗 -->
    <ProxyDialog
      :open="proxyDialogOpen"
      @update:open="proxyDialogOpen = $event"
    />

    <!-- 设置弹窗 -->
    <SettingsDialog
      :open="settingsDialogOpen"
      :initial-tab="settingsInitialTab"
      @update:open="settingsDialogOpen = $event"
    />

    <!-- 标签页概览弹窗 -->
    <TabOverviewDialog
      :open="tabOverviewOpen"
      @update:open="tabOverviewOpen = $event"
    />

    <!-- 命令面板 -->
    <CommandPaletteDialog
      :open="commandPaletteOpen"
      :toggle-sidebar="toggleSidebar"
      :open-settings="() => { settingsDialogOpen = true; settingsInitialTab = 'general' }"
      :open-new-tab-dialog="() => { newTabDialogOpen = true }"
      @update:open="commandPaletteOpen = $event"
    />

    <!-- 外部链接容器选择对话框 -->
    <ContainerSelectDialog />

    <!-- 新建标签页对话框（命令面板入口） -->
    <NewTabDialog
      :open="newTabDialogOpen"
      @update:open="newTabDialogOpen = $event"
      @select="(page) => tabStore.createTab(page.id)"
      @navigate="(url) => tabStore.createTabForSite(url)"
    />

    <!-- 更新提示弹窗 -->
    <UpdateNotification />

    <!-- 全局 Toast 通知 -->
    <Toaster
      rich-colors
      position="top-center"
    />
  </TooltipProvider>
</template>
