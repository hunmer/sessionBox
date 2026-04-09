<script setup lang="ts">
import { computed, ref } from 'vue'
import { Home, Tag, Command } from 'lucide-vue-next'

import WorkspaceSwitcher from '@/components/WorkspaceSwitcher.vue'
import NavMain from '@/components/NavMain.vue'
import NavUser from '@/components/NavUser.vue'
import SidebarGroups from './SidebarGroups.vue'
import GroupDialog from './GroupDialog.vue'
import AccountDialog from './AccountDialog.vue'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from '@/components/ui/sidebar'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTabStore } from '@/stores/tab'
import { useAccountStore } from '@/stores/account'
import type { Group, Account } from '@/types'

const workspaceStore = useWorkspaceStore()
const tabStore = useTabStore()
const accountStore = useAccountStore()

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  openProxy: []
  openSettings: []
}>()

// 对话框状态
const groupDialogOpen = ref(false)
const editingGroup = ref<Group | null>(null)
const accountDialogOpen = ref(false)
const editingAccount = ref<Account | null>(null)

// 分组操作
function handleEditGroup(group: Group) {
  editingGroup.value = group
  groupDialogOpen.value = true
}

async function handleSaveGroup(data: { name: string; proxyId?: string; color?: string; workspaceId?: string }) {
  if (editingGroup.value) {
    await accountStore.updateGroup(editingGroup.value.id, data)
  }
  groupDialogOpen.value = false
  editingGroup.value = null
}

async function handleDeleteGroup(group: Group) {
  if (confirm(`确定要删除分组「${group.name}」吗？账号不会被删除。`)) {
    await accountStore.deleteGroup(group.id)
  }
}

// 账号操作
function handleEditAccount(account: Account) {
  editingAccount.value = account
  accountDialogOpen.value = true
}

async function handleSaveAccount(data: Partial<Account> & { groupId: string; name: string; icon: string; defaultUrl: string; order: number }) {
  if (editingAccount.value) {
    await accountStore.updateAccount(editingAccount.value.id, data)
  }
  accountDialogOpen.value = false
  editingAccount.value = null
}

async function handleDeleteAccount(account: Account) {
  if (confirm(`确定要删除账号「${account.name}」吗？`)) {
    await accountStore.deleteAccount(account.id)
  }
}

/** 切换到或创建指定账号的标签页 */
function handleSelectAccount(accountId: string) {
  const accountTabs = tabStore.sortedTabs.filter((t) => t.accountId === accountId)
  if (accountTabs.length > 0) {
    tabStore.switchTab(accountTabs[accountTabs.length - 1].id)
  } else {
    tabStore.createTab(accountId)
  }
}

// navMain: 【主页】【标签】（占位）
const navMain = [
  {
    title: '主页',
    url: '#',
    icon: Home,
    isActive: true,
  },
  {
    title: '标签',
    url: '#',
    icon: Tag,
  },
]

// WorkspaceSwitcher 使用当前工作区数据（确保至少有一个工作区）
const workspaceSwitcherItems = computed(() => {
  const workspaceList = workspaceStore.sortedWorkspaces
  if (workspaceList.length === 0) {
    return [{ id: '__default__', name: '默认工作区', logo: Command, plan: '', color: '#3b82f6' }]
  }
  return workspaceList.map((w) => ({
    id: w.id,
    name: w.title,
    logo: Tag,
    plan: '',
    color: w.color,
  }))
})
</script>

<template>
  <Sidebar class="border-r-0" v-bind="props">
    <SidebarHeader>
      <WorkspaceSwitcher :workspaces="workspaceSwitcherItems" />
      <NavMain :items="navMain" />
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroups
        :collapsed="collapsed"
        @edit-group="handleEditGroup"
        @delete-group="handleDeleteGroup"
        @add-account="emit('openSettings')"
        @edit-account="handleEditAccount"
        @delete-account="handleDeleteAccount"
        @select-account="handleSelectAccount"
      />
      <NavUser
        class="mt-auto p-1"
        :user="{ name: '用户', email: '', avatar: '' }"
        @open-settings="emit('openSettings')"
        @open-proxy="emit('openProxy')"
      />
    </SidebarContent>
  </Sidebar>

  <!-- 分组编辑对话框 -->
  <GroupDialog
    v-model:open="groupDialogOpen"
    :group="editingGroup"
    @save="handleSaveGroup"
  />

  <!-- 账号编辑对话框 -->
  <AccountDialog
    v-model:open="accountDialogOpen"
    :account="editingAccount"
    @save="handleSaveAccount"
  />
</template>
