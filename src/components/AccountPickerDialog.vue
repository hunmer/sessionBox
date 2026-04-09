<script setup lang="ts">
import { computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAccountStore } from '@/stores/account'
import { useTabStore } from '@/stores/tab'
import type { Account } from '@/types'

const props = defineProps<{
  open: boolean
  /** 可选：限制只显示某个分组的账号 */
  groupId?: string
  /** 对话框标题，默认"选择账号" */
  title?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [account: Account]
}>()

const accountStore = useAccountStore()
const tabStore = useTabStore()

/** 展示的账号列表，直接使用 workspaceGroups 确保与 Sidebar 一致 */
const accounts = computed(() => {
  // 直接从 workspaceGroups 获取分组，再取其账号列表，保证与 Sidebar 完全一致
  const groups = accountStore.workspaceGroups
  const groupIds = new Set(groups.map((g) => g.id))

  let list = accountStore.accounts.filter((a) => groupIds.has(a.groupId))

  // 按分组过滤（优先级更高）
  if (props.groupId) {
    list = list.filter((a) => a.groupId === props.groupId)
  }
  return list.slice().sort((a, b) => a.order - b.order)
})

/** 账号是否有激活的 tab */
function isActive(accountId: string) {
  return tabStore.activeTab?.accountId === accountId
}

/** 图标是否为自定义图片 */
function isImageIcon(icon: string | undefined) {
  return icon?.startsWith('img:')
}

/** 点击账号 */
function handleSelect(account: Account) {
  emit('select', account)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[360px]">
      <DialogHeader>
        <DialogTitle>{{ title ?? '选择账号' }}</DialogTitle>
      </DialogHeader>
      <ScrollArea class="max-h-[300px]">
        <div v-if="accounts.length === 0" class="py-6 text-center text-sm text-muted-foreground">
          暂无账号，请先创建
        </div>
        <div v-else class="flex flex-col gap-1">
          <button
            v-for="account in accounts"
            :key="account.id"
            class="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left"
            :class="isActive(account.id) ? 'bg-primary/10' : 'hover:bg-accent'"
            @click="handleSelect(account)"
          >
            <span class="flex-shrink-0 w-5 h-5 flex items-center justify-center overflow-hidden">
              <img
                v-if="isImageIcon(account.icon)"
                :src="`account-icon://${account.icon!.slice(4)}`"
                alt=""
                class="w-full h-full rounded-sm object-cover"
              />
              <span v-else class="text-base leading-none">{{ account.icon }}</span>
            </span>
            <span class="flex-1 truncate">{{ account.name }}</span>
            <span v-if="account.proxyId" class="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
          </button>
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>
