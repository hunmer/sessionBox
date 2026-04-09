<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Minus, Square, X, Copy, PanelLeft, Bookmark, FolderOpen, MoreHorizontal, Check } from 'lucide-vue-next'
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

defineProps<{
  isMaximized: boolean
}>()

const tabStore = useTabStore()
const showAddDialog = ref(false)

const windowApi = () => window.api

function minimizeWindow() {
  windowApi()?.window.minimize()
}

function maximizeWindow() {
  windowApi()?.window.maximize()
}

function closeWindow() {
  windowApi()?.window.close()
}

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
  <div class="flex items-center h-[42px] px-2 gap-1 bg-card/30 border-b border-border">
    <!-- 标签列表 - 分组模式（每个 tab 独立可拖拽） -->
    <draggable
      v-if="tabStore.tabGroupEnabled"
      :model-value="tabStore.groupedSortedTabs"
      :animation="150"
      item-key="id"
      class="flex items-center gap-1 min-w-0 h-full"
      @update:model-value="onListUpdate"
    >
      <template #item="{ element: tab }">
        <div class="flex items-center gap-0.5">
          <!-- 分组 badge：仅在该组第一个 tab 前显示 -->
          <span
            v-if="tab.isGroupStart"
            class="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-md select-none"
            :style="tab.groupColor
              ? { backgroundColor: tab.groupColor + '22', color: tab.groupColor, borderBottom: `2px solid ${tab.groupColor}` }
              : {}"
            :class="!tab.groupColor && 'bg-muted text-muted-foreground'"
          >
            {{ tab.groupName }}
          </span>
          <TabItem :tab="tab" :group-color="tab.groupColor" />
        </div>
      </template>
    </draggable>

    <!-- 标签列表 - 扁平模式（可拖拽排序） -->
    <draggable
      v-else
      :model-value="tabStore.sortedTabs"
      :animation="150"
      item-key="id"
      class="flex items-center gap-1 min-w-0 h-full"
      @update:model-value="onListUpdate"
    >
      <template #item="{ element: tab }">
        <div>
          <TabItem :tab="tab" />
        </div>
      </template>
    </draggable>

    <!-- 新建标签按钮 -->
    <Button variant="ghost" size="icon-sm" class="h-7 w-7 flex-shrink-0 rounded-full" @click="showAddDialog = true">
      <Plus class="w-3.5 h-3.5" />
    </Button>
    <AccountPickerDialog
      :open="showAddDialog"
      title="新建标签页"
      @update:open="showAddDialog = $event"
      @select="handleAddAccount"
    />

    <!-- 填充可拖拽区域 -->
    <div class="flex-1 min-w-[60px] h-full" style="-webkit-app-region: drag" />

    <!-- 更多选项 -->
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 rounded-full hover:bg-secondary flex-shrink-0"
          style="-webkit-app-region: no-drag"
        >
          <MoreHorizontal class="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-48">
        <DropdownMenuItem class="cursor-pointer" @click="tabStore.toggleLayout()">
          <PanelLeft class="size-4 mr-2" />
          <span class="flex-1">侧边栏布局</span>
          <Check v-if="tabStore.tabLayout === 'vertical'" class="size-4 text-primary" />
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

    <!-- 窗口控制按钮 -->
    <div class="flex items-center gap-1.5 flex-shrink-0" style="-webkit-app-region: no-drag">
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 rounded-full hover:bg-secondary"
        @click="minimizeWindow()"
      >
        <Minus class="w-3 h-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 rounded-full hover:bg-secondary"
        @click="maximizeWindow()"
      >
        <Copy v-if="isMaximized" class="w-3 h-3" />
        <Square v-else class="w-2.5 h-2.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 rounded-full hover:bg-red-500/80 hover:text-white"
        @click="closeWindow()"
      >
        <X class="w-3.5 h-3.5" />
      </Button>
    </div>
  </div>
</template>
