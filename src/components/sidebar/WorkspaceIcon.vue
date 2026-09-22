<script setup lang="ts">
import { computed, type Component } from 'vue'
import { resolveLucideIcon } from '@/lib/lucide-resolver'

const props = defineProps<{
  /** 图标值（emoji / lucide:xxx / img:xxx） */
  icon?: string
  /** 无图标时的回退文本（如标题首字符） */
  fallback?: string
  /** 无图标时的回退图标组件（优先于回退文本） */
  fallbackIcon?: Component
}>()

const isImage = computed(() => props.icon?.startsWith('img:'))
const imgSrc = computed(() => isImage.value ? `account-icon://${props.icon!.slice(4)}` : '')
const lucideComponent = computed(() =>
  props.icon?.startsWith('lucide:') ? resolveLucideIcon(props.icon.slice(7)) : null
)
</script>

<template>
  <img
    v-if="isImage"
    :src="imgSrc"
    alt=""
    class="w-full h-full object-cover rounded-[inherit]"
  >
  <component
    :is="lucideComponent"
    v-else-if="lucideComponent"
    class="w-[60%] h-[60%]"
  />
  <span
    v-else-if="icon"
    class="leading-none"
  >{{ icon }}</span>
  <component
    :is="fallbackIcon"
    v-else-if="fallbackIcon"
    class="w-[60%] h-[60%]"
  />
  <span v-else>{{ fallback }}</span>
</template>
