<script setup lang="ts">
import { computed } from 'vue'
import { useAccountStore } from '@/stores/account'
import GroupItem from './GroupItem.vue'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-vue-next'
import type { Group, Account } from '@/types'

const props = defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  selectAccount: [accountName: string]
  editGroup: [group: Group]
  deleteGroup: [group: Group]
  editAccount: [account: Account]
  deleteAccount: [account: Account]
}>()

const accountStore = useAccountStore()

// 将 workspaceGroups 及其账号转换为 GroupItem 需要的格式
const workspaces = computed(() => {
  return accountStore.workspaceGroups.map((g) => ({
    group: g,
    name: g.name,
    emoji: '📁',
    color: g.color, // 保留颜色信息
    pages: (accountStore.accountsByGroup.get(g.id) || [])
      .sort((a, b) => a.order - b.order)
      .map((a) => ({
        account: a,
        id: a.id,
        name: a.name,
        emoji: a.icon || '👤', // 账号使用 icon 或默认用户 emoji
      })),
  }))
})
</script>

<template>
  <!-- 折叠状态：显示图标列表，点击弹出下拉菜单 -->
  <template v-if="collapsed">
    <SidebarMenu>
      <SidebarMenuItem v-for="workspace in workspaces" :key="workspace.name">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <SidebarMenuButton
              :tooltip="workspace.name"
              class="flex items-center justify-center"
            >
              <span>{{ workspace.emoji }}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" class="w-48">
            <DropdownMenuItem
              v-for="page in workspace.pages"
              :key="page.id"
              @click="emit('selectAccount', page.id)"
            >
              <span class="mr-2">{{ page.emoji }}</span>
              {{ page.name }}
            </DropdownMenuItem>
            <template v-if="workspace.pages.length > 0">
              <DropdownMenuSeparator />
            </template>
            <DropdownMenuItem @click.stop="emit('editGroup', workspace.group)">
              <Pencil class="w-4 h-4 mr-2" />
              编辑分组
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              @click.stop="emit('deleteGroup', workspace.group)"
              class="text-destructive"
            >
              <Trash2 class="w-4 h-4 mr-2" />
              删除分组
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  </template>

  <!-- 展开状态：显示完整列表 -->
  <GroupItem
    v-else-if="accountStore.workspaceGroups.length > 0"
    :workspaces="workspaces"
    @select-account="emit('selectAccount', $event)"
    @edit-group="emit('editGroup', $event)"
    @delete-group="emit('deleteGroup', $event)"
    @edit-account="emit('editAccount', $event)"
    @delete-account="emit('deleteAccount', $event)"
  />
  <div v-else class="flex flex-col items-center justify-center py-8 text-muted-foreground">
    <p class="text-sm">暂无分组</p>
    <p class="text-xs mt-1">点击下方「新建分组」开始</p>
  </div>
</template>
