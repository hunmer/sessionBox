<script setup lang="ts">
import { useBookmarkStore } from '@/stores/bookmark'
import { useDragState, getDragData } from '@/composables/useBookmarkDragDrop'
import FolderTreeItem from './FolderTreeItem.vue'

const props = defineProps<{
  selectedFolderId: string
  searchQuery: string
}>()

const emit = defineEmits<{
  'update:selectedFolderId': [id: string]
  addFolder: [parentId: string | null]
  editFolder: [id: string]
}>()

const bookmarkStore = useBookmarkStore()
const { state: dragState, startDrag, endDrag } = useDragState()

// 空白区域 dragover：恢复拖拽状态（如果因边界离开丢失） + 允许 drop
function onContainerDragOver(event: DragEvent) {
  event.preventDefault()

  // 恢复拖拽状态：从 dataTransfer 读取（鼠标重新进入时全局状态可能已清除）
  if (!dragState.value.data) {
    const data = getDragData(event)
    if (data) startDrag(data)
  }

  // 如果没有悬浮在任何文件夹 item 上，允许 drop 到容器
  if (!dragState.value.overId && dragState.value.data) {
    event.dataTransfer!.dropEffect = 'move'
  }
}

function onContainerDrop(event: DragEvent) {
  if (dragState.value.overId) return // 已由子组件处理
  event.preventDefault()

  if (dragState.value.data?.type === 'folder') {
    const rootFolders = bookmarkStore.rootFolders
    bookmarkStore.moveFolder(dragState.value.data.id, null, rootFolders.length)
  }

  endDrag()
}

function onContainerDragLeave(event: DragEvent) {
  const related = event.relatedTarget as HTMLElement | null
  if (related && (event.currentTarget as HTMLElement).contains(related)) return
  endDrag()
}

// Escape 取消或拖拽结束时清理全局状态
function onContainerDragEnd() {
  endDrag()
}
</script>

<template>
  <div
    class="p-2 space-y-0.5"
    @dragover="onContainerDragOver"
    @drop="onContainerDrop"
    @dragleave="onContainerDragLeave"
    @dragend="onContainerDragEnd"
  >
    <FolderTreeItem
      v-for="folder in bookmarkStore.rootFolders"
      :key="folder.id"
      :folder="folder"
      :selected-folder-id="selectedFolderId"
      :search-query="searchQuery"
      :depth="0"
      @select="emit('update:selectedFolderId', $event)"
      @add-folder="emit('addFolder', $event)"
      @edit-folder="emit('editFolder', $event)"
    />
  </div>
</template>
