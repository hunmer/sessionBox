<script setup lang="ts">
import { reactive, computed } from 'vue'
import { ChevronRight, MoreHorizontal, X } from "lucide-vue-next"
import draggable from 'vuedraggable'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
import { useTabStore } from '@/stores/tab'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Pencil, Trash2, Plus } from "lucide-vue-next"
import type { Group, Page, Tab } from '@/types'

interface PageItem {
  page: Page
  id: string
  name: string
  emoji: string
}

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
  editPage: [page: Page]
  deletePage: [page: Page]
}>()

const containerStore = useContainerStore()
const pageStore = usePageStore()
const tabStore = useTabStore()

// 计算每个页面的标签页数量
const pageTabCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const tab of tabStore.tabs) {
    if (tab.pageId) {
      counts[tab.pageId] = (counts[tab.pageId] || 0) + 1
    }
  }
  return counts
})

// 获取每个页面的标签页列表
const pageTabs = computed(() => {
  const map: Record<string, Tab[]> = {}
  for (const tab of tabStore.tabs) {
    if (tab.pageId) {
      if (!map[tab.pageId]) map[tab.pageId] = []
      map[tab.pageId].push(tab)
    }
  }
  return map
})

// 关闭页面的单个标签页
async function closePageTab(tabId: string) {
  await tabStore.closeTab(tabId)
}

// 关闭页面的所有标签页
async function closeAllPageTabs(pageId: string) {
  const tabs = pageTabs.value[pageId] || []
  for (const tab of tabs) {
    await tabStore.closeTab(tab.id)
  }
}

// 为每个 workspace 维护独立的折叠状态
const openStates = reactive<Record<string, boolean>>({})

// 初始化所有为展开状态
props.workspaces.forEach((w) => {
  if (openStates[w.name] === undefined) {
    openStates[w.name] = true
  }
})

function handlePageClick(pageId: string) {
  emit('selectPage', pageId)
}

// 分组拖拽排序
function onGroupReorder(reordered: Workspace[]) {
  containerStore.reorderGroups(reordered.map(w => w.group.id))
}

// 页面拖拽排序
function onPageReorder(groupId: string, reordered: PageItem[]) {
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
      <Collapsible v-model:open="openStates[workspace.name]">
        <SidebarMenuItem>
          <div class="flex items-center gap-1 group/menu-button-wrapper">
            <SidebarMenuButton as-child>
              <a
                href="#"
                class="flex-1 flex items-center gap-2"
                :style="workspace.color ? { '--hover-bg': workspace.color + '20' } : undefined"
                @click.prevent="openStates[workspace.name] = !openStates[workspace.name]"
              >
                <ChevronRight
                  class="w-4 h-4 transition-transform group-data-[collapsible=icon]:hidden shrink-0"
                  :class="openStates[workspace.name] ? 'rotate-90' : ''"
                />
                <EmojiRenderer v-if="workspace.emoji" :emoji="workspace.emoji" />
                <span class="flex-1">{{ workspace.name }}</span>
                <span
                  v-if="workspace.color"
                  class="w-2 h-2 rounded-full flex-shrink-0"
                  :style="{ backgroundColor: workspace.color }"
                ></span>
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
                <DropdownMenuItem @click="emit('deleteGroup', workspace.group)" class="text-destructive">
                  <Trash2 class="w-4 h-4 mr-2" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <CollapsibleContent>
            <!-- 页面列表（可拖拽排序） -->
            <draggable
              :model-value="workspace.pages"
              item-key="id"
              :animation="150"
              tag="ul"
              data-slot="sidebar-menu-sub"
              data-sidebar="menu-badge"
              class="border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5 group-data-[collapsible=icon]:hidden"
              @update:model-value="onPageReorder(workspace.group.id, $event)"
            >
              <template #item="{ element: pageItem }">
                <SidebarMenuSubItem
                  :style="workspace.color ? { '--item-hover': workspace.color + '20' } : undefined"
                  class="group/menu-sub-item"
                >
                  <div class="flex items-center gap-1 w-full">
                    <SidebarMenuSubButton as-child class="flex-1">
                      <a
                        href="#"
                        class="flex items-center gap-2 w-full text-left"
                        @click.prevent="handlePageClick(pageItem.id)"
                      >
                        <EmojiRenderer :emoji="pageItem.emoji" :url="pageItem.url" />
                        <span>{{ pageItem.name }}</span>
                      </a>
                    </SidebarMenuSubButton>
                    <!-- 标签页关闭按钮 -->
                    <template v-if="pageTabCounts[pageItem.id]">
                      <!-- 单个标签页：直接关闭 -->
                      <button
                        v-if="pageTabCounts[pageItem.id] === 1"
                        class="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        @click.stop="closePageTab(pageTabs[pageItem.id][0].id)"
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
                            <span class="text-[10px] leading-none">{{ pageTabCounts[pageItem.id] }}</span>
                            <X class="w-3 h-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" class="p-2 w-56" @click.stop>
                          <div class="flex items-center justify-between mb-1.5 px-1">
                            <span class="text-xs font-medium text-muted-foreground">打开的标签页</span>
                            <button
                              class="text-xs text-destructive hover:underline"
                              @click="closeAllPageTabs(pageItem.id)"
                            >
                              全部关闭
                            </button>
                          </div>
                          <div class="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                            <div
                              v-for="tab in pageTabs[pageItem.id]"
                              :key="tab.id"
                              class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted group/tab-item"
                            >
                              <span class="flex-1 text-xs truncate" :title="tab.title || tab.url">{{ tab.title || tab.url }}</span>
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
                        <DropdownMenuItem @click="emit('editPage', pageItem.page)">
                          <Pencil class="w-4 h-4 mr-2" />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem @click="emit('deletePage', pageItem.page)" class="text-destructive">
                          <Trash2 class="w-4 h-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </SidebarMenuSubItem>
              </template>
            </draggable>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    </template>
  </draggable>
</template>

<style scoped>
/* 分组名称 hover 效果 */
.group\/menu-button-wrapper:hover {
  background-color: var(--hover-bg, transparent);
}

/* 页面项 hover 效果 - 覆盖 SidebarMenuSubButton 默认的 hover 样式 */
.group\/menu-sub-item:hover :deep([data-slot="sidebar-menu-sub-button"]) {
  background-color: var(--item-hover, transparent) !important;
}
</style>
