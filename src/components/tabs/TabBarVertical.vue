<script setup lang="ts">
import { Plus, MoreVertical, PanelTop, FolderOpen, Bookmark, Check } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import draggable from 'vuedraggable'
import AccountPickerDialog from '@/components/AccountPickerDialog.vue'
import TabItem from './TabItem.vue'
import { useTabStore } from '@/stores/tab'
import type { Account } from '@/types'

const tabStore = useTabStore()
const showAddDialog = defineModel<boolean>('showAddDialog')

function onListUpdate(newList: { id: string }[]) {
  const ids = newList.map((t) => t.id)
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
      :model-value="tabStore.workspaceTabs"
      :animation="150"
      item-key="id"
      filter=".tab-pinned"
      class="flex flex-col gap-0.5 p-1 flex-1 min-h-0 overflow-y-auto"
      @update:model-value="onListUpdate"
    >
      <template #item="{ element: tab }">
        <div :class="{ 'tab-pinned': tab.pinned }">
          <TabItem :tab="tab" vertical />
        </div>
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
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            class="h-7 w-7 rounded-full"
          >
            <MoreVertical class="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-48">
          <DropdownMenuItem class="cursor-pointer" @click="tabStore.toggleLayout()">
            <PanelTop class="size-4 mr-2" />
            <span class="flex-1">水平布局</span>
            <Check v-if="tabStore.tabLayout === 'horizontal'" class="size-4 text-primary" />
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="tabStore.toggleTabGroup()">
            <FolderOpen class="size-4 mr-2" />
            <span class="flex-1">自动分组</span>
            <Check v-if="tabStore.tabGroupEnabled" class="size-4 text-primary" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem class="cursor-pointer" @click="tabStore.toggleFavoriteBar()">
            <Bookmark class="size-4 mr-2" />
            <span class="flex-1">快捷网站栏</span>
            <Check v-if="tabStore.favoriteBarVisible" class="size-4 text-primary" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <AccountPickerDialog
      :open="showAddDialog"
      title="新建标签页"
      @update:open="showAddDialog = $event"
      @select="handleAddAccount"
    />
  </div>
</template>
