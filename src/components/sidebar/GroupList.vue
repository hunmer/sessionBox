<script setup lang="ts">
import { computed } from 'vue'
import { useContainerStore } from '@/stores/container'
import GroupItem from './GroupItem.vue'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
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
import { MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-vue-next'
import type { Group, Container } from '@/types'

const props = defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  selectContainer: [containerName: string]
  editGroup: [group: Group]
  deleteGroup: [group: Group]
  addContainer: [groupId: string]
  editContainer: [container: Container]
  deleteContainer: [container: Container]
}>()

const containerStore = useContainerStore()

// 将 workspaceGroups 及其容器转换为 GroupItem 需要的格式
const workspaces = computed(() => {
  return containerStore.workspaceGroups.map((g) => ({
    id: g.id,
    group: g,
    name: g.name,
    emoji: g.icon || '📁',
    color: g.color,
    pages: (containerStore.containersByGroup.get(g.id) || [])
      .sort((a, b) => a.order - b.order)
      .map((a) => ({
        container: a,
        id: a.id,
        name: a.name,
        emoji: a.icon || '👤', // 容器使用 icon 或默认用户 emoji
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
              <EmojiRenderer :emoji="workspace.emoji" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" class="w-48">
            <DropdownMenuItem
              v-for="page in workspace.pages"
              :key="page.id"
              @click="emit('selectContainer', page.id)"
            >
              <EmojiRenderer :emoji="page.emoji" class="mr-2" />
              {{ page.name }}
            </DropdownMenuItem>
            <template v-if="workspace.pages.length > 0">
              <DropdownMenuSeparator />
            </template>
            <DropdownMenuItem @click.stop="emit('addContainer', workspace.group.id)">
              <Plus class="w-4 h-4 mr-2" />
              新建容器
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
    v-else-if="containerStore.workspaceGroups.length > 0"
    :workspaces="workspaces"
    @select-container="emit('selectContainer', $event)"
    @edit-group="emit('editGroup', $event)"
    @delete-group="emit('deleteGroup', $event)"
    @add-container="emit('addContainer', $event)"
    @edit-container="emit('editContainer', $event)"
    @delete-container="emit('deleteContainer', $event)"
  />
  <div v-else class="flex flex-col items-center justify-center py-8 text-muted-foreground">
    <p class="text-sm">暂无分组</p>
    <p class="text-xs mt-1">点击下方「新建分组」开始</p>
  </div>
</template>
