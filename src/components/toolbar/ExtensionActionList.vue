<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Loader2, Puzzle } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useExtensionStore } from '@/stores/extension'
import { useTabStore } from '@/stores/tab'

const extensionStore = useExtensionStore()
const tabStore = useTabStore()

const isLoading = ref(false)
const emit = defineEmits<{ 'open-manager': [] }>()

const currentPartition = computed(() => {
  const accountId = tabStore.activeTab?.accountId
  return accountId ? `persist:account-${accountId}` : undefined
})

const hasExtensions = computed(() => extensionStore.loadedExtensionIds.length > 0)

onMounted(async () => {
  if (extensionStore.extensions.length === 0) {
    await extensionStore.init()
  } else {
    await extensionStore.refreshLoadedExtensions()
  }

  setTimeout(() => {
    void injectBrowserActionIfNeeded()
  }, 100)
})

watch(
  () => tabStore.activeTabId,
  () => {
    setTimeout(() => {
      void injectBrowserActionIfNeeded()
    }, 100)
  }
)

watch(
  () => extensionStore.loadedExtensionIds.slice(),
  () => {
    setTimeout(() => {
      void injectBrowserActionIfNeeded()
    }, 100)
  }
)

async function injectBrowserActionIfNeeded() {
  if (customElements.get('browser-action-list')) {
    return
  }

  try {
    const { injectBrowserAction } = await import('electron-chrome-extensions/browser-action')
    injectBrowserAction()
    console.log('[ExtensionActionList] Browser action API injected')
  } catch (error) {
    console.warn('[ExtensionActionList] Failed to inject browser action:', error)
  }
}
</script>

<template>
  <div class="extension-action-list flex items-center gap-1">
    <browser-action-list
      v-if="tabStore.activeTabId"
      :partition="currentPartition"
      alignment="bottom left"
      class="extension-browser-action-list"
    />

    <Button
      v-if="!hasExtensions"
      variant="ghost"
      size="icon"
      class="h-7 w-7 text-muted-foreground cursor-default"
      disabled
    >
      <Puzzle class="w-4 h-4" />
    </Button>

    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      :disabled="!tabStore.activeTabId"
      @click="emit('open-manager')"
    >
      <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
      <Puzzle v-else class="w-4 h-4" />
    </Button>
  </div>
</template>

<style scoped>
extension-browser-action-list::part(action) {
  width: 20px;
  height: 20px;
}
</style>
