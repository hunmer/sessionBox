<script setup lang="ts">
import { reactive } from 'vue'
import { ChevronRight, MoreHorizontal } from "lucide-vue-next"
import draggable from 'vuedraggable'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import { useAccountStore } from '@/stores/account'

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
import type { Group, Account } from '@/types'

interface WorkspacePage {
  account: Account
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
  pages: WorkspacePage[]
}

const props = defineProps<{
  workspaces: Workspace[]
}>()

const emit = defineEmits<{
  selectAccount: [accountId: string]
  editGroup: [group: Group]
  deleteGroup: [group: Group]
  addAccount: [groupId: string]
  editAccount: [account: Account]
  deleteAccount: [account: Account]
}>()

const accountStore = useAccountStore()

// 为每个 workspace 维护独立的折叠状态
const openStates = reactive<Record<string, boolean>>({})

// 初始化所有为展开状态
props.workspaces.forEach((w) => {
  if (openStates[w.name] === undefined) {
    openStates[w.name] = true
  }
})

function handleAccountClick(pageId: string) {
  emit('selectAccount', pageId)
}

// 分组拖拽排序
function onGroupReorder(reordered: Workspace[]) {
  accountStore.reorderGroups(reordered.map(w => w.group.id))
}

// 账号拖拽排序
function onAccountReorder(groupId: string, reordered: WorkspacePage[]) {
  accountStore.reorderAccounts(reordered.map(p => p.id))
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
                <DropdownMenuItem @click="emit('addAccount', workspace.group.id)">
                  <Plus class="w-4 h-4 mr-2" />
                  新建账号
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
            <!-- 账号列表（可拖拽排序） -->
            <draggable
              :model-value="workspace.pages"
              item-key="id"
              :animation="150"
              tag="ul"
              data-slot="sidebar-menu-sub"
              data-sidebar="menu-badge"
              class="border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5 group-data-[collapsible=icon]:hidden"
              @update:model-value="onAccountReorder(workspace.group.id, $event)"
            >
              <template #item="{ element: page }">
                <SidebarMenuSubItem
                  :style="workspace.color ? { '--item-hover': workspace.color + '20' } : undefined"
                  class="group/menu-sub-item"
                >
                  <div class="flex items-center gap-1 w-full">
                    <SidebarMenuSubButton as-child class="flex-1">
                      <a
                        href="#"
                        class="flex items-center gap-2 w-full text-left"
                        @click.prevent="handleAccountClick(page.id)"
                      >
                        <EmojiRenderer :emoji="page.emoji" />
                        <span>{{ page.name }}</span>
                      </a>
                    </SidebarMenuSubButton>
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
                        <DropdownMenuItem @click="emit('editAccount', page.account)">
                          <Pencil class="w-4 h-4 mr-2" />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem @click="emit('deleteAccount', page.account)" class="text-destructive">
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

/* 账号项 hover 效果 - 覆盖 SidebarMenuSubButton 默认的 hover 样式 */
.group\/menu-sub-item:hover :deep([data-slot="sidebar-menu-sub-button"]) {
  background-color: var(--item-hover, transparent) !important;
}
</style>
