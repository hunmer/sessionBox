<script setup lang="ts">
import type { Component } from "vue"
import { ChevronDown, Plus } from "lucide-vue-next"
import { computed, ref } from "vue"
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
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
import { useTabStore } from '@/stores/tab'

const props = defineProps<{
  workspaces: {
    id: string
    name: string
    logo: Component
    plan: string
    color?: string
  }[]
  collapsed?: boolean
}>()

const workspaceStore = useWorkspaceStore()
const containerStore = useContainerStore()
const pageStore = usePageStore()
const tabStore = useTabStore()
const dialogOpen = ref(false)

/** 当前激活工作区的完整信息（包含 logo） */
const activeWorkspaceInfo = computed(() =>
  props.workspaces.find((w) => w.id === workspaceStore.activeWorkspaceId) ?? props.workspaces[0]
)

/** 每个工作区的激活标签页数：Workspace → Group → Page → Tab */
const tabCountByWorkspace = computed(() => {
  const countMap = new Map<string, number>()

  for (const workspace of props.workspaces) {
    const effectiveWorkspaceId = workspace.id
    const groupIds = new Set(
      containerStore.groups
        .filter((g) => (g.workspaceId || '__default__') === effectiveWorkspaceId)
        .map((g) => g.id)
    )
    const pageIds = new Set(
      pageStore.pages.filter((p) => groupIds.has(p.groupId)).map((p) => p.id)
    )
    const count = tabStore.tabs.filter((t) => pageIds.has(t.pageId)).length
    countMap.set(workspace.id, count)
  }

  return countMap
})

function handleAddWorkspace() {
  dialogOpen.value = true
}

async function handleSave(data: { title: string; color: string }) {
  await workspaceStore.createWorkspace(data.title, data.color)
}

function handleSelectWorkspace(workspace: typeof props.workspaces[0]) {
  workspaceStore.activate(workspace.id)
}
</script>

<template>
  <SidebarMenu v-if="activeWorkspaceInfo" :class="collapsed ? 'w-full justify-center' : ''">
    <SidebarMenuItem :class="collapsed ? 'flex justify-center' : ''">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton class="w-fit px-1.5 flex items-center justify-center" :class="collapsed ? '!p-1.5' : ''">
            <div
              class="flex aspect-square items-center justify-center rounded-md"
              :class="collapsed ? 'size-6' : 'size-5'"
              :style="{ backgroundColor: activeWorkspaceInfo.color || '#3b82f6' }"
            >
              <component :is="activeWorkspaceInfo.logo" :class="collapsed ? 'size-4' : 'size-3'" class="text-white" />
            </div>
            <span v-if="!collapsed" class="truncate font-semibold">{{ activeWorkspaceInfo.name }}</span>
            <ChevronDown v-if="!collapsed" class="opacity-50" />
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
            :key="workspace.id"
            class="gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="handleSelectWorkspace(workspace)"
          >
            <div
              class="flex size-6 items-center justify-center rounded-md"
              :style="{ backgroundColor: workspace.color || '#6b7280' }"
            >
              <component :is="workspace.logo" class="size-4 shrink-0 text-white" />
            </div>
            <span class="truncate">{{ workspace.name }}</span>
            <span v-if="tabCountByWorkspace.get(workspace.id)" class="ml-auto text-xs text-muted-foreground tabular-nums">
              {{ tabCountByWorkspace.get(workspace.id) }}
            </span>
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
