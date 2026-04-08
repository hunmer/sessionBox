<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import type { Tab } from '@/types'
import { useTabStore } from '@/stores/tab'

const props = defineProps<{
  tab: Tab
}>()

const tabStore = useTabStore()
const isActive = computed(() => tabStore.activeTabId === props.tab.id)

function handleClose(e: MouseEvent) {
  e.stopPropagation()
  tabStore.closeTab(props.tab.id)
}
</script>

<template>
  <div
    class="group flex items-center gap-1.5 h-full px-3 border-r border-border cursor-pointer transition-colors select-none"
    :class="isActive ? 'bg-background text-foreground' : 'bg-card/50 text-muted-foreground hover:bg-card'"
    @click="tabStore.switchTab(tab.id)"
  >
    <span class="truncate text-xs max-w-[120px]">{{ tab.title || tab.url || '新标签页' }}</span>
    <button
      class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-secondary transition-opacity"
      @click="handleClose"
    >
      <X class="w-3 h-3" />
    </button>
  </div>
</template>
