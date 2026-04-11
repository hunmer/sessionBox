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
import { useContainerStore } from '@/stores/container'
import type { Group, Container } from '@/types'

defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  editGroup: [group: Group]
  deleteGroup: [group: Group]
  addContainer: [groupId: string]
  editContainer: [container: Container]
  deleteContainer: [container: Container]
  selectContainer: [containerId: string]
}>()

const containerStore = useContainerStore()
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel v-if="!collapsed" class="group px-2.5">
      <span class="flex-1">分组</span>
      <button
        v-if="!collapsed"
        class="flex-shrink-0 p-0.5 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors opacity-0 group-hover:opacity-100"
        @click.stop="emit('addContainer', '')"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>
    </SidebarGroupLabel>
    <SidebarGroupContent>
      <GroupList
        :collapsed="collapsed"
        @edit-group="emit('editGroup', $event)"
        @delete-group="emit('deleteGroup', $event)"
        @add-container="emit('addContainer', $event)"
        @edit-container="emit('editContainer', $event)"
        @delete-container="emit('deleteContainer', $event)"
        @select-container="emit('selectContainer', $event)"
      />
    </SidebarGroupContent>
  </SidebarGroup>
</template>
