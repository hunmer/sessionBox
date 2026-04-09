<script setup lang="ts">
import { computed } from 'vue'
import { useBookmarkStore } from '@/stores/bookmark'
import FolderTreeItem from './FolderTreeItem.vue'
import type { BookmarkFolder } from '@/types'

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
</script>

<template>
  <div class="p-2 space-y-0.5">
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
