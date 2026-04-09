<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Loader2, Puzzle } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useExtensionStore } from '@/stores/extension'
import { useTabStore } from '@/stores/tab'

const extensionStore = useExtensionStore()
const tabStore = useTabStore()

const isLoading = ref(false)
const emit = defineEmits<{ 'open-manager': [] }>()

const enabledExtensions = computed(() => extensionStore.extensions.filter((e) => e.enabled))

onMounted(async () => {
  if (extensionStore.extensions.length === 0) {
    await extensionStore.init()
  } else {
    await extensionStore.refreshLoadedExtensions()
  }
})
</script>

<template>
  <div class="extension-action-list flex items-center gap-0.5">
    <Button
      v-for="ext in enabledExtensions"
      :key="ext.id"
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      :title="ext.name"
    >
      <img
        v-if="ext.icon"
        :src="`extension-icon://${ext.id}`"
        class="w-5 h-5 object-contain"
      />
      <span v-else class="text-xs font-medium text-muted-foreground">
        {{ ext.name.charAt(0).toUpperCase() }}
      </span>
    </Button>

    <Button
      v-if="enabledExtensions.length === 0"
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
