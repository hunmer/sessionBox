<script setup lang="ts">
import { computed, provide, reactive, ref, watch, type VNode } from 'vue'
import { FolderOpen, Tag } from 'lucide-vue-next'
import FolderTreeBaseCategories from './FolderTreeBaseCategories.vue'
import FolderTreeHeader from './FolderTreeHeader.vue'
import FolderTreeNode from './FolderTreeNode.vue'
import { useBranchLines } from './useBranchLines'
import {
  buildInfoMap,
  collectInitialOpen,
  DEFAULT_BASE_CATEGORIES,
  filterNodes,
  flattenVisible,
  folderTreeKey,
  type BaseCategoryData,
  type FolderTreeApi,
  type FolderTreeNodeData,
  type FolderTreeDropMarker,
  type FolderTreeDropPayload,
  type FolderTreeDropPosition,
} from './types'

const props = withDefaults(
  defineProps<{
    /** 'folder' | 'tag'：决定默认标题 / 默认图标 / 空状态图标 */
    itemType?: 'folder' | 'tag'
    nodes?: FolderTreeNodeData[]
    title?: string
    /** 仅 folder 模式生效，展示顶部基础分类区 */
    showBaseCategories?: boolean
    baseCategories?: BaseCategoryData[]
    defaultShowSearch?: boolean
    emptyText?: string
    /** 不渲染标题栏（嵌入已有标题区时使用，隐藏后搜索入口不可用） */
    hideHeader?: boolean
    /**
     * 树滚动区最大高度：缺省 16rem；false 时不限高不滚动（随外层容器滚动）；
     * 其余字符串作为 CSS max-height（如 "300px"）
     */
    maxHeight?: string | false
    /** 不渲染内置空状态（由业务自渲染） */
    hideEmpty?: boolean
    /** 启用内部拖拽排序（HTML5 DnD），落定后 emit nodeDrop */
    draggable?: boolean
    /** 初始展开状态（键值优先级高于 node.open），业务可持久化后回传 */
    openStates?: Record<string, boolean>
    /** 右键菜单内容渲染器；提供后行将包右键菜单 */
    menuRenderer?: (node: FolderTreeNodeData) => VNode | null
    /** 行尾操作区渲染器 */
    actionsRenderer?: (node: FolderTreeNodeData) => VNode | null
  }>(),
  { itemType: 'folder', nodes: () => [], showBaseCategories: false, defaultShowSearch: false },
)

/** 选中节点 id（v-model:selected-key） */
const selectedKey = defineModel<string | undefined>('selectedKey', { default: undefined })

const emit = defineEmits<{
  select: [id: string]
  /** 行点击（无论该行是否触发 select/toggle） */
  nodeClick: [id: string]
  /** 任意展开/折叠后上抛完整快照 */
  openChange: [states: Record<string, boolean>]
  /** 内部拖拽落定（dragId 移动到 targetId 的 position 位置） */
  nodeDrop: [payload: FolderTreeDropPayload]
  /** 外部拖放悬停（业务可 preventDefault 接管并决定 dropEffect） */
  nodeExternalDragover: [node: FolderTreeNodeData, event: DragEvent]
  /** 外部拖放离开该行（业务清理悬停计时等） */
  nodeExternalDragleave: [node: FolderTreeNodeData]
  /** 外部拖放在该行落下 */
  nodeExternalDrop: [node: FolderTreeNodeData, event: DragEvent]
}>()

const isFolder = computed(() => props.itemType === 'folder')
console.log('[FolderTree:debug] setup rerun', new Date().toISOString())
const sectionTitle = computed(() => props.title ?? (isFolder.value ? '文件夹' : '标签'))
const defaultIcon = computed(() => (isFolder.value ? 'folder' : 'label'))

/* ---- 搜索 ---- */
const showSearch = ref(props.defaultShowSearch)
const searchQuery = ref('')
const searching = computed(() => searchQuery.value.trim().length > 0)
const treeData = computed(() =>
  searching.value ? filterNodes(props.nodes, searchQuery.value.trim()) : props.nodes,
)

/* ---- 展开状态：node.open / openStates 收集初始值；数据更新时合并新增（用户手动操作优先，避免 count 刷新重置展开态） ---- */
const openMap = reactive<Record<string, boolean>>({
  ...collectInitialOpen(props.nodes),
  ...(props.openStates ?? {}),
})
watch(
  () => props.nodes,
  (nodes) => {
    const init = collectInitialOpen(nodes)
    for (const key of Object.keys(init)) {
      if (!(key in openMap)) openMap[key] = true
    }
  },
)
watch(
  () => props.openStates,
  (states) => {
    // 业务回传新快照时合并（仅写入差异键，避免与本地交互形成循环）
    if (!states) return
    for (const [key, value] of Object.entries(states)) {
      if (openMap[key] !== value) openMap[key] = value
    }
  },
)
/** 搜索时强制全部展开（命中子节点也要能看到父链） */
const isOpen = (id: string) => (searching.value ? true : !!openMap[id])
const toggle = (id: string) => {
  openMap[id] = !openMap[id]
  emit('openChange', { ...openMap })
}

const select = (id: string) => {
  selectedKey.value = id
  emit('select', id)
}

/* ---- 内部拖拽 / 外部拖放状态 ---- */
const draggingId = ref<string | null>(null)
const dropTarget = ref<FolderTreeDropMarker | null>(null)
const externalDropId = ref<string | null>(null)

function beginInternalDrag(id: string) {
  draggingId.value = id
}
function endInternalDrag() {
  draggingId.value = null
  dropTarget.value = null
}
function setDropTarget(marker: FolderTreeDropMarker) {
  dropTarget.value = marker
}
function consumeDrop(targetId: string) {
  const dragId = draggingId.value
  const position: FolderTreeDropPosition =
    dropTarget.value?.id === targetId ? dropTarget.value.position : 'after'
  draggingId.value = null
  dropTarget.value = null
  if (dragId && dragId !== targetId) {
    emit('nodeDrop', { dragId, targetId, position })
  }
}
function forwardExternalDragover(node: FolderTreeNodeData, event: DragEvent) {
  emit('nodeExternalDragover', node, event)
  // 业务 preventDefault 即视为接受外部拖放，行做高亮反馈
  if (event.defaultPrevented) externalDropId.value = node.id
}
function forwardExternalDrop(node: FolderTreeNodeData, event: DragEvent) {
  externalDropId.value = null
  emit('nodeExternalDrop', node, event)
}
function clearRowFeedback(node: FolderTreeNodeData) {
  if (dropTarget.value?.id === node.id) dropTarget.value = null
  if (externalDropId.value === node.id) {
    externalDropId.value = null
    emit('nodeExternalDragleave', node)
  }
}


/* ---- 可见行集合与索引（分支线只画可见行） ---- */
const visibleIds = computed(
  () => new Set(flattenVisible(treeData.value, isOpen).map((node) => node.id)),
)
const infoMap = computed(() => buildInfoMap(treeData.value))

const layerRef = ref<HTMLDivElement | null>(null)
const rowsRef = ref<HTMLDivElement | null>(null)
const { paths, size, activeKeys, hoverKeys, setHover } = useBranchLines({
  infoMap,
  visibleIds,
  selectedKey,
  layerRef,
  rowsRef,
})

provide(folderTreeKey, {
  selectedKey: computed(() => selectedKey.value),
  isOpen,
  toggle,
  select,
  hover: setHover,
  nodeClick: (id: string) => emit('nodeClick', id),
  draggable: computed(() => props.draggable === true),
  menuRenderer: (node: FolderTreeNodeData) => props.menuRenderer?.(node) ?? null,
  actionsRenderer: (node: FolderTreeNodeData) => props.actionsRenderer?.(node) ?? null,
  draggingId,
  dropTarget,
  externalDropId,
  beginInternalDrag,
  endInternalDrag,
  setDropTarget,
  consumeDrop,
  forwardExternalDragover,
  forwardExternalDrop,
  clearRowFeedback,
} satisfies FolderTreeApi)

/* ---- 基础分类 ---- */
const cats = computed<BaseCategoryData[]>(
  () =>
    props.baseCategories ??
    (isFolder.value && props.showBaseCategories ? DEFAULT_BASE_CATEGORIES : []),
)
const showBase = computed(() => isFolder.value && props.showBaseCategories && cats.value.length > 0)

/* ---- 滚动区高度 ---- */
const scrollStyle = computed(() => {
  if (typeof props.maxHeight === 'string') return { maxHeight: props.maxHeight }
  return undefined
})
</script>

<template>
  <div class="ft-root">
    <!-- 标题栏 + 搜索框 -->
    <FolderTreeHeader
      v-if="!hideHeader"
      v-model:show-search="showSearch"
      v-model:query="searchQuery"
      :title="sectionTitle"
    />

    <!-- 基础分类（仅 folder 模式） -->
    <FolderTreeBaseCategories
      v-if="showBase"
      :categories="cats"
      :selected-key="selectedKey"
      :default-icon="defaultIcon"
      @select="select"
    />

    <!-- 树滚动区 + SVG 分支线层 -->
    <div class="ft-scroll" :class="{ 'ft-scroll--fill': maxHeight === false }" :style="scrollStyle">
      <div ref="layerRef" class="ft-branch-layer">
        <div ref="rowsRef" role="tree" :aria-label="sectionTitle">
          <FolderTreeNode
            v-for="node in treeData"
            :key="node.id"
            :node="node"
            :level="1"
            :default-icon="defaultIcon"
          />
        </div>
        <svg class="ft-branch-svg" :width="size.w" :height="size.h" aria-hidden="true">
          <!-- ① 基础层：灰色 + CSS 描画入场（SMIL 对 v-for 动态插入/复用元素的冻结行为不确定，曾致部分线不可见） -->
          <g>
            <path
              v-for="p in paths"
              :key="`b-${p.key}`"
              class="ft-branch-base"
              :d="p.d"
              fill="none"
              :stroke-width="1.5"
              :pathLength="100"
              stroke-dasharray="100 200"
              :stroke-dashoffset="0"
            />
          </g>
          <!-- ② hover 层：半透明点亮（动态颜色必须走内联 style） -->
          <g opacity="0.45">
            <path
              v-for="p in paths"
              :key="`h-${p.key}`"
              class="ft-branch-hover"
              :d="p.d"
              fill="none"
              :stroke-width="1.75"
              :pathLength="100"
              stroke-dasharray="100 200"
              :style="{ stroke: p.stroke, strokeDashoffset: hoverKeys.has(p.key) ? 0 : 105 }"
            />
          </g>
          <!-- ③ active 层：选中链路全亮 -->
          <g>
            <path
              v-for="p in paths"
              :key="`a-${p.key}`"
              class="ft-branch-active"
              :d="p.d"
              fill="none"
              :stroke-width="1.75"
              :pathLength="100"
              stroke-dasharray="100 200"
              :style="{ stroke: p.stroke, strokeDashoffset: activeKeys.has(p.key) ? 0 : 105 }"
            />
          </g>
        </svg>
      </div>

      <!-- 空状态 -->
      <div v-if="treeData.length === 0 && !hideEmpty" class="ft-empty">
        <component :is="isFolder ? FolderOpen : Tag" />
        <p>{{ props.emptyText ?? `暂无${sectionTitle}，点击右上角 + 添加` }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---------- 作用域变量：桥接项目主题（自动适配 dark 模式） ---------- */

.ft-root {
  --ft-primary: var(--primary, #2563eb);
  --ft-border: var(--border, rgba(0, 0, 0, 0.08));
  --ft-fg: var(--foreground, rgba(0, 0, 0, 0.88));
  --ft-muted-fg: var(--muted-foreground, rgba(0, 0, 0, 0.52));
  --ft-destructive: var(--destructive, #dc2626);
  --ft-field-bg: color-mix(in srgb, var(--muted, rgba(0, 0, 0, 0.06)) 60%, transparent);

  width: 100%;
  color: var(--ft-fg);
  font-size: 14px;
  line-height: 1.45;
}

/* ---------- 树滚动区 ---------- */

.ft-scroll {
  max-height: 16rem;
  overflow-y: auto;
  overflow-x: auto;
  scrollbar-width: none;
  padding-right: 4px;
  margin-right: -4px;
}

/* maxHeight=false：不限高不滚动，随外层容器滚动 */
.ft-scroll.ft-scroll--fill {
  max-height: none;
  overflow: visible;
}

.ft-scroll::-webkit-scrollbar {
  display: none;
}

.ft-branch-layer {
  position: relative;
  min-width: 100%;
}

.ft-branch-svg {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  display: block;
  overflow: visible;
  pointer-events: none;
}

/* base 灰线走 CSS 类（stroke attribute 不支持 var()）；CSS 描画入场，forwards 保证终态可见 */
.ft-branch-base {
  stroke: var(--ft-border);
  animation: ft-branch-draw-in 0.3s ease-out forwards;
}

@keyframes ft-branch-draw-in {
  from {
    stroke-dashoffset: 105;
  }
  to {
    stroke-dashoffset: 0;
  }
}

.ft-branch-hover {
  transition: stroke-dashoffset 200ms ease-out;
}

.ft-branch-active {
  transition: stroke-dashoffset 300ms ease-out;
}

/* ---------- 空状态 ---------- */

.ft-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
  color: var(--ft-muted-fg);
}

.ft-empty :deep(svg) {
  width: 36px;
  height: 36px;
  margin-bottom: 8px;
}

.ft-empty p {
  margin: 0;
  font-size: 13px;
  text-align: center;
}
</style>
