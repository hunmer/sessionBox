<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Plus, ChevronDown, Folder, MoreHorizontal, Pencil, Trash2, FolderInput } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuSeparator
} from '@/components/ui/context-menu'
import BookmarkFolderMenu from './BookmarkFolderMenu.vue'
import AddBookmarkDialog from './AddBookmarkDialog.vue'
import { useBookmarkStore } from '@/stores/bookmark'
import { useTabStore } from '@/stores/tab'
import { getFaviconUrl } from '@/lib/utils'
import type { Bookmark } from '@/types'

const bookmarkStore = useBookmarkStore()
const tabStore = useTabStore()

const showAddDialog = ref(false)
const editSite = ref<{ id: string; title: string; url: string; pageId?: string } | null>(null)

// ====== 溢出检测 ======
const itemsContainer = ref<HTMLElement>()
const overflowStartIndex = ref(-1)
let resizeObserver: ResizeObserver | null = null

/** 溢出项列表 */
const overflowItems = computed(() => {
  if (overflowStartIndex.value <= -1) return []
  return bookmarkStore.toolbarItems.slice(overflowStartIndex.value)
})

/** 检测书签栏溢出 */
function updateOverflow() {
  const container = itemsContainer.value
  if (!container) return
  const items = container.querySelectorAll<HTMLElement>('[data-bookmark-item]')
  if (items.length === 0) {
    overflowStartIndex.value = -1
    return
  }
  const moreBtnWidth = 36
  const tolerance = 1
  // 如果"更多"按钮已经显示，需要把它占掉的宽度补回来，判断在完整宽度下是否真的溢出
  const totalAvailableWidth = container.clientWidth + (overflowStartIndex.value > -1 ? moreBtnWidth : 0)

  if (container.scrollWidth <= totalAvailableWidth + tolerance) {
    overflowStartIndex.value = -1
    return
  }

  const availableWidth = totalAvailableWidth - moreBtnWidth
  const containerLeft = container.getBoundingClientRect().left
  let firstOverflow = -1

  for (let i = 0; i < items.length; i++) {
    const itemRight = items[i].getBoundingClientRect().right - containerLeft
    if (itemRight > availableWidth + tolerance) {
      firstOverflow = i
      break
    }
  }
  overflowStartIndex.value = firstOverflow
}

// ====== 操作函数 ======

function openSite(site: { url: string; pageId?: string }) {
  tabStore.createTabForSite(site.url, site.pageId)
}

function handleEdit(site: Bookmark) {
  editSite.value = { id: site.id, title: site.title, url: site.url, pageId: site.pageId }
  showAddDialog.value = true
}

async function moveBookmark(bookmark: Bookmark, targetFolderId: string) {
  if (bookmark.folderId === targetFolderId) return
  await bookmarkStore.updateBookmark(bookmark.id, { folderId: targetFolderId })
}

function handleDelete(site: Bookmark) {
  if (confirm(`删除书签「${site.title}」？`)) {
    bookmarkStore.deleteBookmark(site.id)
  }
}

function handleAdd() {
  editSite.value = null
  showAddDialog.value = true
}

function onDialogClose(open: boolean) {
  showAddDialog.value = open
  if (!open) editSite.value = null
}

function getMoveTargetFolders(currentFolderId: string) {
  return bookmarkStore.folders.filter(f => f.id !== currentFolderId)
}

// ====== 生命周期 ======

watch(() => bookmarkStore.toolbarItems, () => {
  nextTick(updateOverflow)
})

onMounted(() => {
  if (itemsContainer.value) {
    resizeObserver = new ResizeObserver(() => nextTick(updateOverflow))
    resizeObserver.observe(itemsContainer.value)
  }
  nextTick(updateOverflow)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <div class="flex items-center h-[34px] px-2 gap-1 bg-card/20 border-b border-border">
    <Button
      variant="ghost"
      size="icon-sm"
      class="h-7 w-7 flex-shrink-0 rounded-md hover:bg-secondary"
      @click="handleAdd"
    >
      <Plus class="w-3.5 h-3.5" />
    </Button>

    <div class="w-px h-4 bg-border flex-shrink-0" />

    <!-- 书签栏：书签 + 文件夹混合排列 -->
    <div
      ref="itemsContainer"
      class="flex items-center gap-0.5 overflow-hidden min-w-0 flex-shrink"
      style="flex: 1 1 0%"
    >
      <template
        v-for="item in bookmarkStore.toolbarItems"
        :key="item.data.id"
      >
        <!-- 书签项 -->
        <ContextMenu v-if="item.type === 'bookmark'">
          <ContextMenuTrigger as-child>
            <button
              data-bookmark-item
              class="h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded-md text-xs hover:bg-secondary transition-colors flex-shrink-0"
              @click="openSite(item.data)"
              @dblclick.prevent="handleEdit(item.data)"
            >
              <img
                :src="getFaviconUrl(item.data.url)"
                alt=""
                class="w-4 h-4 rounded-sm object-cover flex-shrink-0"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              >
              <span class="ml-1 truncate max-w-[60px]">{{ item.data.title }}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent class="min-w-[140px]">
            <ContextMenuItem
              class="text-xs"
              @click="handleEdit(item.data)"
            >
              <Pencil class="w-3.5 h-3.5 mr-2" />
              编辑
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger class="text-xs">
                <FolderInput class="w-3.5 h-3.5 mr-2" />
                移动到
              </ContextMenuSubTrigger>
              <ContextMenuSubContent class="min-w-[160px]">
                <ContextMenuItem
                  v-for="folder in getMoveTargetFolders(item.data.folderId)"
                  :key="folder.id"
                  class="text-xs"
                  @click="moveBookmark(item.data, folder.id)"
                >
                  <Folder class="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                  {{ folder.name }}
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
            <ContextMenuItem
              class="text-xs text-destructive focus:text-destructive"
              @click="handleDelete(item.data)"
            >
              <Trash2 class="w-3.5 h-3.5 mr-2" />
              删除
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <!-- 文件夹项 -->
        <DropdownMenu v-else>
          <DropdownMenuTrigger as-child>
            <button
              data-bookmark-item
              class="h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded-md text-xs hover:bg-secondary transition-colors flex-shrink-0"
            >
              <Folder class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
              <span class="ml-1 truncate max-w-[60px]">{{ item.data.name }}</span>
              <ChevronDown class="w-3 h-3 ml-0.5 text-muted-foreground flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            class="min-w-[160px]"
          >
            <BookmarkFolderMenu :folder-id="item.data.id" />
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </div>

    <!-- 溢出更多按钮 -->
    <DropdownMenu v-if="overflowItems.length > 0">
      <DropdownMenuTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          class="h-7 w-7 flex-shrink-0 rounded-md hover:bg-secondary"
        >
          <MoreHorizontal class="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        class="min-w-[180px]"
      >
        <template
          v-for="item in overflowItems"
          :key="item.data.id"
        >
          <DropdownMenuSub v-if="item.type === 'folder'">
            <DropdownMenuSubTrigger class="text-xs">
              <Folder class="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <span class="truncate">{{ item.data.name }}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent class="min-w-[160px]">
              <BookmarkFolderMenu :folder-id="item.data.id" />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            v-else
            class="text-xs"
            @click="openSite(item.data)"
          >
            <img
              :src="getFaviconUrl(item.data.url)"
              alt=""
              class="w-3.5 h-3.5 rounded-sm mr-1.5"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            >
            <span class="truncate">{{ item.data.title }}</span>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>

    <AddBookmarkDialog
      :open="showAddDialog"
      :edit-site="editSite"
      @update:open="onDialogClose"
    />
  </div>
</template>
