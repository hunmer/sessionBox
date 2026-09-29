<script setup lang="ts">
import { onBeforeUnmount, reactive, watch } from 'vue'
import { ChevronRight, MoreHorizontal, Pencil, Trash2, Plus } from "lucide-vue-next"
import draggable from 'vuedraggable'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import PageTreeNode from './PageTreeNode.vue'
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
import { useTabStore } from '@/stores/tab'
import type { PageItem } from './page-tree'
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Group, Page, Tab } from '@/types'

interface Workspace {
  id: string
  group: Group
  name: string
  emoji: string
  color?: string
  pages: PageItem[]
}

const props = defineProps<{
  workspaces: Workspace[]
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

// 为每个 workspace 维护独立的折叠状态，持久化到 localStorage
const COLLAPSE_STORAGE_KEY = 'sessionbox-group-collapse-states'

function loadCollapseStates(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const openStates = reactive<Record<string, boolean>>({})
const savedStates = loadCollapseStates()

props.workspaces.forEach((w) => {
  openStates[w.group.id] = savedStates[w.group.id] ?? true
})

watch(openStates, () => {
  localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify({ ...openStates }))
})

// ====== 分组标题点击：单击切换到该组已激活 tab，双击新增 tab ======

// 临时调试日志（渲染进程 console 会转发到 procm 结构化日志）
function debugLog(event: string, data: Record<string, unknown> = {}) {
  console.log(`[GroupItem:debug] ${event}`, JSON.stringify(data))
}

// 每个分组最近激活的 tab（由全局激活 tab 按所属页面反推分组）
const groupActiveTabIds = reactive<Record<string, string>>({})

watch(
  () => tabStore.activeTabId,
  (tabId) => {
    if (!tabId) return
    const tab = tabStore.tabs.find((t) => t.id === tabId)
    if (!tab?.pageId) return
    const groupId = pageStore.getPage(tab.pageId)?.groupId
    if (groupId) groupActiveTabIds[groupId] = tabId
  },
  { immediate: true }
)

// 分组下排序最前的页面（order 升序），作为无激活记录时的兜底
function getGroupFirstPage(groupId: string): Page | undefined {
  const pages = pageStore.pagesByGroup.get(groupId) || []
  return [...pages].sort((a, b) => a.order - b.order)[0]
}

// 分组当前应聚焦的 tab：优先最近激活的，其次按排序取该组第一个
function getGroupActiveTab(groupId: string): Tab | undefined {
  const recorded = groupActiveTabIds[groupId]
  const recordedTab = recorded ? tabStore.tabs.find((t) => t.id === recorded) : undefined
  if (recordedTab) {
    debugLog('getGroupActiveTab:hit-recorded', { groupId, tabId: recordedTab.id, pageId: recordedTab.pageId })
    return recordedTab
  }
  const pageIds = new Set((pageStore.pagesByGroup.get(groupId) || []).map((p) => p.id))
  const fallback = tabStore.sortedTabs.find((t) => t.pageId && pageIds.has(t.pageId))
  debugLog('getGroupActiveTab:fallback', { groupId, recordedMissing: !!recorded, groupPageCount: pageIds.size, resultTabId: fallback?.id ?? null })
  return fallback
}

// 单击：切换到该组已激活的 tab；该组尚无 tab 时为其首个页面新建（与点击页面行为一致）
async function activateGroupTab(groupId: string) {
  debugLog('activateGroupTab:enter', { groupId })
  openStates[groupId] = true
  const tab = getGroupActiveTab(groupId)
  if (tab) {
    debugLog('activateGroupTab:switchTab', { groupId, tabId: tab.id })
    await tabStore.switchTab(tab.id)
    return
  }
  const firstPage = getGroupFirstPage(groupId)
  if (firstPage) {
    debugLog('activateGroupTab:createTab-by-first-page', { groupId, pageId: firstPage.id })
    await tabStore.createTab(firstPage.id)
  } else {
    debugLog('activateGroupTab:no-page-noop', { groupId })
  }
}

// 双击：为该组新开一个 tab（挂在最近激活的页面，无则首个页面）
async function createGroupTab(groupId: string) {
  debugLog('createGroupTab:enter', { groupId })
  openStates[groupId] = true
  const activeTab = getGroupActiveTab(groupId)
  const firstPage = getGroupFirstPage(groupId)
  const pageId = activeTab?.pageId ?? firstPage?.id
  debugLog('createGroupTab:resolve-page', { groupId, activeTabId: activeTab?.id ?? null, activeTabPageId: activeTab?.pageId ?? null, firstPageId: firstPage?.id ?? null, pageId: pageId ?? null })
  if (pageId) await tabStore.createTab(pageId)
  else debugLog('createGroupTab:noop-no-page', { groupId })
}

// 单击延迟判定 + 双击自检测：不依赖浏览器 dblclick 派发
// （click 上的 preventDefault、两次点击 target 不一致等都会抑制 dblclick 派发）
const DBLCLICK_INTERVAL = 350
let groupClickTimer: ReturnType<typeof setTimeout> | null = null
let lastGroupClickAt = 0
let lastGroupClickGroupId = ''

function handleGroupClick(groupId: string) {
  const now = Date.now()
  const isDouble = lastGroupClickGroupId === groupId && now - lastGroupClickAt < DBLCLICK_INTERVAL
  debugLog('click', { groupId, hadPendingTimer: !!groupClickTimer, isDouble, gapMs: now - lastGroupClickAt })
  lastGroupClickAt = now
  lastGroupClickGroupId = groupId

  if (groupClickTimer) {
    clearTimeout(groupClickTimer)
    groupClickTimer = null
  }

  if (isDouble) {
    // 判定为双击：清空记录防止三连击再开一个 tab
    lastGroupClickGroupId = ''
    void createGroupTab(groupId)
    return
  }
  groupClickTimer = setTimeout(() => {
    groupClickTimer = null
    void activateGroupTab(groupId)
  }, 220)
}

onBeforeUnmount(() => {
  if (groupClickTimer) clearTimeout(groupClickTimer)
})

// 分组拖拽排序
function onGroupReorder(reordered: Workspace[]) {
  containerStore.reorderGroups(reordered.map(w => w.group.id))
}

// 顶层页面拖拽排序（仅同层内）
function onPageReorder(reordered: PageItem[]) {
  pageStore.reorderPages(reordered.map(p => p.id))
}
</script>

<template>
  <!-- 分组列表（可拖拽排序） -->
  <draggable
    :model-value="workspaces"
    item-key="id"
    :animation="150"
    tag="ul"
    data-slot="sidebar-menu"
    data-sidebar="menu"
    class="flex w-full min-w-0 flex-col gap-1"
    @update:model-value="onGroupReorder"
  >
    <template #item="{ element: workspace }">
      <Collapsible v-model:open="openStates[workspace.group.id]">
        <SidebarMenuItem>
          <ContextMenu>
            <ContextMenuTrigger as-child>
              <div
                class="flex items-center gap-1 group/menu-button-wrapper"
                :class="openStates[workspace.group.id] && workspace.pages.length > 0 ? 'rounded-t-lg' : 'rounded-lg'"
                :style="workspace.color ? { '--hover-bg': workspace.color + '20' } : undefined"
                @click.capture="debugLog('probe:click-capture', { groupId: workspace.group.id })"
                @dblclick.capture="debugLog('probe:dblclick-capture', { groupId: workspace.group.id })"
              >
                <SidebarMenuButton
                  as-child
                  class="rounded-lg"
                >
                  <a
                    href="#"
                    class="flex-1 flex items-center gap-2"
                    @click.prevent="handleGroupClick(workspace.group.id)"
                  >
                    <ChevronRight
                      class="w-4 h-4 transition-transform group-data-[collapsible=icon]:hidden shrink-0"
                      :class="openStates[workspace.group.id] ? 'rotate-90' : ''"
                      @click.stop.prevent="openStates[workspace.group.id] = !openStates[workspace.group.id]"
                    />
                    <EmojiRenderer
                      v-if="workspace.emoji"
                      :emoji="workspace.emoji"
                    />
                    <span class="flex-1">{{ workspace.name }}</span>
                  </a>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <button
                      class="opacity-0 group-hover/menu-button-wrapper:opacity-100 p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-opacity"
                      @click.stop
                    >
                      <MoreHorizontal class="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem @click="emit('addPage', workspace.group.id)">
                      <Plus class="w-4 h-4 mr-2" />
                      新建页面
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="emit('editGroup', workspace.group)">
                      <Pencil class="w-4 h-4 mr-2" />
                      编辑
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      class="text-destructive"
                      @click="emit('deleteGroup', workspace.group)"
                    >
                      <Trash2 class="w-4 h-4 mr-2" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem @click="emit('addPage', workspace.group.id)">
                <Plus class="w-4 h-4 mr-2" />
                新建页面
              </ContextMenuItem>
              <ContextMenuItem @click="emit('editGroup', workspace.group)">
                <Pencil class="w-4 h-4 mr-2" />
                编辑
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                class="text-destructive"
                @click="emit('deleteGroup', workspace.group)"
              >
                <Trash2 class="w-4 h-4 mr-2" />
                删除
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <CollapsibleContent>
            <!-- 顶层页面列表（可拖拽排序）；注意 item 插槽根必须是单个真实元素（li），vuedraggable 的 data-draggable 标记才能落到 li 上，根为 renderless 组件时标记会丢失，导致拖拽被外层分组列表抢占 -->
            <draggable
              v-if="workspace.pages.length > 0"
              :model-value="workspace.pages"
              item-key="id"
              :animation="150"
              tag="ul"
              data-slot="sidebar-menu-sub"
              data-sidebar="menu-badge"
              class="pages-card border-sidebar-border mb-2 flex min-w-0 flex-col gap-1 rounded-b-lg border border-t-0 px-2.5 py-1 group-data-[collapsible=icon]:hidden"
              :style="workspace.color ? { '--card-bg-from': workspace.color + '20', '--card-bg-to': workspace.color + '05' } : undefined"
              @update:model-value="onPageReorder($event)"
            >
              <template #item="{ element: pageItem }">
                <PageTreeNode
                  :page-item="pageItem"
                  :color="workspace.color"
                  @select-page="emit('selectPage', $event)"
                  @edit-page="emit('editPage', $event)"
                  @delete-page="emit('deletePage', $event)"
                  @add-sub-page="emit('addSubPage', $event)"
                />
              </template>
            </draggable>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    </template>
  </draggable>
</template>

<style scoped>
/* 分组始终展示分组颜色背景 */
.group\/menu-button-wrapper {
  background-color: var(--hover-bg, transparent);
}

/* 移除按钮默认的灰色 hover 叠加 */
.group\/menu-button-wrapper :deep([data-slot="sidebar-menu-button"]:hover) {
  background-color: transparent;
}

/* 页面卡片：从与头部相同的淡染向下渐变至近透明，与头部卡片连成一体 */
.pages-card {
  background-image: linear-gradient(to bottom, var(--card-bg-from, transparent), var(--card-bg-to, transparent));
}
</style>
