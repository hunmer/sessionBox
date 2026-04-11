<script setup lang="ts">
import { computed, ref } from 'vue'
import { Home, Tag, Command, Bookmark, History, Download } from 'lucide-vue-next'

import WorkspaceSwitcher from '@/components/WorkspaceSwitcher.vue'
import NavMain from '@/components/NavMain.vue'
import NavUser from '@/components/NavUser.vue'
import SidebarGroups from './SidebarGroups.vue'
import GroupDialog from './GroupDialog.vue'
import ContainerDialog from './ContainerDialog.vue'
import {
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTabStore } from '@/stores/tab'
import { useContainerStore } from '@/stores/container'
import { useHomepageStore } from '@/stores/homepage'
import { useUserProfileStore } from '@/stores/userProfile'
import type { Group, Container } from '@/types'

const workspaceStore = useWorkspaceStore()
const tabStore = useTabStore()
const containerStore = useContainerStore()
const homepageStore = useHomepageStore()
const userProfileStore = useUserProfileStore()

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
const containerDialogOpen = ref(false)

// 分组操作
function handleEditGroup(group: Group) {
  editingGroup.value = group
  groupDialogOpen.value = true
}

async function handleSaveGroup(data: { name: string; icon?: string; proxyId?: string; color?: string; workspaceId?: string }) {
  if (editingGroup.value) {
    await containerStore.updateGroup(editingGroup.value.id, data)
  } else {
    await containerStore.createGroup(data.name, data.color, data.workspaceId, data.proxyId, data.icon)
  }
  groupDialogOpen.value = false
  editingGroup.value = null
}

async function handleDeleteGroup(group: Group) {
  const groupContainers = containerStore.containersByGroup.get(group.id) || []
  const hint = groupContainers.length > 0
    ? `该分组下有 ${groupContainers.length} 个容器，将一并删除。`
    : ''
  if (!confirm(`确定要删除分组「${group.name}」吗？${hint}`)) return

  // 先关闭并删除该分组下所有容器的标签页，再删除容器，最后删除分组
  for (const container of groupContainers) {
    const tab = tabStore.tabs.find(t => t.containerId === container.id)
    if (tab) await tabStore.closeTab(tab.id)
    await containerStore.deleteContainer(container.id)
  }
  await containerStore.deleteGroup(group.id)
}

// 添加分组
function handleAddGroup() {
  editingGroup.value = null
  groupDialogOpen.value = true
}

// 添加容器（打开容器管理面板）
function handleAddContainer(groupId: string) {
  if (!groupId) {
    handleAddGroup()
    return
  }
  containerDialogOpen.value = true
}

function handleEditContainer(_container: Container) {
  containerDialogOpen.value = true
}

async function handleDeleteContainer(_container: Container) {
  containerDialogOpen.value = true
}

/** 切换到或创建指定容器的标签页 */
function handleSelectContainer(containerId: string) {
  const containerTabs = tabStore.sortedTabs.filter((t) => t.containerId === containerId)
  if (containerTabs.length > 0) {
    tabStore.switchTab(containerTabs[containerTabs.length - 1].id)
  } else {
    tabStore.createTab(containerId)
  }
}

/** 打开主页 */
function openHomepage() {
  const { url, openMethod } = homepageStore.settings
  if (!url?.trim()) return
  if (openMethod === 'newTab' || !tabStore.activeTab) {
    tabStore.createTabForSite(url)
  } else {
    tabStore.navigate(tabStore.activeTab.id, url)
  }
}

// navMain: 【主页】【书签管理】【历史记录】
const navMain = [
  {
    title: '主页',
    url: '#',
    icon: Home,
    isActive: true,
    onClick: openHomepage,
  },
  {
    title: '书签管理',
    url: '#',
    icon: Bookmark,
    onClick: () => tabStore.createTabForSite('sessionbox://bookmarks'),
  },
  {
    title: '历史记录',
    url: '#',
    icon: History,
    onClick: () => tabStore.createTabForSite('sessionbox://history'),
  },
  {
    title: '下载管理',
    url: '#',
    icon: Download,
    onClick: () => tabStore.createTabForSite('sessionbox://downloads'),
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
  <div class="flex h-full w-full flex-col border-r-0 bg-sidebar text-sidebar-foreground overflow-hidden">
    <SidebarHeader class="shrink-0">
      <WorkspaceSwitcher :workspaces="workspaceSwitcherItems" :collapsed="collapsed" />
      <NavMain :items="navMain" :collapsed="collapsed" />
    </SidebarHeader>
    <SidebarContent class="flex-1 min-h-0">
      <SidebarGroups
        :collapsed="collapsed"
        @edit-group="handleEditGroup"
        @delete-group="handleDeleteGroup"
        @add-container="handleAddContainer"
        @edit-container="handleEditContainer"
        @delete-container="handleDeleteContainer"
        @select-container="handleSelectContainer"
      />
      <NavUser
        class="mt-auto p-1 shrink-0"
        :user="{ name: userProfileStore.profile.name, email: '', avatar: userProfileStore.avatarSrc, emoji: userProfileStore.isEmojiAvatar ? userProfileStore.profile.avatar : undefined }"
        :collapsed="collapsed"
        @open-settings="emit('openSettings')"
        @open-proxy="emit('openProxy')"
      />
    </SidebarContent>
    <SidebarRail />
  </div>

  <!-- 分组编辑对话框 -->
  <GroupDialog
    v-model:open="groupDialogOpen"
    :group="editingGroup"
    @save="handleSaveGroup"
  />

  <!-- 容器管理面板 -->
  <ContainerDialog
    v-model:open="containerDialogOpen"
  />
</template>
