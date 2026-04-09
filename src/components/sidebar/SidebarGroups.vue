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
import { useAccountStore } from '@/stores/account'
import type { Group, Account } from '@/types'

defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  editGroup: [group: Group]
  deleteGroup: [group: Group]
  addAccount: [groupId: string]
  editAccount: [account: Account]
  deleteAccount: [account: Account]
  selectAccount: [accountId: string]
}>()

const accountStore = useAccountStore()
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel v-if="!collapsed" class="group px-2.5">
      <span class="flex-1">分组</span>
      <button
        v-if="!collapsed"
        class="flex-shrink-0 p-0.5 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors opacity-0 group-hover:opacity-100"
        @click.stop="emit('addAccount', '')"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>
    </SidebarGroupLabel>
    <SidebarGroupContent>
      <GroupList
        :collapsed="collapsed"
        @edit-group="emit('editGroup', $event)"
        @delete-group="emit('deleteGroup', $event)"
        @add-account="emit('addAccount', $event)"
        @edit-account="emit('editAccount', $event)"
        @delete-account="emit('deleteAccount', $event)"
        @select-account="emit('selectAccount', $event)"
      />
    </SidebarGroupContent>
  </SidebarGroup>
</template>
