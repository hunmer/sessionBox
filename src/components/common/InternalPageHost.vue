<script setup lang="ts">
import { computed, markRaw, type Component, type CSSProperties } from 'vue'
import { useTabStore } from '@/stores/tab'
import BookmarksPage from '@/components/bookmarks/BookmarksPage.vue'
import HistoryPage from '@/components/history/HistoryPage.vue'
import DownloadsPage from '@/components/download/DownloadsPage.vue'
import PluginsPage from '@/components/plugins/PluginsPage.vue'
import PasswordsPage from '@/components/passwords/PasswordsPage.vue'

defineProps<{
  contentInsetStyle?: CSSProperties
}>()

const emit = defineEmits<{
  'open-download-settings': []
}>()

const tabStore = useTabStore()

const INTERNAL_PAGES: Record<string, Component> = {
  bookmarks: markRaw(BookmarksPage),
  history: markRaw(HistoryPage),
  downloads: markRaw(DownloadsPage),
  plugins: markRaw(PluginsPage),
  passwords: markRaw(PasswordsPage)
}

function getInternalPageComponent(url?: string | null): Component | null {
  if (!url?.startsWith('sessionbox://')) return null
  const path = url.replace('sessionbox://', '')
  return INTERNAL_PAGES[path] ?? null
}

const internalTabViews = computed(() =>
  tabStore.tabs.flatMap((tab) => {
    const component = getInternalPageComponent(tab.url)
    return component ? [{ id: tab.id, component }] : []
  })
)

const hasActiveInternalComponent = computed(() =>
  !!getInternalPageComponent(tabStore.activeTab?.url)
)
</script>

<template>
  <div
    v-show="tabStore.isInternalPage"
    class="absolute inset-x-0 top-0 bottom-2 z-20 overflow-auto"
    :style="contentInsetStyle"
  >
    <div
      v-for="tab in internalTabViews"
      v-show="tab.id === tabStore.activeTabId"
      :key="tab.id"
      class="h-full"
    >
      <component
        :is="tab.component"
        @open-download-settings="emit('open-download-settings')"
      />
    </div>

    <div
      v-if="!hasActiveInternalComponent && tabStore.isInternalPage"
      class="flex h-full items-center justify-center"
    >
      <p class="text-sm text-muted-foreground">
        未知页面
      </p>
    </div>
  </div>
</template>
