<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ChevronRight, Folder, FolderOpen, MoreHorizontal, FolderPlus, Pencil, Trash2 } from 'lucide-vue-next'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useBookmarkStore } from '@/stores/bookmark'
import {
  useDragState,
  setDragData,
  getDragData,
  getDropPosition,
} from '@/composables/useBookmarkDragDrop'
import type { BookmarkFolder } from '@/types'

const props = defineProps<{
  folder: BookmarkFolder
  selectedFolderId: string
  searchQuery: string
  depth: number
}>()

const emit = defineEmits<{
  select: [id: string]
  addFolder: [parentId: string | null]
  editFolder: [id: string]
}>()

const bookmarkStore = useBookmarkStore()
const { state: dragState, startDrag, updateOver, endDrag } = useDragState()
const open = ref(true)

const children = computed(() => bookmarkStore.getChildFolders(props.folder.id))
const isSelected = computed(() => props.selectedFolderId === props.folder.id)
const bookmarkCount = computed(() => bookmarkStore.getBookmarksByFolder(props.folder.id).length)

// 当前 item 的拖拽落点状态
const dropPos = computed(() => {
  if (dragState.value.overId !== props.folder.id) return null
  return dragState.value.dropPosition
})

const isDraggingSelf = computed(() => {
  return dragState.value.data?.type === 'folder' && dragState.value.data.id === props.folder.id
})

// 预计算拖拽文件夹的所有后代 ID 集合（仅在拖拽文件夹时计算一次）
const forbiddenTargets = computed(() => {
  const data = dragState.value.data
  if (!data || data.type !== 'folder') return new Set<string>()
  return collectDescendantIds(data.id)
})

function collectDescendantIds(folderId: string): Set<string> {
  const ids = new Set<string>()
  function walk(id: string) {
    for (const child of bookmarkStore.getChildFolders(id)) {
      ids.add(child.id)
      walk(child.id)
    }
  }
  walk(folderId)
  return ids
}

function handleClick() {
  emit('select', props.folder.id)
}

// ====== 拖拽事件 ======

function onDragStart(event: DragEvent) {
  const dragItem = { type: 'folder' as const, id: props.folder.id }
  setDragData(event, dragItem)
  startDrag(dragItem)
  event.dataTransfer!.effectAllowed = 'move'
  const el = event.currentTarget as HTMLElement
  el.classList.add('opacity-40')
  const cleanup = () => {
    el.classList.remove('opacity-40')
    document.removeEventListener('dragend', cleanup)
  }
  document.addEventListener('dragend', cleanup)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (!dragState.value.data) return
  if (isDraggingSelf.value) return

  // 文件夹不能拖入自身或子级（O(1) 查表）
  if (dragState.value.data.type === 'folder' && forbiddenTargets.value.has(props.folder.id)) {
    return
  }

  const position = getDropPosition(event, event.currentTarget as HTMLElement)
  event.dataTransfer!.dropEffect = 'move'
  updateOver(props.folder.id, position)
}

function onDragLeave(event: DragEvent) {
  const related = event.relatedTarget as HTMLElement | null
  if (related && (event.currentTarget as HTMLElement).contains(related)) return
  if (dragState.value.overId === props.folder.id) {
    updateOver(null, null)
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  const data = getDragData(event)
  if (!data) return

  const position = dropPos.value
  if (!position) return

  if (data.type === 'folder') {
    handleFolderDrop(data.id, position)
  } else if (data.type === 'bookmark') {
    handleBookmarkDrop(data.id, position)
  }

  endDrag()
}

function handleFolderDrop(folderId: string, position: 'before' | 'after' | 'inside') {
  if (folderId === props.folder.id) return
  if (forbiddenTargets.value.has(props.folder.id)) return

  if (position === 'inside') {
    const targetChildren = bookmarkStore.getChildFolders(props.folder.id)
    bookmarkStore.moveFolder(folderId, props.folder.id, targetChildren.length)
  } else {
    const parentId = props.folder.parentId
    const siblings = bookmarkStore.getChildFolders(parentId)
    const targetIndex = siblings.findIndex((f) => f.id === props.folder.id)
    const insertIndex = position === 'before' ? targetIndex : targetIndex + 1
    bookmarkStore.moveFolder(folderId, parentId, insertIndex)
  }
}

function handleBookmarkDrop(bookmarkId: string, position: 'before' | 'after' | 'inside') {
  // 书签放入文件夹（无论 before/after/inside 都放到该文件夹内）
  const targetBookmarks = bookmarkStore.getBookmarksByFolder(props.folder.id)
  bookmarkStore.moveBookmark(bookmarkId, props.folder.id, targetBookmarks.length)
}
</script>

<template>
  <div>
    <!-- 顶部落点指示线 -->
    <div
      v-if="dropPos === 'before'"
      class="drop-indicator"
    />

    <Collapsible v-model:open="open">
      <div
        class="folder-item group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors"
        :class="[
          isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary',
          dropPos === 'inside' ? 'drop-inside' : '',
          isDraggingSelf ? 'opacity-40' : ''
        ]"
        :style="{ paddingLeft: `${depth * 16 + 8}px` }"
        draggable="true"
        @click="handleClick"
        @dragstart="onDragStart"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <!-- 折叠按钮 -->
        <CollapsibleTrigger as-child>
          <button
            v-if="children.length > 0"
            class="flex-shrink-0 transition-transform p-0.5 rounded hover:bg-accent/80"
            :class="open ? 'rotate-90' : ''"
            @click.stop
          >
            <ChevronRight class="w-3 h-3" />
          </button>
          <span
            v-else
            class="w-4 flex-shrink-0"
          />
        </CollapsibleTrigger>

        <!-- 文件夹图标 -->
        <component
          :is="open ? FolderOpen : Folder"
          class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground"
        />

        <!-- 文件夹名 -->
        <span class="flex-1 truncate text-xs">{{ folder.name }}</span>

        <!-- 书签数量 -->
        <span
          v-if="bookmarkCount > 0"
          class="text-[10px] text-muted-foreground flex-shrink-0"
        >
          {{ bookmarkCount }}
        </span>

        <!-- 更多操作 -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent/80 transition-opacity"
              @click.stop
            >
              <MoreHorizontal class="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            class="w-32"
          >
            <DropdownMenuItem
              class="text-xs"
              @click="emit('addFolder', folder.id)"
            >
              <FolderPlus class="w-3 h-3 mr-1.5" /> 新建子文件夹
            </DropdownMenuItem>
            <DropdownMenuItem
              class="text-xs"
              @click="emit('editFolder', folder.id)"
            >
              <Pencil class="w-3 h-3 mr-1.5" /> 重命名
            </DropdownMenuItem>
            <DropdownMenuItem
              class="text-xs text-destructive"
              @click="bookmarkStore.deleteFolder(folder.id)"
            >
              <Trash2 class="w-3 h-3 mr-1.5" /> 删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <!-- 子文件夹 -->
      <CollapsibleContent>
        <FolderTreeItem
          v-for="child in children"
          :key="child.id"
          :folder="child"
          :selected-folder-id="selectedFolderId"
          :search-query="searchQuery"
          :depth="depth + 1"
          @select="emit('select', $event)"
          @add-folder="emit('addFolder', $event)"
          @edit-folder="emit('editFolder', $event)"
        />
      </CollapsibleContent>
    </Collapsible>

    <!-- 底部落点指示线 -->
    <div
      v-if="dropPos === 'after'"
      class="drop-indicator"
    />
  </div>
</template>

<style scoped>
.drop-indicator {
  height: 2px;
  margin: 0 8px;
  pointer-events: none;
  background: repeating-linear-gradient(
    90deg,
    hsl(var(--primary)) 0px,
    hsl(var(--primary)) 4px,
    transparent 4px,
    transparent 8px
  );
}

.drop-inside {
  outline: 2px dashed hsl(var(--primary)) !important;
  outline-offset: -2px;
}

.folder-item {
  position: relative;
}
</style>
