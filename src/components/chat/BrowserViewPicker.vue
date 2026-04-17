<script setup lang="ts">
import { computed, watch } from 'vue'
import { useTabStore } from '@/stores/tab'
import { useChatUIStore } from '@/stores/chat-ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const CURRENT_VALUE = '__current__'

const tabStore = useTabStore()
const chatUIStore = useChatUIStore()

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
    const targetId = chatUIStore.targetTabId
    if (targetId && !tabIds.includes(targetId)) {
      chatUIStore.setTargetTab(null)
    }
  }
)

/** trigger 中显示的文本 */
const displayLabel = computed(() => {
  if (!chatUIStore.targetTabId) {
    return currentTabLabel.value
  }
  const tab = tabStore.tabs.find((t) => t.id === chatUIStore.targetTabId)
  return tab?.title || (tab ? getDomain(tab.url) : currentTabLabel.value)
})

function getCurrentValue(): string {
  return chatUIStore.targetTabId ?? CURRENT_VALUE
}

function handleChange(value: string): void {
  chatUIStore.setTargetTab(value === CURRENT_VALUE ? null : value)
}
</script>

<template>
  <Select
    :model-value="getCurrentValue()"
    @update:model-value="handleChange"
  >
    <SelectTrigger class="h-7 text-xs w-[160px]">
      <span class="truncate">{{ displayLabel }}</span>
      <span v-if="!chatUIStore.targetTabId" class="shrink-0 text-[10px] text-muted-foreground/60 ml-1">(跟随)</span>
    </SelectTrigger>
    <SelectContent>
      <SelectItem :value="CURRENT_VALUE" class="text-xs">
        {{ currentTabLabel }}
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
