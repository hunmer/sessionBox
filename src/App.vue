<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { TooltipProvider } from '@/components/ui/tooltip'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import TabBar from '@/components/tabs/TabBar.vue'
import BrowserToolbar from '@/components/toolbar/BrowserToolbar.vue'
import { useAccountStore } from '@/stores/account'
import { useTabStore } from '@/stores/tab'
import { useProxyStore } from '@/stores/proxy'

const accountStore = useAccountStore()
const tabStore = useTabStore()
const proxyStore = useProxyStore()

const proxyDialogOpen = ref(false)
const ready = ref(false)

onMounted(async () => {
  await Promise.all([
    accountStore.init(),
    tabStore.init(),
    proxyStore.init()
  ])
  ready.value = true
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
              class="flex items-center justify-center h-full"
            >
              <p class="text-muted-foreground text-sm">点击左侧账号或使用 + 按钮打开新标签页</p>
            </div>
            <!-- WebContentsView 将由主进程在此区域叠加 -->
            <div id="webview-container" class="absolute inset-0" />
          </div>
        </template>

        <!-- 加载态 -->
        <div v-else class="flex items-center justify-center flex-1">
          <p class="text-muted-foreground text-sm">加载中...</p>
        </div>
      </div>
    </div>

    <!-- 代理管理弹窗（Phase 7 实现具体内容） -->
    <!-- TODO: ProxyDialog -->
  </TooltipProvider>
</template>
