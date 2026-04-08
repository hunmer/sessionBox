<script setup lang="ts">
import { onMounted, onUnmounted, nextTick, ref, watch } from 'vue'
import { TooltipProvider } from '@/components/ui/tooltip'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import TabBar from '@/components/tabs/TabBar.vue'
import BrowserToolbar from '@/components/toolbar/BrowserToolbar.vue'
import ProxyDialog from '@/components/proxy/ProxyDialog.vue'
import { useAccountStore } from '@/stores/account'
import { useTabStore } from '@/stores/tab'
import { useProxyStore } from '@/stores/proxy'

const accountStore = useAccountStore()
const tabStore = useTabStore()
const proxyStore = useProxyStore()

const proxyDialogOpen = ref(false)
const ready = ref(false)

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
    accountStore.init(),
    tabStore.init(),
    proxyStore.init()
  ])
  ready.value = true

  // 监听 webview 容器尺寸变化
  await nextTick()
  const container = document.getElementById('webview-container')
  if (container) {
    resizeObserver = new ResizeObserver(() => sendBounds())
    resizeObserver.observe(container)
  }
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
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <!-- 侧边栏 -->
      <Sidebar @open-proxy="proxyDialogOpen = true" />

      <!-- 主内容区 -->
      <div class="flex flex-col flex-1 min-w-0">
        <template v-if="ready">
          <!-- 标签栏 -->
          <TabBar />

          <!-- 工具栏 -->
          <BrowserToolbar v-if="tabStore.activeTab" />

          <!-- WebContentsView 占位区域 -->
          <div class="flex-1 relative bg-background">
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
            <!-- 主进程在此区域叠加 WebContentsView -->
            <div id="webview-container" class="absolute inset-0" />
          </div>
        </template>

        <!-- 加载态 -->
        <div v-else class="flex items-center justify-center flex-1">
          <p class="text-muted-foreground text-sm">加载中...</p>
        </div>
      </div>
    </div>

    <!-- 代理管理弹窗 -->
    <ProxyDialog :open="proxyDialogOpen" @update:open="proxyDialogOpen = $event" />
  </TooltipProvider>
</template>
