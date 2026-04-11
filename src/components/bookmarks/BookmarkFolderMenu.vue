<script setup lang="ts">
import { Folder } from 'lucide-vue-next'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import BookmarkFolderMenu from './BookmarkFolderMenu.vue'
import { useBookmarkStore } from '@/stores/bookmark'
import { useTabStore } from '@/stores/tab'
import { getFaviconUrl } from '@/lib/utils'
import type { Bookmark, BookmarkFolder } from '@/types'

defineProps<{
  folderId: string
}>()

const bookmarkStore = useBookmarkStore()
const tabStore = useTabStore()

/** 点击书签，在新 tab 中打开 */
function openSite(bookmark: Bookmark) {
  tabStore.createTabForSite(bookmark.url, bookmark.accountId)
}
</script>

<template>
  <!-- 渲染当前文件夹下的直接书签 -->
  <DropdownMenuItem
    v-for="bookmark in bookmarkStore.getBookmarksByFolder(folderId)"
    :key="bookmark.id"
    class="text-xs"
    @click="openSite(bookmark)"
  >
    <img
      :src="getFaviconUrl(bookmark.url)"
      alt=""
      class="w-3.5 h-3.5 rounded-sm mr-1.5"
      @error="($event.target as HTMLImageElement).style.display = 'none'"
    />
    <span class="truncate">{{ bookmark.title }}</span>
  </DropdownMenuItem>

  <!-- 渲染子文件夹为嵌套子菜单 -->
  <DropdownMenuSub
    v-for="subFolder in bookmarkStore.getChildFolders(folderId)"
    :key="subFolder.id"
  >
    <DropdownMenuSubTrigger class="text-xs">
      <Folder class="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
      <span class="truncate">{{ subFolder.name }}</span>
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent class="min-w-[160px]">
      <BookmarkFolderMenu :folder-id="subFolder.id" />
    </DropdownMenuSubContent>
  </DropdownMenuSub>

  <!-- 空状态 -->
  <div
    v-if="
      bookmarkStore.getBookmarksByFolder(folderId).length === 0 &&
      bookmarkStore.getChildFolders(folderId).length === 0
    "
    class="px-2 py-1.5 text-xs text-muted-foreground"
  >
    暂无书签
  </div>
</template>
