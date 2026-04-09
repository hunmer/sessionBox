<script setup lang="ts">
import { ref } from 'vue'
import { Plus, X, MoreHorizontal } from 'lucide-vue-next'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import WorkspaceDialog from './WorkspaceDialog.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Workspace } from '@/types'

const props = defineProps<{
  collapsed: boolean
}>()

const workspaceStore = useWorkspaceStore()
const dialogOpen = ref(false)
const editingWorkspace = ref<Workspace | null>(null)

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
  <div class="border-b border-sidebar-border">
    <!-- 折叠态：图标模式水平滚动 -->
    <div v-if="collapsed" class="flex items-center gap-1 px-1 py-1.5 overflow-x-auto">
      <button
        v-for="ws in workspaceStore.sortedWorkspaces"
        :key="ws.id"
        class="relative flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white transition-all"
        :class="workspaceStore.activeWorkspaceId === ws.id ? 'ring-2 ring-foreground/50 scale-105' : 'opacity-60 hover:opacity-90'"
        :style="{ backgroundColor: ws.color }"
        @click="workspaceStore.activate(ws.id)"
        @contextmenu.prevent="!workspaceStore.isDefaultWorkspace(ws.id) && openEdit(ws)"
      >
        {{ ws.title.charAt(0) }}
        <!-- 关闭按钮（非默认工作区且激活时显示） -->
        <span
          v-if="workspaceStore.activeWorkspaceId === ws.id && !workspaceStore.isDefaultWorkspace(ws.id)"
          class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-white flex items-center justify-center cursor-pointer hover:bg-destructive/80"
          @click.stop="handleDelete(ws)"
        >
          <X class="w-2 h-2" />
        </span>
      </button>
      <button
        class="flex-shrink-0 w-8 h-8 rounded-lg border border-dashed border-sidebar-border flex items-center justify-center text-muted-foreground hover:text-sidebar-foreground hover:border-sidebar-foreground/30"
        @click="openNew"
      >
        <Plus class="w-3 h-3" />
      </button>
    </div>

    <!-- 展开态：根据视图模式 -->
    <template v-else>
      <!-- 网格模式 -->
      <div v-if="workspaceStore.viewMode === 'grid'" class="px-2 py-2">
        <div
          class="grid gap-1.5 max-h-[162px] overflow-y-auto"
          style="grid-template-columns: repeat(auto-fill, minmax(80px, 1fr))"
        >
          <button
            v-for="ws in workspaceStore.sortedWorkspaces"
            :key="ws.id"
            class="relative group/ws flex flex-col items-center justify-center rounded-lg p-2 transition-all min-h-[44px]"
            :class="workspaceStore.activeWorkspaceId === ws.id
              ? 'ring-2 ring-foreground/30 bg-sidebar-hover'
              : 'hover:bg-sidebar-hover opacity-70 hover:opacity-100'"
            @click="workspaceStore.activate(ws.id)"
          >
            <div
              class="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white mb-1"
              :style="{ backgroundColor: ws.color }"
            >
              {{ ws.title.charAt(0) }}
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
              <DropdownMenuContent align="end" class="w-28">
                <DropdownMenuItem @click="openEdit(ws)">编辑</DropdownMenuItem>
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
      <div v-else class="flex items-center gap-1 px-2 py-2 overflow-x-auto">
        <button
          v-for="ws in workspaceStore.sortedWorkspaces"
          :key="ws.id"
          class="relative group/ws flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white transition-all"
          :class="workspaceStore.activeWorkspaceId === ws.id ? 'ring-2 ring-foreground/50 scale-105' : 'opacity-60 hover:opacity-90'"
          :style="{ backgroundColor: ws.color }"
          @click="workspaceStore.activate(ws.id)"
        >
          {{ ws.title.charAt(0) }}
          <!-- 关闭按钮 -->
          <span
            v-if="workspaceStore.activeWorkspaceId === ws.id && !workspaceStore.isDefaultWorkspace(ws.id)"
            class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center cursor-pointer opacity-0 group-hover/ws:opacity-100 transition-opacity"
            @click.stop="workspaceStore.close(ws.id)"
          >
            <X class="w-2.5 h-2.5" />
          </span>
          <!-- 右键菜单 -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <span class="absolute inset-0" @contextmenu.prevent.stop />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-28">
              <DropdownMenuItem @click="openEdit(ws)">编辑</DropdownMenuItem>
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
