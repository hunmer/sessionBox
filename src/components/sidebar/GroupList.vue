<script setup lang="ts">
import { computed } from 'vue'
import { useAccountStore } from '@/stores/account'
import GroupItem from './GroupItem.vue'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  selectAccount: [accountName: string]
}>()

const accountStore = useAccountStore()

// 将 workspaceGroups 及其账号转换为 GroupItem 需要的格式
const workspaces = computed(() => {
  return accountStore.workspaceGroups.map((g) => ({
    name: g.name,
    emoji: g.color ? '●' : '📁', // 使用实心圆点配合颜色，或默认 emoji
    color: g.color, // 保留颜色信息
    pages: (accountStore.accountsByGroup.get(g.id) || [])
      .sort((a, b) => a.order - b.order)
      .map((a) => ({
        id: a.id,
        name: a.name,
        emoji: a.icon || '👤', // 账号使用 icon 或默认用户 emoji
      })),
  }))
})
</script>

<template>
  <GroupItem
    v-if="accountStore.workspaceGroups.length > 0"
    :workspaces="workspaces"
    @select-account="emit('selectAccount', $event)"
  />
  <div v-else-if="!collapsed" class="flex flex-col items-center justify-center py-8 text-muted-foreground">
    <p class="text-sm">暂无分组</p>
    <p class="text-xs mt-1">点击下方「新建分组」开始</p>
  </div>
</template>
