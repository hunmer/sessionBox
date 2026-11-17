<script setup lang="ts">
import { computed, h, onBeforeUnmount, reactive, ref, watch, type VNode } from 'vue'
import {
  ChevronRight,
  ExternalLink,
  FolderX,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-vue-next'
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
import { useTabStore } from '@/stores/tab'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import { buildPageTree, flattenPageItems, type PageItem } from './page-tree'
import FolderTree from '@/components/ui/folder-tree/FolderTree.vue'
import type {
  FolderTreeNodeData,
  FolderTreeDropPayload,
} from '@/components/ui/folder-tree/types'
import { extractNavigableDropUrl, hasSupportedExternalDrop } from '@/lib/external-drop'
import { getDomain, getFaviconUrl } from '@/lib/utils'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import type { Group, Page, Tab } from '@/types'

const props = defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  selectPage: [pageId: string]
  editGroup: [group: Group]
  deleteGroup: [group: Group]
  addPage: [groupId: string]
  addSubPage: [parentId: string]
  editPage: [page: Page]
  deletePage: [page: Page]
}>()

const containerStore = useContainerStore()
const pageStore = usePageStore()
const tabStore = useTabStore()

// 将 workspaceGroups 及其页面转换为树数据（页面按 parentId 组装为树）
const workspaces = computed(() => {
  return containerStore.workspaceGroups.map((g) => ({
    id: g.id,
    group: g,
    name: g.name,
    emoji: g.icon || '📁',
    color: g.color,
    pages: buildPageTree(pageStore.pagesByGroup.get(g.id) || []),
  }))
})

// 折叠态下拉需要平铺展示所有页面（含子页面）
const collapsedPages = computed(() =>
  workspaces.value.map((w) => ({
    ...w,
    flatPages: flattenPageItems(w.pages),
  }))
)

// 当前工作区中无 pageId 归属的标签页（未分组）
const ungroupedTabs = computed(() => {
  return tabStore.workspaceTabs.filter((t) => !t.pageId)
})

const ungroupedOpen = ref(true)

/* ==================== 展开态：FolderTree 渲染 ==================== */

// id → Group / PageItem 索引（分组与页面 id 均为 UUID，不会冲突）
const groupMap = computed(() => new Map(containerStore.workspaceGroups.map((g) => [g.id, g])))

const pageMap = computed(() => {
  const map = new Map<string, PageItem>()
  const walk = (items: PageItem[]) => {
    for (const item of items) {
      map.set(item.id, item)
      walk(item.children)
    }
  }
  for (const w of workspaces.value) walk(w.pages)
  return map
})

// 页面图标：自定义图标 → favicon（带版本号破缓存）
function pageIcon(page: Page): string | undefined {
  if (page.icon) return page.icon
  if (!page.url) return undefined
  return getFaviconUrl(page.url, tabStore.faviconVersions.get(getDomain(page.url)))
}

function pageToNode(item: PageItem): FolderTreeNodeData {
  return {
    id: item.id,
    label: item.name,
    icon: pageIcon(item.page),
    children: item.children.map(pageToNode),
    open: true,
  }
}

// FolderTreeNodeData 树：分组（不可选中，点击仅折叠）→ 页面树
const treeNodes = computed<FolderTreeNodeData[]>(() =>
  workspaces.value.map((w) => ({
    id: w.id,
    label: w.name,
    icon: w.emoji,
    color: w.color,
    selectable: false,
    open: true,
    children: w.pages.map(pageToNode),
  })),
)

// 高亮：仅跟随当前活动标签页所属页面（FolderTree 内部 select 写入被丢弃）
const selectedKey = computed({
  get: () => tabStore.activeTab?.pageId ?? '',
  set: () => {},
})

/* ---- 折叠状态持久化（沿用原两个 localStorage key，默认展开） ---- */
const GROUP_OPEN_KEY = 'sessionbox-group-collapse-states'
const PAGE_OPEN_KEY = 'sessionbox-page-collapse-states'

function loadOpenStates(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const groupOpenStates = reactive<Record<string, boolean>>(loadOpenStates(GROUP_OPEN_KEY))
const pageOpenStates = reactive<Record<string, boolean>>(loadOpenStates(PAGE_OPEN_KEY))

watch(groupOpenStates, () => {
  localStorage.setItem(GROUP_OPEN_KEY, JSON.stringify({ ...groupOpenStates }))
})

watch(pageOpenStates, () => {
  localStorage.setItem(PAGE_OPEN_KEY, JSON.stringify({ ...pageOpenStates }))
})

const openStates = computed<Record<string, boolean>>(() => ({
  ...groupOpenStates,
  ...pageOpenStates,
}))

function onOpenChange(states: Record<string, boolean>) {
  for (const [id, open] of Object.entries(states)) {
    if (groupMap.value.has(id)) groupOpenStates[id] = open
    else if (pageMap.value.has(id)) pageOpenStates[id] = open
  }
}

// 新增子页面时自动展开父页面，保证新建结果可见（对齐原 PageTreeNode 行为）
let prevPageIds = new Set<string>()
watch(
  () => pageStore.pages,
  (pages) => {
    const nextIds = new Set(pages.map((p) => p.id))
    for (const p of pages) {
      if (prevPageIds.has(p.id) || !p.parentId) continue
      if (pageOpenStates[p.parentId] === false) pageOpenStates[p.parentId] = true
    }
    prevPageIds = nextIds
  },
  { immediate: true },
)

/* ---- 单击选中 / 双击新开标签页（350ms 自检测，对齐原 PageTreeNode） ---- */
const PAGE_DBLCLICK_INTERVAL = 350
let pageClickTimer: ReturnType<typeof setTimeout> | null = null
let lastPageClickAt = 0

function onNodeClick(id: string) {
  if (groupMap.value.has(id)) return // 分组行点击仅折叠，无单击/双击语义
  const now = Date.now()
  const isDouble = now - lastPageClickAt < PAGE_DBLCLICK_INTERVAL
  lastPageClickAt = now

  if (pageClickTimer) {
    clearTimeout(pageClickTimer)
    pageClickTimer = null
  }

  if (isDouble) {
    // 判定为双击：清空记录防止三连击再开一个 tab
    lastPageClickAt = 0
    void tabStore.createTab(id)
    return
  }
  pageClickTimer = setTimeout(() => {
    pageClickTimer = null
    emit('selectPage', id)
  }, 220)
}

/* ---- 内部拖拽排序（对齐原 vuedraggable：分组同层 / 页面仅同父同层） ---- */
function onNodeDrop({ dragId, targetId, position }: FolderTreeDropPayload) {
  if (dragId === targetId) return

  // 分组排序
  if (groupMap.value.has(dragId)) {
    if (!groupMap.value.has(targetId) || position === 'inside') return
    const ids = containerStore.workspaceGroups.map((g) => g.id)
    ids.splice(ids.indexOf(dragId), 1)
    const to = ids.indexOf(targetId)
    ids.splice(position === 'before' ? to : to + 1, 0, dragId)
    void containerStore.reorderGroups(ids)
    return
  }

  // 页面排序：仅同父（同层）内有效，不支持跨层移动
  const dragItem = pageMap.value.get(dragId)
  const targetItem = pageMap.value.get(targetId)
  if (!dragItem || !targetItem || position === 'inside') return
  if ((dragItem.page.parentId ?? null) !== (targetItem.page.parentId ?? null)) return
  if (
    dragItem.page.parentId === null &&
    dragItem.page.groupId !== targetItem.page.groupId
  ) {
    return
  }

  const siblings = (pageStore.pagesByGroup.get(dragItem.page.groupId) || [])
    .filter((p) => (p.parentId ?? null) === (dragItem.page.parentId ?? null))
    .slice()
    .sort((a, b) => a.order - b.order)
  const ids = siblings.map((p) => p.id)
  ids.splice(ids.indexOf(dragId), 1)
  const to = ids.indexOf(targetId)
  ids.splice(position === 'before' ? to : to + 1, 0, dragId)
  void pageStore.reorderPages(ids)
}

/* ---- 外部 URL 拖放：悬停 200ms 激活首个标签页，松手导航（对齐原 PageTreeNode） ---- */
let hoverActivateTimer: ReturnType<typeof setTimeout> | null = null

function clearHoverActivateTimer() {
  if (!hoverActivateTimer) return
  clearTimeout(hoverActivateTimer)
  hoverActivateTimer = null
}

function pageTabsOf(pageId: string): Tab[] {
  return tabStore.sortedTabs.filter((tab) => tab.pageId === pageId)
}

function onExternalDragover(node: FolderTreeNodeData, event: DragEvent) {
  if (groupMap.value.has(node.id)) return
  if (!hasSupportedExternalDrop(event)) return

  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }

  const firstTab = pageTabsOf(node.id)[0]
  if (hoverActivateTimer || tabStore.activeTabId === firstTab?.id) return
  hoverActivateTimer = setTimeout(() => {
    hoverActivateTimer = null
    const tab = pageTabsOf(node.id)[0]
    if (tab) void tabStore.switchTab(tab.id)
  }, 200)
}

function onExternalDragleave(node: FolderTreeNodeData) {
  if (groupMap.value.has(node.id)) return
  clearHoverActivateTimer()
}

async function onExternalDrop(node: FolderTreeNodeData, event: DragEvent) {
  clearHoverActivateTimer()
  if (groupMap.value.has(node.id)) return

  const url = extractNavigableDropUrl(event)
  if (!url) return
  event.preventDefault()

  const firstTab = pageTabsOf(node.id)[0]
  if (firstTab) {
    await tabStore.switchTab(firstTab.id)
    await tabStore.navigate(firstTab.id, url)
    return
  }

  const createdTab = await tabStore.createTab(node.id)
  await tabStore.navigate(createdTab.id, url)
}

/* ---- 桌面快捷方式 ---- */
const SHORTCUT_MODES = [
  { mode: 'app', label: '软件内' },
  { mode: 'window', label: '新窗口' },
  { mode: 'taskbar-mobile', label: '任务栏 - 手机视图' },
  { mode: 'taskbar-desktop', label: '任务栏 - 桌面视图' },
] as const

async function createDesktopShortcut(pageId: string, mode: (typeof SHORTCUT_MODES)[number]['mode']) {
  try {
    await window.api.page.createDesktopShortcut(pageId, mode)
  } catch (error) {
    console.error('创建页面快捷方式失败', error)
  }
}

/* ---- 右键菜单 / 行尾操作（渲染函数注入 FolderTree） ---- */

function groupMenuItems(group: Group, Item: typeof ContextMenuItem): VNode[] {
  return [
    h(Item, { onClick: () => emit('addPage', group.id) }, () => [
      h(Plus, { class: 'w-4 h-4 mr-2' }),
      '新建页面',
    ]),
    h(Item, { onClick: () => emit('editGroup', group) }, () => [
      h(Pencil, { class: 'w-4 h-4 mr-2' }),
      '编辑分组',
    ]),
    h(ContextMenuSeparator),
    h(Item, { class: 'text-destructive', onClick: () => emit('deleteGroup', group) }, () => [
      h(Trash2, { class: 'w-4 h-4 mr-2' }),
      '删除分组',
    ]),
  ]
}

/** 页面右键菜单：「在桌面创建快捷方式」子菜单（4 种模式） */
function contextMenuShortcutSub(page: Page): VNode {
  return h(ContextMenuSub, null, {
    trigger: () =>
      h(ContextMenuSubTrigger, null, () => [
        h(ExternalLink, { class: 'w-4 h-4 mr-2' }),
        '在桌面创建快捷方式',
      ]),
    default: () =>
      h(ContextMenuSubContent, null, () =>
        SHORTCUT_MODES.map(({ mode, label }) =>
          h(ContextMenuItem, {
            key: mode,
            onClick: () => void createDesktopShortcut(page.id, mode),
          }, () => label),
        ),
      ),
  })
}

/** 页面右键菜单项集合：新建子页面 / 编辑 / 桌面快捷方式子菜单 / 删除 */
function pageContextMenuItems(page: Page): VNode[] {
  return [
    h(ContextMenuItem, { onClick: () => emit('addSubPage', page.id) }, () => [
      h(Plus, { class: 'w-4 h-4 mr-2' }),
      '新建子页面',
    ]),
    h(ContextMenuItem, { onClick: () => emit('editPage', page) }, () => [
      h(Pencil, { class: 'w-4 h-4 mr-2' }),
      '编辑',
    ]),
    contextMenuShortcutSub(page),
    h(ContextMenuSeparator),
    h(ContextMenuItem, { class: 'text-destructive', onClick: () => emit('deletePage', page) }, () => [
      h(Trash2, { class: 'w-4 h-4 mr-2' }),
      '删除',
    ]),
  ]
}

function menuRenderer(node: FolderTreeNodeData): VNode {
  const group = groupMap.value.get(node.id)
  if (group) {
    return h('div', { class: 'flex flex-col' }, groupMenuItems(group, ContextMenuItem))
  }

  const item = pageMap.value.get(node.id)
  if (!item) return h('div')

  return h('div', { class: 'flex flex-col' }, pageContextMenuItems(item.page))
}

// 页签徽标：1 个标签页 → X 直接关闭；多个 → 数字按钮 Popover 列表（常显，对齐原行为）

/** 单标签页：X 按钮，点击直接关闭该标签页 */
function renderTabCloseButton(tab: Tab): VNode {
  return h(
    'button',
    {
      class:
        'p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0',
      onClick: (e: MouseEvent) => {
        e.stopPropagation()
        void tabStore.closeTab(tab.id)
      },
    },
    () => h(X, { class: 'w-3.5 h-3.5' }),
  )
}

/** Popover 列表行：标题 + hover 才显示的单行关闭按钮 */
function renderTabListItem(tab: Tab): VNode {
  return h(
    'div',
    {
      key: tab.id,
      class: 'flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted group/tab-item',
    },
    [
      h(
        'span',
        { class: 'flex-1 text-xs truncate', title: tab.title || tab.url },
        () => tab.title || tab.url,
      ),
      h(
        'button',
        {
          class:
            'opacity-0 group-hover/tab-item:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-destructive transition-opacity shrink-0',
          onClick: () => void tabStore.closeTab(tab.id),
        },
        () => h(X, { class: 'w-3 h-3' }),
      ),
    ],
  )
}

/** Popover 内容：标题行（含「全部关闭」）+ 标签页列表 */
function renderTabsPopoverContent(tabs: Tab[]): VNode {
  return h(
    PopoverContent,
    {
      align: 'end',
      class: 'p-2 w-56',
      onClick: (e: MouseEvent) => e.stopPropagation(),
    },
    () => [
      h('div', { class: 'flex items-center justify-between mb-1.5 px-1' }, [
        h('span', { class: 'text-xs font-medium text-muted-foreground' }, () => '打开的标签页'),
        h(
          'button',
          {
            class: 'text-xs text-destructive hover:underline',
            onClick: () => {
              for (const tab of tabs) void tabStore.closeTab(tab.id)
            },
          },
          () => '全部关闭',
        ),
      ]),
      h('div', { class: 'flex flex-col gap-0.5 max-h-48 overflow-y-auto' }, () =>
        tabs.map(renderTabListItem),
      ),
    ],
  )
}

/** 多标签页：数字徽标按钮 + Popover 标签页列表 */
function renderTabsPopover(tabs: Tab[]): VNode {
  return h(Popover, null, {
    trigger: () =>
      h(PopoverTrigger, { asChild: true }, () =>
        h(
          'button',
          {
            class:
              'p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0 inline-flex items-center gap-0.5',
            onClick: (e: MouseEvent) => e.stopPropagation(),
          },
          () => h('span', { class: 'text-[10px] leading-none' }, String(tabs.length)),
        ),
      ),
    default: () => renderTabsPopoverContent(tabs),
  })
}

function renderTabBadge(pageId: string): VNode | null {
  const tabs = pageTabsOf(pageId)
  if (tabs.length === 0) return null
  if (tabs.length === 1) return renderTabCloseButton(tabs[0])
  return renderTabsPopover(tabs)
}

// 行尾操作区：页签徽标（常显）+ MoreHorizontal 下拉（hover 才显示）

/** 「在桌面创建快捷方式」子菜单（下拉菜单版，4 种模式） */
function dropdownShortcutSub(page: Page): VNode {
  return h(DropdownMenuSub, null, {
    trigger: () =>
      h(DropdownMenuSubTrigger, null, () => [
        h(ExternalLink, { class: 'w-4 h-4 mr-2' }),
        '在桌面创建快捷方式',
      ]),
    default: () =>
      h(
        DropdownMenuSubContent,
        null,
        () =>
          SHORTCUT_MODES.map(({ mode, label }) =>
            h(DropdownMenuItem, {
              key: mode,
              onClick: () => void createDesktopShortcut(page.id, mode),
            }, () => label),
          ),
      ),
  })
}

/** 分组下拉菜单项集合：新建页面 / 编辑分组 / 删除分组 */
function groupDropdownItems(group: Group): VNode[] {
  return [
    h(DropdownMenuItem, { onClick: () => emit('addPage', group.id) }, () => [
      h(Plus, { class: 'w-4 h-4 mr-2' }),
      '新建页面',
    ]),
    h(DropdownMenuItem, { onClick: () => emit('editGroup', group) }, () => [
      h(Pencil, { class: 'w-4 h-4 mr-2' }),
      '编辑分组',
    ]),
    h(DropdownMenuSeparator),
    h(DropdownMenuItem, { class: 'text-destructive', onClick: () => emit('deleteGroup', group) }, () => [
      h(Trash2, { class: 'w-4 h-4 mr-2' }),
      '删除分组',
    ]),
  ]
}

/** 页面下拉菜单项集合：新建子页面 / 编辑 / 桌面快捷方式子菜单 / 删除 */
function pageDropdownItems(page: Page): VNode[] {
  return [
    h(DropdownMenuItem, { onClick: () => emit('addSubPage', page.id) }, () => [
      h(Plus, { class: 'w-4 h-4 mr-2' }),
      '新建子页面',
    ]),
    h(DropdownMenuItem, { onClick: () => emit('editPage', page) }, () => [
      h(Pencil, { class: 'w-4 h-4 mr-2' }),
      '编辑',
    ]),
    dropdownShortcutSub(page),
    h(DropdownMenuSeparator),
    h(DropdownMenuItem, { class: 'text-destructive', onClick: () => emit('deletePage', page) }, () => [
      h(Trash2, { class: 'w-4 h-4 mr-2' }),
      '删除',
    ]),
  ]
}

/** 分组行尾：MoreHorizontal 下拉（新建页面 / 编辑分组 / 删除分组） */
function groupActions(group: Group): VNode {
  return h('div', { class: 'inline-flex items-center gap-1' }, [
    renderMoreMenu(groupDropdownItems(group)),
  ])
}

/** 页面行尾：页签徽标 + MoreHorizontal 下拉（新建子页面 / 编辑 / 桌面快捷方式 / 删除） */
function pageActions(nodeId: string, page: Page): VNode {
  return h('div', { class: 'inline-flex items-center gap-1' }, [
    renderTabBadge(nodeId),
    renderMoreMenu(pageDropdownItems(page)),
  ])
}

function actionsRenderer(node: FolderTreeNodeData): VNode {
  const group = groupMap.value.get(node.id)
  if (group) {
    return groupActions(group)
  }

  const item = pageMap.value.get(node.id)
  if (!item) return h('div')

  return pageActions(node.id, item.page)
}

/** MoreHorizontal 下拉触发按钮（阻止冒泡，避免触发节点点击/选中） */
function renderMoreMenuTrigger(): VNode {
  return h(DropdownMenuTrigger, { asChild: true }, () =>
    h(
      'button',
      {
        class:
          'ft-action-hover p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-opacity',
        onClick: (e: MouseEvent) => e.stopPropagation(),
      },
      () => h(MoreHorizontal, { class: 'w-4 h-4' }),
    ),
  )
}

function renderMoreMenu(items: VNode[]): VNode {
  return h(DropdownMenu, null, {
    trigger: renderMoreMenuTrigger,
    default: () => h(DropdownMenuContent, { align: 'start' }, () => items),
  })
}

onBeforeUnmount(() => {
  clearHoverActivateTimer()
  if (pageClickTimer) clearTimeout(pageClickTimer)
})
</script>

<template>
  <!-- 折叠状态：显示图标列表，点击弹出下拉菜单 -->
  <template v-if="collapsed">
    <SidebarMenu>
      <SidebarMenuItem
        v-for="workspace in collapsedPages"
        :key="workspace.name"
      >
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <SidebarMenuButton
              :tooltip="workspace.name"
              class="flex items-center justify-center rounded-lg"
            >
              <EmojiRenderer :emoji="workspace.emoji" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            class="w-48"
          >
            <DropdownMenuItem
              v-for="{ item: pageItem, depth } in workspace.flatPages"
              :key="pageItem.id"
              @click="emit('selectPage', pageItem.id)"
            >
              <span
                class="mr-1.5 shrink-0 inline-flex"
                :style="{ marginLeft: `${depth * 12}px` }"
              >
                <EmojiRenderer
                  :emoji="pageItem.emoji"
                  :url="pageItem.url"
                />
              </span>
              <span class="truncate">{{ pageItem.name }}</span>
            </DropdownMenuItem>
            <template v-if="workspace.flatPages.length > 0">
              <DropdownMenuSeparator />
            </template>
            <DropdownMenuItem @click.stop="emit('addPage', workspace.group.id)">
              <Plus class="w-4 h-4 mr-2" />
              新建页面
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click.stop="emit('editGroup', workspace.group)">
              <Pencil class="w-4 h-4 mr-2" />
              编辑分组
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              class="text-destructive"
              @click.stop="emit('deleteGroup', workspace.group)"
            >
              <Trash2 class="w-4 h-4 mr-2" />
              删除分组
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  </template>

  <!-- 展开状态：FolderTree 渲染分组与页面树 -->
  <template v-else>
    <FolderTree
      v-if="containerStore.workspaceGroups.length > 0"
      v-model:selected-key="selectedKey"
      item-type="folder"
      title="分组"
      hide-header
      :max-height="false"
      :hide-empty="true"
      draggable
      :nodes="treeNodes"
      :open-states="openStates"
      :menu-renderer="menuRenderer"
      :actions-renderer="actionsRenderer"
      @node-click="onNodeClick"
      @open-change="onOpenChange"
      @node-drop="onNodeDrop"
      @node-external-dragover="onExternalDragover"
      @node-external-dragleave="onExternalDragleave"
      @node-external-drop="onExternalDrop"
    />

    <!-- 未分组标签页 -->
    <Collapsible
      v-if="ungroupedTabs.length > 0"
      v-model:open="ungroupedOpen"
    >
      <SidebarMenuItem>
        <SidebarMenuButton as-child>
          <a
            href="#"
            class="flex-1 flex items-center gap-2 text-muted-foreground"
            @click.prevent="ungroupedOpen = !ungroupedOpen"
          >
            <ChevronRight
              class="w-4 h-4 transition-transform shrink-0"
              :class="ungroupedOpen ? 'rotate-90' : ''"
            />
            <FolderX class="w-4 h-4" />
            <span class="flex-1 text-xs">未分组</span>
            <span class="text-[10px] text-muted-foreground/60">{{ ungroupedTabs.length }}</span>
          </a>
        </SidebarMenuButton>
        <CollapsibleContent>
          <ul
            class="border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5"
          >
            <SidebarMenuSubItem
              v-for="tab in ungroupedTabs"
              :key="tab.id"
            >
              <div class="flex items-center gap-1 w-full">
                <SidebarMenuSubButton
                  as-child
                  class="flex-1"
                >
                  <a
                    href="#"
                    class="flex items-center gap-2 w-full text-left"
                    @click.prevent="tabStore.switchTab(tab.id)"
                  >
                    <EmojiRenderer
                      emoji="🌐"
                      :url="tab.url"
                    />
                    <span class="truncate">{{ tab.title || tab.url }}</span>
                  </a>
                </SidebarMenuSubButton>
                <button
                  class="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  @click.stop="tabStore.closeTab(tab.id)"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
            </SidebarMenuSubItem>
          </ul>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>

    <div
      v-if="containerStore.workspaceGroups.length === 0 && ungroupedTabs.length === 0"
      class="flex flex-col items-center justify-center py-8 text-muted-foreground"
    >
      <p class="text-sm">
        暂无分组
      </p>
      <p class="text-xs mt-1">
        点击下方「新建分组」开始
      </p>
    </div>
  </template>
</template>
