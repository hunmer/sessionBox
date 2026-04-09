<script setup lang="ts">
import { reactive } from 'vue'
import { ChevronRight, MoreHorizontal } from "lucide-vue-next"

import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
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

const props = defineProps<{
  workspaces: {
    group: Group
    name: string
    emoji: string
    color?: string
    pages: {
      account: Account
      id: string
      name: string
      emoji: string
    }[]
  }[]
}>()

const emit = defineEmits<{
  selectAccount: [accountId: string]
  editGroup: [group: Group]
  deleteGroup: [group: Group]
  addAccount: [groupId: string]
  editAccount: [account: Account]
  deleteAccount: [account: Account]
}>()

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

// 生成分组颜色的 hover 样式（只在 hover 时显示背景）
function getColorHoverStyle(color: string) {
  return { '--hover-bg': color + '20' } as Record<string, string>
}
</script>

<template>
  <SidebarMenu>
    <Collapsible
      v-for="workspace in workspaces"
      :key="workspace.name"
      v-model:open="openStates[workspace.name]"
    >
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
              <span v-if="workspace.emoji">{{ workspace.emoji }}</span>
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
          <SidebarMenuSub>
            <SidebarMenuSubItem
              v-for="page in workspace.pages"
              :key="page.id"
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
                    <span>{{ page.emoji }}</span>
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
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  </SidebarMenu>
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
