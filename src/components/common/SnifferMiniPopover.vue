<script setup lang="ts">
import { computed, ref, reactive, onMounted, onUnmounted } from 'vue'
import {
  Radar,
  Copy,
  Download,
  Trash2,
  Power,
  Globe,
  Play,
  Pause
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
  stopAudio()
  await snifferStore.clearResources(tid)
}

// ── 音频播放控制 ──

const audioState = reactive({
  playingId: null as string | null,
  currentTime: 0,
  duration: 0,
  progress: 0
})

let audioElement: HTMLAudioElement | null = null

function handleAudioToggle(res: { id: string; url: string }) {
  if (audioState.playingId === res.id) {
    if (audioElement?.paused) {
      audioElement.play().catch(() => {})
    } else {
      audioElement?.pause()
    }
    return
  }
  stopAudio()
  audioElement = new Audio(res.url)
  audioState.playingId = res.id
  audioState.currentTime = 0
  audioState.duration = 0
  audioState.progress = 0

  audioElement.addEventListener('loadedmetadata', () => {
    audioState.duration = audioElement!.duration
  })
  audioElement.addEventListener('timeupdate', () => {
    if (!audioElement) return
    audioState.currentTime = audioElement.currentTime
    audioState.progress = audioElement.duration
      ? (audioElement.currentTime / audioElement.duration) * 100
      : 0
  })
  audioElement.addEventListener('ended', () => {
    audioState.playingId = null
    audioState.currentTime = 0
    audioState.progress = 0
  })
  audioElement.play().catch(() => {})
}

function stopAudio() {
  if (audioElement) {
    audioElement.pause()
    audioElement.src = ''
    audioElement = null
  }
  audioState.playingId = null
  audioState.currentTime = 0
  audioState.duration = 0
  audioState.progress = 0
}

function handleAudioSeek(e: MouseEvent) {
  if (!audioElement || !audioState.duration) return
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  audioElement.currentTime = ratio * audioState.duration
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

onUnmounted(() => stopAudio())
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

        <!-- 音频：带播放控制的列表 -->
        <div v-if="audioResources.length > 0" class="mt-1 space-y-0.5">
          <div
            v-for="res in audioResources"
            :key="res.id"
            class="px-2 py-1.5 hover:bg-muted/50 rounded-sm transition-colors group"
          >
            <div class="flex items-center gap-2">
              <!-- 播放/暂停按钮 -->
              <button
                class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-green-500/10 hover:bg-green-500/20 transition-colors"
                @click="handleAudioToggle(res)"
              >
                <Play v-if="audioState.playingId !== res.id" class="h-2.5 w-2.5 text-green-500 ml-px" />
                <Pause v-else class="h-2.5 w-2.5 text-green-500" />
              </button>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1">
                  <span class="text-[10px] text-muted-foreground">{{ res.mimeType }}</span>
                  <span v-if="res.size" class="text-[10px] text-muted-foreground">{{ formatSize(res.size) }}</span>
                </div>
                <!-- 进度条（仅当前播放时展示） -->
                <div v-if="audioState.playingId === res.id" class="mt-1">
                  <div class="flex items-center gap-1">
                    <span class="text-[8px] text-muted-foreground w-6 text-right tabular-nums">{{ formatTime(audioState.currentTime) }}</span>
                    <div
                      class="flex-1 h-1 bg-muted rounded-full overflow-hidden cursor-pointer"
                      @click="handleAudioSeek"
                    >
                      <div
                        class="h-full bg-green-500 rounded-full"
                        :style="{ width: audioState.progress + '%' }"
                      />
                    </div>
                    <span class="text-[8px] text-muted-foreground w-6 tabular-nums">{{ formatTime(audioState.duration) }}</span>
                  </div>
                </div>
              </div>
              <!-- 操作按钮：hover 才展示 -->
              <div class="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" class="h-5 px-1" @click="handleCopy(res.url)">
                  <Copy class="h-2.5 w-2.5" />
                </Button>
                <Button variant="ghost" size="sm" class="h-5 px-1" @click="handleDownload(res.url)">
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
