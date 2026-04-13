<script setup lang="ts">
import { computed, onMounted } from 'vue'
import {
  Radar,
  Copy,
  ExternalLink,
  Download,
  Trash2,
  Video,
  Music,
  ImageIcon,
  Power,
  Globe
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useSnifferStore } from '@/stores/sniffer'
import { useTabStore } from '@/stores/tab'
import { toast } from 'vue-sonner'

const snifferStore = useSnifferStore()
const tabStore = useTabStore()

onMounted(async () => {
  await snifferStore.init()
})

const activeTabId = computed(() => tabStore.activeTabId)
const currentUrl = computed(() => {
  const tid = activeTabId.value
  if (!tid) return ''
  const tab = tabStore.tabs.find(t => t.id === tid)
  return tab?.url ?? ''
})

const currentDomain = computed(() => {
  try {
    return new URL(currentUrl.value).hostname
  } catch {
    return ''
  }
})

const isSniffing = computed(() => {
  const tid = activeTabId.value
  if (!tid) return false
  return snifferStore.enabled.get(tid) ?? false
})

const isDomainAutoEnabled = computed(() => {
  return snifferStore.isDomainEnabled(currentDomain.value)
})

const filteredResources = computed(() => {
  const tid = activeTabId.value
  if (!tid) return []
  return snifferStore.getFilteredResources(tid)
})

const resourceCount = computed(() => {
  const tid = activeTabId.value
  if (!tid) return 0
  return snifferStore.getResourceCount(tid)
})

function formatSize(bytes?: number): string {
  if (!bytes || bytes === 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

function typeIcon(type: 'video' | 'audio' | 'image') {
  if (type === 'video') return Video
  if (type === 'audio') return Music
  return ImageIcon
}

function typeColor(type: 'video' | 'audio' | 'image'): string {
  if (type === 'video') return 'text-blue-500'
  if (type === 'audio') return 'text-green-500'
  return 'text-orange-500'
}

function typeBgColor(type: 'video' | 'audio' | 'image'): string {
  if (type === 'video') return 'bg-blue-500/10'
  if (type === 'audio') return 'bg-green-500/10'
  return 'bg-orange-500/10'
}

async function handleToggleSniffing(val: boolean) {
  const tid = activeTabId.value
  if (!tid) return
  await snifferStore.toggle(tid, val)
}

async function handleToggleDomain(val: boolean) {
  const domain = currentDomain.value
  if (!domain) return
  await snifferStore.toggleDomain(domain, val)
}

function isFilterActive(type: 'video' | 'audio' | 'image'): boolean {
  return snifferStore.filterTypes.has(type)
}

function handleToggleFilter(type: 'video' | 'audio' | 'image') {
  snifferStore.toggleFilter(type)
}

async function handleCopy(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('链接已复制')
  } catch {
    toast.error('复制失败')
  }
}

function handleOpenInNewWindow(url: string) {
  tabStore.createTab(null, url)
}

async function handleDownload(url: string) {
  try {
    await window.api.download.add(url)
    toast.success('已添加到下载')
  } catch {
    toast.error('添加下载失败')
  }
}

async function handleClear() {
  const tid = activeTabId.value
  if (!tid) return
  await snifferStore.clearResources(tid)
}
</script>

<template>
  <div class="w-80">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between px-3 pt-2 pb-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Radar class="h-3.5 w-3.5 text-muted-foreground" />
        网络嗅探
        <Badge v-if="resourceCount > 0" variant="secondary" class="text-[10px] h-4">
          {{ resourceCount }}
        </Badge>
      </div>
    </div>
    <Separator />

    <!-- 开关区域 -->
    <div class="px-3 py-2 space-y-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs">
          <Power class="h-3 w-3 text-muted-foreground" />
          <span>启用嗅探</span>
        </div>
        <Switch
          :checked="isSniffing"
          @update:checked="handleToggleSniffing"
        />
      </div>
      <div v-if="currentDomain" class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs">
          <Globe class="h-3 w-3 text-muted-foreground" />
          <span class="truncate max-w-[160px]">自动启用 *.{{ currentDomain }}</span>
        </div>
        <Switch
          :checked="isDomainAutoEnabled"
          @update:checked="handleToggleDomain"
        />
      </div>
    </div>
    <Separator />

    <!-- 过滤器 -->
    <div class="flex items-center gap-1 px-3 py-2">
      <Button
        v-for="ft in (['video', 'audio', 'image'] as const)"
        :key="ft"
        variant="ghost"
        size="sm"
        :class="[
          'h-6 text-[10px] px-2',
          isFilterActive(ft) ? typeBgColor(ft) : 'opacity-50'
        ]"
        @click="handleToggleFilter(ft)"
      >
        {{ ft === 'video' ? '视频' : ft === 'audio' ? '音频' : '图片' }}
      </Button>
    </div>
    <Separator />

    <!-- 资源列表 -->
    <ScrollArea class="h-[280px]">
      <div v-if="filteredResources.length === 0" class="flex items-center justify-center py-8">
        <p class="text-xs text-muted-foreground">
          {{ isSniffing ? '等待捕获资源...' : '开启嗅探以捕获资源' }}
        </p>
      </div>
      <div v-else class="py-1">
        <div
          v-for="res in filteredResources"
          :key="res.id"
          class="px-3 py-1.5 hover:bg-muted/50 rounded-sm transition-colors"
        >
          <div class="flex items-start gap-2">
            <!-- 类型图标 -->
            <div :class="['shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5', typeBgColor(res.type)]">
              <component :is="typeIcon(res.type)" :class="['h-3 w-3', typeColor(res.type)]" />
            </div>
            <!-- 信息 -->
            <div class="flex-1 min-w-0 space-y-0.5">
              <div class="flex items-center gap-1">
                <span class="text-[10px] text-muted-foreground shrink-0">{{ res.mimeType }}</span>
                <span v-if="res.size" class="text-[10px] text-muted-foreground">{{ formatSize(res.size) }}</span>
              </div>
              <p class="text-xs truncate text-foreground/80" :title="res.url">{{ res.url }}</p>
              <!-- 操作按钮 -->
              <div class="flex items-center gap-1">
                <Button variant="ghost" size="sm" class="h-5 px-1.5 text-[10px]" @click="handleCopy(res.url)">
                  <Copy class="h-2.5 w-2.5 mr-0.5" />
                  复制
                </Button>
                <Button variant="ghost" size="sm" class="h-5 px-1.5 text-[10px]" @click="handleOpenInNewWindow(res.url)">
                  <ExternalLink class="h-2.5 w-2.5 mr-0.5" />
                  打开
                </Button>
                <Button variant="ghost" size="sm" class="h-5 px-1.5 text-[10px]" @click="handleDownload(res.url)">
                  <Download class="h-2.5 w-2.5 mr-0.5" />
                  下载
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>

    <Separator />
    <!-- 底部 -->
    <div class="flex items-center justify-between px-3 py-1.5">
      <span class="text-[10px] text-muted-foreground">
        共 {{ resourceCount }} 个资源
      </span>
      <Button
        v-if="resourceCount > 0"
        variant="ghost"
        size="sm"
        class="h-5 gap-1 text-[10px] text-destructive hover:text-destructive"
        @click="handleClear"
      >
        <Trash2 class="h-2.5 w-2.5" />
        清空
      </Button>
    </div>
  </div>
</template>
