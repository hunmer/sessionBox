<script setup lang="ts">
import { computed, markRaw } from 'vue'
import * as lucideIcons from 'lucide-vue-next'

const props = defineProps<{
  emoji?: string
}>()

const isImage = computed(() => props.emoji?.startsWith('img:'))
const isLucide = computed(() => props.emoji?.startsWith('lucide:'))
const imgSrc = computed(() => isImage.value ? `account-icon://${props.emoji!.slice(4)}` : '')

const lucideComponent = computed(() => {
  if (!isLucide.value) return null
  const name = props.emoji!.slice(6)
  const comp = (lucideIcons as any)[name]
  return comp ? markRaw(comp) : null
})
</script>

<template>
  <img v-if="isImage" :src="imgSrc" class="w-5 h-5 rounded object-contain" />
  <component v-else-if="isLucide && lucideComponent" :is="lucideComponent" class="w-5 h-5" />
  <span v-else>{{ emoji }}</span>
</template>
