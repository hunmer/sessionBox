<script setup lang="ts">
import { computed } from 'vue'
import { resolveLucideIcon } from '@/lib/lucide-resolver'

const props = defineProps<{
  emoji?: string
}>()

const isImage = computed(() => props.emoji?.startsWith('img:'))
const isLucide = computed(() => props.emoji?.startsWith('lucide:'))
const imgSrc = computed(() => isImage.value ? `account-icon://${props.emoji!.slice(4)}` : '')

const lucideComponent = computed(() => {
  if (!isLucide.value) return null
  return resolveLucideIcon(props.emoji!.slice(7))
})
</script>

<template>
  <img v-if="isImage" :src="imgSrc" class="w-5 h-5 rounded object-contain" />
  <component v-else-if="isLucide && lucideComponent" :is="lucideComponent" class="w-5 h-5" />
  <span v-else>{{ emoji }}</span>
</template>
