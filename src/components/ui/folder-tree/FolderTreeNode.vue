<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch, type Directive } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import NodeIcon from './NodeIcon.vue'
import {
  folderTreeKey,
  FOLDER_TREE_DRAG_MIME,
  LINE_INDENT,
  type FolderTreeNodeData,
  type FolderTreeDropPosition,
} from './types'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'

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

/** 右键菜单 / 行尾操作区（业务渲染器） */
const menuVNode = computed(() => api?.menuRenderer?.(props.node) ?? null)
const actionsVNode = computed(() => api?.actionsRenderer?.(props.node) ?? null)

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

/** 行点击（同源）：有子节点 → 折叠态=展开+选中，展开态=仅折叠；叶子 → 仅选中；selectable=false 的行仅折叠 */
const handleClick = () => {
  api?.nodeClick(props.node.id)
  const selectable = props.node.selectable !== false
  if (hasChildren.value) {
    if (!open.value && selectable) api?.select(props.node.id)
    api?.toggle(props.node.id)
  } else if (selectable) {
    api?.select(props.node.id)
  }
}

/* ---- 内部拖拽排序 + 外部拖放转发 ---- */
const dragEnabled = computed(() => api?.draggable.value === true)
const isDragging = computed(() => api?.draggingId.value === props.node.id)
const dropPosition = computed(() =>
  api?.dropTarget.value?.id === props.node.id ? api.dropTarget.value.position : null,
)
const isExternalDrop = computed(() => api?.externalDropId.value === props.node.id)

function isInternalDrag(event: DragEvent): boolean {
  if (api?.draggingId.value) return true
  return event.dataTransfer?.types.includes(FOLDER_TREE_DRAG_MIME) ?? false
}

function onDragStart(event: DragEvent) {
  if (!dragEnabled.value || !api) return
  event.dataTransfer?.setData(FOLDER_TREE_DRAG_MIME, props.node.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  api.beginInternalDrag(props.node.id)
}

function onDragEnd() {
  api?.endInternalDrag()
}

function onDragOver(event: DragEvent) {
  if (!api) return
  if (isInternalDrag(event)) {
    if (!dragEnabled.value) return
    if (!api.draggingId.value || api.draggingId.value === props.node.id) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    // 按鼠标纵向位置判定落点：上 30% → 前，下 30% → 后，中部 → 内部（无子节点时退化为后）
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const y = event.clientY - rect.top
    let position: FolderTreeDropPosition
    if (y < rect.height * 0.3) position = 'before'
    else if (y > rect.height * 0.7) position = 'after'
    else position = hasChildren.value ? 'inside' : 'after'
    api.setDropTarget({ id: props.node.id, position })
  } else {
    event.stopPropagation()
    api.forwardExternalDragover(props.node, event)
  }
}

function onDragLeave(event: DragEvent) {
  // 子元素间移动会触发 dragleave，仅当真正离开行时清理
  const currentTarget = event.currentTarget as HTMLElement | null
  const relatedTarget = event.relatedTarget as Node | null
  if (currentTarget?.contains(relatedTarget)) return
  api?.clearRowFeedback(props.node)
}

function onDrop(event: DragEvent) {
  if (!api) return
  if (isInternalDrag(event)) {
    if (!dragEnabled.value) return
    event.preventDefault()
    event.stopPropagation()
    api.consumeDrop(props.node.id)
  } else {
    event.stopPropagation()
    api.forwardExternalDrop(props.node, event)
  }
}

/** 行 DOM 属性/事件（右键菜单包裹与否共用，避免两份模板重复定义） */
const rowBindings = computed(() => ({
  'data-ft-node-id': props.node.id,
  class: [
    'ft-row',
    {
      'is-selected': selected.value,
      'is-dragging': isDragging.value,
      'drop-before': dropPosition.value === 'before',
      'drop-after': dropPosition.value === 'after',
      'drop-inside': dropPosition.value === 'inside',
      'is-external-drop': isExternalDrop.value,
    },
  ],
  style: { paddingLeft: `${8 + (props.level - 1) * LINE_INDENT}px` },
  role: 'treeitem',
  'aria-level': props.level,
  'aria-expanded': hasChildren.value ? open.value : undefined,
  'aria-selected': selected.value,
  draggable: dragEnabled.value || undefined,
  onClick: handleClick,
  onMouseenter: () => api?.hover(props.node.id),
  onMouseleave: () => api?.hover(null),
  onDragstart: onDragStart,
  onDragend: onDragEnd,
  onDragover: onDragOver,
  onDragleave: onDragLeave,
  onDrop: onDrop,
}))

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
  <!-- 有右键菜单渲染器：行包 ContextMenu（Trigger as-child 不产生额外 DOM） -->
  <ContextMenu v-if="menuVNode">
    <ContextMenuTrigger as-child>
      <div v-bind="rowBindings">
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
        <span v-if="actionsVNode" class="ft-actions">
          <component :is="actionsVNode" />
        </span>
        <span
          v-if="hasChildren"
          class="ft-chevron"
          :class="{ 'is-open': open }"
          @click.stop="api?.toggle(node.id)"
        >
          <ChevronRight />
        </span>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <component :is="menuVNode" />
    </ContextMenuContent>
  </ContextMenu>

  <!-- 无右键菜单：裸行 -->
  <div v-else v-bind="rowBindings">
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
    <span v-if="actionsVNode" class="ft-actions">
      <component :is="actionsVNode" />
    </span>
    <span
      v-if="hasChildren"
      class="ft-chevron"
      :class="{ 'is-open': open }"
      @click.stop="api?.toggle(node.id)"
    >
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

/* ---------- 行尾操作区（业务 actionsRenderer 注入） ---------- */

.ft-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
  margin-right: 2px;
  flex: none;
}

/* 业务 VNode 中带 .ft-action-hover 的元素：行 hover / 聚焦时才显示 */
.ft-row :deep(.ft-action-hover) {
  opacity: 0;
  transition: opacity 150ms ease;
}

.ft-row:hover :deep(.ft-action-hover),
.ft-row:focus-within :deep(.ft-action-hover) {
  opacity: 1;
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

/* ---------- 拖拽反馈 ---------- */

/* 拖拽源行降透明 */
.ft-row.is-dragging {
  opacity: 0.4;
}

/* 目标行插入线：before 在行顶、after 在行底 */
.ft-row.drop-before::before,
.ft-row.drop-after::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  height: 2px;
  border-radius: 1px;
  background: var(--ft-primary);
  pointer-events: none;
}

.ft-row.drop-before::before {
  top: 0;
}

.ft-row.drop-after::after {
  bottom: 0;
}

/* inside：行内高亮框 */
.ft-row.drop-inside {
  box-shadow: inset 0 0 0 1.5px var(--ft-primary);
  background: color-mix(in srgb, var(--ft-primary) 8%, transparent);
}

/* 外部拖放悬停（业务 preventDefault 接管后） */
.ft-row.is-external-drop {
  background: color-mix(in srgb, var(--ft-primary) 18%, transparent);
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

.ft-children--open > .ft-children-inner > :deep(.ft-row) {
  animation: ft-row-in 240ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

.ft-children:not(.ft-children--open) > .ft-children-inner > :deep(.ft-row) {
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
