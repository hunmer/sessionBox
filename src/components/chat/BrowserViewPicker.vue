<script setup lang="ts">
import { useTabStore } from '@/stores/tab'
import { useChatStore } from '@/stores/chat'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const AUTO_VALUE = '__auto__'

const tabStore = useTabStore()
const chatStore = useChatStore()

function getDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function getCurrentValue(): string {
  return chatStore.targetTabId ?? AUTO_VALUE
}

function handleChange(value: string): void {
  chatStore.setTargetTab(value === AUTO_VALUE ? null : value)
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
      <SelectItem :value="AUTO_VALUE" class="text-xs">自动检测</SelectItem>
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
