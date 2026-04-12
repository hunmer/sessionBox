<script setup lang="ts">
import { ref } from 'vue'
import { Bookmark, History, Download } from 'lucide-vue-next'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { useTabStore } from '@/stores/tab'
import ExtensionActionList from '@/components/toolbar/ExtensionActionList.vue'
import BookmarkMiniPopover from './BookmarkMiniPopover.vue'
import HistoryMiniPopover from './HistoryMiniPopover.vue'
import DownloadMiniPopover from './DownloadMiniPopover.vue'

const tabStore = useTabStore()

/** 控制各 Popover 的打开状态 */
const bookmarkOpen = ref(false)
const historyOpen = ref(false)
const downloadOpen = ref(false)

function openFullPage(site: string) {
  bookmarkOpen.value = false
  historyOpen.value = false
  downloadOpen.value = false
  tabStore.createTabForSite(site)
}
</script>

<template>
  <div class="h-full w-full bg-background">
    <ResizablePanelGroup direction="vertical">
      <!-- 区域一：书签 / 历史 / 下载 Popover 入口 -->
      <ResizablePanel :default-size="33">
        <div class="flex flex-col items-center gap-1 py-2 h-full">
          <!-- 书签 -->
          <Popover v-model:open="bookmarkOpen">
            <PopoverTrigger as-child>
              <Button variant="ghost" size="icon" class="h-8 w-8">
                <Bookmark class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="left" :side-offset="4" :collision-padding="30" class="p-0 w-auto overflow-hidden">
              <BookmarkMiniPopover @open-full="openFullPage('sessionbox://bookmarks')" />
            </PopoverContent>
          </Popover>

          <!-- 历史记录 -->
          <Popover v-model:open="historyOpen">
            <PopoverTrigger as-child>
              <Button variant="ghost" size="icon" class="h-8 w-8">
                <History class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="left" :side-offset="4" :collision-padding="30" class="p-0 w-auto overflow-hidden">
              <HistoryMiniPopover @open-full="openFullPage('sessionbox://history')" />
            </PopoverContent>
          </Popover>

          <!-- 下载管理 -->
          <Popover v-model:open="downloadOpen">
            <PopoverTrigger as-child>
              <Button variant="ghost" size="icon" class="h-8 w-8">
                <Download class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="left" :side-offset="4" :collision-padding="30" class="p-0 w-auto overflow-hidden">
              <DownloadMiniPopover @open-full="openFullPage('sessionbox://downloads')" />
            </PopoverContent>
          </Popover>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <!-- 区域二：扩展列表（垂直模式） -->
      <ResizablePanel :default-size="33">
        <div class="flex flex-col items-center py-2 h-full overflow-y-auto">
          <ExtensionActionList vertical />
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <!-- 区域三：占位区域 -->
      <ResizablePanel :default-size="34">
        <div class="flex items-center justify-center h-full text-xs text-muted-foreground" />
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>
