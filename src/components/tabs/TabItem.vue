<script setup lang="ts">
import { computed } from 'vue'
import { X, Globe, Loader2, ExternalLink, Monitor } from 'lucide-vue-next'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import type { Tab } from '@/types'
import { useTabStore } from '@/stores/tab'
import { useAccountStore } from '@/stores/account'

const props = defineProps<{
  tab: Tab
  vertical?: boolean
  groupColor?: string
}>()

const tabStore = useTabStore()
const accountStore = useAccountStore()

// 始终显示 【分组名】账号名
const tabLabel = computed(() => {
  const account = accountStore.getAccount(props.tab.accountId)
  if (!account) return '新标签页'
  const group = accountStore.getGroup(account.groupId)
  return group ? `【${group.name}】${account.name}` : account.name
})
const isActive = computed(() => tabStore.activeTabId === props.tab.id)
const isLoading = computed(() => tabStore.navStates.get(props.tab.id)?.isLoading ?? false)
const faviconUrl = computed(() => tabStore.favicons.get(props.tab.id))

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
        <img v-else-if="faviconUrl" :src="faviconUrl" class="w-3.5 h-3.5 flex-shrink-0 rounded-sm" />
        <Globe v-else class="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
        <span class="truncate text-xs" :class="vertical ? 'flex-1 min-w-0' : 'max-w-[120px]'">{{ tabLabel }}</span>
        <button
          class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-secondary transition-opacity"
          :class="vertical ? 'ml-auto' : ''"
          @click="handleClose"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-44">
      <ContextMenuItem @click="tabStore.openInNewWindow(tab.id)">
        <Monitor class="w-3.5 h-3.5 mr-2" />新窗口打开
      </ContextMenuItem>
      <ContextMenuItem @click="tabStore.openInBrowser(tab.id)">
        <ExternalLink class="w-3.5 h-3.5 mr-2" />浏览器打开
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
