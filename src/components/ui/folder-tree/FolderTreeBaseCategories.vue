<script setup lang="ts">
import NodeIcon from './NodeIcon.vue'
import type { BaseCategoryData } from './types'

const props = withDefaults(
  defineProps<{
    categories: BaseCategoryData[]
    selectedKey?: string
    /** 默认图标名（folder 模式） */
    defaultIcon?: string
  }>(),
  { defaultIcon: 'folder' },
)

const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <ul class="ft-base">
    <li v-for="cat in props.categories" :key="cat.id">
      <a
        class="ft-base-row"
        :class="{ 'is-selected': props.selectedKey === cat.id }"
        @click="emit('select', cat.id)"
      >
        <span class="ft-base-inner">
          <NodeIcon :icon="cat.icon" :fallback="props.defaultIcon" :variant="cat.iconColor" />
          {{ cat.label }}
        </span>
        <span v-if="cat.count" class="ft-base-count">{{ cat.count }}</span>
      </a>
    </li>
  </ul>
</template>

<style scoped>
.ft-base {
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
}

.ft-base li + li {
  margin-top: 2px;
}

.ft-base-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
  color: var(--ft-fg);
  text-decoration: none;
}

.ft-base-row:hover {
  background: color-mix(in srgb, var(--ft-primary) 5%, transparent);
}

.ft-base-row.is-selected {
  background: color-mix(in srgb, var(--ft-primary) 10%, transparent);
  color: var(--ft-primary);
  font-weight: 500;
}

.ft-base-inner {
  display: flex;
  align-items: center;
}

.ft-base-count {
  color: var(--ft-muted-fg);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
