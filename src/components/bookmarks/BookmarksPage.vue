<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, FolderPlus, Search } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import FolderTree from './FolderTree.vue'
import BookmarkList from './BookmarkList.vue'
import BookmarkFolderDialog from './BookmarkFolderDialog.vue'
import BookmarkDialog from './BookmarkDialog.vue'
import { useBookmarkStore } from '@/stores/bookmark'

const bookmarkStore = useBookmarkStore()

const selectedFolderId = ref<string>('__bookmark_bar__')
const searchQuery = ref('')

// 文件夹对话框
const folderDialogOpen = ref(false)
const editingFolderId = ref<string | null>(null)

// 书签对话框
const bookmarkDialogOpen = ref(false)
const editingBookmarkId = ref<string | null>(null)

function handleAddFolder(parentId: string | null = null) {
  editingFolderId.value = null
  folderDialogOpen.value = true
}

function handleEditFolder(folderId: string) {
  editingFolderId.value = folderId
  folderDialogOpen.value = true
}

function handleAddBookmark() {
  editingBookmarkId.value = null
  bookmarkDialogOpen.value = true
}

function handleEditBookmark(bookmarkId: string) {
  editingBookmarkId.value = bookmarkId
  bookmarkDialogOpen.value = true
}

function handleFolderDialogClose() {
  folderDialogOpen.value = false
  editingFolderId.value = null
}

function handleBookmarkDialogClose() {
  bookmarkDialogOpen.value = false
  editingBookmarkId.value = null
}
</script>

<template>
  <div class="h-full bg-background text-foreground">
    <!-- 顶部工具栏 -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-border">
      <h2 class="text-sm font-semibold flex-shrink-0">书签管理</h2>
      <div class="flex-1" />
      <div class="relative w-48">
        <Search class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          class="h-7 text-xs pl-7"
          placeholder="搜索书签..."
        />
      </div>
      <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="handleAddFolder()">
        <FolderPlus class="w-3.5 h-3.5" />
        新建文件夹
      </Button>
      <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="handleAddBookmark()">
        <Plus class="w-3.5 h-3.5" />
        添加书签
      </Button>
    </div>

    <!-- 左右分栏 -->
    <ResizablePanelGroup direction="horizontal" class="h-[calc(100%-40px)]">
      <!-- 左侧文件夹树 -->
      <ResizablePanel :default-size="220" :min-size="160" :max-size="360" size-unit="px">
        <ScrollArea class="h-full">
          <FolderTree
            v-model:selected-folder-id="selectedFolderId"
            :search-query="searchQuery"
            @add-folder="handleAddFolder"
            @edit-folder="handleEditFolder"
          />
        </ScrollArea>
      </ResizablePanel>

      <ResizableHandle />

      <!-- 右侧书签列表 -->
      <ResizablePanel>
        <BookmarkList
          :folder-id="selectedFolderId"
          :search-query="searchQuery"
          @edit="handleEditBookmark"
          @add-bookmark="handleAddBookmark"
        />
      </ResizablePanel>
    </ResizablePanelGroup>

    <!-- 文件夹对话框 -->
    <BookmarkFolderDialog
      :open="folderDialogOpen"
      :folder-id="editingFolderId"
      :parent-id="selectedFolderId"
      @update:open="handleFolderDialogClose"
    />

    <!-- 书签对话框 -->
    <BookmarkDialog
      :open="bookmarkDialogOpen"
      :bookmark-id="editingBookmarkId"
      :folder-id="selectedFolderId"
      @update:open="handleBookmarkDialogClose"
    />
  </div>
</template>
