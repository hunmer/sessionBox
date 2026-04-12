<script setup lang="ts">
import { onMounted, onUnmounted, nextTick, ref, watch, computed, shallowRef } from 'vue'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { SidebarProvider } from '@/components/ui/sidebar'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import TabBar from '@/components/tabs/TabBar.vue'
import TabBarVertical from '@/components/tabs/TabBarVertical.vue'
import BrowserToolbar from '@/components/toolbar/BrowserToolbar.vue'
import BookmarkBar from '@/components/bookmarks/BookmarkBar.vue'
import ProxyDialog from '@/components/proxy/ProxyDialog.vue'
import SettingsDialog from '@/components/settings/SettingsDialog.vue'
import UpdateNotification from '@/components/common/UpdateNotification.vue'
import RightPanel from '@/components/common/RightPanel.vue'
import SplitView from '@/components/tabs/SplitView.vue'
import TabOverviewDialog from '@/components/tabs/TabOverviewDialog.vue'
import { useSplitStore } from '@/stores/split'
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
import { useTabStore } from '@/stores/tab'
import { useProxyStore } from '@/stores/proxy'
import { useBookmarkStore } from '@/stores/bookmark'
import { useWorkspaceStore } from '@/stores/workspace'
import { useHomepageStore } from '@/stores/homepage'
import { useIpcEvent } from '@/composables/useIpc'
import { isOverlayActive, isWebviewBlocked, startWebviewOverlayDetection, stopWebviewOverlayDetection } from '@/lib/webview-overlay'
import { markRaw, type Component } from 'vue'
import BookmarksPage from '@/components/bookmarks/BookmarksPage.vue'
import HistoryPage from '@/components/history/HistoryPage.vue'
import DownloadsPage from '@/components/download/DownloadsPage.vue'
import ContainersPage from '@/components/containers/ContainersPage.vue'

const INTERNAL_PAGES: Record<string, Component> = {
  bookmarks: markRaw(BookmarksPage),
  history: markRaw(HistoryPage),
  downloads: markRaw(DownloadsPage),
  containers: markRaw(ContainersPage)
}

const internalPageComponent = computed(() => {
  const path = tabStore.internalPagePath
  if (!path) return null
  return INTERNAL_PAGES[path] ?? null
})

const containerStore = useContainerStore()
const pageStore = usePageStore()
const tabStore = useTabStore()
const proxyStore = useProxyStore()
const bookmarkStore = useBookmarkStore()
const workspaceStore = useWorkspaceStore()
const homepageStore = useHomepageStore()
const splitStore = useSplitStore()

const proxyDialogOpen = ref(false)
const settingsDialogOpen = ref(false)
const settingsInitialTab = ref('general')
const ready = ref(false)
const isMaximized = ref(false)
const verticalTabAddDialog = ref(false)
const tabOverviewOpen = ref(false)
const activeProxyBadgeText = computed(() => tabStore.activeProxyInfo?.text || '')
const shouldShowWebContentsView = computed(() =>
  !!tabStore.activeTab && !tabStore.isInternalPage && !isWebviewBlocked.value
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
  void tabStore.saveState()
  void splitStore.persistState()
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
  // 1. 更新容器的 autoProxyEnabled（持久化）
  await containerStore.updateContainer(container.id, { autoProxyEnabled: enabled })
  // 2. 立即生效：对当前 session 应用/移除代理
  await tabStore.setProxyEnabled(tabStore.activeTabId, enabled)
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
const SIDEBAR_STORAGE_KEY = 'sessionbox-sidebar-width'
const SIDEBAR_MIN_SIZE = 55 // ResizablePanel 允许的最小宽度
const SIDEBAR_COLLAPSED_SIZE = 85 // 检测折叠状态的阈值
const SIDEBAR_DEFAULT_SIZE = 260

// ====== 垂直标签栏面板控制 ======
const VERTICAL_TAB_STORAGE_KEY = 'sessionbox-vertical-tab-width'
const VERTICAL_TAB_DEFAULT_SIZE = 180

const sidebarPanelRef = ref<InstanceType<typeof ResizablePanel>>()

// 从 localStorage 恢复侧边栏宽度
const savedWidth = localStorage.getItem(SIDEBAR_STORAGE_KEY)
const sidebarDefaultSize = savedWidth ? Math.max(Number(savedWidth), SIDEBAR_MIN_SIZE) : SIDEBAR_DEFAULT_SIZE
// 如果保存的宽度等于折叠宽度，则初始化为折叠态
const sidebarCollapsed = ref(savedWidth ? Number(savedWidth) <= SIDEBAR_COLLAPSED_SIZE : false)

// 从 localStorage 恢复垂直标签栏宽度
const savedVerticalTabWidth = localStorage.getItem(VERTICAL_TAB_STORAGE_KEY)
const verticalTabDefaultSize = savedVerticalTabWidth ? Number(savedVerticalTabWidth) : VERTICAL_TAB_DEFAULT_SIZE

/** 节流保存面板宽度 + 同步 webview bounds */
let saveTimer: ReturnType<typeof setTimeout> | null = null
function handleLayout(sizes: number[]) {
  // 从布局尺寸变化同步侧边栏折叠状态（比依赖 collapse/expand 事件更可靠）
  if (sizes.length > 0) {
    sidebarCollapsed.value = Math.round(sizes[0]) <= SIDEBAR_COLLAPSED_SIZE
  }
  nextTick(() => sendBounds())
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    // sizes[0] 始终是侧边栏面板的像素宽度
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(Math.round(sizes[0])))
    // 垂直模式下 sizes[1] 是垂直标签栏面板的像素宽度
    if (tabStore.tabLayout === 'vertical' && sizes.length >= 3) {
      localStorage.setItem(VERTICAL_TAB_STORAGE_KEY, String(Math.round(sizes[1])))
    }
  }, 300)
}

/** 折叠/展开侧边栏 */
function toggleSidebar() {
  const panel = sidebarPanelRef.value as any
  if (!panel) return
  if (sidebarCollapsed.value) {
    // 展开到默认宽度
    panel.resize(SIDEBAR_DEFAULT_SIZE)
    sidebarCollapsed.value = false
  } else {
    // 折叠到最小宽度
    panel.resize(SIDEBAR_MIN_SIZE)
    sidebarCollapsed.value = true
  }
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

  await Promise.all([
    workspaceStore.init(),
    containerStore.init(),
    pageStore.loadPages(),
    tabStore.init(),
    proxyStore.init(),
    bookmarkStore.init(),
    splitStore.loadSchemes()
  ])
  await splitStore.restoreState()
  ready.value = true

  // 启动时自动打开主页
  if (homepageStore.settings.autoOpen && homepageStore.hasHomepage()) {
    const url = homepageStore.settings.url
    if (homepageStore.settings.openMethod === 'currentTab' && tabStore.activeTab) {
      tabStore.navigate(tabStore.activeTab.id, url)
    } else {
      tabStore.createTabForSite(url)
    }
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
          sidebarCollapsed.value = Math.round(size) <= SIDEBAR_COLLAPSED_SIZE
        }
      }
      sendBounds()
    }, 100)
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null }
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

useIpcEvent('tab:request-bounds', () => {
  nextTick(() => syncWebContentsViewVisibility())
})

useIpcEvent('shortcut', (actionId) => {
  const action = actionId as string
  console.log('[App] 收到快捷键事件:', action)
  const tab = tabStore.activeTab
  switch (action) {
    case 'new-tab': {
      // 新建标签页：用当前活动页面的 pageId 或第一个 page
      const currentPageId = tab?.pageId || pageStore.pages[0]?.id
      if (currentPageId) tabStore.createTab(currentPageId)
      break
    }
    case 'close-tab':
      if (tab) tabStore.closeTab(tab.id)
      break
    case 'next-tab': {
      const tabs = tabStore.sortedTabs
      if (tabs.length < 2) break
      const idx = tabs.findIndex(t => t.id === tabStore.activeTabId)
      const next = tabs[(idx + 1) % tabs.length]
      if (next) tabStore.switchTab(next.id)
      break
    }
    case 'prev-tab': {
      const tabs = tabStore.sortedTabs
      if (tabs.length < 2) break
      const idx = tabs.findIndex(t => t.id === tabStore.activeTabId)
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length]
      if (prev) tabStore.switchTab(prev.id)
      break
    }
    case 'toggle-sidebar':
      toggleSidebar()
      break
    case 'new-container':
      // 由 Sidebar 内部处理，此处通过全局事件通知
      window.dispatchEvent(new CustomEvent('shortcut:new-container'))
      break
    case 'reload-tab':
      if (tab) tabStore.reload(tab.id)
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
  }
})
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div
      class="relative h-screen w-screen overflow-hidden bg-background text-foreground transition-all duration-150"
      :class="isMaximized ? '' : 'rounded-lg border border-border/60 shadow-2xl dark:shadow-black/50'"
    >
      <!-- 全宽窗口悬浮拖拽条 -->
      <div class="absolute top-0 inset-x-0 h-[12px] z-50" style="-webkit-app-region: drag" />
      <ResizablePanelGroup :key="tabStore.tabLayout" direction="horizontal" @layout="handleLayout">
        <!-- 侧边栏面板 -->
        <ResizablePanel
          ref="sidebarPanelRef"
          size-unit="px"
          :default-size="sidebarDefaultSize"
          :min-size="SIDEBAR_MIN_SIZE"
        >
          <SidebarProvider :open="!sidebarCollapsed" @update:open="sidebarCollapsed = !$event">
            <Sidebar
              :collapsed="sidebarCollapsed"
              @open-settings="settingsDialogOpen = true; settingsInitialTab = 'user'"
            />
          </SidebarProvider>
        </ResizablePanel>

        <ResizableHandle />

        <!-- 垂直标签栏面板（仅垂直模式） -->
        <template v-if="tabStore.tabLayout === 'vertical'">
          <ResizablePanel size-unit="px" :default-size="verticalTabDefaultSize" :min-size="120" :max-size="320">
            <TabBarVertical v-model:show-add-dialog="verticalTabAddDialog" />
          </ResizablePanel>
          <ResizableHandle />
        </template>

        <!-- 主内容区面板 -->
        <ResizablePanel>
          <div class="flex flex-col h-full min-w-0">
            <template v-if="ready">
              <!-- 水平标签栏 -->
              <TabBar :is-maximized="isMaximized" @toggle-sidebar="toggleSidebar" />

               <!-- 工具栏 -->
              <BrowserToolbar v-if="tabStore.activeTab" />

              <!-- 快捷网站栏 -->
              <BookmarkBar v-if="tabStore.bookmarkBarVisible" />
             
              <!-- WebContentsView 占位区域 -->
              <div class="flex-1 relative bg-background">
                <!-- 内部页面渲染（v-show + KeepAlive 保留状态，避免切换 tab 时销毁重建） -->
                <div
                  v-show="tabStore.isInternalPage"
                  class="absolute inset-x-0 top-0 bottom-2 z-20 overflow-auto"
                >
                  <KeepAlive>
                    <component
                      :is="internalPageComponent"
                      v-if="internalPageComponent"
                      @open-download-settings="settingsDialogOpen = true; settingsInitialTab = 'download'"
                    />
                  </KeepAlive>
                  <div v-if="!internalPageComponent && tabStore.isInternalPage" class="flex items-center justify-center h-full">
                    <p class="text-muted-foreground text-sm">未知页面</p>
                  </div>
                </div>
                <!-- 无标签页时的空状态 -->
                <div
                  v-if="!tabStore.activeTab"
                  class="flex flex-col items-center justify-center h-full gap-4"
                >
                  <div class="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <svg class="w-8 h-8 text-muted-foreground/60" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.466.73-3.555" />
                    </svg>
                  </div>
                  <div class="text-center">
                    <p class="text-sm text-muted-foreground">点击左侧容器或使用标签栏 + 按钮打开新标签页</p>
                  </div>
                </div>
                <!-- WebContentsView 被覆盖层（dialog/dropdown）隐藏时的兜底 -->
                <div
                  v-else-if="isOverlayActive"
                  class="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center"
                >
                  <p class="text-sm text-muted-foreground/60">页面已暂停</p>
                </div>
                <!-- 主进程在此区域叠加 WebContentsView -->
                <SplitView :key="splitStore.layoutRevision" class="absolute inset-x-0 top-0 bottom-7" />
                <!-- 页面加载进度条 -->
                <div class="absolute bottom-[3px] inset-x-0 z-20">
                  <div class="h-6 w-full border-t bg-background/95 backdrop-blur-sm px-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span class="truncate">
                      {{ tabStore.activeTab?.url || '就绪' }}
                    </span>
                    <div v-if="tabStore.activeProxyInfo" class="flex items-center gap-2 shrink-0 max-w-[45%]">
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
                  <div v-if="showProgress" class="absolute bottom-0 inset-x-0 z-30">
                    <Progress :model-value="loadingProgress" class="h-[3px] rounded-none" />
                  </div>
                </Transition>
              </div>
            </template>

            <!-- 加载态 -->
            <div v-else class="flex items-center justify-center flex-1">
              <p class="text-muted-foreground text-sm">加载中...</p>
            </div>
          </div>
        </ResizablePanel>

        <!-- 右侧面板（固定 50px） -->
        <div class="w-[50px] shrink-0 h-full border-l border-border">
          <RightPanel
            @open-settings="settingsDialogOpen = true; settingsInitialTab = $event || 'general'"
            @open-proxy="proxyDialogOpen = true"
          />
        </div>
      </ResizablePanelGroup>
    </div>

    <!-- 代理管理弹窗 -->
    <ProxyDialog :open="proxyDialogOpen" @update:open="proxyDialogOpen = $event" />

    <!-- 设置弹窗 -->
    <SettingsDialog :open="settingsDialogOpen" :initial-tab="settingsInitialTab" @update:open="settingsDialogOpen = $event" />

    <!-- 标签页概览弹窗 -->
    <TabOverviewDialog :open="tabOverviewOpen" @update:open="tabOverviewOpen = $event" />

    <!-- 更新提示弹窗 -->
    <UpdateNotification />

    <!-- 全局 Toast 通知 -->
    <Toaster rich-colors position="top-center" />
  </TooltipProvider>
</template>
