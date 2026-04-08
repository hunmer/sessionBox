<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronRight, Pencil, Trash2 } from 'lucide-vue-next'
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
</script>

<template>
  <Collapsible v-model:open="open">
    <!-- 分组标题 -->
    <div
      class="group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors"
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
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-sidebar-hover transition-opacity"
              @click.stop
            >
              <Pencil class="w-3 h-3" />
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
      <div class="pl-2">
        <AccountItem
          v-for="account in accounts"
          :key="account.id"
          :account="account"
          :collapsed="collapsed"
          @edit="emit('editAccount', $event)"
          @delete="emit('deleteAccount', $event)"
        />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
