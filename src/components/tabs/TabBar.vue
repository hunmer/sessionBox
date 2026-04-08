<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Minus, Square, X, Copy, PanelLeft, Bookmark, FolderOpen } from 'lucide-vue-next'
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

/** 分组 badge 拖拽结束回调 */
function onGroupDragEnd(evt: { oldIndex: number; newIndex: number }) {
  const entries = [...tabStore.groupedTabs]
  const [moved] = entries.splice(evt.oldIndex, 1)
  entries.splice(evt.newIndex, 0, moved)
  tabStore.reorderTabGroups(entries.map((e) => e[0]))
}

function handleAddAccount(account: Account) {
  tabStore.createTab(account.id)
}
</script>

<template>
  <div class="flex items-center h-[42px] px-2 gap-1 bg-card/30 border-b border-border">
    <!-- 标签列表 - 分组模式 -->
    <template v-if="tabStore.tabGroupEnabled">
      <draggable
        :model-value="tabStore.groupedTabs"
        :animation="150"
        item-key="0"
        class="flex items-center gap-1 min-w-0 h-full"
        @end="onGroupDragEnd"
      >
        <template #item="{ element: entry }">
          <div class="flex items-center gap-0.5">
            <!-- 分组 badge -->
            <span
              class="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-muted text-muted-foreground cursor-grab select-none"
            >
              {{ entry[1].group.name }}
            </span>
            <!-- 组内标签列表 -->
            <TabItem v-for="tab in entry[1].tabs" :key="tab.id" :tab="tab" />
          </div>
        </template>
      </draggable>
    </template>

    <!-- 标签列表 - 扁平模式（可拖拽排序） -->
    <draggable
      v-else
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

    <!-- 标签自动分组按钮 -->
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7 rounded-full flex-shrink-0"
      :class="tabStore.tabGroupEnabled ? 'bg-secondary text-primary' : 'hover:bg-secondary'"
      style="-webkit-app-region: no-drag"
      @click="tabStore.toggleTabGroup()"
    >
      <FolderOpen class="w-3.5 h-3.5" />
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
