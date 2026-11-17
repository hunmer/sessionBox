<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { Folder } from 'lucide-vue-next'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { ICONS, isHttpUrl } from './types'

const props = withDefaults(
  defineProps<{
    /**
     * 图标，按以下顺序解析：
     * - ICONS 键（如 "folder" / "label"）
     * - `lucide:Name` 前缀 → lucide 图标组件
     * - `img:key` 前缀 → 业务自定义 account-icon:// 协议图片
     * - http(s) URL / `site-icon://` 协议 → img（favicon）
     * - 其余非空字符串 → emoji 文本
     */
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

/** 图片地址：http(s) / site-icon:// / img: 前缀（account-icon:// 协议） */
const imgSrc = computed(() => {
  const icon = props.icon
  if (!icon) return ''
  if (isHttpUrl(icon) || icon.startsWith('site-icon://')) return icon
  if (icon.startsWith('img:')) return `account-icon://${icon.slice(4)}`
  return ''
})

const lucideComp = computed<Component | null>(() => {
  if (!props.icon?.startsWith('lucide:')) return null
  return resolveLucideIcon(props.icon.slice(7))
})

/** ICONS 键命中的命名图标 */
const namedComp = computed<Component | null>(() => {
  const icon = props.icon
  if (!icon) return null
  return ICONS[icon] ?? null
})

/** 其余非空字符串按 emoji 文本渲染 */
const isEmoji = computed(
  () => !!props.icon?.trim() && !imgSrc.value && !lucideComp.value && !namedComp.value,
)

const fallbackComp = computed<Component>(() => ICONS[props.fallback] ?? Folder)
</script>

<template>
  <span class="ft-icon" :class="variant === 'destructive' ? 'is-destructive' : 'is-muted'">
    <img v-if="imgSrc && !imgFailed" :src="imgSrc" alt="" draggable="false" @error="imgFailed = true" />
    <component :is="lucideComp" v-else-if="lucideComp" />
    <component :is="namedComp" v-else-if="namedComp" />
    <span v-else-if="isEmoji" class="ft-emoji">{{ icon }}</span>
    <component :is="fallbackComp" v-else />
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

.ft-emoji {
  font-size: 15px;
  line-height: 1;
  /* emoji 自带彩色，覆盖继承的主题色 */
  color: inherit;
}
</style>
