<script setup lang="ts">
import { ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import draggable from 'vuedraggable'
import TabItem from './TabItem.vue'
import { useTabStore } from '@/stores/tab'
import { useAccountStore } from '@/stores/account'

const tabStore = useTabStore()
const accountStore = useAccountStore()

function onDragEnd() {
  const ids = tabStore.sortedTabs.map((t) => t.id)
  tabStore.reorderTabs(ids)
}

function addTab(accountId: string) {
  tabStore.createTab(accountId)
}
</script>

<template>
  <div class="flex items-end h-[38px] bg-card/30 border-b border-border overflow-hidden">
    <!-- 标签列表（可拖拽排序） -->
    <draggable
      :model-value="tabStore.sortedTabs"
      :animation="150"
      item-key="id"
      class="flex h-full"
      @end="onDragEnd"
      @update:model-value="tabStore.tabs = $event"
    >
      <template #item="{ element: tab }">
        <TabItem :tab="tab" />
      </template>
    </draggable>

    <!-- 新建标签按钮 -->
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="icon" class="h-7 w-7 mx-1 flex-shrink-0">
          <Plus class="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          v-for="account in accountStore.accounts"
          :key="account.id"
          @click="addTab(account.id)"
        >
          {{ account.icon }} {{ account.name }}
        </DropdownMenuItem>
        <template v-if="accountStore.accounts.length === 0">
          <div class="px-2 py-1.5 text-xs text-muted-foreground">暂无账号，请先创建</div>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
