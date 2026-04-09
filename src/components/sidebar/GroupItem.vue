<script setup lang="ts">
import { computed, reactive } from 'vue'
import { ChevronRight, MoreHorizontal } from "lucide-vue-next"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

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
            class="group/menu-button"
            :style="workspace.color ? { '--hover-bg': workspace.color + '20' } : undefined"
          >
            <span
              v-if="workspace.color"
              class="w-4 h-4 rounded-sm flex-shrink-0"
              :style="{ backgroundColor: workspace.color }"
            ></span>
            <span v-else>{{ workspace.emoji }}</span>
            <span>{{ workspace.name }}</span>
          </a>
        </SidebarMenuButton>
        <CollapsibleTrigger as-child>
          <SidebarMenuAction
            class="left-2 group-data-[collapsible=icon]:hidden hover:!bg-sidebar-accent"
            :style="workspace.color ? { '--hover-bg': workspace.color + '20' } : undefined"
            show-on-hover
          >
            <ChevronRight class="group-hover/menu-item:!text-sidebar-accent-foreground transition-colors" />
          </SidebarMenuAction>
        </CollapsibleTrigger>
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
