<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Loader2, Puzzle } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useExtensionStore } from '@/stores/extension'
import { useTabStore } from '@/stores/tab'
import ExtensionMiniPopover from '@/components/common/ExtensionMiniPopover.vue'

const props = withDefaults(defineProps<{ vertical?: boolean }>(), { vertical: false })

const extensionStore = useExtensionStore()
const tabStore = useTabStore()

const isLoading = ref(false)
const managerOpen = ref(false)
const badgeByExtensionId = ref<Record<string, string>>({})
let removeBadgeListener: (() => void) | undefined

// 未固定（pinned === false）的扩展收进拼图弹出列表，其余固定显示在工具栏
const pinnedExtensions = computed(() =>
  extensionStore.extensions.filter((e) => e.enabled && e.pinned !== false)
)

onMounted(async () => {
  if (extensionStore.extensions.length === 0) {
    await extensionStore.init()
  } else {
    await extensionStore.refreshLoadedExtensions()
  }
  await refreshBadges()
  removeBadgeListener = (window.api.extension as any).onBrowserActionUpdate?.(() => {
    void refreshBadges()
  })
})

onUnmounted(() => removeBadgeListener?.())

async function refreshBadges() {
  const state = await (window.api.extension as any).getBrowserActionState?.()
  if (!state) return

  const next: Record<string, string> = {}
  for (const action of state.actions || []) {
    const tabAction = state.activeTabId != null ? action.tabs?.[state.activeTabId] : undefined
    const text = tabAction?.text ?? action.text
    if (text) next[action.id] = String(text)
  }
  badgeByExtensionId.value = next
}

async function openBrowserActionPopup(extensionId: string, event: MouseEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  await window.api.extension.openBrowserActionPopup(extensionId, {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    alignment: props.vertical ? 'top right' : undefined
  })
}

function openExtensionsPage() {
  managerOpen.value = false
  tabStore.createTabForSite('sessionbox://extensions')
}
</script>

<template>
  <div
    class="extension-action-list"
    :class="vertical ? 'flex flex-col items-center gap-0.5' : 'flex items-center gap-0.5'"
  >
    <Button
      v-for="ext in pinnedExtensions"
      :key="ext.id"
      variant="ghost"
      size="icon"
      class="relative h-7 w-7"
      :title="ext.name"
      @click="openBrowserActionPopup(ext.id, $event)"
    >
      <img
        v-if="ext.icon"
        :src="`extension-icon://${ext.id}`"
        class="w-5 h-5 p-0.5 object-contain"
      >
      <span
        v-else
        class="text-xs font-medium text-muted-foreground"
      >
        {{ ext.name.charAt(0).toUpperCase() }}
      </span>
      <span
        v-if="ext.electronExtensionId && badgeByExtensionId[ext.electronExtensionId]"
        class="absolute -right-0.5 -bottom-0.5 max-w-[calc(100%-2px)] min-w-3 h-3 px-0.5 rounded-sm bg-red-600 text-[9px] leading-3 text-white shadow-sm overflow-hidden whitespace-nowrap"
      >
        {{ badgeByExtensionId[ext.electronExtensionId] }}
      </span>
    </Button>

    <Popover v-model:open="managerOpen">
      <PopoverTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
        >
          <Loader2
            v-if="isLoading"
            class="w-4 h-4 animate-spin"
          />
          <Puzzle
            v-else
            class="w-4 h-4"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        :side="vertical ? 'left' : 'top'"
        :side-offset="4"
        :collision-padding="30"
        class="p-0 w-auto overflow-hidden"
      >
        <ExtensionMiniPopover @open-full="openExtensionsPage" />
      </PopoverContent>
    </Popover>
  </div>
</template>
