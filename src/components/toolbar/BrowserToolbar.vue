<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ArrowLeft, ArrowRight, RotateCw, Loader2, Code2, Star, KeyRound, Search, CornerDownLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  const url = urlInput.value.trim()
  if (!url || !tabStore.activeTabId) return
  // 内部页面直接导航，不补全协议
  if (url.startsWith('sessionbox://')) {
    tabStore.navigate(tabStore.activeTabId, url)
    return
  }
  // 自动补全协议（file:// 和 http/https 保持原样）
  const finalUrl = url.match(/^(https?|file):\/\//) ? url : `https://${url}`
  tabStore.navigate(tabStore.activeTabId, finalUrl)
}

/** 选择搜索引擎候选 */
function selectSearchCandidate(url: string) {
  if (!tabStore.activeTabId) return
  isFocused.value = false
  tabStore.navigate(tabStore.activeTabId, url)
}

function onFocus() {
  isFocused.value = true
  // 聚焦时全选
  const input = document.querySelector<HTMLInputElement>('.toolbar-url-input input')
  input?.select()
}

function onBlur() {
  // 延迟关闭，以便点击候选项时能先触发
  setTimeout(() => {
    isFocused.value = false
    urlInput.value = tabStore.activeTab?.url ?? ''
  }, 150)
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
</script>

<template>
  <div class="flex items-center gap-2 h-[42px] px-2.5 border-b border-border bg-card/50">
    <!-- 后退 -->
    <Button
      variant="ghost" size="icon" class="h-7 w-7"
      :disabled="!navState.canGoBack"
      @click="goBack"
    >
      <ArrowLeft class="w-4 h-4" />
    </Button>

    <!-- 前进 -->
    <Button
      variant="ghost" size="icon" class="h-7 w-7"
      :disabled="!navState.canGoForward"
      @click="goForward"
    >
      <ArrowRight class="w-4 h-4" />
    </Button>

    <!-- 刷新/加载中 -->
    <Button variant="ghost" size="icon" class="h-7 w-7" @click="reload">
      <Loader2 v-if="navState.isLoading" class="w-4 h-4 animate-spin" />
      <RotateCw v-else class="w-4 h-4" />
    </Button>

    <!-- 地址栏 + 搜索候选 -->
    <Popover :open="showSearchSuggestion">
      <PopoverTrigger as-child>
        <div class="relative flex-1 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            class="absolute left-0.5 h-6 w-6 z-10 rounded-sm"
            :class="isBookmarked ? 'text-yellow-500' : 'text-muted-foreground'"
            :disabled="!tabStore.activeTabId"
            @click="toggleBookmark"
          >
            <Star class="w-3.5 h-3.5" :fill="isBookmarked ? 'currentColor' : 'none'" />
          </Button>
          <Input
            v-model="urlInput"
            class="toolbar-url-input flex-1 h-7 text-xs bg-secondary/60 border-transparent focus:border-ring pl-7"
            placeholder="输入网址或搜索..."
            :disabled="!tabStore.activeTabId"
            @keydown.enter="navigate"
            @focus="onFocus"
            @blur="onBlur"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        :side-offset="4"
        align="start"
        class="w-[var(--radix-popover-trigger-width)] p-1"
      >
        <button
          v-for="({ engine, url }, idx) in searchCandidates"
          :key="engine.id"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs hover:bg-accent transition-colors"
          :class="idx === 0 && 'bg-accent/50'"
          @mousedown.prevent="selectSearchCandidate(url)"
        >
          <img
            :src="getFaviconUrl(engine.url)"
            :alt="engine.name"
            class="w-3.5 h-3.5 shrink-0 rounded-sm object-contain"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <span class="truncate flex-1 text-left">
            <span class="text-muted-foreground">{{ engine.name }}</span>
            {{ urlInput.trim() }}
          </span>
          <CornerDownLeft v-if="idx === 0" class="w-3 h-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverContent>
    </Popover>

    <!-- 开发者工具 -->
    <Button
      variant="ghost" size="icon" class="h-7 w-7"
      :disabled="!tabStore.activeTabId"
      @click="openDevTools"
    >
      <Code2 class="w-4 h-4" />
    </Button>

    <!-- 密码/笔记 -->
    <Popover v-model:open="passwordPopoverOpen">
      <PopoverTrigger as-child>
        <Button
          variant="ghost" size="icon" class="h-7 w-7"
          :disabled="!tabStore.activeTabId"
        >
          <KeyRound class="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" :side-offset="4" class="w-80 p-0">
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
