<script setup lang="ts">
import { Plus, Minus, Square, X, Copy } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import draggable from 'vuedraggable'
import TabItem from './TabItem.vue'
import { useTabStore } from '@/stores/tab'
import { useAccountStore } from '@/stores/account'

defineProps<{
  isMaximized: boolean
}>()

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
      class="flex h-full flex-1 min-w-0"
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
          <img
            v-if="account.icon?.startsWith('img:')"
            :src="`account-icon://${account.icon.slice(4)}`"
            alt=""
            class="w-4 h-4 rounded-sm object-cover mr-1"
          />
          <span v-else class="mr-1">{{ account.icon }}</span>
          {{ account.name }}
        </DropdownMenuItem>
        <template v-if="accountStore.accounts.length === 0">
          <div class="px-2 py-1.5 text-xs text-muted-foreground">暂无账号，请先创建</div>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>

    <!-- 填充可拖拽区域 -->
    <div class="flex-1 min-w-[60px] h-full" style="-webkit-app-region: drag" />

    <!-- 窗口控制按钮 -->
    <div class="flex items-center h-full flex-shrink-0" style="-webkit-app-region: no-drag">
      <Button
        variant="ghost"
        size="icon"
        class="h-full w-10 rounded-none hover:bg-secondary"
        @click="window.api.window.minimize()"
      >
        <Minus class="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="h-full w-10 rounded-none hover:bg-secondary"
        @click="window.api.window.maximize()"
      >
        <Copy v-if="isMaximized" class="w-3.5 h-3.5" />
        <Square v-else class="w-3 h-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="h-full w-10 rounded-none hover:bg-red-500/80 hover:text-white"
        @click="window.api.window.close()"
      >
        <X class="w-4 h-4" />
      </Button>
    </div>
  </div>
</template>
