<script setup lang="ts">
import { computed, ref } from 'vue'
import { Home, Tag, Command } from 'lucide-vue-next'

import WorkspaceSwitcher from '@/components/WorkspaceSwitcher.vue'
import NavMain from '@/components/NavMain.vue'
import NavUser from '@/components/NavUser.vue'
import SidebarGroups from './SidebarGroups.vue'
import GroupDialog from './GroupDialog.vue'
import PageDialog from './PageDialog.vue'
import {
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTabStore } from '@/stores/tab'
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
import { useHomepageStore } from '@/stores/homepage'
import { useUserProfileStore } from '@/stores/userProfile'
import type { Group, Page } from '@/types'

const workspaceStore = useWorkspaceStore()
const tabStore = useTabStore()
const containerStore = useContainerStore()
const pageStore = usePageStore()
const homepageStore = useHomepageStore()
const userProfileStore = useUserProfileStore()

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  openSettings: [tab?: string]
}>()

// 对话框状态
const groupDialogOpen = ref(false)
const editingGroup = ref<Group | null>(null)
const pageDialogOpen = ref(false)
const editingPage = ref<Page | null>(null)
const newPageGroupId = ref<string>('')

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
  const groupPages = pageStore.pagesByGroup.get(group.id) || []
  const hint = groupPages.length > 0
    ? `该分组下有 ${groupPages.length} 个页面，将一并删除。`
    : ''
  if (!confirm(`确定要删除分组「${group.name}」吗？${hint}`)) return

  // 先关闭并删除该分组下所有页面的标签页，再删除页面，最后删除分组
  for (const page of groupPages) {
    const tab = tabStore.tabs.find(t => t.pageId === page.id)
    if (tab) await tabStore.closeTab(tab.id)
    await pageStore.deletePage(page.id)
  }
  await containerStore.deleteGroup(group.id)
}

// 添加分组
function handleAddGroup() {
  editingGroup.value = null
  groupDialogOpen.value = true
}

// 添加页面
function handleAddPage(groupId: string) {
  if (!groupId) {
    handleAddGroup()
    return
  }
  editingPage.value = null
  newPageGroupId.value = groupId
  pageDialogOpen.value = true
}

// 编辑页面
function handleEditPage(page: Page) {
  editingPage.value = page
  newPageGroupId.value = page.groupId
  pageDialogOpen.value = true
}

// 删除页面
async function handleDeletePage(page: Page) {
  if (!confirm(`确定要删除页面「${page.name}」吗？`)) return
  // 关闭关联的 tab
  const tab = tabStore.tabs.find(t => t.pageId === page.id)
  if (tab) await tabStore.closeTab(tab.id)
  await pageStore.deletePage(page.id)
}

// 保存页面
async function handleSavePage(data: Omit<Page, 'id'>) {
  if (editingPage.value) {
    await pageStore.updatePage(editingPage.value.id, data)
  } else {
    await pageStore.createPage(data)
  }
  pageDialogOpen.value = false
  editingPage.value = null
}

/** 切换到或创建指定页面的标签页 */
function handleSelectPage(pageId: string) {
  const pageTabs = tabStore.sortedTabs.filter((t) => t.pageId === pageId)
  if (pageTabs.length > 0) {
    tabStore.switchTab(pageTabs[pageTabs.length - 1].id)
  } else {
    tabStore.createTab(pageId)
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

// navMain: 【主页】
const navMain = [
  {
    title: '主页',
    url: '#',
    icon: Home,
    isActive: true,
    onClick: openHomepage,
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
        @add-page="handleAddPage"
        @edit-page="handleEditPage"
        @delete-page="handleDeletePage"
        @select-page="handleSelectPage"
      />
      <NavUser
        class="mt-auto p-1 shrink-0"
        :user="{ name: userProfileStore.profile.name, email: '', avatar: userProfileStore.avatarSrc, emoji: userProfileStore.isEmojiAvatar ? userProfileStore.profile.avatar : undefined }"
        :collapsed="collapsed"
        @open-settings="emit('openSettings')"
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

  <!-- 页面编辑/新建对话框 -->
  <PageDialog
    v-model:open="pageDialogOpen"
    :page="editingPage"
    :group-id="newPageGroupId"
    @save="handleSavePage"
    @delete="handleDeletePage"
    @open-settings="emit('openSettings', $event)"
  />
</template>
