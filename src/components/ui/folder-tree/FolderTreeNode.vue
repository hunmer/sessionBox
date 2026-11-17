<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch, type Directive } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import NodeIcon from './NodeIcon.vue'
import { folderTreeKey, LINE_INDENT, type FolderTreeNodeData } from './types'

const props = withDefaults(
  defineProps<{
    node: FolderTreeNodeData
    level: number
    /** 默认图标名（folder 模式 "folder" / tag 模式 "label"） */
    defaultIcon?: string
  }>(),
  { defaultIcon: 'folder' },
)

const api = inject(folderTreeKey, null)

const children = computed(() => props.node.children ?? [])
const hasChildren = computed(() => children.value.length > 0)
const open = computed(() => api?.isOpen(props.node.id) ?? false)
const selected = computed(() => api?.selectedKey.value === props.node.id)

/* ---- 折叠动画两态：mounted 控制是否渲染子行，expanded 控制 grid-rows 过渡 ---- */
const mounted = ref(open.value)
const expanded = ref(open.value)
let raf = 0
let timer = 0

watch(open, (value) => {
  if (value) {
    mounted.value = true
    cancelAnimationFrame(raf)
    window.clearTimeout(timer)
    // 双 rAF：先以 0fr 挂载，再切 1fr 触发高度过渡
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        expanded.value = true
      })
    })
  } else {
    expanded.value = false
    cancelAnimationFrame(raf)
    window.clearTimeout(timer)
    timer = window.setTimeout(() => (mounted.value = false), 300)
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.clearTimeout(timer)
})

/** 行点击（同源）：有子节点 → 折叠态=展开+选中，展开态=仅折叠；叶子 → 仅选中 */
const handleClick = () => {
  if (hasChildren.value) {
    if (!open.value) api?.select(props.node.id)
    api?.toggle(props.node.id)
  } else {
    api?.select(props.node.id)
  }
}

/* ---- 计数逐位弹出（对照源 vDigitPop 指令） ---- */
const vDigitPop: Directive<HTMLElement, number | undefined> = {
  updated(el, binding) {
    if (binding.oldValue === binding.value) return
    el.classList.remove('is-animating')
    void el.offsetWidth // 强制 reflow 重播动画
    el.classList.add('is-animating')
  },
}
</script>

<template>
  <div
    :data-ft-node-id="node.id"
    class="ft-row"
    :class="{ 'is-selected': selected }"
    :style="{ paddingLeft: `${8 + (level - 1) * LINE_INDENT}px` }"
    role="treeitem"
    :aria-level="level"
    :aria-expanded="hasChildren ? open : undefined"
    :aria-selected="selected"
    @click="handleClick"
    @mouseenter="api?.hover(node.id)"
    @mouseleave="api?.hover(null)"
  >
    <NodeIcon :icon="node.icon" :fallback="defaultIcon" />
    <span class="ft-row-label">{{ node.label }}</span>
    <span
      v-if="node.count"
      v-digit-pop="node.count"
      class="ft-digits"
      :aria-label="String(node.count)"
    >
      <span
        v-for="(digit, i) in String(node.count)"
        :key="i"
        class="ft-digit"
        :data-stagger="i > 0 ? Math.min(i, 2) : undefined"
      >
        {{ digit }}
      </span>
    </span>
    <span v-if="hasChildren" class="ft-chevron" :class="{ 'is-open': open }">
      <ChevronRight />
    </span>
  </div>
  <div v-if="hasChildren && mounted" class="ft-children" :class="{ 'ft-children--open': expanded }">
    <div class="ft-children-inner">
      <FolderTreeNode
        v-for="child in children"
        :key="child.id"
        :node="child"
        :level="level + 1"
        :default-icon="defaultIcon"
      />
    </div>
  </div>
</template>

<style scoped>
/* ---------- 树节点行 ---------- */

.ft-row {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: background-color 150ms ease, color 150ms ease;
}

.ft-row:hover {
  background: color-mix(in srgb, var(--ft-primary) 5%, transparent);
}

.ft-row.is-selected {
  background: color-mix(in srgb, var(--ft-primary) 10%, transparent);
  color: var(--ft-primary);
  font-weight: 500;
}

.ft-row-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* chevron 始终在行尾 */
.ft-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  flex: none;
  color: var(--ft-muted-fg);
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
  transform-origin: center center;
}

.ft-chevron :deep(svg) {
  width: 16px;
  height: 16px;
}

.ft-chevron.is-open {
  transform: rotate(90deg);
}

.ft-chevron:active {
  transform: scale(0.9);
}

.ft-chevron.is-open:active {
  transform: rotate(90deg) scale(0.9);
}

/* ---------- 子节点容器：grid-rows 高度过渡 + 行滑入/滑出 ---------- */

.ft-children {
  display: grid;
  grid-template-rows: 0fr;
  overflow: hidden;
  transition: grid-template-rows 240ms cubic-bezier(0.23, 1, 0.32, 1);
}

.ft-children.ft-children--open {
  grid-template-rows: 1fr;
}

.ft-children-inner {
  overflow: hidden;
  min-height: 0;
}

.ft-children--open > .ft-children-inner > .ft-row {
  animation: ft-row-in 240ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

.ft-children:not(.ft-children--open) > .ft-children-inner > .ft-row {
  animation: ft-row-out 240ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

@keyframes ft-row-in {
  from {
    transform: translateX(-24px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes ft-row-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(24px);
    opacity: 0;
  }
}

/* ---------- 计数：逐位弹出（Transitions.dev number pop-in） ---------- */

.ft-digits {
  --digit-dur: 500ms;
  --digit-distance: 8px;
  --digit-stagger: 70ms;
  --digit-blur: 2px;
  --digit-ease: cubic-bezier(0.34, 1.45, 0.64, 1);
  --digit-dir-x: 0;
  --digit-dir-y: 1;
  display: inline-flex;
  align-items: baseline;
  margin-left: 8px;
  color: var(--ft-muted-fg);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.ft-digit {
  display: inline-block;
  will-change: transform, opacity, filter;
}

.ft-digits.is-animating .ft-digit {
  animation: ft-digit-pop-in var(--digit-dur) var(--digit-ease) both;
}

.ft-digits.is-animating .ft-digit[data-stagger='1'] {
  animation-delay: var(--digit-stagger);
}

.ft-digits.is-animating .ft-digit[data-stagger='2'] {
  animation-delay: calc(var(--digit-stagger) * 2);
}

@keyframes ft-digit-pop-in {
  0% {
    transform: translate(
      calc(var(--digit-distance) * var(--digit-dir-x)),
      calc(var(--digit-distance) * var(--digit-dir-y))
    );
    opacity: 0;
    filter: blur(var(--digit-blur));
  }
  100% {
    transform: translate(0, 0);
    opacity: 1;
    filter: blur(0);
  }
}

/* ---------- reduced motion ---------- */

@media (prefers-reduced-motion: reduce) {
  .ft-digits .ft-digit {
    animation: none !important;
  }
}
</style>
