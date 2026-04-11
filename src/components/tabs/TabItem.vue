<script setup lang="ts">
import { computed } from 'vue'
import { X, Globe, Loader2, ExternalLink, Monitor, Snowflake, Volume2, VolumeX, Pin, PinOff, GlobeLock } from 'lucide-vue-next'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import type { Tab } from '@/types'
import { useTabStore } from '@/stores/tab'
import { usePageStore } from '@/stores/page'
import { useContainerStore } from '@/stores/container'

const props = defineProps<{
  tab: Tab
  vertical?: boolean
  groupColor?: string
}>()

const tabStore = useTabStore()
const pageStore = usePageStore()
const containerStore = useContainerStore()

// 网页标题
const pageTitle = computed(() => {
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
  const page = pageStore.getPage(props.tab.pageId)
  if (!page) return ''
  const group = containerStore.getGroup(page.groupId)
  return group ? `${group.name}·${page.name}` : page.name
})
const isActive = computed(() => tabStore.activeTabId === props.tab.id)
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
</script>

<template>
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
</template>
