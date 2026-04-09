<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useExtensionStore } from '@/stores/extension'
import { useTabStore } from '@/stores/tab'
import { Puzzle, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const extensionStore = useExtensionStore()
const tabStore = useTabStore()

const isLoading = ref(false)

// 获取当前账号已加载的扩展列表
const loadedExtensions = computed(() => {
  const accountId = tabStore.activeTab?.accountId
  if (!accountId) return []
  return extensionStore.getLoadedExtensions(accountId)
})

// 获取当前账号的 partition
const currentPartition = computed(() => {
  const accountId = tabStore.activeTab?.accountId
  if (!accountId) return ''
  return `persist:account-${accountId}`
})

// 获取当前 tab ID（字符串形式，供 browser-action-list 使用）
const currentTabId = computed(() => {
  return tabStore.activeTabId?.toString() ?? ''
})

/**
 * 初始化扩展图标列表
 * 注意：<browser-action-list> 元素需要在 DOM 中存在后才能调用 injectBrowserAction
 */
onMounted(async () => {
  const accountId = tabStore.activeTab?.accountId
  if (!accountId) return

  // 获取该账号已加载的扩展 ID
  await extensionStore.fetchAccountLoadedExtensions(accountId)

  // 延迟注入，确保 DOM 已渲染
  setTimeout(() => {
    injectBrowserActionIfNeeded()
  }, 100)
})

// 当 tab 切换时，重新注入
watch(() => tabStore.activeTabId, () => {
  setTimeout(() => {
    injectBrowserActionIfNeeded()
  }, 100)
})

/**
 * 注入 browser-action API（如果尚未注入）
 */
async function injectBrowserActionIfNeeded() {
  // 检查是否已注入
  if (document.getElementById('browser-action-injected')) {
    return
  }

  try {
    // 动态导入 injectBrowserAction
    const { injectBrowserAction } = await import('electron-chrome-extensions/browser-action')
    const { injectBrowserAction: _ } = await import('electron-chrome-extensions/dist/browser-action')

    // 注入到当前页面
    injectBrowserAction()
    console.log('[ExtensionActionList] Browser action API injected')
  } catch (error) {
    console.warn('[ExtensionActionList] Failed to inject browser action:', error)
  }
}

// 触发打开扩展管理器
const emit = defineEmits<{ 'open-manager': [] }>()
</script>

<template>
  <div class="extension-action-list flex items-center gap-1">
    <!-- browser-action-list: 显示扩展图标 -->
    <browser-action-list
      v-if="currentPartition && currentTabId"
      :partition="currentPartition"
      :tab="currentTabId"
      alignment="bottom left"
      class="extension-browser-action-list"
    />

    <!-- 占位符（无扩展时显示） -->
    <Button
      v-if="loadedExtensions.length === 0"
      variant="ghost"
      size="icon"
      class="h-7 w-7 text-muted-foreground cursor-default"
      disabled
    >
      <Puzzle class="w-4 h-4" />
    </Button>

    <!-- 扩展管理入口 -->
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      :disabled="!tabStore.activeTabId"
      @click="emit('open-manager')"
    >
      <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
      <Puzzle v-else class="w-4 h-4" />
    </Button>
  </div>
</template>

<style scoped>
extension-browser-action-list::part(action) {
  width: 20px;
  height: 20px;
}
</style>
