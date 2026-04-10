<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, ChevronRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import draggable from 'vuedraggable'
import TabLayoutMenu from './TabLayoutMenu.vue'
import AccountPickerDialog from '@/components/AccountPickerDialog.vue'
import TabItem from './TabItem.vue'
import { useTabStore } from '@/stores/tab'
import type { Account } from '@/types'

const tabStore = useTabStore()
const showAddDialog = defineModel<boolean>('showAddDialog')

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

// 各分组的标签数量
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
    <!-- 标签列表 - 分组模式 -->
    <draggable
      v-if="tabStore.tabGroupEnabled"
      :model-value="tabStore.groupedWorkspaceTabs"
      :animation="150"
      item-key="id"
      filter=".tab-pinned"
      class="flex flex-col gap-0.5 p-1 flex-1 min-h-0 overflow-y-auto"
      @update:model-value="onListUpdate"
    >
      <template #item="{ element: tab }">
        <div
          v-show="tab.isGroupStart || !isGroupCollapsed(tab)"
          class="w-full"
          :class="{ 'tab-pinned': tab.pinned }"
        >
          <!-- 分组标题：仅在该组第一个 tab 前显示 -->
          <div
            v-if="tab.isGroupStart"
            class="flex items-center gap-1.5 px-2 pt-1.5 pb-0.5 select-none cursor-pointer"
            @click.stop="toggleGroupCollapse(tab)"
          >
            <ChevronRight
              class="w-3 h-3 flex-shrink-0 transition-transform text-muted-foreground"
              :class="!isGroupCollapsed(tab) && 'rotate-90'"
            />
            <span
              class="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
              :style="tab.groupColor
                ? { backgroundColor: tab.groupColor + '22', color: tab.groupColor, borderBottom: `2px solid ${tab.groupColor}` }
                : {}"
              :class="!tab.groupColor && 'bg-muted text-muted-foreground'"
            >
              {{ tab.groupName }}
            </span>
            <span
              v-if="isGroupCollapsed(tab)"
              class="text-[9px] px-1.5 rounded-full bg-muted text-muted-foreground"
            >
              {{ groupTabCounts.get(getGroupKey(tab)) ?? 0 }}
            </span>
          </div>
          <TabItem v-if="!isGroupCollapsed(tab)" :tab="tab" vertical :group-color="tab.groupColor" />
        </div>
      </template>
    </draggable>

    <!-- 标签列表 - 扁平模式（垂直可拖拽排序） -->
    <draggable
      v-else
      :model-value="tabStore.workspaceTabs"
      :animation="150"
      item-key="id"
      filter=".tab-pinned"
      class="flex flex-col gap-0.5 p-1 flex-1 min-h-0 overflow-y-auto"
      @update:model-value="onListUpdate"
    >
      <template #item="{ element: tab }">
        <div class="w-full" :class="{ 'tab-pinned': tab.pinned }">
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
      <TabLayoutMenu direction="vertical" />
    </div>

    <AccountPickerDialog
      :open="showAddDialog"
      title="新建标签页"
      @update:open="showAddDialog = $event"
      @select="handleAddAccount"
    />
  </div>
</template>
