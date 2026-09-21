<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { Globe } from 'lucide-vue-next'
import { useTabStore } from '@/stores/tab'
import { useChatUIStore } from '@/stores/chat-ui'
import { getDomain, getFaviconUrl } from '@/lib/utils'
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

/** 图标加载失败的标签页 id，回退 Globe 图标 */
const failedFaviconIds = reactive(new Set<string>())

type TabLike = { id: string; url?: string } | null | undefined

/** 与标签页一致：优先页面已上报的图标，否则按 URL 推导本地缓存图标 */
function faviconFor(tab: TabLike): string {
  if (!tab || failedFaviconIds.has(tab.id)) return ''
  const loaded = tabStore.favicons.get(tab.id)
  if (loaded) return loaded
  if (!tab.url?.startsWith('http')) return ''
  return getFaviconUrl(tab.url, tabStore.faviconVersions.get(getDomain(tab.url)))
}

function markFaviconFailed(tab: TabLike): void {
  if (tab) failedFaviconIds.add(tab.id)
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

/** trigger 中展示的标签：未指定目标时跟随激活标签页 */
const displayTab = computed(() => {
  if (!chatUIStore.targetTabId) return tabStore.activeTab
  return tabStore.tabs.find((t) => t.id === chatUIStore.targetTabId) ?? tabStore.activeTab
})

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
      <img
        v-if="faviconFor(displayTab)"
        :src="faviconFor(displayTab)"
        class="size-3.5 shrink-0 rounded-sm object-contain"
        @error="markFaviconFailed(displayTab)"
      >
      <Globe
        v-else
        class="size-3.5 shrink-0 opacity-50"
      />
      <span class="truncate">{{ displayLabel }}</span>
    </SelectTrigger>
    <SelectContent>
      <SelectItem
        :value="CURRENT_VALUE"
        class="text-xs"
      >
        <img
          v-if="faviconFor(tabStore.activeTab)"
          :src="faviconFor(tabStore.activeTab)"
          class="size-3.5 shrink-0 rounded-sm object-contain"
          @error="markFaviconFailed(tabStore.activeTab)"
        >
        <Globe
          v-else
          class="size-3.5 shrink-0 opacity-50"
        />
        <span class="truncate">{{ currentTabLabel }}</span>
      </SelectItem>
      <SelectItem
        v-for="tab in tabStore.tabs"
        :key="tab.id"
        :value="tab.id"
        class="text-xs"
      >
        <img
          v-if="faviconFor(tab)"
          :src="faviconFor(tab)"
          class="size-3.5 shrink-0 rounded-sm object-contain"
          @error="markFaviconFailed(tab)"
        >
        <Globe
          v-else
          class="size-3.5 shrink-0 opacity-50"
        />
        <span class="truncate">{{ tab.title || getDomain(tab.url) }}</span>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
