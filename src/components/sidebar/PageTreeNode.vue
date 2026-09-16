<script setup lang="ts">
import { reactive, computed, ref, onBeforeUnmount, watch } from 'vue'
import { ChevronRight, MoreHorizontal, X, Pencil, Trash2, Plus } from "lucide-vue-next"
import draggable from 'vuedraggable'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import { usePageStore } from '@/stores/page'
import { useTabStore } from '@/stores/tab'
import { extractNavigableDropUrl, hasSupportedExternalDrop } from '@/lib/external-drop'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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
import type { Page, Tab } from '@/types'
import type { PageItem } from './page-tree'

defineOptions({ name: 'PageTreeNode' })

const props = defineProps<{
  pageItem: PageItem
  /** 分组颜色（用于 hover 高亮） */
  color?: string
}>()

const emit = defineEmits<{
  selectPage: [pageId: string]
  editPage: [page: Page]
  deletePage: [page: Page]
  addSubPage: [parentId: string]
}>()

const pageStore = usePageStore()
const tabStore = useTabStore()

// 该页面的标签页数量
const pageTabCount = computed(() => pageTabs.value.length)

// 该页面的标签页列表
const pageTabs = computed<Tab[]>(() =>
  tabStore.sortedTabs.filter(tab => tab.pageId === props.pageItem.id)
)

// 当前激活标签页所属的页面 id（用于高亮当前页面）
const activePageId = computed(() => tabStore.activeTab?.pageId ?? null)

// 是否含子页面
const hasChildren = computed(() => props.pageItem.children.length > 0)

// 子页面折叠状态，持久化到 localStorage（与分组的折叠状态分开存储）
const PAGE_COLLAPSE_STORAGE_KEY = 'sessionbox-page-collapse-states'

function loadPageCollapseStates(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PAGE_COLLAPSE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const pageOpenStates = reactive<Record<string, boolean>>(loadPageCollapseStates())

watch(pageOpenStates, () => {
  localStorage.setItem(PAGE_COLLAPSE_STORAGE_KEY, JSON.stringify({ ...pageOpenStates }))
})

const childrenOpen = computed({
  get: () => pageOpenStates[props.pageItem.id] ?? true,
  set: (val: boolean) => { pageOpenStates[props.pageItem.id] = val },
})

// 新增子页面时自动展开，保证新建结果可见
watch(() => props.pageItem.children.length, (len, oldLen) => {
  if (len > (oldLen ?? 0) && !childrenOpen.value) {
    childrenOpen.value = true
  }
})

// 关闭页面的单个标签页
async function closePageTab(tabId: string) {
  await tabStore.closeTab(tabId)
}

// 关闭页面的所有标签页
async function closeAllPageTabs() {
  for (const tab of pageTabs.value) {
    await tabStore.closeTab(tab.id)
  }
}

// 外部 URL 拖放到页面项：悬停激活首个标签页，松手时导航
const isDropTarget = ref(false)
let hoverActivateTimer: ReturnType<typeof setTimeout> | null = null

function clearHoverActivateTimer() {
  if (!hoverActivateTimer) return
  clearTimeout(hoverActivateTimer)
  hoverActivateTimer = null
}

function getFirstPageTab(): Tab | null {
  return pageTabs.value[0] ?? null
}

async function activatePageFirstTab() {
  const firstTab = getFirstPageTab()
  if (!firstTab) return
  await tabStore.switchTab(firstTab.id)
}

function handlePageDragOver(event: DragEvent) {
  if (!hasSupportedExternalDrop(event)) return

  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }

  if (!isDropTarget.value) clearHoverActivateTimer()
  isDropTarget.value = true
  if (hoverActivateTimer || tabStore.activeTabId === getFirstPageTab()?.id) return

  hoverActivateTimer = setTimeout(() => {
    hoverActivateTimer = null
    void activatePageFirstTab()
  }, 200)
}

function handlePageDragLeave(event: DragEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null
  const relatedTarget = event.relatedTarget as Node | null
  if (currentTarget?.contains(relatedTarget)) return

  isDropTarget.value = false
  clearHoverActivateTimer()
}

async function handlePageDrop(event: DragEvent) {
  const url = extractNavigableDropUrl(event)
  isDropTarget.value = false
  clearHoverActivateTimer()
  if (!url) return

  event.preventDefault()

  const firstTab = getFirstPageTab()
  if (firstTab) {
    await tabStore.switchTab(firstTab.id)
    await tabStore.navigate(firstTab.id, url)
    return
  }

  const createdTab = await tabStore.createTab(props.pageItem.id)
  await tabStore.navigate(createdTab.id, url)
}

onBeforeUnmount(() => {
  clearHoverActivateTimer()
})

// 子页面拖拽排序（仅在同层内排序，order 只在兄弟节点间有意义）
function onChildrenReorder(reordered: PageItem[]) {
  pageStore.reorderPages(reordered.map(p => p.id))
}
</script>

<template>
  <SidebarMenuSubItem
    :style="color ? { '--item-hover': color + '20' } : undefined"
    class="group/menu-sub-item"
  >
    <ContextMenu>
      <ContextMenuTrigger as-child>
        <div class="flex items-center gap-1 w-full">
          <SidebarMenuSubButton
            as-child
            class="flex-1"
            :is-active="activePageId === pageItem.id"
          >
            <a
              href="#"
              class="flex items-center gap-2 w-full text-left rounded-md transition-colors"
              :class="isDropTarget ? 'bg-accent/60 text-accent-foreground' : ''"
              @click.prevent="emit('selectPage', pageItem.id)"
              @dragover.stop="handlePageDragOver($event)"
              @dragleave.stop="handlePageDragLeave($event)"
              @drop.stop="handlePageDrop($event)"
            >
              <button
                v-if="hasChildren"
                class="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
                @click.stop.prevent="childrenOpen = !childrenOpen"
              >
                <ChevronRight
                  class="w-3.5 h-3.5 transition-transform"
                  :class="childrenOpen ? 'rotate-90' : ''"
                />
              </button>
              <EmojiRenderer
                :emoji="pageItem.emoji"
                :url="pageItem.url"
              />
              <span class="truncate">{{ pageItem.name }}</span>
            </a>
          </SidebarMenuSubButton>
          <!-- 标签页关闭按钮 -->
          <template v-if="pageTabCount">
            <!-- 单个标签页：直接关闭 -->
            <button
              v-if="pageTabCount === 1"
              class="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
              @click.stop="closePageTab(pageTabs[0].id)"
            >
              <X class="w-3.5 h-3.5" />
            </button>
            <!-- 多个标签页：弹出 Popover 列表 -->
            <Popover v-else>
              <PopoverTrigger as-child>
                <button
                  class="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0 inline-flex items-center gap-0.5"
                  @click.stop
                >
                  <span class="text-[10px] leading-none">{{ pageTabCount }}</span>
                  <X class="w-3 h-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                class="p-2 w-56"
                @click.stop
              >
                <div class="flex items-center justify-between mb-1.5 px-1">
                  <span class="text-xs font-medium text-muted-foreground">打开的标签页</span>
                  <button
                    class="text-xs text-destructive hover:underline"
                    @click="closeAllPageTabs()"
                  >
                    全部关闭
                  </button>
                </div>
                <div class="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                  <div
                    v-for="tab in pageTabs"
                    :key="tab.id"
                    class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted group/tab-item"
                  >
                    <span
                      class="flex-1 text-xs truncate"
                      :title="tab.title || tab.url"
                    >{{ tab.title || tab.url }}</span>
                    <button
                      class="opacity-0 group-hover/tab-item:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-destructive transition-opacity shrink-0"
                      @click="closePageTab(tab.id)"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </template>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                class="opacity-0 group-hover/menu-sub-item:opacity-100 p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-opacity"
                @click.stop
              >
                <MoreHorizontal class="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem @click="emit('addSubPage', pageItem.id)">
                <Plus class="w-4 h-4 mr-2" />
                新建子页面
              </DropdownMenuItem>
              <DropdownMenuItem @click="emit('editPage', pageItem.page)">
                <Pencil class="w-4 h-4 mr-2" />
                编辑
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                class="text-destructive"
                @click="emit('deletePage', pageItem.page)"
              >
                <Trash2 class="w-4 h-4 mr-2" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem @click="emit('addSubPage', pageItem.id)">
          <Plus class="w-4 h-4 mr-2" />
          新建子页面
        </ContextMenuItem>
        <ContextMenuItem @click="emit('editPage', pageItem.page)">
          <Pencil class="w-4 h-4 mr-2" />
          编辑
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          class="text-destructive"
          @click="emit('deletePage', pageItem.page)"
        >
          <Trash2 class="w-4 h-4 mr-2" />
          删除
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    <!-- 子页面列表（可拖拽排序，仅同层内）；item 插槽根必须是单个真实元素（li） -->
    <draggable
      v-if="hasChildren && childrenOpen"
      :model-value="pageItem.children"
      item-key="id"
      :animation="150"
      tag="ul"
      class="border-sidebar-border ml-3 flex min-w-0 flex-col gap-1 border-l pl-1.5 py-0.5"
      @update:model-value="onChildrenReorder"
    >
      <template #item="{ element: child }">
        <PageTreeNode
          :page-item="child"
          :color="color"
          @select-page="emit('selectPage', $event)"
          @edit-page="emit('editPage', $event)"
          @delete-page="emit('deletePage', $event)"
          @add-sub-page="emit('addSubPage', $event)"
        />
      </template>
    </draggable>
  </SidebarMenuSubItem>
</template>

<style scoped>
/* 页面项 hover 效果 - 覆盖 SidebarMenuSubButton 默认的 hover 样式 */
.group\/menu-sub-item:hover :deep([data-slot="sidebar-menu-sub-button"]) {
  background-color: var(--item-hover, transparent) !important;
}
</style>
