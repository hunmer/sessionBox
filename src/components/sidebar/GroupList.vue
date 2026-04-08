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
  editAccount: [account: Account]
  deleteAccount: [account: Account]
}>()

const accountStore = useAccountStore()

function onDragEnd() {
  const ids = accountStore.sortedGroups.map((g) => g.id)
  accountStore.reorderGroups(ids)
}
</script>

<template>
  <draggable
    :model-value="accountStore.sortedGroups"
    :animation="150"
    item-key="id"
    class="flex flex-col gap-0.5"
    @end="onDragEnd"
    @update:model-value="accountStore.groups = $event"
  >
    <template #item="{ element: group }">
      <GroupItem
        :group="group"
        :collapsed="collapsed"
        @edit-group="emit('editGroup', $event)"
        @delete-group="emit('deleteGroup', $event)"
        @edit-account="emit('editAccount', $event)"
        @delete-account="emit('deleteAccount', $event)"
      />
    </template>
  </draggable>
</template>
