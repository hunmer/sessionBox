<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowRight, Play, Video } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTabStore } from '@/stores/tab'

interface Preset { id: string; name: string; stepCount: number; initialUrl?: string }
interface DebugTab { tabId: string; title: string; url: string; webContentsId: number }
const emit = defineEmits<{ 'open-full': [] }>()
const tabStore = useTabStore()
const presets = ref<Preset[]>([])
const tabs = ref<DebugTab[]>([])

function siteKey(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return host || ''
  } catch {
    return ''
  }
}

const activeTab = computed(() => tabStore.activeTab)

function matchesActiveSite(item: Preset): boolean {
  const currentSite = siteKey(activeTab.value?.url || '')
  const presetSite = siteKey(item.initialUrl || '')
  return !!currentSite && !!presetSite && currentSite === presetSite
}

function disabledReason(item: Preset): string {
  if (!activeTab.value || activeTab.value.url?.startsWith('sessionbox://')) return '请先打开网页标签页'
  if (!item.initialUrl) return '录制没有起始网站信息'
  if (!matchesActiveSite(item)) return `仅支持在 ${siteKey(item.initialUrl) || item.initialUrl} 网站执行`
  return ''
}

onMounted(async () => {
  ;[presets.value, tabs.value] = await Promise.all([window.api.debugger.listActionPresets(), window.api.debugger.getTabs()])
})

async function execute(item: Preset) {
  const reason = disabledReason(item)
  if (reason) return toast.error(reason)
  const currentTabId = tabStore.activeTabId
  if (!currentTabId) return toast.error('没有当前网页标签页')
  tabs.value = await window.api.debugger.getTabs()
  const target = tabs.value.find(tab => tab.tabId === currentTabId)
  if (!target) return toast.error('当前标签页尚未就绪，请稍后重试')
  if (siteKey(target.url) !== siteKey(item.initialUrl)) return toast.error(disabledReason(item))
  const loaded = await window.api.debugger.loadActionPreset(item.id)
  if (!loaded?.success) return toast.error(loaded?.error || '读取录制失败')
  const result = await window.api.debugger.playActionRun(target.webContentsId, loaded.run)
  if (result?.success === false) return toast.error(result.error || '执行失败')
  toast.success(`正在执行“${item.name}”`)
}
</script>

<template>
  <div class="w-80">
    <div class="flex items-center justify-between px-3 py-2">
      <div class="flex items-center gap-2 text-sm font-medium"><Video class="h-4 w-4" />录制</div>
      <Button variant="ghost" size="sm" class="h-7 gap-1 text-xs text-primary" @click="emit('open-full')">打开调试面板<ArrowRight class="h-3 w-3" /></Button>
    </div>
    <ScrollArea class="h-72 border-t">
      <button v-for="item in presets" :key="item.id" class="flex w-full items-center gap-2 border-b px-3 py-2 text-left hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50" :disabled="!!disabledReason(item)" :title="disabledReason(item) || '在当前标签页执行'" @click="execute(item)">
        <Play class="h-3.5 w-3.5 shrink-0" :class="disabledReason(item) ? 'text-muted-foreground' : 'text-primary'" />
        <span class="min-w-0 flex-1 truncate text-xs">{{ item.name }}</span>
        <Badge variant="secondary" class="text-[10px]">{{ item.stepCount }} 步</Badge>
      </button>
      <div v-if="!presets.length" class="flex h-40 items-center justify-center text-xs text-muted-foreground">暂无已保存录制</div>
    </ScrollArea>
  </div>
</template>
