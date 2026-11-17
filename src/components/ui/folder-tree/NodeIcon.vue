<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { Folder } from 'lucide-vue-next'
import { ICONS, isHttpUrl } from './types'

const props = withDefaults(
  defineProps<{
    /** 图标名（ICONS 键）或 http(s) 图片 URL（favicon） */
    icon?: string
    /** icon 无效时的回退图标名 */
    fallback?: string
    variant?: 'muted' | 'destructive'
  }>(),
  { fallback: 'folder' },
)

const imgFailed = ref(false)
watch(
  () => props.icon,
  () => (imgFailed.value = false),
)

const isUrl = computed(() => isHttpUrl(props.icon))
const comp = computed<Component>(() => ICONS[props.icon ?? ''] ?? ICONS[props.fallback] ?? Folder)
</script>

<template>
  <span class="ft-icon" :class="variant === 'destructive' ? 'is-destructive' : 'is-muted'">
    <img v-if="isUrl && !imgFailed" :src="icon" alt="" draggable="false" @error="imgFailed = true" />
    <component :is="comp" v-else />
  </span>
</template>

<style scoped>
.ft-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 8px;
  flex: none;
  color: var(--ft-muted-fg);
}

.ft-icon.is-muted {
  color: var(--ft-muted-fg);
}

.ft-icon.is-destructive {
  color: var(--ft-destructive);
}

.ft-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.ft-icon img {
  width: 18px;
  height: 18px;
  border-radius: 2px;
  object-fit: contain;
}
</style>
