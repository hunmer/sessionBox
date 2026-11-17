<script setup lang="ts">
import { computed, provide, reactive, ref, watch } from 'vue'
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
  type FolderTreeNodeData,
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
  }>(),
  { itemType: 'folder', nodes: () => [], showBaseCategories: false, defaultShowSearch: false },
)

/** 选中节点 id（v-model:selected-key） */
const selectedKey = defineModel<string | undefined>('selectedKey', { default: undefined })

const emit = defineEmits<{ select: [id: string] }>()

const isFolder = computed(() => props.itemType === 'folder')
const sectionTitle = computed(() => props.title ?? (isFolder.value ? '文件夹' : '标签'))
const defaultIcon = computed(() => (isFolder.value ? 'folder' : 'label'))

/* ---- 搜索 ---- */
const showSearch = ref(props.defaultShowSearch)
const searchQuery = ref('')
const searching = computed(() => searchQuery.value.trim().length > 0)
const treeData = computed(() =>
  searching.value ? filterNodes(props.nodes, searchQuery.value.trim()) : props.nodes,
)

/* ---- 展开状态：node.open 收集初始值；数据更新时合并（用户手动操作优先，避免 count 刷新重置展开态） ---- */
const openMap = reactive<Record<string, boolean>>(collectInitialOpen(props.nodes))
watch(
  () => props.nodes,
  (nodes) => {
    const init = collectInitialOpen(nodes)
    for (const key of Object.keys(init)) {
      if (!(key in openMap)) openMap[key] = true
    }
  },
)
/** 搜索时强制全部展开（命中子节点也要能看到父链） */
const isOpen = (id: string) => (searching.value ? true : !!openMap[id])
const toggle = (id: string) => {
  openMap[id] = !openMap[id]
}

const select = (id: string) => {
  selectedKey.value = id
  emit('select', id)
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
})

/* ---- 基础分类 ---- */
const cats = computed<BaseCategoryData[]>(
  () =>
    props.baseCategories ??
    (isFolder.value && props.showBaseCategories ? DEFAULT_BASE_CATEGORIES : []),
)
const showBase = computed(() => isFolder.value && props.showBaseCategories && cats.value.length > 0)
</script>

<template>
  <div class="ft-root">
    <!-- 标题栏 + 搜索框 -->
    <FolderTreeHeader v-model:show-search="showSearch" v-model:query="searchQuery" :title="sectionTitle" />

    <!-- 基础分类（仅 folder 模式） -->
    <FolderTreeBaseCategories
      v-if="showBase"
      :categories="cats"
      :selected-key="selectedKey"
      :default-icon="defaultIcon"
      @select="select"
    />

    <!-- 树滚动区 + SVG 分支线层 -->
    <div class="ft-scroll">
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
          <!-- ① 基础层：灰色 + SMIL 描画入场（stroke 走 CSS 类：presentation attribute 不支持 var()） -->
          <g>
            <path
              v-for="p in paths"
              :key="`b-${p.key}`"
              class="ft-branch-base"
              :d="p.d"
              fill="none"
              :stroke-width="1.5"
              :path-length="100"
              stroke-dasharray="100 200"
              :stroke-dashoffset="105"
            >
              <animate attributeName="stroke-dashoffset" from="105" to="0" dur="0.3s" fill="freeze" />
            </path>
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
              :path-length="100"
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
              :path-length="100"
              stroke-dasharray="100 200"
              :style="{ stroke: p.stroke, strokeDashoffset: activeKeys.has(p.key) ? 0 : 105 }"
            />
          </g>
        </svg>
      </div>

      <!-- 空状态 -->
      <div v-if="treeData.length === 0" class="ft-empty">
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

/* base 灰线走 CSS 类（stroke attribute 不支持 var()） */
.ft-branch-base {
  stroke: var(--ft-border);
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
