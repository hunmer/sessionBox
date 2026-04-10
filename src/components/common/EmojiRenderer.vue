<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  emoji?: string
}>()

const isImage = computed(() => props.emoji?.startsWith('img:'))
const imgSrc = computed(() => isImage.value ? `account-icon://${props.emoji!.slice(4)}` : '')
</script>

<template>
  <img v-if="isImage" :src="imgSrc" class="w-5 h-5 rounded object-contain" />
  <span v-else>{{ emoji }}</span>
</template>
