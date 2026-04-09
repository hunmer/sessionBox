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

const props = defineProps<{
  workspaces: {
    name: string
    logo: Component
    plan: string
  }[]
}>()

const activeWorkspace = ref(props.workspaces[0])
</script>

<template>
  <SidebarMenu v-if="activeWorkspace">
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton class="w-fit px-1.5">
            <div class="flex aspect-square size-5 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <component :is="activeWorkspace.logo" class="size-3" />
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
            class="gap-2 p-2"
            @click="activeWorkspace = workspace"
          >
            <div class="flex size-6 items-center justify-center rounded-xs border">
              <component :is="workspace.logo" class="size-4 shrink-0" />
            </div>
            {{ workspace.name }}
            <DropdownMenuShortcut>⌘{{ index + 1 }}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem class="gap-2 p-2">
            <div class="flex size-6 items-center justify-center rounded-md border bg-background">
              <Plus class="size-4" />
            </div>
            <div class="font-medium text-muted-foreground">
              添加工作区
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
