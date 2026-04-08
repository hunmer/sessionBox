<script setup lang="ts">
import { computed } from 'vue'
import { X, Globe, Loader2 } from 'lucide-vue-next'
import type { Tab } from '@/types'
import { useTabStore } from '@/stores/tab'
import { useAccountStore } from '@/stores/account'

const props = defineProps<{
  tab: Tab
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

function handleClose(e: MouseEvent) {
  e.stopPropagation()
  tabStore.closeTab(props.tab.id)
}
</script>

<template>
  <div
    class="group flex items-center gap-2 h-full px-3.5 border-r border-border cursor-pointer transition-all select-none relative"
    :class="isActive
      ? 'bg-background text-foreground shadow-sm font-medium'
      : 'bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground/80'"
    @click="tabStore.switchTab(tab.id)"
  >
    <!-- 激活状态底部指示条 -->
    <div
      v-if="isActive"
      class="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-full"
    />
    <Loader2 v-if="isLoading" class="w-3.5 h-3.5 flex-shrink-0 animate-spin text-primary/50" />
    <img v-else-if="faviconUrl" :src="faviconUrl" class="w-3.5 h-3.5 flex-shrink-0 rounded-sm" />
    <Globe v-else class="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
    <span class="truncate text-xs max-w-[120px]">{{ tabLabel }}</span>
    <button
      class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-secondary transition-opacity"
      @click="handleClose"
    >
      <X class="w-3 h-3" />
    </button>
  </div>
</template>
