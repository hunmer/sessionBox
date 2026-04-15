<script setup lang="ts">
import { computed } from 'vue'
import { useTabStore } from '@/stores/tab'
import { useChatStore } from '@/stores/chat'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const tabStore = useTabStore()
const chatStore = useChatStore()

const tabs = computed(() => tabStore.tabs)

function getDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
</script>

<template>
  <Select
    :model-value="chatStore.targetTabId ?? ''"
    @update:model-value="chatStore.setTargetTab($event || null)"
  >
    <SelectTrigger class="h-7 text-xs w-[160px]">
      <SelectValue placeholder="选择标签页" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="" class="text-xs">自动检测</SelectItem>
      <SelectItem
        v-for="tab in tabs"
        :key="tab.id"
        :value="tab.id"
        class="text-xs"
      >
        <span class="truncate">{{ tab.title || getDomain(tab.url) }}</span>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
