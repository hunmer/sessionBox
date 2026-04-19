<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { History, ExternalLink, ArrowRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useHistoryStore } from '@/stores/history'
import { useTabStore } from '@/stores/tab'
import { getDomain } from '@/lib/utils'
import type { HistoryEntry } from '@/lib/db'

const historyStore = useHistoryStore()
const tabStore = useTabStore()

const emit = defineEmits<{ 'open-full': [] }>()

const entries = ref<HistoryEntry[]>([])

async function loadRecent() {
  entries.value = await historyStore.getRecentHistory(50)
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function handleOpenUrl(url: string) {
  tabStore.createTabForSite(url)
}

function handleOpenFull() {
  emit('open-full')
}

onMounted(loadRecent)
</script>

<template>
  <div class="w-80">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between px-3 pt-2 pb-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <History class="h-3.5 w-3.5 text-muted-foreground" />
        历史记录
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="h-6 gap-1 text-xs text-primary hover:text-primary"
        @click="handleOpenFull"
      >
        查看全部
        <ArrowRight class="h-3 w-3" />
      </Button>
    </div>
    <Separator />

    <!-- 列表 -->
    <ScrollArea class="h-[360px]">
      <div
        v-if="entries.length === 0"
        class="flex items-center justify-center py-8"
      >
        <p class="text-xs text-muted-foreground">
          暂无浏览历史
        </p>
      </div>
      <div
        v-else
        class="py-1"
      >
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 rounded-sm cursor-pointer transition-colors"
          @click="handleOpenUrl(entry.url)"
        >
          <div class="flex-1 min-w-0">
            <p class="text-xs truncate">
              {{ entry.title || entry.url }}
            </p>
            <div class="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span class="truncate">{{ getDomain(entry.url) }}</span>
              <span class="flex-shrink-0">{{ formatTime(entry.time) }}</span>
            </div>
          </div>
          <ExternalLink class="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>
      </div>
    </ScrollArea>

    <Separator />
    <!-- 底部统计 -->
    <div class="px-3 py-1.5 text-[10px] text-muted-foreground">
      最近 {{ entries.length }} 条记录
    </div>
  </div>
</template>
