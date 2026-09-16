<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  PanelTop,
  PanelLeft,
  FolderOpen,
  User,
  Bookmark,
  Check,
  MoreHorizontal,
  MoreVertical,
  Star,
  KeyRound,
  Code2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Columns2,
  EyeOff
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useTabStore, type TabGroupMode } from '@/stores/tab'
import { useBookmarkStore } from '@/stores/bookmark'
import AddBookmarkDialog from '@/components/bookmarks/AddBookmarkDialog.vue'
import PasswordPopover from '@/components/toolbar/PasswordPopover.vue'
import SplitMenuContent from './SplitMenuContent.vue'

const props = defineProps<{
  direction: 'horizontal' | 'vertical'
  immersiveMode?: boolean
}>()

const emit = defineEmits<{
  'update:immersive-mode': [value: boolean]
}>()

const tabStore = useTabStore()
const bookmarkStore = useBookmarkStore()

function toggleImmersiveMode() {
  emit('update:immersive-mode', !props.immersiveMode)
}

function setGroupMode(mode: TabGroupMode) {
  tabStore.setTabGroupMode(tabStore.tabGroupMode === mode ? 'none' : mode)
}

// ====== 收藏 ======
const isBookmarked = computed(() => {
  const url = tabStore.activeTab?.url
  if (!url) return false
  return bookmarkStore.isBookmarked(url)
})

const bookmarkDialogOpen = ref(false)

/** 点击收藏项：已收藏则直接取消，否则打开新增对话框 */
function toggleBookmark() {
  const url = tabStore.activeTab?.url
  if (!url) return

  if (isBookmarked.value) {
    const bookmark = bookmarkStore.findBookmarkByUrl(url)
    if (bookmark) {
      bookmarkStore.deleteBookmark(bookmark.id)
    }
  } else {
    bookmarkDialogOpen.value = true
  }
}

// ====== 密码/笔记 ======
const passwordDialogOpen = ref(false)

// ====== 开发者工具 ======
function openDevTools() {
  if (tabStore.activeTabId) tabStore.openDevTools(tabStore.activeTabId)
}

// ====== 缩放控制 ======
const zoomPercentage = computed(() => {
  const level = tabStore.activeZoomLevel
  // Electron zoom level 转百分比：level 0 = 100%，每级约 ±20%
  return Math.round(100 * Math.pow(1.2, level))
})

function handleZoomIn() {
  if (tabStore.activeTabId) tabStore.zoomIn(tabStore.activeTabId)
}

function handleZoomOut() {
  if (tabStore.activeTabId) tabStore.zoomOut(tabStore.activeTabId)
}

function handleZoomReset() {
  if (tabStore.activeTabId) tabStore.zoomReset(tabStore.activeTabId)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon-sm"
        class="h-7 w-7 rounded-full"
        :class="{ 'flex-shrink-0': direction === 'horizontal' }"
      >
        <MoreHorizontal
          v-if="direction === 'horizontal'"
          class="w-3.5 h-3.5"
        />
        <MoreVertical
          v-else
          class="w-3.5 h-3.5"
        />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      class="w-48"
    >
      <DropdownMenuItem
        class="cursor-pointer"
        @click="tabStore.toggleLayout()"
      >
        <PanelTop
          v-if="direction === 'vertical'"
          class="size-4 mr-2"
        />
        <PanelLeft
          v-else
          class="size-4 mr-2"
        />
        <span class="flex-1">{{ direction === 'vertical' ? '水平布局' : '侧边栏布局' }}</span>
        <Check
          v-if="(direction === 'vertical' && tabStore.tabLayout === 'horizontal') || (direction === 'horizontal' && tabStore.tabLayout === 'vertical')"
          class="size-4 text-primary"
        />
      </DropdownMenuItem>
      <DropdownMenuItem
        class="cursor-pointer"
        @click="setGroupMode('group')"
      >
        <FolderOpen class="size-4 mr-2" />
        <span class="flex-1">按分组名称分组</span>
        <Check
          v-if="tabStore.tabGroupMode === 'group'"
          class="size-4 text-primary"
        />
      </DropdownMenuItem>
      <DropdownMenuItem
        class="cursor-pointer"
        @click="setGroupMode('account')"
      >
        <User class="size-4 mr-2" />
        <span class="flex-1">按容器名称分组</span>
        <Check
          v-if="tabStore.tabGroupMode === 'account'"
          class="size-4 text-primary"
        />
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        class="cursor-pointer"
        @click="tabStore.toggleBookmarkBar()"
      >
        <Bookmark class="size-4 mr-2" />
        <span class="flex-1">快捷网站栏</span>
        <Check
          v-if="tabStore.bookmarkBarVisible"
          class="size-4 text-primary"
        />
      </DropdownMenuItem>
      <DropdownMenuItem
        class="cursor-pointer"
        :disabled="!tabStore.activeTabId"
        @click="toggleBookmark"
      >
        <Star
          class="size-4 mr-2"
          :class="isBookmarked && 'text-yellow-500 fill-yellow-500'"
        />
        <span class="flex-1">{{ isBookmarked ? '取消收藏' : '收藏此页' }}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        class="cursor-pointer"
        :disabled="!tabStore.activeTabId"
        @click="passwordDialogOpen = true"
      >
        <KeyRound class="size-4 mr-2" />
        <span class="flex-1">密码/笔记</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        class="cursor-pointer"
        :disabled="!tabStore.activeTabId"
        @click="openDevTools"
      >
        <Code2 class="size-4 mr-2" />
        <span class="flex-1">开发者工具</span>
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          class="cursor-pointer"
          :disabled="!tabStore.activeTabId"
        >
          <ZoomIn class="size-4 mr-2" />
          <span class="flex-1">缩放</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="min-w-[150px]">
          <DropdownMenuItem
            class="cursor-pointer"
            @click="handleZoomIn"
          >
            <ZoomIn class="size-4 mr-2" />
            <span class="flex-1">放大</span>
            <span class="text-xs text-muted-foreground">Ctrl++</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            class="cursor-pointer"
            @click="handleZoomOut"
          >
            <ZoomOut class="size-4 mr-2" />
            <span class="flex-1">缩小</span>
            <span class="text-xs text-muted-foreground">Ctrl+-</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            class="cursor-pointer"
            @click="handleZoomReset"
          >
            <RotateCcw class="size-4 mr-2" />
            <span class="flex-1">重置 ({{ zoomPercentage }}%)</span>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger class="cursor-pointer">
          <Columns2 class="size-4 mr-2" />
          <span class="flex-1">分屏</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="w-48">
          <SplitMenuContent />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem
        class="cursor-pointer"
        @click="toggleImmersiveMode"
      >
        <EyeOff class="size-4 mr-2" />
        <span class="flex-1">沉浸模式</span>
        <Check
          v-if="immersiveMode"
          class="size-4 text-primary"
        />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <!-- 收藏对话框 -->
  <AddBookmarkDialog
    v-model:open="bookmarkDialogOpen"
    :edit-site="null"
    :default-page-id="tabStore.activeTab?.pageId"
    :default-url="tabStore.activeTab?.url"
    :default-title="tabStore.activeTab?.title"
  />

  <!-- 密码/笔记对话框 -->
  <Dialog v-model:open="passwordDialogOpen">
    <DialogContent class="w-80 p-0 gap-0">
      <DialogTitle class="sr-only">
        密码/笔记
      </DialogTitle>
      <PasswordPopover @open-full="passwordDialogOpen = false" />
    </DialogContent>
  </Dialog>
</template>
