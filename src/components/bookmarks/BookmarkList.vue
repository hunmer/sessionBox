<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, Folder } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import BookmarkItem from './BookmarkItem.vue'
import { useBookmarkStore } from '@/stores/bookmark'
import { getDragData } from '@/composables/useBookmarkDragDrop'
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

// ====== 列表内拖拽排序 ======

const dragOverIndex = ref<number | null>(null)
/** 'before' = 指示线在上方，'after' = 指示线在下方 */
const dragOverPosition = ref<'before' | 'after'>('before')

function getItemDropPosition(event: DragEvent, element: HTMLElement): 'before' | 'after' {
  const rect = element.getBoundingClientRect()
  const y = event.clientY - rect.top
  return y < rect.height / 2 ? 'before' : 'after'
}

function onItemDragOver(event: DragEvent, index: number) {
  event.preventDefault()
  const data = getDragData(event)
  // 只处理书签类型的拖拽
  if (!data || data.type !== 'bookmark') return

  dragOverIndex.value = index
  dragOverPosition.value = getItemDropPosition(event, event.currentTarget as HTMLElement)
}

function onItemDragLeave(event: DragEvent, index: number) {
  const related = event.relatedTarget as HTMLElement | null
  if (related && (event.currentTarget as HTMLElement).contains(related)) return
  if (dragOverIndex.value === index) {
    dragOverIndex.value = null
  }
}

function onItemDrop(event: DragEvent, targetIndex: number) {
  event.preventDefault()
  // 先保存落点位置再重置状态
  const savedPosition = dragOverPosition.value
  dragOverIndex.value = null

  const data = getDragData(event)
  if (!data || data.type !== 'bookmark') return

  const bookmarkId = data.id
  const list = bookmarks.value
  const sourceIndex = list.findIndex((b) => b.id === bookmarkId)
  if (sourceIndex === -1) {
    // 从外部（其他文件夹）拖入：移动到此文件夹
    const insertIndex = savedPosition === 'before' ? targetIndex : targetIndex + 1
    bookmarkStore.moveBookmark(bookmarkId, props.folderId, insertIndex)
    return
  }

  // 同列表内重排
  let insertIndex = savedPosition === 'before' ? targetIndex : targetIndex + 1
  // 调整索引（移除源后目标偏移）
  if (sourceIndex < insertIndex) insertIndex--

  if (sourceIndex === insertIndex) return

  const reordered = [...list]
  reordered.splice(sourceIndex, 1)
  reordered.splice(insertIndex, 0, list[sourceIndex])
  bookmarkStore.reorderBookmarks(reordered.map((b) => b.id))
}
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
      <div v-if="bookmarks.length > 0" class="space-y-0.5">
        <template v-for="(bookmark, index) in bookmarks" :key="bookmark.id">
          <!-- 顶部指示线 -->
          <div
            v-if="dragOverIndex === index && dragOverPosition === 'before'"
            class="drop-indicator"
          />
          <div
            @dragover="onItemDragOver($event, index)"
            @dragleave="onItemDragLeave($event, index)"
            @drop="onItemDrop($event, index)"
          >
            <BookmarkItem
              :bookmark="bookmark"
              :favicon-url="getFaviconUrl(bookmark.url)"
              @edit="emit('edit', $event)"
            />
          </div>
          <!-- 底部指示线 -->
          <div
            v-if="dragOverIndex === index && dragOverPosition === 'after'"
            class="drop-indicator"
          />
        </template>
      </div>
    </div>
  </ScrollArea>
</template>

<style scoped>
.drop-indicator {
  height: 2px;
  margin: 0 12px;
  pointer-events: none;
  background: repeating-linear-gradient(
    90deg,
    hsl(var(--primary)) 0px,
    hsl(var(--primary)) 4px,
    transparent 4px,
    transparent 8px
  );
}
</style>
