<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Search, Trash2, ExternalLink, Clock } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useHistoryStore } from '@/stores/history'
import { useTabStore } from '@/stores/tab'
import { getDomain } from '@/lib/utils'
import type { HistoryEntry } from '@/lib/db'

const historyStore = useHistoryStore()
const tabStore = useTabStore()

const searchQuery = ref('')
const entries = ref<HistoryEntry[]>([])
const isSearch = computed(() => searchQuery.value.trim().length > 0)

/** 按日期分组 */
const grouped = computed(() => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const weekAgo = today - 7 * 86400000

  const groups: { label: string; items: HistoryEntry[] }[] = []
  const todayItems: HistoryEntry[] = []
  const yesterdayItems: HistoryEntry[] = []
  const weekItems: HistoryEntry[] = []
  const olderItems: HistoryEntry[] = []

  for (const entry of entries.value) {
    if (entry.time >= today) {
      todayItems.push(entry)
    } else if (entry.time >= yesterday) {
      yesterdayItems.push(entry)
    } else if (entry.time >= weekAgo) {
      weekItems.push(entry)
    } else {
      olderItems.push(entry)
    }
  }

  if (todayItems.length) groups.push({ label: '今天', items: todayItems })
  if (yesterdayItems.length) groups.push({ label: '昨天', items: yesterdayItems })
  if (weekItems.length) groups.push({ label: '最近7天', items: weekItems })
  if (olderItems.length) groups.push({ label: '更早', items: olderItems })
  return groups
})

async function loadEntries() {
  if (isSearch.value) {
    entries.value = await historyStore.searchHistory(searchQuery.value.trim())
  } else {
    entries.value = await historyStore.getRecentHistory(1000)
  }
}

async function handleSearch() {
  await loadEntries()
}

async function handleClear() {
  await historyStore.clearHistory()
  entries.value = []
}

function handleOpen(url: string) {
  if (tabStore.activeTab) {
    tabStore.navigate(tabStore.activeTab.id, url)
  } else {
    tabStore.createTabForSite(url)
  }
}

async function handleDelete(id: number) {
  await historyStore.removeHistory(id)
  await loadEntries()
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

onMounted(loadEntries)
</script>

<template>
  <div class="h-full bg-background text-foreground">
    <!-- 顶部工具栏 -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-border">
      <Clock class="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <h2 class="text-sm font-semibold flex-shrink-0">历史记录</h2>
      <div class="flex-1" />
      <div class="relative w-48">
        <Search class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          class="h-7 text-xs pl-7"
          placeholder="搜索历史记录..."
          @keyup.enter="handleSearch"
        />
      </div>
      <AlertDialog>
        <AlertDialogTrigger as-child>
          <Button variant="ghost" size="sm" class="h-7 text-xs gap-1 text-destructive hover:text-destructive">
            <Trash2 class="w-3.5 h-3.5" />
            清空
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空历史记录？</AlertDialogTitle>
            <AlertDialogDescription>此操作将删除所有浏览历史记录，无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction @click="handleClear">确认清空</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

    <!-- 历史记录列表 -->
    <ScrollArea class="h-[calc(100%-40px)]">
      <div v-if="entries.length === 0" class="flex items-center justify-center h-64">
        <p class="text-sm text-muted-foreground">{{ isSearch ? '未找到匹配的记录' : '暂无浏览历史' }}</p>
      </div>
      <div v-else class="px-4 py-2">
        <div v-for="group in grouped" :key="group.label" class="mb-4">
          <h3 class="text-xs font-medium text-muted-foreground mb-2 sticky top-0 bg-background py-1">
            {{ group.label }}
          </h3>
          <div class="space-y-1">
            <div
              v-for="entry in group.items"
              :key="entry.id"
              class="group flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <!-- 信息区 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span
                    class="text-sm truncate cursor-pointer hover:underline"
                    @click="handleOpen(entry.url)"
                  >{{ entry.title || entry.url }}</span>
                </div>
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                  <span class="truncate">{{ getDomain(entry.url) }}</span>
                  <span>{{ formatTime(entry.time) }}</span>
                </div>
              </div>
              <!-- 操作按钮 -->
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <Button variant="ghost" size="icon" class="h-6 w-6" @click="handleOpen(entry.url)">
                  <ExternalLink class="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" class="h-6 w-6 text-destructive hover:text-destructive" @click="handleDelete(entry.id!)">
                  <Trash2 class="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
