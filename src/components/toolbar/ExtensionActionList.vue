<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

const enabledExtensions = computed(() => extensionStore.extensions.filter((e) => e.enabled))

onMounted(async () => {
  if (extensionStore.extensions.length === 0) {
    await extensionStore.init()
  } else {
    await extensionStore.refreshLoadedExtensions()
  }
})

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
      v-for="ext in enabledExtensions"
      :key="ext.id"
      variant="ghost"
      size="icon"
      class="h-7 w-7"
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
