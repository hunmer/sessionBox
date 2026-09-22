<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink, Loader2, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useNotification } from '@/composables/useNotification'
import type { ExternalAuthBrowser } from '../../../preload'

const props = defineProps<{ tabId: string }>()
const emit = defineEmits<{ dismiss: [] }>()
const notify = useNotification()
const syncing = ref<ExternalAuthBrowser | null>(null)
const pendingBrowser = ref<ExternalAuthBrowser | null>(null)

async function start(browser: ExternalAuthBrowser) {
  if (syncing.value) return
  syncing.value = browser
  const phase = pendingBrowser.value === browser ? 'complete' : 'start'
  const operationId = crypto.randomUUID()
  console.info('[ExternalAuth]', { event: 'renderer-invoke', operationId, tabId: props.tabId, browser, phase })
  const loadingId = notify.loading(phase === 'complete' ? '正在同步登录结果...' : '正在启动外部浏览器...')
  try {
    const result = await window.api.tab.syncExternalAuth(props.tabId, browser, phase, operationId)
    console.info('[ExternalAuth]', { event: 'renderer-result', operationId, result })
    if (result.ok && result.pending) {
      pendingBrowser.value = browser
      notify.info('请在外部浏览器完成登录并关闭窗口，然后同步登录结果')
    } else if (result.ok) {
      notify.success(`已同步 ${result.cookieCount || 0} 个登录 Cookie`)
      emit('dismiss')
    } else {
      notify.error({ title: '外部登录同步失败', description: result.error })
    }
  } catch (error) {
    console.error('[ExternalAuth]', { event: 'renderer-error', operationId, error: error instanceof Error ? error.message : String(error) })
    notify.error({
      title: '外部登录同步失败',
      description: error instanceof Error ? error.message : String(error)
    })
  } finally {
    notify.dismiss(loadingId)
    syncing.value = null
  }
}
</script>

<template>
  <div
    class="flex h-9 items-center gap-2 border-b border-amber-500/30 bg-amber-50 px-3 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100"
  >
    <span class="min-w-0 flex-1 truncate">使用隔离的外部浏览器完成 Google 登录</span>
    <Button
      size="sm"
      variant="outline"
      class="h-6 px-2 text-xs"
      :disabled="!!syncing || (!!pendingBrowser && pendingBrowser !== 'chrome')"
      @click.stop="start('chrome')"
    >
      <Loader2
        v-if="syncing === 'chrome'"
        class="mr-1 size-3 animate-spin"
      />
      <ExternalLink
        v-else
        class="mr-1 size-3"
      />
      {{ pendingBrowser === 'chrome' ? '同步登录结果' : 'Chrome' }}
    </Button>
    <Button
      size="sm"
      variant="outline"
      class="h-6 px-2 text-xs"
      :disabled="!!syncing || (!!pendingBrowser && pendingBrowser !== 'edge')"
      @click.stop="start('edge')"
    >
      <Loader2
        v-if="syncing === 'edge'"
        class="mr-1 size-3 animate-spin"
      />
      <ExternalLink
        v-else
        class="mr-1 size-3"
      />
      {{ pendingBrowser === 'edge' ? '同步登录结果' : 'Edge' }}
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
