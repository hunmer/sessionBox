<script setup lang="ts">
import { onMounted, onUnmounted, nextTick, ref, watch, computed } from 'vue'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import TabBar from '@/components/tabs/TabBar.vue'
import TabBarVertical from '@/components/tabs/TabBarVertical.vue'
import BrowserToolbar from '@/components/toolbar/BrowserToolbar.vue'
import FavoriteBar from '@/components/favorite/FavoriteBar.vue'
import ProxyDialog from '@/components/proxy/ProxyDialog.vue'
import SettingsDialog from '@/components/settings/SettingsDialog.vue'
import UpdateNotification from '@/components/common/UpdateNotification.vue'
import { useAccountStore } from '@/stores/account'
import { useTabStore } from '@/stores/tab'
import { useProxyStore } from '@/stores/proxy'
import { useBookmarkStore } from '@/stores/bookmark'
import { useWorkspaceStore } from '@/stores/workspace'
import { isOverlayActive } from '@/lib/webview-overlay'
import { markRaw, type Component } from 'vue'
import BookmarksPage from '@/components/bookmarks/BookmarksPage.vue'

const INTERNAL_PAGES: Record<string, Component> = {
  bookmarks: markRaw(BookmarksPage)
}

const internalPageComponent = computed(() => {
  const path = tabStore.internalPagePath
  if (!path) return null
  return INTERNAL_PAGES[path] ?? null
})

const accountStore = useAccountStore()
const tabStore = useTabStore()
const proxyStore = useProxyStore()
const bookmarkStore = useBookmarkStore()
const workspaceStore = useWorkspaceStore()

const proxyDialogOpen = ref(false)
const settingsDialogOpen = ref(false)
const ready = ref(false)
const isMaximized = ref(false)
const verticalTabAddDialog = ref(false)

// ====== 侧边栏面板控制 ======
const SIDEBAR_STORAGE_KEY = 'sessionbox-sidebar-width'
const SIDEBAR_COLLAPSED_SIZE = 52
const SIDEBAR_DEFAULT_SIZE = 260

// ====== 垂直标签栏面板控制 ======
const VERTICAL_TAB_STORAGE_KEY = 'sessionbox-vertical-tab-width'
const VERTICAL_TAB_DEFAULT_SIZE = 180

const sidebarPanelRef = ref<InstanceType<typeof ResizablePanel>>()

// 从 localStorage 恢复侧边栏宽度
const savedWidth = localStorage.getItem(SIDEBAR_STORAGE_KEY)
const sidebarDefaultSize = savedWidth ? Number(savedWidth) : SIDEBAR_DEFAULT_SIZE
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
    const prevSize = panel.getSize?.() as number
    panel.expand()
    sidebarCollapsed.value = false
    // expand() 依赖内部记录的折叠前大小，首次启动时该记录不存在，
    // 会回退到 minSize（52px）= collapsedSize，等于没展开。
    // 需要在下一帧检测实际宽度是否有变化，无变化则手动 resize 到默认宽度。
    nextTick(() => {
      const newSize = panel.getSize?.() as number
      if (newSize != null && Math.abs(newSize - prevSize) < 2) {
        panel.resize(SIDEBAR_DEFAULT_SIZE)
      }
    })
  } else {
    panel.collapse()
    sidebarCollapsed.value = true
  }
}

// 窗口最大化状态
window.api.on('window:maximized', () => { isMaximized.value = true })
window.api.on('window:unmaximized', () => { isMaximized.value = false })
window.api.window.isMaximized().then((m: boolean) => { isMaximized.value = m })

/** 向主进程同步 webview 容器的位置和大小 */
function sendBounds() {
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

onMounted(async () => {
  await Promise.all([
    workspaceStore.init(),
    accountStore.init(),
    tabStore.init(),
    proxyStore.init(),
    bookmarkStore.init()
  ])
  ready.value = true

  // 监听 webview 容器尺寸变化
  await nextTick()
  const container = document.getElementById('webview-container')
  if (container) {
    resizeObserver = new ResizeObserver(() => sendBounds())
    resizeObserver.observe(container)
  }

  // 主进程请求同步 bounds（switchView 后触发）
  window.api.on('tab:request-bounds', () => sendBounds())

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
})

// 退出前保存 tab 状态（title/url 等运行时数据回写到主进程 store）
window.addEventListener('beforeunload', () => {
  tabStore.saveState()
})

// Tab 切换时同步 bounds
watch(() => tabStore.activeTabId, () => {
  nextTick(() => sendBounds())
})

// 快捷网站栏显隐时同步 bounds
watch(() => tabStore.favoriteBarVisible, () => {
  nextTick(() => sendBounds())
})
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div
      class="h-screen w-screen overflow-hidden bg-background text-foreground transition-all duration-150"
      :class="isMaximized ? '' : 'rounded-lg border border-border/60 shadow-2xl dark:shadow-black/50'"
    >
      <ResizablePanelGroup :key="tabStore.tabLayout" direction="horizontal" @layout="handleLayout">
        <!-- 侧边栏面板 -->
        <ResizablePanel
          ref="sidebarPanelRef"
          size-unit="px"
          :default-size="sidebarDefaultSize"
          :min-size="SIDEBAR_COLLAPSED_SIZE"
          :collapsed-size="SIDEBAR_COLLAPSED_SIZE"
          collapsible
          @collapse="sidebarCollapsed = true"
          @expand="sidebarCollapsed = false"
        >
          <Sidebar
            :collapsed="sidebarCollapsed"
            @open-proxy="proxyDialogOpen = true"
            @open-settings="settingsDialogOpen = true"
            @toggle-collapse="toggleSidebar"
          />
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
              <!-- 水平标签栏（仅水平模式） -->
              <TabBar v-if="tabStore.tabLayout === 'horizontal'" :is-maximized="isMaximized" />

              <!-- 快捷网站栏 -->
              <FavoriteBar v-if="tabStore.favoriteBarVisible" />

              <!-- 工具栏 -->
              <BrowserToolbar v-if="tabStore.activeTab" />

              <!-- WebContentsView 占位区域 -->
              <div class="flex-1 relative bg-background">
                <!-- 内部页面渲染 -->
                <div
                  v-if="tabStore.isInternalPage"
                  class="absolute inset-0 z-20 overflow-auto"
                >
                  <component :is="internalPageComponent" v-if="internalPageComponent" />
                  <div v-else class="flex items-center justify-center h-full">
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
                    <p class="text-sm text-muted-foreground">点击左侧账号或使用标签栏 + 按钮打开新标签页</p>
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
                <div id="webview-container" class="absolute inset-0" />
              </div>
            </template>

            <!-- 加载态 -->
            <div v-else class="flex items-center justify-center flex-1">
              <p class="text-muted-foreground text-sm">加载中...</p>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>

    <!-- 代理管理弹窗 -->
    <ProxyDialog :open="proxyDialogOpen" @update:open="proxyDialogOpen = $event" />

    <!-- 设置弹窗 -->
    <SettingsDialog :open="settingsDialogOpen" @update:open="settingsDialogOpen = $event" />

    <!-- 更新提示弹窗 -->
    <UpdateNotification />
  </TooltipProvider>
</template>
