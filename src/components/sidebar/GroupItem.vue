<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronRight, Plus, MoreHorizontal } from 'lucide-vue-next'
import draggable from 'vuedraggable'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import AccountItem from './AccountItem.vue'
import { useAccountStore } from '@/stores/account'
import { useTabStore } from '@/stores/tab'
import type { Group } from '@/types'

const props = defineProps<{
  group: Group
  collapsed: boolean
}>()

const emit = defineEmits<{
  editGroup: [group: Group]
  deleteGroup: [group: Group]
  addAccount: [groupId: string]
  editAccount: [account: import('@/types').Account]
  deleteAccount: [account: import('@/types').Account]
}>()

const accountStore = useAccountStore()
const tabStore = useTabStore()
const open = ref(true)

/** 该分组下的账号（已排序） */
const accounts = computed(() => {
  const list = accountStore.accountsByGroup.get(props.group.id) || []
  return list.sort((a, b) => a.order - b.order)
})

/** 该分组是否有激活的 tab */
const isGroupActive = computed(() =>
  accounts.value.some((a) => tabStore.activeTab?.accountId === a.id)
)

/** 账号拖拽排序结束后同步 order */
function onAccountDragEnd() {
  const ids = accounts.value.map((a) => a.id)
  accountStore.reorderAccounts(ids)
}

/** 拖拽过程中同步本地顺序 */
function onAccountUpdate(newList: typeof accounts.value) {
  // 按新顺序更新本地 order，让 computed 重新排序
  newList.forEach((account, i) => {
    const item = accountStore.accounts.find((a) => a.id === account.id)
    if (item) item.order = i
  })
}
</script>

<template>
  <Collapsible v-model:open="open">
    <!-- 分组标题 -->
    <div
      class="group group-handle flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors"
      :class="isGroupActive ? 'text-primary' : 'text-muted-foreground hover:text-sidebar-foreground'"
    >
      <!-- 折叠态：仅显示首字母 -->
      <template v-if="collapsed">
        <span class="flex-1 text-xs font-medium text-center">
          {{ group.name.charAt(0) }}
        </span>
      </template>

      <!-- 展开态 -->
      <template v-else>
        <CollapsibleTrigger as-child>
          <button class="flex-shrink-0 transition-transform" :class="open ? 'rotate-90' : ''">
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </CollapsibleTrigger>
        <span class="flex-1 truncate text-xs font-medium uppercase tracking-wider">
          {{ group.name }}
        </span>
        <!-- 增加账号按钮 -->
        <button
          class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-sidebar-hover transition-opacity"
          @click.stop="emit('addAccount', group.id)"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
        <!-- 更多操作 -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-sidebar-hover transition-opacity"
              @click.stop
            >
              <MoreHorizontal class="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-36">
            <DropdownMenuItem @click="emit('editGroup', group)">编辑分组</DropdownMenuItem>
            <DropdownMenuItem class="text-destructive" @click="emit('deleteGroup', group)">删除分组</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </div>

    <!-- 账号列表 -->
    <CollapsibleContent v-if="!collapsed">
      <draggable
        :model-value="accounts"
        :animation="150"
        item-key="id"
        class="pl-2"
        @end="onAccountDragEnd"
        @update:model-value="onAccountUpdate"
      >
        <template #item="{ element: account }">
          <AccountItem
            :account="account"
            :collapsed="collapsed"
            @edit="emit('editAccount', $event)"
            @delete="emit('deleteAccount', $event)"
          />
        </template>
      </draggable>
    </CollapsibleContent>
  </Collapsible>
</template>
