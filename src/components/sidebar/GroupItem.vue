<script setup lang="ts">
import { computed, reactive } from 'vue'
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
import { Pencil, Trash2 } from "lucide-vue-next"

const props = defineProps<{
  workspaces: {
    name: string
    emoji: string
    color?: string
    pages: {
      id: string
      name: string
      emoji: string
    }[]
  }[]
}>()

const emit = defineEmits<{
  selectAccount: [accountId: string]
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
        <SidebarMenuButton as-child>
          <a
            href="#"
            class="group/menu-button flex items-center gap-2"
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
        <CollapsibleContent>
          <SidebarMenuSub>
            <SidebarMenuSubItem
              v-for="page in workspace.pages"
              :key="page.id"
              :style="workspace.color ? { '--item-hover': workspace.color + '20' } : undefined"
              class="group/menu-sub-item"
            >
              <SidebarMenuSubButton as-child>
                <a
                  href="#"
                  class="flex items-center gap-2 w-full text-left"
                  @click.prevent="handleAccountClick(page.id)"
                >
                  <span>{{ page.emoji }}</span>
                  <span>{{ page.name }}</span>
                </a>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>

    <SidebarMenuItem>
      <SidebarMenuButton class="text-sidebar-foreground/70">
        <MoreHorizontal />
        <span>More</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</template>

<style scoped>
/* 分组名称 hover 效果 */
.group\/menu-button:hover {
  background-color: var(--hover-bg, transparent);
}

/* 账号项 hover 效果 - 覆盖 SidebarMenuSubButton 默认的 hover 样式 */
.group\/menu-sub-item:hover :deep([data-slot="sidebar-menu-sub-button"]) {
  background-color: var(--item-hover, transparent) !important;
}
</style>
