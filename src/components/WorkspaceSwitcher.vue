<script setup lang="ts">
import type { Component } from "vue"
import { ChevronDown, Plus } from "lucide-vue-next"
import { ref } from "vue"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

import WorkspaceDialog from './sidebar/WorkspaceDialog.vue'
import { useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{
  workspaces: {
    name: string
    logo: Component
    plan: string
    color?: string
  }[]
}>()

const workspaceStore = useWorkspaceStore()
const activeWorkspace = ref(props.workspaces[0])
const dialogOpen = ref(false)

function handleAddWorkspace() {
  dialogOpen.value = true
}

async function handleSave(data: { title: string; color: string }) {
  await workspaceStore.createWorkspace(data.title, data.color)
}
</script>

<template>
  <SidebarMenu v-if="activeWorkspace">
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton class="w-fit px-1.5">
            <div
              class="flex aspect-square size-5 items-center justify-center rounded-md"
              :style="{ backgroundColor: activeWorkspace.color || '#3b82f6' }"
            >
              <component :is="activeWorkspace.logo" class="size-3 text-white" />
            </div>
            <span class="truncate font-semibold">{{ activeWorkspace.name }}</span>
            <ChevronDown class="opacity-50" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="w-64 rounded-lg"
          align="start"
          side="bottom"
          :side-offset="4"
        >
          <DropdownMenuLabel class="text-xs text-muted-foreground">
            工作区
          </DropdownMenuLabel>
          <DropdownMenuItem
            v-for="(workspace, index) in workspaces"
            :key="workspace.name"
            class="gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="activeWorkspace = workspace"
          >
            <div
              class="flex size-6 items-center justify-center rounded-md"
              :style="{ backgroundColor: workspace.color || '#6b7280' }"
            >
              <component :is="workspace.logo" class="size-4 shrink-0 text-white" />
            </div>
            {{ workspace.name }}
            <DropdownMenuShortcut>⌘{{ index + 1 }}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem class="gap-2 p-2" @click="handleAddWorkspace">
            <div class="flex size-6 items-center justify-center rounded-md border bg-gray-100 dark:bg-gray-800">
              <Plus class="size-4 text-muted-foreground" />
            </div>
            <div class="font-medium text-muted-foreground">
              添加工作区
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>

  <WorkspaceDialog v-model:open="dialogOpen" @save="handleSave" />
</template>
