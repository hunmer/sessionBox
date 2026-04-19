<script setup lang="ts">
import { Plus } from 'lucide-vue-next'

import GroupList from './GroupList.vue'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { Group, Page } from '@/types'

defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  editGroup: [group: Group]
  deleteGroup: [group: Group]
  addPage: [groupId: string]
  editPage: [page: Page]
  deletePage: [page: Page]
  selectPage: [pageId: string]
}>()
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel
      v-if="!collapsed"
      class="group px-2.5"
    >
      <span class="flex-1">分组</span>
      <button
        v-if="!collapsed"
        class="flex-shrink-0 p-0.5 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors opacity-0 group-hover:opacity-100"
        @click.stop="emit('addPage', '')"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>
    </SidebarGroupLabel>
    <SidebarGroupContent>
      <GroupList
        :collapsed="collapsed"
        @edit-group="emit('editGroup', $event)"
        @delete-group="emit('deleteGroup', $event)"
        @add-page="emit('addPage', $event)"
        @edit-page="emit('editPage', $event)"
        @delete-page="emit('deletePage', $event)"
        @select-page="emit('selectPage', $event)"
      />
    </SidebarGroupContent>
  </SidebarGroup>
</template>
