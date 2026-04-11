<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Bookmark, History, Download } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { useTabStore } from '@/stores/tab'
import ExtensionActionList from '@/components/toolbar/ExtensionActionList.vue'

const tabStore = useTabStore()

// ====== 持久化面板高度 ======
const STORAGE_KEY = 'sessionbox-right-panel-sizes'
const DEFAULT_SIZES = [120, 120, 120] // 三个区域默认高度

const savedSizes = localStorage.getItem(STORAGE_KEY)
const panelSizes = ref<number[]>(savedSizes ? JSON.parse(savedSizes) : [...DEFAULT_SIZES])

/** 防抖保存面板高度 */
let saveTimer: ReturnType<typeof setTimeout> | null = null
function handleLayout(sizes: number[]) {
  panelSizes.value = sizes
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes))
  }, 300)
}

/** 快捷入口：历史记录、书签管理、下载管理 */
const quickEntries = [
  { title: '书签管理', icon: Bookmark, action: () => tabStore.createTabForSite('sessionbox://bookmarks') },
  { title: '历史记录', icon: History, action: () => tabStore.createTabForSite('sessionbox://history') },
  { title: '下载管理', icon: Download, action: () => tabStore.createTabForSite('sessionbox://downloads') },
]
</script>

<template>
  <div class="h-full w-full bg-background border-l border-border">
    <ResizablePanelGroup direction="vertical" @layout="handleLayout">
      <!-- 区域一：历史记录 / 书签管理 / 下载管理 图标 -->
      <ResizablePanel :default-size="panelSizes[0]" :min-size="40">
        <div class="flex flex-col items-center gap-1 py-2 h-full">
          <Tooltip
            v-for="entry in quickEntries"
            :key="entry.title"
          >
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
                @click="entry.action"
              >
                <component :is="entry.icon" class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" :side-offset="4">
              {{ entry.title }}
            </TooltipContent>
          </Tooltip>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <!-- 区域二：扩展列表（垂直模式） -->
      <ResizablePanel :default-size="panelSizes[1]" :min-size="40">
        <div class="flex flex-col items-center py-2 h-full overflow-y-auto">
          <ExtensionActionList vertical />
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <!-- 区域三：占位区域 -->
      <ResizablePanel :default-size="panelSizes[2]" :min-size="40">
        <div class="flex items-center justify-center h-full text-xs text-muted-foreground">
          <!-- 预留区域 -->
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>
