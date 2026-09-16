<script setup lang="ts">
import { reactive, watch } from 'vue'
import { ChevronRight, MoreHorizontal, Pencil, Trash2, Plus } from "lucide-vue-next"
import draggable from 'vuedraggable'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import PageTreeNode from './PageTreeNode.vue'
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
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
import type { Group, Page } from '@/types'

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
                class="flex items-center gap-1 rounded-lg group/menu-button-wrapper"
                :style="workspace.color ? { '--hover-bg': workspace.color + '20' } : undefined"
              >
                <SidebarMenuButton
                  as-child
                  class="rounded-lg"
                >
                  <a
                    href="#"
                    class="flex-1 flex items-center gap-2"
                    @click.prevent="openStates[workspace.group.id] = !openStates[workspace.group.id]"
                  >
                    <ChevronRight
                      class="w-4 h-4 transition-transform group-data-[collapsible=icon]:hidden shrink-0"
                      :class="openStates[workspace.group.id] ? 'rotate-90' : ''"
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
              :model-value="workspace.pages"
              item-key="id"
              :animation="150"
              tag="ul"
              data-slot="sidebar-menu-sub"
              data-sidebar="menu-badge"
              class="border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5 group-data-[collapsible=icon]:hidden"
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
</style>
