<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Plus, ChevronDown, Folder, MoreHorizontal, Pencil, Trash2, FolderInput } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu'
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
const editSite = ref<{ id: string; title: string; url: string; accountId?: string } | null>(null)

// ====== 溢出检测 ======
const itemsContainer = ref<HTMLElement>()
const overflowStartIndex = ref(-1)
let resizeObserver: ResizeObserver | null = null

/** 溢出的书签列表 */
const overflowBookmarks = computed(() => {
  if (overflowStartIndex.value <= -1) return []
  return bookmarkStore.toolbarBookmarks.slice(overflowStartIndex.value)
})

/** 检测书签栏溢出 */
function updateOverflow() {
  const container = itemsContainer.value
  if (!container) return
  const items = container.querySelectorAll('[data-bookmark-item]')
  if (items.length === 0) {
    overflowStartIndex.value = -1
    return
  }
  // 预留"更多"按钮的宽度
  const moreBtnWidth = 36
  const availableWidth = container.clientWidth - moreBtnWidth
  let firstOverflow = -1
  for (let i = 0; i < items.length; i++) {
    const el = items[i] as HTMLElement
    if (el.offsetLeft + el.offsetWidth > availableWidth) {
      firstOverflow = i
      break
    }
  }
  overflowStartIndex.value = firstOverflow
}

// ====== 操作函数 ======

/** 点击快捷网站，在新 tab 中打开 */
function openSite(site: { url: string; accountId?: string }) {
  tabStore.createTabForSite(site.url, site.accountId)
}

/** 编辑书签 */
function handleEdit(site: Bookmark) {
  editSite.value = { id: site.id, title: site.title, url: site.url, accountId: site.accountId }
  showAddDialog.value = true
}

/** 移动书签到指定文件夹 */
async function moveBookmark(bookmark: Bookmark, targetFolderId: string) {
  if (bookmark.folderId === targetFolderId) return
  await bookmarkStore.updateBookmark(bookmark.id, { folderId: targetFolderId })
}

/** 删除书签 */
function handleDelete(site: Bookmark) {
  if (confirm(`删除书签「${site.title}」？`)) {
    bookmarkStore.deleteBookmark(site.id)
  }
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

/** 获取可移动的目标文件夹列表 */
function getMoveTargetFolders(currentFolderId: string) {
  return bookmarkStore.folders.filter(f => f.id !== currentFolderId)
}

// ====== 生命周期 ======

// 书签列表变化时重新计算溢出
watch(() => bookmarkStore.toolbarBookmarks, () => {
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

    <!-- 书签项容器（溢出隐藏） -->
    <div ref="itemsContainer" class="flex items-center gap-0.5 overflow-hidden min-w-0" style="flex: 1 1 0%">
      <template v-for="item in bookmarkStore.toolbarBookmarks" :key="item.id">
        <ContextMenu>
          <ContextMenuTrigger as-child>
            <button
              data-bookmark-item
              class="h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded-md text-xs hover:bg-secondary transition-colors flex-shrink-0"
              @click="openSite(item)"
              @dblclick.prevent="handleEdit(item)"
            >
              <img :src="getFaviconUrl(item.url)" alt="" class="w-4 h-4 rounded-sm object-cover flex-shrink-0" @error="($event.target as HTMLImageElement).style.display = 'none'" />
              <span class="ml-1 truncate max-w-[60px]">{{ item.title }}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent class="min-w-[140px]">
            <ContextMenuItem class="text-xs" @click="handleEdit(item)">
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
                  v-for="folder in getMoveTargetFolders(item.folderId)"
                  :key="folder.id"
                  class="text-xs"
                  @click="moveBookmark(item, folder.id)"
                >
                  <Folder class="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                  {{ folder.name }}
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
            <ContextMenuItem class="text-xs text-destructive focus:text-destructive" @click="handleDelete(item)">
              <Trash2 class="w-3.5 h-3.5 mr-2" />
              删除
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </template>
    </div>

    <!-- 更多按钮（显示溢出书签） -->
    <DropdownMenu v-if="overflowBookmarks.length > 0">
      <DropdownMenuTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          class="h-7 w-7 flex-shrink-0 rounded-md hover:bg-secondary"
        >
          <MoreHorizontal class="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="min-w-[180px]">
        <DropdownMenuItem
          v-for="item in overflowBookmarks"
          :key="item.id"
          class="text-xs"
          @click="openSite(item)"
        >
          <img
            :src="getFaviconUrl(item.url)"
            alt=""
            class="w-3.5 h-3.5 rounded-sm mr-1.5"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <span class="truncate">{{ item.title }}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

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

    <!-- 添加/编辑对话框 -->
    <AddBookmarkDialog
      :open="showAddDialog"
      :edit-site="editSite"
      @update:open="onDialogClose"
    />
  </div>
</template>
