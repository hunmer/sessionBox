<script setup lang="ts">
import { Plus, PanelTop } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import draggable from 'vuedraggable'
import AccountPickerDialog from '@/components/AccountPickerDialog.vue'
import TabItem from './TabItem.vue'
import { useTabStore } from '@/stores/tab'
import type { Account } from '@/types'

const tabStore = useTabStore()
const showAddDialog = defineModel<boolean>('showAddDialog')

function onDragEnd(evt: { oldIndex: number; newIndex: number }) {
  const sorted = [...tabStore.sortedTabs]
  const [moved] = sorted.splice(evt.oldIndex, 1)
  sorted.splice(evt.newIndex, 0, moved)

  const ids = sorted.map((t) => t.id)
  ids.forEach((id, order) => {
    const t = tabStore.tabs.find((t) => t.id === id)
    if (t) t.order = order
  })

  tabStore.reorderTabs(ids)
}

function handleAddAccount(account: Account) {
  tabStore.createTab(account.id)
}
</script>

<template>
  <div class="flex flex-col h-full bg-card/30 border-r border-border">
    <!-- 标签列表（垂直可拖拽排序） -->
    <draggable
      :model-value="tabStore.sortedTabs"
      :animation="150"
      item-key="id"
      class="flex flex-col gap-0.5 p-1 flex-1 min-h-0 overflow-y-auto"
      @end="onDragEnd"
    >
      <template #item="{ element: tab }">
        <TabItem :tab="tab" vertical />
      </template>
    </draggable>

    <!-- 底部操作区 -->
    <div class="flex items-center gap-1 p-1.5 border-t border-border flex-shrink-0">
      <Button
        variant="ghost"
        size="icon-sm"
        class="h-7 w-7 rounded-full"
        @click="showAddDialog = true"
      >
        <Plus class="w-3.5 h-3.5" />
      </Button>
      <div class="flex-1" />
      <Button
        variant="ghost"
        size="icon-sm"
        class="h-7 w-7 rounded-full"
        @click="tabStore.toggleLayout()"
      >
        <PanelTop class="w-3.5 h-3.5" />
      </Button>
    </div>

    <AccountPickerDialog
      :open="showAddDialog"
      title="新建标签页"
      @update:open="showAddDialog = $event"
      @select="handleAddAccount"
    />
  </div>
</template>
