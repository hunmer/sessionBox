<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { X, Globe, Loader2, ExternalLink, Monitor, Snowflake, Volume2, VolumeX, Pin, PinOff, GlobeLock } from 'lucide-vue-next'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import type { Tab } from '@/types'
import { useTabStore } from '@/stores/tab'
import { useSplitStore } from '@/stores/split'
import { usePageStore } from '@/stores/page'
import { useContainerStore } from '@/stores/container'
import { getDomain } from '@/lib/utils'

const props = defineProps<{
  tab: Tab
  vertical?: boolean
  groupColor?: string
}>()

const tabStore = useTabStore()
const splitStore = useSplitStore()
const pageStore = usePageStore()
const containerStore = useContainerStore()

// 内部页面名称映射
const internalPageNames: Record<string, string> = {
  bookmarks: '书签管理',
  history: '历史记录',
  downloads: '下载管理',
}

// 判断是否为内部页面
const isInternalPage = computed(() => props.tab.url?.startsWith('sessionbox://'))

// 网页标题
const pageTitle = computed(() => {
  // 内部页面：返回映射的中文名称
  if (isInternalPage.value) {
    const path = props.tab.url!.replace('sessionbox://', '')
    return internalPageNames[path] || path
  }
  if (!props.tab.url?.startsWith('http')) return props.tab.title || '新标签页'
  const title = props.tab.title
  // 排除初始占位标题（页面名或"新标签页"），视为尚未加载
  if (!title || title === '新标签页') return ''
  const page = pageStore.getPage(props.tab.pageId)
  if (title === page?.name) return ''
  return title
})
// 页面标识：【分组】页面名（通过 page -> group 链路）
const pageLabel = computed(() => {
  // 内部页面不显示分组·页面名
  if (isInternalPage.value) return ''
  const page = pageStore.getPage(props.tab.pageId)
  if (!page) return ''
  const group = containerStore.getGroup(page.groupId)
  return group ? `${group.name}·${page.name}` : page.name
})
const isActive = computed(() => {
  if (splitStore.isSplitActive) {
    return splitStore.focusedPane?.activeTabId === props.tab.id
  }

  return tabStore.activeTabId === props.tab.id
})
const isLoading = computed(() => tabStore.navStates.get(props.tab.id)?.isLoading ?? false)
const faviconUrl = computed(() => tabStore.favicons.get(props.tab.id))
const isFrozen = computed(() => tabStore.frozenTabIds.has(props.tab.id))
const isPinned = computed(() => !!props.tab.pinned)
const isMuted = computed(() => !!props.tab.muted)

// 激活态样式：分组模式下使用分组颜色，否则使用默认主题色
const activeStyle = computed(() => {
  if (!isActive.value || !props.groupColor) return {}
  const c = props.groupColor
  return {
    backgroundColor: c + '22',
    color: c,
    borderColor: c + '55'
  }
})

function handleClose(e: MouseEvent) {
  e.stopPropagation()
  tabStore.closeTab(props.tab.id)
}

// 获取当前标签页的域名
function getTabHostname(): string {
  try {
    return new URL(props.tab.url).hostname
  } catch {
    return ''
  }
}

// 当前网站是否在静音列表中
const isSiteMuted = computed(() => {
  const hostname = getTabHostname()
  return hostname ? tabStore.isSiteMuted(hostname) : false
})

// 切换当前网站的静音状态
async function handleToggleSiteMute() {
  const hostname = getTabHostname()
  if (!hostname) return
  if (isSiteMuted.value) {
    await tabStore.unmuteSite(hostname)
    // 同时解除当前标签页的静音
    if (props.tab.muted) {
      tabStore.toggleMute(props.tab.id)
    }
  } else {
    await tabStore.muteSite(hostname)
    // 同时静音当前标签页
    if (!props.tab.muted) {
      tabStore.toggleMute(props.tab.id)
    }
  }
}

// 当前标签页的域名是否在静音列表中（仅用于菜单显示判断）
const isWebPage = computed(() => props.tab.url?.startsWith('http'))

// ====== 悬浮预览 ======
const api = window.api
const previewOpen = ref(false)
const screenshotUrl = ref<string | null>(null)
const screenshotLoading = ref(false)
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

// 模块级截图缓存，所有 TabItem 实例共享
const screenshotCache = new Map<string, { url: string | null; timestamp: number }>()
const CACHE_TTL = 30_000 // 30 秒

const canPreview = computed(
  () => !isFrozen.value && !isInternalPage.value && isWebPage.value
)

function clearTimers() {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
}

function handleTriggerEnter() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
  if (!canPreview.value) return
  hoverTimer = setTimeout(() => {
    previewOpen.value = true
    capturePreview()
  }, 1500)
}

function handleTriggerLeave() {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
  closeTimer = setTimeout(() => { previewOpen.value = false }, 150)
}

function handleContentEnter() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
}

function handleContentLeave() {
  closeTimer = setTimeout(() => { previewOpen.value = false }, 150)
}

async function capturePreview() {
  const cached = screenshotCache.get(props.tab.id)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    screenshotUrl.value = cached.url
    return
  }

  screenshotLoading.value = true
  try {
    const results = await api.tab.capture([props.tab.id])
    const url = results[props.tab.id] ?? null
    screenshotUrl.value = url
    screenshotCache.set(props.tab.id, { url, timestamp: Date.now() })
  } finally {
    screenshotLoading.value = false
  }
}

onBeforeUnmount(clearTimers)
</script>

<template>
  <Popover :open="previewOpen">
    <PopoverAnchor>
      <ContextMenu>
        <ContextMenuTrigger as-child>
          <div
            class="group flex items-center gap-2 h-[30px] px-3 cursor-pointer transition-all select-none border rounded-xl"
            :class="[
              vertical ? 'w-full' : '',
              isActive && groupColor
                ? 'shadow-sm font-medium'
                : isActive
                  ? 'bg-primary/15 text-primary border-primary/30 shadow-sm font-medium'
                  : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            ]"
            :style="activeStyle"
            @click="tabStore.switchTab(tab.id)"
            @mouseenter="handleTriggerEnter"
            @mouseleave="handleTriggerLeave"
          >
            <Loader2 v-if="isLoading" class="w-3.5 h-3.5 flex-shrink-0 animate-spin" :class="isActive && groupColor ? '' : 'text-primary/50'" :style="isActive && groupColor ? { color: groupColor + '80' } : {}" />
            <Snowflake v-else-if="isFrozen" class="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
            <img v-else-if="faviconUrl" :src="faviconUrl" class="w-3.5 h-3.5 flex-shrink-0 rounded-sm" />
            <Globe v-else class="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
            <span class="truncate text-xs" :class="vertical ? 'flex-1 min-w-0' : isPinned ? 'max-w-[100px]' : 'max-w-[120px]'">{{ pageTitle || pageLabel || '新标签页' }}</span>
            <span v-if="pageTitle && pageLabel" class="truncate text-[10px] text-muted-foreground/60 max-w-[60px] flex-shrink-0">{{ pageLabel }}</span>
            <VolumeX v-if="isMuted" class="w-3 h-3 flex-shrink-0 text-muted-foreground" />
            <Pin v-if="isPinned" class="w-3 h-3 flex-shrink-0 text-muted-foreground" />
            <button
              v-if="!isPinned"
              class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-secondary transition-opacity"
              :class="vertical ? 'ml-auto' : ''"
              @click="handleClose"
            >
              <X class="w-3 h-3" />
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-48">
          <ContextMenuItem @click="tabStore.toggleMute(tab.id)">
            <VolumeX v-if="isMuted" class="w-3.5 h-3.5 mr-2" />
            <Volume2 v-else class="w-3.5 h-3.5 mr-2" />
            {{ isMuted ? '取消静音' : '静音标签' }}
          </ContextMenuItem>
          <ContextMenuItem v-if="isWebPage" @click="handleToggleSiteMute">
            <GlobeLock class="w-3.5 h-3.5 mr-2" />
            {{ isSiteMuted ? '取消静音此网站' : '静音此网站' }}
          </ContextMenuItem>
          <ContextMenuItem @click="tabStore.togglePin(tab.id)">
            <PinOff v-if="isPinned" class="w-3.5 h-3.5 mr-2" />
            <Pin v-else class="w-3.5 h-3.5 mr-2" />
            {{ isPinned ? '取消固定' : '固定标签' }}
          </ContextMenuItem>
          <ContextMenuItem @click="tabStore.openInNewWindow(tab.id)">
            <Monitor class="w-3.5 h-3.5 mr-2" />新窗口打开
          </ContextMenuItem>
          <ContextMenuItem @click="tabStore.openInBrowser(tab.id)">
            <ExternalLink class="w-3.5 h-3.5 mr-2" />浏览器打开
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </PopoverAnchor>
    <PopoverContent
      :side="vertical ? 'right' : 'bottom'"
      :side-offset="4"
      class="w-[280px] p-0 overflow-hidden pointer-events-auto"
    >
      <div @mouseenter="handleContentEnter" @mouseleave="handleContentLeave">
        <!-- 截图区域 -->
        <div class="aspect-video bg-muted relative overflow-hidden">
          <img
            v-if="screenshotUrl"
            :src="screenshotUrl"
            alt=""
            class="w-full h-full object-cover object-top"
          />
          <div v-else-if="screenshotLoading" class="w-full h-full flex items-center justify-center">
            <div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <div v-else class="w-full h-full flex items-center justify-center">
            <Globe class="w-5 h-5 text-muted-foreground/30" />
          </div>
        </div>
        <!-- 标签信息 -->
        <div class="px-2.5 py-1.5 bg-background">
          <div class="flex items-center gap-1.5">
            <img v-if="faviconUrl" :src="faviconUrl" alt="" class="w-3.5 h-3.5 rounded-sm flex-shrink-0" />
            <Globe v-else class="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
            <p class="text-[11px] font-medium truncate">{{ pageTitle || '新标签页' }}</p>
          </div>
          <p class="text-[10px] text-muted-foreground truncate mt-0.5">
            {{ getDomain(tab.url || '') }}
          </p>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
