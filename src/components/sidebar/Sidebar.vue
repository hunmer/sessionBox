<script setup lang="ts">
import { computed } from 'vue'
import { Home, Tag, Command } from 'lucide-vue-next'

import WorkspaceSwitcher from '@/components/WorkspaceSwitcher.vue'
import NavMain from '@/components/NavMain.vue'
import NavUser from '@/components/NavUser.vue'
import SidebarGroups from './SidebarGroups.vue'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTabStore } from '@/stores/tab'

const workspaceStore = useWorkspaceStore()
const tabStore = useTabStore()

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  openProxy: []
  openSettings: []
  toggleCollapse: []
}>()

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
    return [{ name: '默认工作区', logo: Command, plan: '' }]
  }
  return workspaceList.map((w) => ({
    name: w.title,
    logo: Tag,
    plan: '',
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
        @edit-group="emit('openSettings')"
        @delete-group="emit('openSettings')"
        @add-account="emit('openSettings')"
        @edit-account="emit('openSettings')"
        @delete-account="emit('openSettings')"
        @select-account="handleSelectAccount"
      />
      <NavUser
        class="mt-auto p-1"
        :user="{ name: '用户', email: '', avatar: '' }"
        @open-settings="emit('openSettings')"
        @open-proxy="emit('openProxy')"
      />
    </SidebarContent>
    <SidebarRail />
  </Sidebar>
</template>
