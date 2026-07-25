<script setup lang="ts">
import { Bookmark } from 'lucide-vue-next'
import { Switch } from '@/components/ui/switch'
import { useTabStore } from '@/stores/tab'

const tabStore = useTabStore()
</script>

<template>
  <h3 class="text-sm font-medium mb-3 flex items-center gap-2">
    <Bookmark class="w-4 h-4" />
    书签栏
  </h3>
  <p class="text-xs text-muted-foreground mb-4">
    控制顶部书签栏的显示状态。隐藏后可从设置中重新打开，或使用快捷键
    <kbd class="px-1.5 py-0.5 text-[10px] rounded border bg-muted mx-0.5">Cmd/Ctrl+Shift+B</kbd>
    快速切换。
  </p>
  <div class="flex items-center justify-between">
    <label class="text-xs text-muted-foreground">显示书签栏</label>
    <Switch
      :model-value="tabStore.bookmarkBarVisible"
      @update:model-value="tabStore.toggleBookmarkBar()"
    />
  </div>
</template>
