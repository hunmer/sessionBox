import type { Component, InjectionKey, Ref, VNode } from 'vue'
import { BookmarkX, Folder, FolderOpen, Star, Tag, Trash2 } from 'lucide-vue-next'

/* ============================================================
 * 类型（对照源 mira-client FolderTreeComponent/types.ts，仅保留 UI 展示字段）
 * ============================================================ */

/** 树节点数据 */
export interface FolderTreeNodeData {
  id: string
  label: string
  /** 图标名（ICONS 键，如 "folder" / "label"）或 http(s) 图片 URL（favicon） */
  icon?: string
  /** 计数（0 / undefined 不渲染） */
  count?: number
  /** 分支线颜色（hex 字符串），缺省用主题色 var(--primary) */
  color?: string
  children?: FolderTreeNodeData[]
  /** 初始展开 */
  open?: boolean
  /** 行点击是否触发选中（默认 true）；设为 false 的行（如分组）点击仅折叠/展开 */
  selectable?: boolean
}

/** 基础分类（全部素材 / 未分类 / 未打标 / 回收站） */
export interface BaseCategoryData {
  id: string
  label: string
  icon?: string
  iconColor?: 'muted' | 'destructive'
  count?: number
}

/* ============================================================
 * 常量
 * ============================================================ */

/** 每层缩进像素（分支线 LINE_INDENT 同源） */
export const LINE_INDENT = 20
/** 分支线转弯圆角半径 */
export const LINE_R = 6

/** 图标名 → lucide 组件映射（material icon 名兼容） */
export const ICONS: Record<string, Component> = {
  folder: Folder,
  folder_open: FolderOpen,
  folder_special: Star,
  label: Tag,
  label_off: BookmarkX,
  delete: Trash2,
}

/** 默认基础分类（仅 folder 模式且 showBaseCategories 时使用） */
export const DEFAULT_BASE_CATEGORIES: BaseCategoryData[] = [
  { id: 'all', label: '全部素材', icon: 'folder_open', iconColor: 'muted' },
  { id: 'uncategorized', label: '未分类', icon: 'folder_special', iconColor: 'muted' },
  { id: 'untagged', label: '未打标', icon: 'label_off', iconColor: 'muted' },
  { id: 'trash', label: '回收站', icon: 'delete', iconColor: 'destructive' },
]

/* ============================================================
 * 工具函数（对照源 utils.ts）
 * ============================================================ */

export interface NodeInfo {
  id: string
  node: FolderTreeNodeData
  parent: FolderTreeNodeData | null
  level: number
}

/** id → {node, parent, level} 索引（对照源 infoMap） */
export function buildInfoMap(
  nodes: FolderTreeNodeData[],
  parent: FolderTreeNodeData | null = null,
  level = 1,
  map = new Map<string, NodeInfo>(),
): Map<string, NodeInfo> {
  for (const node of nodes) {
    map.set(node.id, { id: node.id, node, parent, level })
    if (node.children?.length) buildInfoMap(node.children, node, level + 1, map)
  }
  return map
}

/** 收集初始展开状态（node.open） */
export function collectInitialOpen(nodes: FolderTreeNodeData[], acc: Record<string, boolean> = {}) {
  for (const node of nodes) {
    if (node.open) acc[node.id] = true
    if (node.children?.length) collectInitialOpen(node.children, acc)
  }
  return acc
}

/** 子命中保留父链，父命中保留全部子（对照源 filterNodes） */
export function filterNodes(nodes: FolderTreeNodeData[], query: string): FolderTreeNodeData[] {
  const q = query.toLowerCase()
  const walk = (list: FolderTreeNodeData[]): FolderTreeNodeData[] => {
    const out: FolderTreeNodeData[] = []
    for (const node of list) {
      const hit = node.label.toLowerCase().includes(q)
      const children = node.children?.length ? walk(node.children) : []
      if (hit || children.length) {
        out.push(hit ? node : { ...node, children })
      }
    }
    return out
  }
  return walk(nodes)
}

/** 深度优先铺开当前可见行（祖先全部展开） */
export function flattenVisible(
  nodes: FolderTreeNodeData[],
  isOpen: (id: string) => boolean,
  acc: FolderTreeNodeData[] = [],
): FolderTreeNodeData[] {
  for (const node of nodes) {
    acc.push(node)
    if (node.children?.length && isOpen(node.id)) {
      flattenVisible(node.children, isOpen, acc)
    }
  }
  return acc
}

/** 沿 parent 链收集 "parent->child" 连线键 */
export function collectPathKeys(id: string | null, infoMap: Map<string, NodeInfo>): Set<string> {
  const keys = new Set<string>()
  if (!id) return keys
  let cur = infoMap.get(id)
  while (cur?.parent) {
    keys.add(`${cur.parent.id}->${cur.id}`)
    cur = infoMap.get(cur.parent.id)
  }
  return keys
}

/** icon 是否为 http(s) 图片 URL */
export function isHttpUrl(icon?: string) {
  return typeof icon === 'string' && /^https?:\/\//i.test(icon)
}

/* ============================================================
 * 树内部注入 API（主组件 provide，递归节点 inject）
 * ============================================================ */

/** 内部拖拽落点位置：目标行前 / 后 / 内部（成为子节点） */
export type FolderTreeDropPosition = 'before' | 'after' | 'inside'

/** 拖拽过程中目标行标记 */
export interface FolderTreeDropMarker {
  id: string
  position: FolderTreeDropPosition
}

/** 拖拽落定后上抛给业务的数据 */
export interface FolderTreeDropPayload {
  dragId: string
  targetId: string
  position: FolderTreeDropPosition
}

export interface FolderTreeApi {
  selectedKey: Readonly<Ref<string | undefined>>
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
  select: (id: string) => void
  hover: (id: string | null) => void
  /** 行点击（无论该行是否触发 select/toggle），供业务做单击/双击等判定 */
  nodeClick: (id: string) => void
  /** 是否启用内部拖拽排序 */
  draggable: Readonly<Ref<boolean>>
  /** 右键菜单内容渲染器；不提供时行不包右键菜单 */
  menuRenderer?: (node: FolderTreeNodeData) => VNode | null
  /** 行尾操作区渲染器（VNode 内可用 .ft-action-hover 类实现"行 hover 才显示"） */
  actionsRenderer?: (node: FolderTreeNodeData) => VNode | null
  /** 拖拽中的节点 id（源行降透明） */
  draggingId: Readonly<Ref<string | null>>
  /** 当前拖拽目标行与落点 */
  dropTarget: Readonly<Ref<FolderTreeDropMarker | null>>
  /** 外部拖放悬停高亮行（dragover 被业务 preventDefault 后标记） */
  externalDropId: Readonly<Ref<string | null>>
  beginInternalDrag: (id: string) => void
  endInternalDrag: () => void
  setDropTarget: (marker: FolderTreeDropMarker) => void
  /** 结束一次内部拖放：组装 {dragId, targetId, position} 上抛并清空状态 */
  consumeDrop: (targetId: string) => void
  forwardExternalDragover: (node: FolderTreeNodeData, event: DragEvent) => void
  forwardExternalDrop: (node: FolderTreeNodeData, event: DragEvent) => void
  /** dragleave：清目标行反馈；外部拖放行同时通知业务清理悬停计时 */
  clearRowFeedback: (node: FolderTreeNodeData) => void
}

export const folderTreeKey: InjectionKey<FolderTreeApi> = Symbol('FolderTreeApi')

/** 内部拖拽排序使用的 dataTransfer MIME 类型 */
export const FOLDER_TREE_DRAG_MIME = 'application/x-folder-tree'
