<script setup lang="ts">
import { MoreHorizontal, Pencil, Trash2, ExternalLink } from 'lucide-vue-next'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useBookmarkStore } from '@/stores/bookmark'
import { useTabStore } from '@/stores/tab'
import type { Bookmark } from '@/types'

const props = defineProps<{
  bookmark: Bookmark
  faviconUrl: string
}>()

const emit = defineEmits<{
  edit: [id: string]
}>()

const bookmarkStore = useBookmarkStore()
const tabStore = useTabStore()

async function handleOpen() {
  await tabStore.createTabForSite(props.bookmark.url, props.bookmark.pageId)
}

async function handleDelete() {
  await bookmarkStore.deleteBookmark(props.bookmark.id)
}
</script>

<template>
  <div
    class="group flex items-center gap-2 px-3 py-2 rounded-md hover:bg-secondary cursor-pointer transition-colors"
    @dblclick="handleOpen"
  >
    <!-- 图标 -->
    <div class="w-4 h-4 flex-shrink-0">
      <img
        v-if="faviconUrl"
        :src="faviconUrl"
        class="w-4 h-4 rounded-sm"
        alt=""
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
    </div>

    <!-- 标题 + URL -->
    <div class="flex-1 min-w-0">
      <p class="text-xs font-medium truncate">{{ bookmark.title || bookmark.url }}</p>
      <p class="text-[10px] text-muted-foreground truncate">{{ bookmark.url }}</p>
    </div>

    <!-- 操作按钮 -->
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent/80 transition-opacity"
          @click.stop
        >
          <MoreHorizontal class="w-3 h-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-32">
        <DropdownMenuItem class="text-xs" @click="handleOpen">
          <ExternalLink class="w-3 h-3 mr-1.5" /> 打开
        </DropdownMenuItem>
        <DropdownMenuItem class="text-xs" @click="emit('edit', bookmark.id)">
          <Pencil class="w-3 h-3 mr-1.5" /> 编辑
        </DropdownMenuItem>
        <DropdownMenuItem class="text-xs text-destructive" @click="handleDelete">
          <Trash2 class="w-3 h-3 mr-1.5" /> 删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
