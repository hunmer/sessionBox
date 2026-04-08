<script setup lang="ts">
import { computed } from 'vue'
import { MoreHorizontal } from 'lucide-vue-next'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTabStore } from '@/stores/tab'
import type { Account } from '@/types'

const props = defineProps<{
  account: Account
  collapsed: boolean
}>()

const emit = defineEmits<{
  edit: [account: Account]
  delete: [account: Account]
}>()

const tabStore = useTabStore()

/** 当前账号是否有激活的 tab */
const isActive = computed(() =>
  tabStore.activeTab?.accountId === props.account.id
)

/** 点击账号 */
function handleClick() {
  // 查找该账号的所有 tab
  const accountTabs = tabStore.sortedTabs.filter((t) => t.accountId === props.account.id)
  if (accountTabs.length > 0) {
    // 切换到该账号最近活跃的 tab
    tabStore.switchTab(accountTabs[accountTabs.length - 1].id)
  } else {
    // 创建新 tab
    tabStore.createTab(props.account.id)
  }
}
</script>

<template>
  <div
    class="group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors"
    :class="isActive ? 'bg-primary/15 text-primary' : 'hover:bg-sidebar-hover text-sidebar-foreground'"
    @click="handleClick"
  >
    <!-- 图标 -->
    <span class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-sm">
      {{ collapsed ? account.name.charAt(0) : account.icon || account.name.charAt(0) }}
    </span>

    <!-- 名称（折叠时隐藏） -->
    <span v-if="!collapsed" class="flex-1 truncate text-sm">{{ account.name }}</span>

    <!-- 代理标记 -->
    <span
      v-if="!collapsed && account.proxyId"
      class="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary"
      title="已绑定代理"
    />

    <!-- 更多按钮（折叠时隐藏） -->
    <DropdownMenu v-if="!collapsed">
      <DropdownMenuTrigger as-child>
        <button
          class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-sidebar-hover transition-opacity"
          @click.stop
        >
          <MoreHorizontal class="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-36">
        <DropdownMenuItem @click="emit('edit', account)">编辑</DropdownMenuItem>
        <DropdownMenuItem class="text-destructive" @click="emit('delete', account)">删除</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
