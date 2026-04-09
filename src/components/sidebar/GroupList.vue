<script setup lang="ts">
import draggable from 'vuedraggable'
import GroupItem from './GroupItem.vue'
import { useAccountStore } from '@/stores/account'
import type { Group, Account } from '@/types'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  editGroup: [group: Group]
  deleteGroup: [group: Group]
  addAccount: [groupId: string]
  editAccount: [account: Account]
  deleteAccount: [account: Account]
}>()

const accountStore = useAccountStore()

/** 拖拽过程中立即更新 order，防止 computed 按旧 order 重排 */
function onGroupUpdate(newGroups: Group[]) {
  newGroups.forEach((g, i) => { g.order = i })
  accountStore.groups = newGroups
}

function onDragEnd() {
  const ids = accountStore.groups.map((g) => g.id)
  accountStore.reorderGroups(ids)
}
</script>

<template>
  <draggable
    v-if="accountStore.workspaceGroups.length > 0"
    :model-value="accountStore.workspaceGroups"
    :animation="150"
    handle=".group-handle"
    item-key="id"
    class="flex flex-col gap-1"
    @end="onDragEnd"
    @update:model-value="onGroupUpdate"
  >
    <template #item="{ element: group }">
      <GroupItem
        :group="group"
        :collapsed="collapsed"
        @edit-group="emit('editGroup', $event)"
        @delete-group="emit('deleteGroup', $event)"
        @add-account="emit('addAccount', $event)"
        @edit-account="emit('editAccount', $event)"
        @delete-account="emit('deleteAccount', $event)"
      />
    </template>
  </draggable>
  <div v-else-if="!collapsed" class="flex flex-col items-center justify-center py-8 text-muted-foreground">
    <p class="text-sm">暂无分组</p>
    <p class="text-xs mt-1">点击下方「新建分组」开始</p>
  </div>
</template>
