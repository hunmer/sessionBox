<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Minus, Square, X, Copy, PanelLeft, Bookmark } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
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

function onDragEnd(evt: { oldIndex: number; newIndex: number }) {
  // sortable 只在 DOM 层移动了元素，手动同步到 store
  const sorted = [...tabStore.sortedTabs]
  const [moved] = sorted.splice(evt.oldIndex, 1)
  sorted.splice(evt.newIndex, 0, moved)

  // 先立即更新本地 order，防止 sortedTabs 重算后回弹
  const ids = sorted.map((t) => t.id)
  ids.forEach((id, order) => {
    const t = tabStore.tabs.find((t) => t.id === id)
    if (t) t.order = order
  })

  // 异步持久化到主进程
  tabStore.reorderTabs(ids)
}

function handleAddAccount(account: Account) {
  tabStore.createTab(account.id)
}
</script>

<template>
  <div class="flex items-center h-[42px] px-2 gap-1 bg-card/30 border-b border-border">
    <!-- 标签列表（可拖拽排序） -->
    <draggable
      :model-value="tabStore.sortedTabs"
      :animation="150"
      item-key="id"
      class="flex items-center gap-1 min-w-0 h-full"
      @end="onDragEnd"
    >
      <template #item="{ element: tab }">
        <TabItem :tab="tab" />
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

    <!-- 标签布局切换按钮 -->
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7 rounded-full hover:bg-secondary flex-shrink-0"
      style="-webkit-app-region: no-drag"
      @click="tabStore.toggleLayout()"
    >
      <PanelLeft class="w-3.5 h-3.5" />
    </Button>

    <!-- 快捷网站栏切换按钮 -->
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7 rounded-full flex-shrink-0"
      :class="tabStore.favoriteBarVisible ? 'bg-secondary text-primary' : 'hover:bg-secondary'"
      style="-webkit-app-region: no-drag"
      @click="tabStore.toggleFavoriteBar()"
    >
      <Bookmark class="w-3.5 h-3.5" />
    </Button>

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
