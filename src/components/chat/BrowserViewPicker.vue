<script setup lang="ts">
import { computed, watch } from 'vue'
import { useTabStore } from '@/stores/tab'
import { useChatStore } from '@/stores/chat'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const CURRENT_VALUE = '__current__'

const tabStore = useTabStore()
const chatStore = useChatStore()

function getDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** 动态显示当前激活标签页的标题 */
const currentTabLabel = computed(() => {
  const tab = tabStore.activeTab
  if (!tab) return '当前标签页'
  return tab.title || getDomain(tab.url)
})

/** 选中的标签页被关闭后，自动回退到 __current__ */
watch(
  () => tabStore.tabs.map((t) => t.id),
  (tabIds) => {
    const targetId = chatStore.targetTabId
    if (targetId && !tabIds.includes(targetId)) {
      chatStore.setTargetTab(null)
    }
  }
)

function getCurrentValue(): string {
  return chatStore.targetTabId ?? CURRENT_VALUE
}

function handleChange(value: string): void {
  chatStore.setTargetTab(value === CURRENT_VALUE ? null : value)
}
</script>

<template>
  <Select
    :model-value="getCurrentValue()"
    @update:model-value="handleChange"
  >
    <SelectTrigger class="h-7 text-xs w-[160px]">
      <SelectValue placeholder="选择标签页" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem :value="CURRENT_VALUE" class="text-xs">
        <span class="flex items-center gap-1">
          <span class="text-muted-foreground">{{ currentTabLabel }}</span>
          <span class="text-[10px] text-muted-foreground/60">(跟随)</span>
        </span>
      </SelectItem>
      <SelectItem
        v-for="tab in tabStore.tabs"
        :key="tab.id"
        :value="tab.id"
        class="text-xs"
      >
        <span class="truncate">{{ tab.title || getDomain(tab.url) }}</span>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
