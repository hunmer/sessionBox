<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Search, Snowflake, Globe, Bookmark, History, Download, Layers } from 'lucide-vue-next'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
import { useTabStore } from '@/stores/tab'
import { useWorkspaceStore } from '@/stores/workspace'
import { getDomain, getFaviconUrl } from '@/lib/utils'
import type { Tab } from '@/types'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const containerStore = useContainerStore()
const pageStore = usePageStore()
const tabStore = useTabStore()
const workspaceStore = useWorkspaceStore()

const api = window.api

const selectedWorkspaceId = ref<string>('__all__')
const screenshots = ref<Map<string, string | null>>(new Map())
const loading = ref(false)
const searchQuery = ref('')
const gridRef = ref<HTMLElement | null>(null)
const focusedIndex = ref(-1)

// ====== 计算属性 ======

/** 工作区列表（含"全部"选项） */
const workspaceList = computed(() => {
  return [
    { id: '__all__', title: '全部', color: '', isDefault: false },
    ...workspaceStore.sortedWorkspaces
  ]
})

/** 根据工作区 ID 获取该工作区下的标签数量 */
function getTabCountForWorkspace(wsId: string): number {
  if (wsId === '__all__') return tabStore.sortedTabs.length
  const pageIds = new Set(
    pageStore.pages
      .filter((p) => {
        const group = containerStore.getGroup(p.groupId)
        return (group?.workspaceId || '__default__') === wsId
      })
      .map((p) => p.id)
  )
  return tabStore.sortedTabs.filter((t) => pageIds.has(t.pageId) || !t.pageId).length
}

/** 根据选择的工作区过滤标签 */
const displayTabs = computed(() => {
  let tabs = tabStore.sortedTabs

  if (selectedWorkspaceId.value !== '__all__') {
    const wsId = selectedWorkspaceId.value
    const pageIds = new Set(
      pageStore.pages
        .filter((p) => {
          const group = containerStore.getGroup(p.groupId)
          return (group?.workspaceId || '__default__') === wsId
        })
        .map((p) => p.id)
    )
    tabs = tabs.filter((t) => pageIds.has(t.pageId) || !t.pageId)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    tabs = tabs.filter(
      (t) => t.title?.toLowerCase().includes(q) || t.url?.toLowerCase().includes(q)
    )
  }

  return tabs
})

// ====== 截图逻辑 ======

async function captureScreenshots() {
  const tabIds = displayTabs.value
    .filter((t) => !tabStore.frozenTabIds.has(t.id) && !t.url.startsWith('sessionbox://'))
    .map((t) => t.id)

  if (tabIds.length === 0) {
    screenshots.value = new Map()
    return
  }

  loading.value = true
  try {
    const results = await api.tab.capture(tabIds)
    screenshots.value = new Map(Object.entries(results))
  } finally {
    loading.value = false
  }
}

// ====== 内部页面图标 ======

function getInternalPageIcon(url: string) {
  const path = url.replace('sessionbox://', '')
  const icons: Record<string, typeof Bookmark> = {
    bookmarks: Bookmark,
    history: History,
    downloads: Download
  }
  return icons[path] || Globe
}

// ====== 标签激活 ======

async function handleTabClick(tab: Tab) {
  const page = pageStore.getPage(tab.pageId)
  if (page) {
    const group = containerStore.getGroup(page.groupId)
    const tabWorkspaceId = group?.workspaceId || '__default__'
    if (workspaceStore.activeWorkspaceId !== tabWorkspaceId) {
      workspaceStore.activate(tabWorkspaceId)
    }
  }

  await tabStore.switchTab(tab.id)
  emit('update:open', false)
}

// ====== 键盘导航 ======

function getGridColumns(): number {
  if (!gridRef.value) return 4
  const width = gridRef.value.clientWidth
  if (width >= 900) return 5
  if (width >= 700) return 4
  return 3
}

function handleKeydown(e: KeyboardEvent) {
  const tabs = displayTabs.value
  if (tabs.length === 0) return

  const cols = getGridColumns()

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault()
      focusedIndex.value = (focusedIndex.value + 1) % tabs.length
      break
    case 'ArrowLeft':
      e.preventDefault()
      focusedIndex.value = (focusedIndex.value - 1 + tabs.length) % tabs.length
      break
    case 'ArrowDown':
      e.preventDefault()
      focusedIndex.value = Math.min(focusedIndex.value + cols, tabs.length - 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      focusedIndex.value = Math.max(focusedIndex.value - cols, 0)
      break
    case 'Enter':
      e.preventDefault()
      if (focusedIndex.value >= 0 && focusedIndex.value < tabs.length) {
        handleTabClick(tabs[focusedIndex.value])
      }
      break
  }
}

// ====== 生命周期 ======

watch(
  () => props.open,
  async (open) => {
    if (open) {
      selectedWorkspaceId.value = '__all__'
      searchQuery.value = ''
      focusedIndex.value = -1
      await captureScreenshots()
    } else {
      screenshots.value.clear()
    }
  }
)

// 切换工作区时重新截图
watch(selectedWorkspaceId, () => {
  if (props.open) {
    focusedIndex.value = -1
    captureScreenshots()
  }
})
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogScrollContent
      class="w-[85vw] sm:max-w-[960px] max-h-[85vh] p-4 gap-3"
      show-close-button
    >
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Layers class="w-4 h-4" />
          标签页概览
        </DialogTitle>
      </DialogHeader>

      <!-- 搜索框 -->
      <div class="relative">
        <Search
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索标签页..."
          class="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-transparent text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          @keydown="handleKeydown"
        >
      </div>

      <!-- 工作区选择器 -->
      <div class="flex gap-1.5 overflow-x-auto pb-1">
        <button
          v-for="ws in workspaceList"
          :key="ws.id"
          class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          :class="
            selectedWorkspaceId === ws.id
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-accent text-foreground'
          "
          @click="selectedWorkspaceId = ws.id"
        >
          <span
            v-if="ws.color && ws.id !== '__all__'"
            class="w-2 h-2 rounded-full flex-shrink-0"
            :style="{ backgroundColor: ws.color }"
          />
          {{ ws.title }}
          <span class="opacity-70">({{ getTabCountForWorkspace(ws.id) }})</span>
        </button>
      </div>

      <!-- 截图网格 -->
      <div
        v-if="loading"
        class="flex items-center justify-center py-12 text-sm text-muted-foreground"
      >
        <div
          class="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2"
        />
        加载预览中...
      </div>

      <div
        v-else-if="displayTabs.length > 0"
        ref="gridRef"
        class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
        @keydown="handleKeydown"
      >
        <button
          v-for="(tab, index) in displayTabs"
          :key="tab.id"
          class="group relative rounded-lg border overflow-hidden transition-all focus:outline-none"
          :class="[
            focusedIndex === index
              ? 'ring-2 ring-primary'
              : 'hover:ring-1 hover:ring-primary/50',
            tab.id === tabStore.activeTabId ? 'border-primary/60' : 'border-border'
          ]"
          :tabindex="focusedIndex === index ? 0 : -1"
          @click="handleTabClick(tab)"
          @focus="focusedIndex = index"
        >
          <!-- 截图区域 -->
          <div class="aspect-video bg-muted relative overflow-hidden">
            <img
              v-if="screenshots.get(tab.id)"
              :src="screenshots.get(tab.id)!"
              alt=""
              class="w-full h-full object-cover object-top"
            >
            <!-- 冻结标签占位 -->
            <div
              v-else-if="tabStore.frozenTabIds.has(tab.id)"
              class="w-full h-full flex flex-col items-center justify-center gap-1"
            >
              <Snowflake class="w-5 h-5 text-muted-foreground/40" />
              <span class="text-[10px] text-muted-foreground/50">已冻结</span>
            </div>
            <!-- 内部页面占位 -->
            <div
              v-else-if="tab.url.startsWith('sessionbox://')"
              class="w-full h-full flex flex-col items-center justify-center gap-1"
            >
              <component
                :is="getInternalPageIcon(tab.url)"
                class="w-5 h-5 text-muted-foreground/40"
              />
              <span class="text-[10px] text-muted-foreground/50">{{ tab.title }}</span>
            </div>
            <!-- 其他不可用占位 -->
            <div
              v-else
              class="w-full h-full flex items-center justify-center"
            >
              <Globe class="w-5 h-5 text-muted-foreground/30" />
            </div>
          </div>

          <!-- 标签信息 -->
          <div class="px-2 py-1.5 bg-background">
            <div class="flex items-center gap-1.5">
              <img
                v-if="tabStore.favicons.get(tab.id)"
                :src="tabStore.favicons.get(tab.id)"
                alt=""
                class="w-3.5 h-3.5 rounded-sm flex-shrink-0 object-cover"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              >
              <img
                v-else-if="!tab.url.startsWith('sessionbox://')"
                :src="getFaviconUrl(tab.url)"
                alt=""
                class="w-3.5 h-3.5 rounded-sm flex-shrink-0 object-cover"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              >
              <p class="text-[11px] font-medium truncate leading-tight">
                {{ tab.title || '未命名' }}
              </p>
            </div>
            <p class="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
              {{ getDomain(tab.url) }}
            </p>
          </div>

          <!-- 当前激活指示点 -->
          <div
            v-if="tab.id === tabStore.activeTabId"
            class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary shadow-sm"
          />
        </button>
      </div>

      <!-- 空状态 -->
      <div
        v-if="!loading && displayTabs.length === 0"
        class="py-12 text-center text-sm text-muted-foreground"
      >
        暂无打开的标签页
      </div>
    </DialogScrollContent>
  </Dialog>
</template>
