<script setup lang="ts">
import { ref } from 'vue'
import { Plus, ChevronDown, Folder } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import BookmarkFolderMenu from './BookmarkFolderMenu.vue'
import AddBookmarkDialog from './AddBookmarkDialog.vue'
import { useBookmarkStore } from '@/stores/bookmark'
import { useTabStore } from '@/stores/tab'
import { getFaviconUrl } from '@/lib/utils'
import type { Bookmark } from '@/types'

const bookmarkStore = useBookmarkStore()
const tabStore = useTabStore()

const showAddDialog = ref(false)
const editSite = ref<{ id: string; title: string; url: string; accountId?: string } | null>(null)

/** 点击快捷网站，在新 tab 中打开 */
function openSite(site: { url: string; accountId?: string }) {
  tabStore.createTabForSite(site.url, site.accountId)
}

/** 右键删除 */
function handleContextMenu(e: MouseEvent, site: Bookmark) {
  e.preventDefault()
  if (confirm(`删除书签「${site.title}」？`)) {
    bookmarkStore.deleteBookmark(site.id)
  }
}

/** 编辑网站 */
function handleEdit(site: Bookmark) {
  editSite.value = { id: site.id, title: site.title, url: site.url, accountId: site.accountId }
  showAddDialog.value = true
}

/** 添加按钮 */
function handleAdd() {
  editSite.value = null
  showAddDialog.value = true
}

/** 对话框关闭时清理编辑状态 */
function onDialogClose(open: boolean) {
  showAddDialog.value = open
  if (!open) editSite.value = null
}
</script>

<template>
  <div class="flex items-center h-[34px] px-2 gap-1 bg-card/20 border-b border-border overflow-x-auto scrollbar-none">
    <!-- 添加按钮 -->
    <Button
      variant="ghost"
      size="icon-sm"
      class="h-7 w-7 flex-shrink-0 rounded-md hover:bg-secondary"
      @click="handleAdd"
    >
      <Plus class="w-3.5 h-3.5" />
    </Button>

    <div class="w-px h-4 bg-border flex-shrink-0" />

    <!-- 书签栏内容：书签 + 文件夹下拉 -->
    <div class="flex items-center gap-0.5">
      <template v-for="item in bookmarkStore.toolbarBookmarks" :key="item.id">
        <!-- 普通书签 -->
        <button
          class="h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded-md text-xs hover:bg-secondary transition-colors flex-shrink-0"
          @click="openSite(item)"
          @contextmenu="handleContextMenu($event, item)"
          @dblclick.prevent="handleEdit(item)"
        >
          <img :src="getFaviconUrl(item.url)" alt="" class="w-4 h-4 rounded-sm object-cover flex-shrink-0" @error="($event.target as HTMLImageElement).style.display = 'none'" />
          <span class="ml-1 truncate max-w-[60px]">{{ item.title }}</span>
        </button>
      </template>

      <!-- 其他根级文件夹（非书签栏）显示为下拉按钮 -->
      <template v-for="folder in bookmarkStore.rootFolders.filter(f => f.id !== '__bookmark_bar__')" :key="folder.id">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              class="h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded-md text-xs hover:bg-secondary transition-colors flex-shrink-0"
            >
              <Folder class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
              <span class="ml-1 truncate max-w-[60px]">{{ folder.name }}</span>
              <ChevronDown class="w-3 h-3 ml-0.5 text-muted-foreground flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="min-w-[160px]">
            <BookmarkFolderMenu :folder-id="folder.id" />
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </div>

    <!-- 添加/编辑对话框 -->
    <AddBookmarkDialog
      :open="showAddDialog"
      :edit-site="editSite"
      @update:open="onDialogClose"
    />
  </div>
</template>

<style scoped>
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
