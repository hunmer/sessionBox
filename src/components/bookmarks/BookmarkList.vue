<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Folder } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import BookmarkItem from './BookmarkItem.vue'
import { useBookmarkStore } from '@/stores/bookmark'
import { getFaviconUrl } from '@/lib/utils'

const props = defineProps<{
  folderId: string
  searchQuery: string
}>()

const emit = defineEmits<{
  edit: [id: string]
  addBookmark: []
  selectFolder: [id: string]
}>()

const bookmarkStore = useBookmarkStore()

const currentFolder = computed(() =>
  bookmarkStore.folders.find((f) => f.id === props.folderId)
)

const childFolders = computed(() => {
  if (props.searchQuery) return []
  return bookmarkStore.getChildFolders(props.folderId)
})

const bookmarks = computed(() => {
  if (props.searchQuery) {
    const q = props.searchQuery.toLowerCase()
    return bookmarkStore.bookmarks.filter(
      (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
    )
  }
  return bookmarkStore.getBookmarksByFolder(props.folderId)
})
</script>

<template>
  <ScrollArea class="h-full">
    <div class="p-4">
      <!-- 文件夹标题 -->
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-medium">{{ currentFolder?.name ?? '所有书签' }}</h3>
        <Button
          v-if="!searchQuery"
          variant="ghost"
          size="sm"
          class="h-7 text-xs gap-1"
          @click="emit('addBookmark')"
        >
          <Plus class="w-3.5 h-3.5" />
          添加
        </Button>
      </div>

      <!-- 空状态 -->
      <div
        v-if="childFolders.length === 0 && bookmarks.length === 0"
        class="flex flex-col items-center justify-center py-12 text-muted-foreground"
      >
        <p class="text-xs">{{ searchQuery ? '未找到匹配的书签' : '此文件夹暂无书签' }}</p>
      </div>

      <!-- 子文件夹列表 -->
      <div v-if="childFolders.length > 0" class="grid grid-cols-2 gap-2 mb-3">
        <button
          v-for="folder in childFolders"
          :key="folder.id"
          class="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-secondary transition-colors text-left"
          @click="emit('selectFolder', folder.id)"
        >
          <Folder class="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          <span class="text-xs truncate">{{ folder.name }}</span>
        </button>
      </div>

      <!-- 书签列表 -->
      <div v-if="bookmarks.length > 0" class="space-y-1">
        <BookmarkItem
          v-for="bookmark in bookmarks"
          :key="bookmark.id"
          :bookmark="bookmark"
          :favicon-url="getFaviconUrl(bookmark.url)"
          @edit="emit('edit', $event)"
        />
      </div>
    </div>
  </ScrollArea>
</template>
