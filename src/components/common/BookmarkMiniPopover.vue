<script setup lang="ts">
import { computed } from 'vue'
import { Bookmark, ExternalLink, ArrowRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useBookmarkStore } from '@/stores/bookmark'
import { useTabStore } from '@/stores/tab'
import { getDomain, getFaviconUrl } from '@/lib/utils'

const bookmarkStore = useBookmarkStore()
const tabStore = useTabStore()

const emit = defineEmits<{ 'open-full': [] }>()

/** 按最近添加排序，取前 50 条用于迷你面板展示 */
const recentBookmarks = computed(() =>
  [...bookmarkStore.bookmarks]
    .sort((a, b) => b.order - a.order)
    .slice(0, 50)
)

function handleOpenUrl(url: string) {
  tabStore.createTabForSite(url)
}

function handleOpenFull() {
  emit('open-full')
}
</script>

<template>
  <div class="w-80">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between px-3 pt-2 pb-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Bookmark class="h-3.5 w-3.5 text-muted-foreground" />
        书签
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
    <ScrollArea class="max-h-[360px]">
      <div v-if="recentBookmarks.length === 0" class="flex items-center justify-center py-8">
        <p class="text-xs text-muted-foreground">暂无书签</p>
      </div>
      <div v-else class="py-1">
        <div
          v-for="bookmark in recentBookmarks"
          :key="bookmark.id"
          class="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 rounded-sm cursor-pointer transition-colors"
          @click="handleOpenUrl(bookmark.url)"
        >
          <img
            :src="getFaviconUrl(bookmark.url)"
            alt=""
            class="h-4 w-4 rounded-sm flex-shrink-0"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <div class="flex-1 min-w-0">
            <p class="text-xs truncate">{{ bookmark.title || bookmark.url }}</p>
            <p class="text-[10px] text-muted-foreground truncate">{{ getDomain(bookmark.url) }}</p>
          </div>
          <ExternalLink class="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>
      </div>
    </ScrollArea>

    <Separator />
    <!-- 底部统计 -->
    <div class="px-3 py-1.5 text-[10px] text-muted-foreground">
      共 {{ bookmarkStore.bookmarks.length }} 个书签
    </div>
  </div>
</template>
