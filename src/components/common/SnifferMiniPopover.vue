<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import {
  Radar,
  Copy,
  Download,
  Trash2,
  Music,
  Power,
  Globe,
  Play
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Waterfall } from 'vue-waterfall-plugin-next'
import 'vue-waterfall-plugin-next/dist/style.css'
import { useSnifferStore } from '@/stores/sniffer'
import { useTabStore } from '@/stores/tab'
import { toast } from 'vue-sonner'

const snifferStore = useSnifferStore()
const tabStore = useTabStore()
const waterfallRef = ref<InstanceType<typeof Waterfall>>()

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

/** 瀑布流列表：仅视频 + 图片 */
const waterfallList = computed(() => {
  return filteredResources.value
    .filter(r => r.type === 'video' || r.type === 'image')
    .map(r => ({ ...r, src: r.url }))
})

/** 音频列表：保持简单列表 */
const audioResources = computed(() => {
  return filteredResources.value.filter(r => r.type === 'audio')
})

function formatSize(bytes?: number): string {
  if (!bytes || bytes === 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

/** 图片加载完成 → 触发瀑布流重新布局 */
function handleImgLoad() {
  waterfallRef.value?.renderer()
}

/** 卡片 hover → 播放视频 */
function handleCardMouseEnter(e: MouseEvent) {
  const card = e.currentTarget as HTMLElement
  const video = card.querySelector('video')
  video?.play().catch(() => {})
}

/** 卡片 leave → 暂停并重置视频 */
function handleCardMouseLeave(e: MouseEvent) {
  const card = e.currentTarget as HTMLElement
  const video = card.querySelector('video')
  if (video) {
    video.pause()
    video.currentTime = 0
  }
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
          :model-value="isSniffing"
          @update:model-value="handleToggleSniffing"
        />
      </div>
      <div v-if="currentDomain" class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs">
          <Globe class="h-3 w-3 text-muted-foreground" />
          <span class="truncate max-w-[160px]">自动启用 *.{{ currentDomain }}</span>
        </div>
        <Switch
          :model-value="isDomainAutoEnabled"
          @update:model-value="handleToggleDomain"
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
          isFilterActive(ft) ? 'bg-primary/10' : 'opacity-50'
        ]"
        @click="handleToggleFilter(ft)"
      >
        {{ ft === 'video' ? '视频' : ft === 'audio' ? '音频' : '图片' }}
      </Button>
    </div>
    <Separator />

    <!-- 资源展示区 -->
    <ScrollArea class="h-[320px]">
      <!-- 空状态 -->
      <div v-if="filteredResources.length === 0" class="flex items-center justify-center py-8">
        <p class="text-xs text-muted-foreground">
          {{ isSniffing ? '等待捕获资源...' : '开启嗅探以捕获资源' }}
        </p>
      </div>

      <div v-else class="p-1">
        <!-- 双列瀑布流：视频 + 图片 -->
        <Waterfall
          v-if="waterfallList.length > 0"
          ref="waterfallRef"
          :list="waterfallList"
          :gutter="4"
          :has-around-gutter="false"
          :breakpoints="{ 1200: { rowPerView: 2 }, 500: { rowPerView: 2 }, 300: { rowPerView: 2 } }"
          :animation-cancel="true"
          background-color="transparent"
        >
          <template #default="{ item }">
            <div
              class="relative group rounded-md overflow-hidden cursor-pointer bg-muted/30"
              @mouseenter="handleCardMouseEnter"
              @mouseleave="handleCardMouseLeave"
            >
              <!-- 图片：直接用 URL 展示 -->
              <img
                v-if="item.type === 'image'"
                :src="item.url"
                class="w-full block rounded-md min-h-[60px]"
                loading="lazy"
                @load="handleImgLoad"
              />
              <!-- 视频：hover 播放，leave 暂停 -->
              <video
                v-else
                :src="item.url"
                muted
                loop
                preload="metadata"
                class="w-full block rounded-md aspect-video bg-black/5"
              />

              <!-- 视频播放指示器（hover 时隐藏） -->
              <div
                v-if="item.type === 'video'"
                class="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity"
              >
                <div class="bg-black/40 rounded-full p-1.5">
                  <Play class="h-3 w-3 text-white" fill="white" />
                </div>
              </div>

              <!-- 文件大小标签 -->
              <div
                v-if="item.size"
                class="absolute top-1 left-1 bg-black/50 rounded px-1"
              >
                <span class="text-[8px] text-white/80">{{ formatSize(item.size) }}</span>
              </div>

              <!-- Hover 操作按钮层 -->
              <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <div class="flex items-center justify-end gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-5 w-5 p-0 text-white hover:text-white hover:bg-white/20"
                    @click.stop="handleCopy(item.url)"
                  >
                    <Copy class="h-2.5 w-2.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-5 w-5 p-0 text-white hover:text-white hover:bg-white/20"
                    @click.stop="handleDownload(item.url)"
                  >
                    <Download class="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>
            </div>
          </template>
        </Waterfall>

        <!-- 音频：保持简洁列表 -->
        <div v-if="audioResources.length > 0" class="mt-1 space-y-0.5">
          <div
            v-for="res in audioResources"
            :key="res.id"
            class="px-2 py-1.5 hover:bg-muted/50 rounded-sm transition-colors group"
          >
            <div class="flex items-center gap-2">
              <div class="shrink-0 w-4 h-4 rounded flex items-center justify-center bg-green-500/10">
                <Music class="h-2.5 w-2.5 text-green-500" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[10px] text-muted-foreground">
                  {{ res.mimeType }}
                  <span v-if="res.size">{{ formatSize(res.size) }}</span>
                </p>
                <p class="text-xs truncate text-foreground/80" :title="res.url">{{ res.url }}</p>
              </div>
              <div class="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" class="h-5 px-1 text-[10px]" @click="handleCopy(res.url)">
                  <Copy class="h-2.5 w-2.5" />
                </Button>
                <Button variant="ghost" size="sm" class="h-5 px-1 text-[10px]" @click="handleDownload(res.url)">
                  <Download class="h-2.5 w-2.5" />
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
