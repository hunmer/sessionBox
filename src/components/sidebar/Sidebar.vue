<script setup lang="ts">
import { computed } from 'vue'
import { Home, Tag, Settings2, Command } from 'lucide-vue-next'

import WorkspaceSwitcher from '@/components/WorkspaceSwitcher.vue'
import NavMain from '@/components/NavMain.vue'
import NavSecondary from '@/components/NavSecondary.vue'
import SidebarGroups from './SidebarGroups.vue'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useWorkspaceStore } from '@/stores/workspace'

const workspaceStore = useWorkspaceStore()

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  openProxy: []
  openSettings: []
  toggleCollapse: []
}>()

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

// navSecondary: 仅保留 Settings
const navSecondary = [
  {
    title: '设置',
    url: '#',
    icon: Settings2,
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
      />
      <NavSecondary :items="navSecondary" class="mt-auto" />
    </SidebarContent>
    <SidebarRail />
  </Sidebar>
</template>
