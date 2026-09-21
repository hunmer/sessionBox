<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowRight, Globe, Play, Trash2, Video } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useTabStore } from '@/stores/tab'
import { getFaviconUrl } from '@/lib/utils'

interface Preset { id: string; name: string; stepCount: number; initialUrl?: string }
interface DebugTab { tabId: string; title: string; url: string; webContentsId: number }
const emit = defineEmits<{ 'open-full': [] }>()
const tabStore = useTabStore()
const presets = ref<Preset[]>([])
const tabs = ref<DebugTab[]>([])
const showHidden = ref(false)
const deleteTarget = ref<Preset | null>(null)
const deleteDialogOpen = ref(false)
const deleting = ref(false)

function siteKey(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return host || ''
  } catch {
    return ''
  }
}

const activeTab = computed(() => tabStore.activeTab)
// 取消勾选时隐藏禁用项（网站不匹配等），只保留当前可执行的录制
const visiblePresets = computed(() =>
  showHidden.value ? presets.value : presets.value.filter(item => !disabledReason(item))
)

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

function requestDelete(item: Preset) {
  deleteTarget.value = item
  deleteDialogOpen.value = true
}

async function confirmDelete() {
  const item = deleteTarget.value
  if (!item || deleting.value) return
  deleting.value = true
  try {
    const result = await window.api.debugger.deleteActionPreset(item.id)
    if (result?.success !== true) return toast.error(result?.error || '删除录制失败')
    presets.value = presets.value.filter(preset => preset.id !== item.id)
    deleteDialogOpen.value = false
    deleteTarget.value = null
    toast.success(`已删除“${item.name}”`)
  } catch (error) {
    toast.error(`删除录制失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="w-80">
    <div class="flex items-center justify-between px-3 py-2">
      <div class="flex items-center gap-2 text-sm font-medium"><Video class="h-4 w-4" />录制</div>
      <Button variant="ghost" size="sm" class="h-7 gap-1 text-xs text-primary" @click="emit('open-full')">打开调试面板<ArrowRight class="h-3 w-3" /></Button>
    </div>
    <div class="flex items-center gap-1.5 border-t px-3 py-1.5">
      <Checkbox id="recording-show-hidden" :model-value="showHidden" class="h-3.5 w-3.5" @update:model-value="showHidden = $event === true" />
      <label for="recording-show-hidden" class="cursor-pointer text-xs text-muted-foreground">展示已隐藏</label>
    </div>
    <ScrollArea class="h-72 border-t">
      <div v-for="item in visiblePresets" :key="item.id" class="flex items-center border-b hover:bg-muted/60">
        <button class="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50" :disabled="!!disabledReason(item)" :title="disabledReason(item) || '在当前标签页执行'" @click="execute(item)">
          <img v-if="item.initialUrl" :src="getFaviconUrl(item.initialUrl)" alt="" class="h-4 w-4 shrink-0 rounded-sm" @error="($event.target as HTMLImageElement).style.display = 'none'">
          <Globe v-else class="h-4 w-4 shrink-0 text-muted-foreground" />
          <Play class="h-3.5 w-3.5 shrink-0" :class="disabledReason(item) ? 'text-muted-foreground' : 'text-primary'" />
          <span class="min-w-0 flex-1 truncate text-xs">{{ item.name }}</span>
          <Badge variant="secondary" class="text-[10px]">{{ item.stepCount }} 步</Badge>
        </button>
        <Button variant="ghost" size="icon" class="mr-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" title="删除录制" @click="requestDelete(item)">
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      </div>
      <div v-if="!visiblePresets.length" class="flex h-40 items-center justify-center text-xs text-muted-foreground">{{ presets.length ? '没有可在当前网站执行的录制' : '暂无已保存录制' }}</div>
    </ScrollArea>
    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除录制？</AlertDialogTitle>
          <AlertDialogDescription>将永久删除“{{ deleteTarget?.name }}”，此操作不可撤销。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="deleting">取消</AlertDialogCancel>
          <AlertDialogAction class="bg-destructive text-destructive-foreground hover:bg-destructive/90" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? '删除中...' : '删除' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
