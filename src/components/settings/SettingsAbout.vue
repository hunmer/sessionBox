<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import appIcon from '../../../resources/icon.png'

function openExternal(url: string) {
  window.api.openExternal(url)
}
</script>

<template>
  <div class="flex flex-col items-center justify-center py-8 gap-4">
    <img :src="appIcon" alt="SessionBox" class="w-20 h-20 rounded-xl" />
    <div class="text-center">
      <h3 class="text-lg font-semibold">SessionBox</h3>
      <p class="text-xs text-muted-foreground mt-1">版本 0.0.6</p>
    </div>
    <button
      class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mt-2"
      @click="openExternal('https://github.com/hunmer/sessionBox')"
    >
      <ExternalLink class="w-3.5 h-3.5" />
      GitHub
    </button>
  </div>
</template>
