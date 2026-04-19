<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUpdate } from 'vue'
import { ArrowLeft, ArrowRight, RotateCw, Loader2, Code2, Star, KeyRound, CornerDownLeft, ZoomIn, ZoomOut, RotateCcw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useTabStore } from '@/stores/tab'
import { useBookmarkStore } from '@/stores/bookmark'
import { getFaviconUrl } from '@/lib/utils'
import AddBookmarkDialog from '@/components/bookmarks/AddBookmarkDialog.vue'
import PasswordPopover from './PasswordPopover.vue'

interface SearchEngine {
  id: string
  name: string
  url: string
  icon?: string
}

const api = window.api
const tabStore = useTabStore()
const bookmarkStore = useBookmarkStore()
const urlInput = ref('')
const isFocused = ref(false)
const activeIndex = ref(-1)
const triggerRef = ref<HTMLElement | null>(null)
const popoverWidth = ref(0)

function syncWidth() {
  if (triggerRef.value) {
    popoverWidth.value = triggerRef.value.offsetWidth
  }
}

onMounted(syncWidth)
onBeforeUpdate(syncWidth)

// 搜索引擎候选
const engines = ref<SearchEngine[]>([])
const defaultEngineId = ref('')

/** 判断输入是否像 URL（含 . 或 / 或 ://） */
function looksLikeUrl(text: string): boolean {
  return /[\.:\/]/.test(text) && !text.includes(' ')
}

/** 输入内容是否触发搜索候选 */
const showSearchSuggestion = computed(() => {
  const text = urlInput.value.trim()
  return isFocused.value && text.length > 0 && !looksLikeUrl(text)
})

/** 搜索候选列表：默认引擎排第一 */
const searchCandidates = computed(() => {
  if (!showSearchSuggestion.value || !engines.value.length) return []
  const text = urlInput.value.trim()
  const sorted = [...engines.value]
  const defaultIdx = sorted.findIndex((e) => e.id === defaultEngineId.value)
  if (defaultIdx > 0) {
    const [def] = sorted.splice(defaultIdx, 1)
    sorted.unshift(def)
  }
  return sorted.map((engine) => ({
    engine,
    url: engine.url.replace('%s', encodeURIComponent(text)),
  }))
})

// 候选列表变化时重置索引
watch(searchCandidates, () => {
  activeIndex.value = -1
})

async function loadSearchEngines() {
  engines.value = await api.searchEngine.list()
  defaultEngineId.value = await api.searchEngine.getDefault()
}

/** 同步当前 tab URL 到输入框 */
watch(() => tabStore.activeTab?.url, (url) => {
  if (!isFocused.value) {
    urlInput.value = url ?? ''
  }
}, { immediate: true })

const navState = computed(() => tabStore.activeNavState)

function goBack() {
  if (tabStore.activeTabId) tabStore.goBack(tabStore.activeTabId)
}

function goForward() {
  if (tabStore.activeTabId) tabStore.goForward(tabStore.activeTabId)
}

function reload() {
  if (tabStore.activeTabId) tabStore.reload(tabStore.activeTabId)
}

function openDevTools() {
  if (tabStore.activeTabId) tabStore.openDevTools(tabStore.activeTabId)
}

function navigate() {
  const text = urlInput.value.trim()
  if (!text || !tabStore.activeTabId) return
  // 内部页面直接导航
  if (text.startsWith('sessionbox://')) {
    tabStore.navigate(tabStore.activeTabId, text)
    return
  }
  // 已有协议或像域名 → 直接导航
  if (text.match(/^(https?|file):\/\//) || looksLikeUrl(text)) {
    const finalUrl = text.match(/^(https?|file):\/\//) ? text : `https://${text}`
    tabStore.navigate(tabStore.activeTabId, finalUrl)
    return
  }
  // 非 URL 文本 → 用默认搜索引擎搜索
  const engine = engines.value.find((e) => e.id === defaultEngineId.value) || engines.value[0]
  if (engine) {
    const searchUrl = engine.url.replace('%s', encodeURIComponent(text))
    tabStore.navigate(tabStore.activeTabId, searchUrl)
  }
}

/** 选择搜索引擎候选 */
function selectSearchCandidate(url: string) {
  if (!tabStore.activeTabId) return
  isFocused.value = false
  activeIndex.value = -1
  tabStore.navigate(tabStore.activeTabId, url)
}

function onFocus() {
  isFocused.value = true
  const input = document.querySelector<HTMLInputElement>('.toolbar-url-input input')
  input?.select()
}

function onBlur() {
  setTimeout(() => {
    isFocused.value = false
    activeIndex.value = -1
    urlInput.value = tabStore.activeTab?.url ?? ''
  }, 150)
}

/** 键盘导航 */
function handleInputKeydown(e: KeyboardEvent) {
  const list = searchCandidates.value

  // Enter 键始终可触发导航，不依赖候选列表是否为空
  if (e.key === 'Enter') {
    if (list.length && activeIndex.value >= 0 && activeIndex.value < list.length) {
      e.preventDefault()
      selectSearchCandidate(list[activeIndex.value].url)
    } else {
      navigate()
    }
    return
  }

  if (!list.length) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % list.length
    scrollIntoView(activeIndex.value)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = activeIndex.value <= 0 ? list.length - 1 : activeIndex.value - 1
    scrollIntoView(activeIndex.value)
  } else if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % list.length
    scrollIntoView(activeIndex.value)
  } else if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault()
    activeIndex.value = activeIndex.value <= 0 ? list.length - 1 : activeIndex.value - 1
    scrollIntoView(activeIndex.value)
  } else if (e.key === 'Escape') {
    isFocused.value = false
    activeIndex.value = -1
  }
}

/** 滚动到可见区域 */
function scrollIntoView(index: number) {
  nextTick(() => {
    const el = document.querySelector(`[data-suggest-idx="${index}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  })
}

/** 当前 URL 是否已收藏 */
const isBookmarked = computed(() => {
  const url = tabStore.activeTab?.url
  if (!url) return false
  return bookmarkStore.isBookmarked(url)
})

// 收藏对话框
const bookmarkDialogOpen = ref(false)
const editSite = ref<{ id: string; title: string; url: string; pageId?: string } | null>(null)

// 密码 popover
const passwordPopoverOpen = ref(false)

/** 当前 tab 关联的页面 ID */
const activePageId = computed(() => tabStore.activeTab?.pageId)

/** 点击收藏按钮：已收藏则直接取消，否则新增 */
function toggleBookmark() {
  const url = tabStore.activeTab?.url
  if (!url) return

  if (isBookmarked.value) {
    const bookmark = bookmarkStore.findBookmarkByUrl(url)
    if (bookmark) {
      bookmarkStore.deleteBookmark(bookmark.id)
    }
  } else {
    editSite.value = null
    bookmarkDialogOpen.value = true
  }
}

// 初始化加载搜索引擎
loadSearchEngines()

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
  <div class="flex items-center gap-2 h-[42px] px-2.5 border-b border-border bg-card/50">
    <!-- 后退 -->
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      :disabled="!navState.canGoBack"
      @click="goBack"
    >
      <ArrowLeft class="w-4 h-4" />
    </Button>

    <!-- 前进 -->
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      :disabled="!navState.canGoForward"
      @click="goForward"
    >
      <ArrowRight class="w-4 h-4" />
    </Button>

    <!-- 刷新/加载中 -->
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      @click="reload"
    >
      <Loader2
        v-if="navState.isLoading"
        class="w-4 h-4 animate-spin"
      />
      <RotateCw
        v-else
        class="w-4 h-4"
      />
    </Button>

    <!-- 地址栏 + 搜索候选 -->
    <Popover :open="showSearchSuggestion">
      <PopoverTrigger as-child>
        <div
          ref="triggerRef"
          class="relative flex-1 flex items-center"
        >
          <Button
            variant="ghost"
            size="icon"
            class="absolute left-0.5 h-6 w-6 z-10 rounded-sm"
            :class="isBookmarked ? 'text-yellow-500' : 'text-muted-foreground'"
            :disabled="!tabStore.activeTabId"
            @click="toggleBookmark"
          >
            <Star
              class="w-3.5 h-3.5"
              :fill="isBookmarked ? 'currentColor' : 'none'"
            />
          </Button>
          <Input
            v-model="urlInput"
            class="toolbar-url-input flex-1 h-7 text-xs bg-secondary/60 border-transparent focus:border-ring pl-7"
            placeholder="输入网址或搜索..."
            :disabled="!tabStore.activeTabId"
            @keydown="handleInputKeydown"
            @focus="onFocus"
            @blur="onBlur"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        :side-offset="4"
        align="start"
        :style="{ width: popoverWidth + 'px' }"
        class="p-1"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
      >
        <button
          v-for="({ engine, url }, idx) in searchCandidates"
          :key="engine.id"
          :data-suggest-idx="idx"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs transition-colors"
          :class="idx === activeIndex ? 'bg-accent' : 'hover:bg-accent/50'"
          @mousedown.prevent="selectSearchCandidate(url)"
          @mouseenter="activeIndex = idx"
        >
          <img
            :src="getFaviconUrl(engine.url)"
            :alt="engine.name"
            class="w-3.5 h-3.5 shrink-0 rounded-sm object-contain"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          >
          <span class="truncate flex-1 text-left">
            <span class="text-muted-foreground">{{ engine.name }}</span>
            {{ urlInput.trim() }}
          </span>
          <CornerDownLeft
            v-if="idx === activeIndex"
            class="w-3 h-3 shrink-0 text-muted-foreground"
          />
        </button>
      </PopoverContent>
    </Popover>

    <!-- 开发者工具 -->
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      :disabled="!tabStore.activeTabId"
      @click="openDevTools"
    >
      <Code2 class="w-4 h-4" />
    </Button>

    <!-- 缩放控制 -->
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          :disabled="!tabStore.activeTabId"
        >
          <ZoomIn class="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        :side-offset="4"
        align="end"
        class="min-w-[140px]"
      >
        <DropdownMenuItem
          class="flex items-center gap-2 cursor-pointer"
          @click="handleZoomIn"
        >
          <ZoomIn class="w-4 h-4" />
          <span>放大</span>
          <span class="ml-auto text-xs text-muted-foreground">Ctrl++</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          class="flex items-center gap-2 cursor-pointer"
          @click="handleZoomOut"
        >
          <ZoomOut class="w-4 h-4" />
          <span>缩小</span>
          <span class="ml-auto text-xs text-muted-foreground">Ctrl+-</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          class="flex items-center justify-center cursor-pointer font-medium"
          @click="handleZoomReset"
        >
          <RotateCcw class="w-4 h-4 mr-2" />
          <span>重置 ({{ zoomPercentage }}%)</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <!-- 密码/笔记 -->
    <Popover v-model:open="passwordPopoverOpen">
      <PopoverTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          :disabled="!tabStore.activeTabId"
        >
          <KeyRound class="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        :side-offset="4"
        class="w-80 p-0"
      >
        <PasswordPopover @open-full="passwordPopoverOpen = false" />
      </PopoverContent>
    </Popover>

    <!-- 扩展图标列表已移至右侧面板 -->
  </div>

  <!-- 收藏对话框 -->
  <AddBookmarkDialog
    v-model:open="bookmarkDialogOpen"
    :edit-site="editSite"
    :default-page-id="activePageId"
    :default-url="tabStore.activeTab?.url"
    :default-title="tabStore.activeTab?.title"
  />
</template>
