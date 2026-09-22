<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink, Loader2, X } from 'lucide-vue-next'
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

async function openInChrome() {
  if (opening.value) return
  const url = tabStore.tabs.find((tab) => tab.id === props.tabId)?.url
  if (!url) {
    notify.error('无法获取当前扩展页面地址')
    return
  }

  opening.value = true
  const loadingId = notify.loading('正在安装 Chrome 扩展...')
  try {
    const extension = await window.api.extension.installFromWebStore(url)
    if (!extension?.name) {
      throw new Error('安装服务未返回扩展信息')
    }
    await extensionStore.init()
    await extensionStore.refreshLoadedExtensions()
    notify.success(`扩展「${extension.name}」已安装并启用`)
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
    notify.dismiss(loadingId)
    opening.value = false
  }
}
</script>

<template>
  <div
    class="flex h-9 items-center gap-2 border-b border-blue-500/30 bg-blue-50 px-3 text-xs text-blue-950 dark:bg-blue-950 dark:text-blue-100"
  >
    <span class="min-w-0 flex-1 truncate">检测到 Chrome 扩展页面，可在 Chrome 中快捷安装</span>
    <Button
      size="sm"
      variant="outline"
      class="h-6 px-2 text-xs"
      :disabled="opening"
      @click.stop="openInChrome"
    >
      <Loader2 v-if="opening" class="mr-1 size-3 animate-spin" />
      <ExternalLink v-else class="mr-1 size-3" />
      在 Chrome 中安装
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
  </div>
</template>
