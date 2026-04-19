<script setup lang="ts">
import { ref } from 'vue'
import { Plus, X, MoreHorizontal } from 'lucide-vue-next'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import WorkspaceDialog from './WorkspaceDialog.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTabStore } from '@/stores/tab'
import { usePageStore } from '@/stores/page'
import { useContainerStore } from '@/stores/container'
import type { Workspace } from '@/types'

const props = defineProps<{
  collapsed: boolean
}>()

const workspaceStore = useWorkspaceStore()
const tabStore = useTabStore()
const pageStore = usePageStore()
const containerStore = useContainerStore()
const dialogOpen = ref(false)
const editingWorkspace = ref<Workspace | null>(null)

// 计算每个工作区的标签数量
function getWorkspaceTabCount(workspaceId: string): number {
  const pageIds = new Set(
    pageStore.pages
      .filter((p) => {
        const group = containerStore.getGroup(p.groupId)
        const gWorkspaceId = group?.workspaceId
        // workspaceId 为 undefined 时属于默认工作区
        return (gWorkspaceId || '__default__') === workspaceId
      })
      .map((p) => p.id)
  )
  return tabStore.tabs.filter((t) => t.pageId && pageIds.has(t.pageId)).length
}

function openNew() {
  editingWorkspace.value = null
  dialogOpen.value = true
}

function openEdit(ws: Workspace) {
  editingWorkspace.value = ws
  dialogOpen.value = true
}

async function handleSave(data: { title: string; color: string }) {
  if (editingWorkspace.value) {
    await workspaceStore.updateWorkspace(editingWorkspace.value.id, data)
  } else {
    const ws = await workspaceStore.createWorkspace(data.title, data.color)
    workspaceStore.activate(ws.id)
  }
}

async function handleDelete(ws: Workspace) {
  if (workspaceStore.isDefaultWorkspace(ws.id)) return
  workspaceStore.close(ws.id)
  await workspaceStore.deleteWorkspace(ws.id)
}
</script>

<template>
  <div class="border-b border-sidebar-border p-1">
    <!-- 折叠态：垂直图标排列 -->
    <div
      v-if="collapsed"
      class="flex flex-col items-center gap-1 py-3 px-0"
    >
      <div
        v-for="ws in workspaceStore.sortedWorkspaces"
        :key="ws.id"
        class="relative"
      >
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white transition-all"
          :class="workspaceStore.activeWorkspaceId === ws.id ? 'ring-2 ring-foreground/50 scale-105' : 'opacity-60 hover:opacity-90'"
          :style="{ backgroundColor: ws.color }"
          @click="workspaceStore.activate(ws.id)"
          @contextmenu.prevent="!workspaceStore.isDefaultWorkspace(ws.id) && openEdit(ws)"
        >
          {{ ws.title.charAt(0) }}
        </button>
        <!-- 标签数量 badge -->
        <span
          v-if="getWorkspaceTabCount(ws.id) > 0"
          class="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center"
        >
          {{ getWorkspaceTabCount(ws.id) > 99 ? '99+' : getWorkspaceTabCount(ws.id) }}
        </span>
        <!-- 关闭按钮（非默认工作区且激活时显示） -->
        <span
          v-if="workspaceStore.activeWorkspaceId === ws.id && !workspaceStore.isDefaultWorkspace(ws.id)"
          class="absolute -top-1 -left-1 w-3.5 h-3.5 rounded-full bg-destructive text-white flex items-center justify-center cursor-pointer hover:bg-destructive/80"
          @click.stop="handleDelete(ws)"
        >
          <X class="w-2 h-2" />
        </span>
      </div>
      <button
        class="w-8 h-8 rounded-lg border border-dashed border-sidebar-border flex items-center justify-center text-muted-foreground hover:text-sidebar-foreground hover:border-sidebar-foreground/30 mt-1"
        @click="openNew"
      >
        <Plus class="w-3 h-3" />
      </button>
    </div>

    <!-- 展开态：根据视图模式 -->
    <template v-else>
      <!-- 网格模式 -->
      <div
        v-if="workspaceStore.viewMode === 'grid'"
        class="p-1"
      >
        <div
          class="grid gap-1.5 max-h-[162px]"
          style="grid-template-columns: repeat(auto-fill, minmax(80px, 1fr))"
        >
          <button
            v-for="ws in workspaceStore.sortedWorkspaces"
            :key="ws.id"
            class="relative group/ws flex flex-col items-center justify-center rounded-lg p-2 transition-all min-h-[44px] overflow-visible"
            :class="workspaceStore.activeWorkspaceId === ws.id
              ? 'ring-2 ring-foreground/30 ring-offset-1 bg-sidebar-hover'
              : 'hover:bg-sidebar-hover opacity-70 hover:opacity-100'"
            @click="workspaceStore.activate(ws.id)"
          >
            <div
              class="relative w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white mb-1"
              :style="{ backgroundColor: ws.color }"
            >
              {{ ws.title.charAt(0) }}
              <!-- 标签数量 badge -->
              <span
                v-if="getWorkspaceTabCount(ws.id) > 0"
                class="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center"
              >
                {{ getWorkspaceTabCount(ws.id) > 99 ? '99+' : getWorkspaceTabCount(ws.id) }}
              </span>
            </div>
            <span class="text-[10px] truncate w-full text-center text-sidebar-foreground">
              {{ ws.title }}
            </span>
            <!-- 关闭按钮 -->
            <span
              v-if="workspaceStore.activeWorkspaceId === ws.id && !workspaceStore.isDefaultWorkspace(ws.id)"
              class="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-destructive/90 text-white flex items-center justify-center cursor-pointer opacity-0 group-hover/ws:opacity-100 transition-opacity"
              @click.stop="workspaceStore.close(ws.id)"
            >
              <X class="w-2.5 h-2.5" />
            </span>
            <!-- 更多操作 -->
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <span
                  class="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center cursor-pointer opacity-0 group-hover/ws:opacity-100 transition-opacity text-muted-foreground hover:text-sidebar-foreground"
                  @click.stop
                >
                  <MoreHorizontal class="w-3 h-3" />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                class="w-28"
              >
                <DropdownMenuItem @click="openEdit(ws)">
                  编辑
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="!workspaceStore.isDefaultWorkspace(ws.id)"
                  class="text-destructive"
                  @click="handleDelete(ws)"
                >
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </button>
          <!-- 新建按钮 -->
          <button
            class="flex flex-col items-center justify-center rounded-lg p-2 min-h-[44px] border border-dashed border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:border-sidebar-foreground/30 transition-colors"
            @click="openNew"
          >
            <Plus class="w-4 h-4 mb-1" />
            <span class="text-[10px]">新建</span>
          </button>
        </div>
      </div>

      <!-- 图标模式 -->
      <div
        v-else
        class="flex items-center gap-1 px-2 py-2 overflow-x-auto"
      >
        <button
          v-for="ws in workspaceStore.sortedWorkspaces"
          :key="ws.id"
          class="relative group/ws flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white transition-all"
          :class="workspaceStore.activeWorkspaceId === ws.id ? 'ring-2 ring-foreground/50 scale-105' : 'opacity-60 hover:opacity-90'"
          :style="{ backgroundColor: ws.color }"
          @click="workspaceStore.activate(ws.id)"
        >
          {{ ws.title.charAt(0) }}
          <!-- 标签数量 badge -->
          <span
            v-if="getWorkspaceTabCount(ws.id) > 0"
            class="absolute -top-1 -left-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center"
          >
            {{ getWorkspaceTabCount(ws.id) > 99 ? '99+' : getWorkspaceTabCount(ws.id) }}
          </span>
          <!-- 关闭按钮 -->
          <span
            v-if="workspaceStore.activeWorkspaceId === ws.id && !workspaceStore.isDefaultWorkspace(ws.id)"
            class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center cursor-pointer opacity-0 group-hover/ws:opacity-100 transition-opacity"
            @click.stop="workspaceStore.close(ws.id)"
          >
            <X class="w-2.5 h-2.5" />
          </span>
          <!-- 右键菜单 -->
          <ContextMenu>
            <ContextMenuTrigger as-child>
              <span class="absolute inset-0 cursor-default" />
            </ContextMenuTrigger>
            <ContextMenuContent
              align="start"
              class="w-28"
            >
              <ContextMenuItem @click="openEdit(ws)">
                编辑
              </ContextMenuItem>
              <ContextMenuItem
                v-if="!workspaceStore.isDefaultWorkspace(ws.id)"
                class="text-destructive"
                @click="handleDelete(ws)"
              >
                删除
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </button>
        <button
          class="flex-shrink-0 w-10 h-10 rounded-lg border border-dashed border-sidebar-border flex items-center justify-center text-muted-foreground hover:text-sidebar-foreground hover:border-sidebar-foreground/30"
          @click="openNew"
        >
          <Plus class="w-4 h-4" />
        </button>
      </div>
    </template>

    <!-- 工作区编辑弹窗 -->
    <WorkspaceDialog
      :open="dialogOpen"
      :workspace="editingWorkspace"
      @update:open="dialogOpen = $event"
      @save="handleSave"
    />
  </div>
</template>
