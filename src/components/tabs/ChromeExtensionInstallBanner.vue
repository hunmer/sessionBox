<script setup lang="ts">
import { computed, ref } from 'vue'
import { Loader2, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useNotification } from '@/composables/useNotification'
import { useExtensionStore } from '@/stores/extension'
import { useTabStore } from '@/stores/tab'

const props = defineProps<{ tabId: string }>()
const emit = defineEmits<{ dismiss: [] }>()
const tabStore = useTabStore()
const extensionStore = useExtensionStore()
const notify = useNotification()
const opening = ref(false)
const progress = ref<{ received: number; total: number | null } | null>(null)
const progressLabel = computed(() => {
  if (!progress.value) return '正在连接...'
  const { received, total } = progress.value
  if (total && received >= total) return '正在安装扩展...'
  return total
    ? `下载中 ${Math.min(100, Math.floor(received / total * 100))}%`
    : received < 1024 * 1024
      ? `已下载 ${Math.round(received / 1024)} KB`
      : `已下载 ${(received / 1024 / 1024).toFixed(1)} MB`
})

async function openInChrome() {
  if (opening.value) return
  const url = tabStore.tabs.find((tab) => tab.id === props.tabId)?.url
  if (!url) {
    notify.error('无法获取当前扩展页面地址')
    return
  }

  opening.value = true
  progress.value = null
  try {
    const extension = await window.api.extension.installFromWebStore(url, (value) => {
      progress.value = value
    })
    if (!extension?.name) {
      throw new Error('安装服务未返回扩展信息')
    }
    notify.success(`扩展「${extension.name}」已安装并启用`)
    await extensionStore.init()
    await extensionStore.refreshLoadedExtensions()
    if (extension.compatibilityWarnings?.length) {
      notify.warning({
        title: '部分扩展权限不受 Electron 支持',
        description: extension.compatibilityWarnings.join('、')
      })
    }
    if (extension.userScriptsEnabled) {
      notify.warning({
        title: '需要重启以启用用户脚本',
        description: 'Tampermonkey 等扩展将在重启后获得用户脚本权限。',
        action: {
          label: '立即重启',
          onClick: () => window.api.extension.restartForUserScripts()
        }
      })
    }
  } catch (error) {
    notify.error({
      title: '安装扩展失败',
      description: error instanceof Error ? error.message : String(error)
    })
  } finally {
    opening.value = false
    progress.value = null
  }
}
</script>

<template>
  <div
    class="flex h-9 items-center gap-2 border-b border-blue-500/30 bg-blue-50 px-3 text-xs text-blue-950 dark:bg-blue-950 dark:text-blue-100"
  >
    <span class="min-w-0 flex-1 truncate" role="status" aria-live="polite">
      {{ opening ? progressLabel : '检测到 Chrome 扩展页面，可在 Chrome 中快捷安装' }}
    </span>
    <Button
      size="sm"
      variant="outline"
      class="h-6 px-2 text-xs"
      :disabled="opening"
      @click.stop="openInChrome"
    >
      <Loader2 v-if="opening" class="mr-1 size-3 animate-spin" />
      {{ opening ? '安装中' : '安装到 SessionBox' }}
    </Button>
    <Button
      size="icon-sm"
      variant="ghost"
      class="size-6"
      title="关闭提示"
      @click.stop="emit('dismiss')"
    >
      <X class="size-3.5" />
    </Button>
    <div v-if="opening && progress?.total" class="absolute inset-x-0 bottom-0 h-0.5 bg-blue-200 dark:bg-blue-900">
      <div class="h-full bg-blue-600 transition-[width] duration-100 dark:bg-blue-400" :style="{ width: `${Math.min(100, progress.received / progress.total * 100)}%` }" />
    </div>
  </div>
</template>
