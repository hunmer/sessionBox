<script setup lang="ts">
import { reactive } from 'vue'
import { ChevronRight, MoreHorizontal, Plus } from "lucide-vue-next"

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
          <a href="#">
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
            class="left-2 bg-sidebar-accent text-sidebar-accent-foreground data-[state=open]:rotate-90"
            show-on-hover
          >
            <ChevronRight />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <SidebarMenuAction show-on-hover>
          <Plus />
        </SidebarMenuAction>
        <CollapsibleContent>
          <SidebarMenuSub>
            <SidebarMenuSubItem v-for="page in workspace.pages" :key="page.id">
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
