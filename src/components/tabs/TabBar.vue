<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, Minus, Square, X, Copy, PanelLeftClose, ChevronRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import draggable from 'vuedraggable'
import TabLayoutMenu from './TabLayoutMenu.vue'
import AccountPickerDialog from '@/components/AccountPickerDialog.vue'
import TabItem from './TabItem.vue'
import { useTabStore } from '@/stores/tab'
import type { Account } from '@/types'

defineProps<{
  isMaximized: boolean
}>()

defineEmits<{
  'toggle-sidebar': []
}>()

const tabStore = useTabStore()
const showAddDialog = ref(false)

// 分组折叠状态
const collapsedGroups = ref(new Set<string>())

function getGroupKey(tab: { groupName: string; groupColor?: string }) {
  return `${tab.groupName}::${tab.groupColor ?? ''}`
}

function isGroupCollapsed(tab: { groupName: string; groupColor?: string }) {
  return collapsedGroups.value.has(getGroupKey(tab))
}

function toggleGroupCollapse(tab: { groupName: string; groupColor?: string }) {
  const key = getGroupKey(tab)
  const s = new Set(collapsedGroups.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  collapsedGroups.value = s
}

const groupTabCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const tab of tabStore.groupedWorkspaceTabs) {
    if (tab.groupName) {
      const key = getGroupKey(tab)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
})

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
    <!-- 切换侧边栏按钮 -->
    <Button
      variant="ghost"
      size="icon-sm"
      class="h-7 w-7 flex-shrink-0 rounded-full"
      @click="$emit('toggle-sidebar')"
    >
      <PanelLeftClose class="w-3.5 h-3.5" />
    </Button>

    <!-- 标签列表 - 分组模式（每个 tab 独立可拖拽） -->
    <draggable
      v-if="tabStore.tabLayout === 'horizontal' && tabStore.tabGroupEnabled"
      :model-value="tabStore.groupedWorkspaceTabs"
      :animation="150"
      item-key="id"
      filter=".tab-pinned"
      class="flex items-center gap-1 flex-1 min-w-0 h-full overflow-x-auto overflow-y-hidden"
      @update:model-value="onListUpdate"
    >
      <template #item="{ element: tab }">
        <div
          v-show="tab.isGroupStart || !isGroupCollapsed(tab)"
          class="flex items-center gap-0.5 flex-shrink-0"
          :class="{ 'tab-pinned': tab.pinned }"
        >
          <!-- 分组 badge：仅在该组第一个 tab 前显示，可点击折叠 -->
          <span
            v-if="tab.isGroupStart"
            class="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-md select-none cursor-pointer"
            :style="tab.groupColor
              ? { backgroundColor: tab.groupColor + '22', color: tab.groupColor, borderBottom: `2px solid ${tab.groupColor}` }
              : {}"
            :class="!tab.groupColor && 'bg-muted text-muted-foreground'"
            @click.stop="toggleGroupCollapse(tab)"
          >
            <ChevronRight
              class="w-2.5 h-2.5 transition-transform"
              :class="!isGroupCollapsed(tab) && 'rotate-90'"
            />
            {{ tab.groupName }}
            <span
              v-if="isGroupCollapsed(tab)"
              class="text-[8px] opacity-60"
            >
              {{ groupTabCounts.get(getGroupKey(tab)) ?? 0 }}
            </span>
          </span>
          <TabItem v-if="!isGroupCollapsed(tab)" :tab="tab" :group-color="tab.groupColor" />
        </div>
      </template>
    </draggable>

    <!-- 标签列表 - 扁平模式（可拖拽排序） -->
    <draggable
      v-else-if="tabStore.tabLayout === 'horizontal'"
      :model-value="tabStore.workspaceTabs"
      :animation="150"
      item-key="id"
      filter=".tab-pinned"
      class="flex items-center gap-1 flex-1 min-w-0 h-full overflow-x-auto overflow-y-hidden"
      @update:model-value="onListUpdate"
    >
      <template #item="{ element: tab }">
        <div class="flex-shrink-0" :class="{ 'tab-pinned': tab.pinned }">
          <TabItem :tab="tab" />
        </div>
      </template>
    </draggable>

    <!-- 弹性占位（垂直布局下撑开宽度，使控制按钮靠右） -->
    <div v-if="tabStore.tabLayout === 'vertical'" class="flex-1" />

    <template v-if="tabStore.tabLayout === 'horizontal'">
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

      <!-- 更多选项 -->
      <TabLayoutMenu direction="horizontal" />
    </template>

    <!-- 窗口控制按钮 -->
    <div class="flex items-center gap-1.5 flex-shrink-0">
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
