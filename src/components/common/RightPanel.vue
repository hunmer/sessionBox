<script setup lang="ts">
import { ref } from 'vue'
import { Bookmark, History, Download, Shield, Settings2, Network, Keyboard, Box, Radar, Puzzle, MessageSquare, Workflow, Bug } from 'lucide-vue-next'
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
import ExtensionManager from '@/components/settings/ExtensionManager.vue'
import BookmarkMiniPopover from './BookmarkMiniPopover.vue'
import HistoryMiniPopover from './HistoryMiniPopover.vue'
import DownloadMiniPopover from './DownloadMiniPopover.vue'
import ProxyMiniPopover from './ProxyMiniPopover.vue'
import ProxyDialog from '@/components/proxy/ProxyDialog.vue'
import ContainerMiniPopover from './ContainerMiniPopover.vue'
import SnifferMiniPopover from './SnifferMiniPopover.vue'
import PluginMiniPopover from './PluginMiniPopover.vue'
import PluginSettings from '@/components/plugins/PluginSettings.vue'
import WorkflowDialog from '@/components/workflow/WorkflowDialog.vue'
import { useChatUIStore } from '@/stores/chat-ui'

const tabStore = useTabStore()
const chatUIStore = useChatUIStore()
const extensionManagerRef = ref<InstanceType<typeof ExtensionManager> | null>(null)

const emit = defineEmits<{
  openSettings: [tab?: string]
  openProxy: []
}>()

/** 控制各 Popover 的打开状态 */
const bookmarkOpen = ref(false)
const historyOpen = ref(false)
const downloadOpen = ref(false)
const proxyOpen = ref(false)
const proxyDialogOpen = ref(false)
const containerOpen = ref(false)
const snifferOpen = ref(false)
const pluginOpen = ref(false)
const workflowOpen = ref(false)

function openDebugger() {
  window.api.debugger?.createWindow?.()
}

function openFullPage(site: string) {
  bookmarkOpen.value = false
  historyOpen.value = false
  downloadOpen.value = false
  proxyOpen.value = false
  containerOpen.value = false
  snifferOpen.value = false
  pluginOpen.value = false
  tabStore.createTabForSite(site)
}
</script>

<template>
  <div class="h-full w-full bg-background">
    <ResizablePanelGroup direction="vertical">
      <!-- 区域一：书签 / 历史 / 下载 Popover 入口 -->
      <ResizablePanel :default-size="33">
        <div class="flex flex-col items-center justify-start gap-1 py-2 h-full">
          <!-- 工作流 -->
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            @click="workflowOpen = true"
          >
            <Workflow class="h-4 w-4" />
          </Button>

          <!-- 书签 -->
          <Popover v-model:open="bookmarkOpen">
            <PopoverTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
              >
                <Bookmark class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              :side-offset="4"
              :collision-padding="30"
              class="p-0 w-auto overflow-hidden"
            >
              <BookmarkMiniPopover @open-full="openFullPage('sessionbox://bookmarks')" />
            </PopoverContent>
          </Popover>

          <!-- 历史记录 -->
          <Popover v-model:open="historyOpen">
            <PopoverTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
              >
                <History class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              :side-offset="4"
              :collision-padding="30"
              class="p-0 w-auto overflow-hidden"
            >
              <HistoryMiniPopover @open-full="openFullPage('sessionbox://history')" />
            </PopoverContent>
          </Popover>

          <!-- 下载管理 -->
          <Popover v-model:open="downloadOpen">
            <PopoverTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
              >
                <Download class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              :side-offset="4"
              :collision-padding="30"
              class="p-0 w-auto overflow-hidden"
            >
              <DownloadMiniPopover @open-full="openFullPage('sessionbox://downloads')" />
            </PopoverContent>
          </Popover>

          <!-- 代理切换 -->
          <Popover v-model:open="proxyOpen">
            <PopoverTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
              >
                <Shield class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              :side-offset="4"
              :collision-padding="30"
              class="p-0 w-auto overflow-hidden"
            >
              <ProxyMiniPopover @open-full="proxyOpen = false; proxyDialogOpen = true" />
            </PopoverContent>
          </Popover>

          <!-- 容器切换 -->
          <Popover v-model:open="containerOpen">
            <PopoverTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
              >
                <Box class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              :side-offset="4"
              :collision-padding="30"
              class="p-0 w-auto overflow-hidden"
            >
              <ContainerMiniPopover @open-full="emit('openSettings', 'containers')" />
            </PopoverContent>
          </Popover>

          <!-- 网络嗅探 -->
          <Popover v-model:open="snifferOpen">
            <PopoverTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
              >
                <Radar class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              :side-offset="4"
              :collision-padding="30"
              class="p-0 w-auto overflow-hidden"
            >
              <SnifferMiniPopover />
            </PopoverContent>
          </Popover>

          <!-- 插件 -->
          <Popover v-model:open="pluginOpen">
            <PopoverTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
              >
                <Puzzle class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              :side-offset="4"
              :collision-padding="30"
              class="p-0 w-auto overflow-hidden"
            >
              <PluginMiniPopover @open-full="openFullPage('sessionbox://plugins')" />
            </PopoverContent>
          </Popover>

          <!-- 网页调试 -->
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            @click="openDebugger"
          >
            <Bug class="h-4 w-4" />
          </Button>

          <!-- AI 聊天 -->
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            @click="chatUIStore.togglePanel()"
          >
            <MessageSquare class="h-4 w-4" />
          </Button>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <!-- 区域二：扩展列表（垂直模式） -->
      <ResizablePanel :default-size="33">
        <div class="flex flex-col items-center justify-center py-2 h-full overflow-y-auto">
          <ExtensionActionList
            vertical
            @open-manager="extensionManagerRef?.open()"
          />
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <!-- 区域三：设置 / 代理入口 -->
      <ResizablePanel :default-size="34">
        <div class="flex flex-col items-center justify-end gap-1 py-2 h-full">
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            @click="emit('openProxy')"
          >
            <Network class="h-4 w-4" />
          </Button>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>

    <!-- 扩展管理对话框 -->
    <ExtensionManager ref="extensionManagerRef" />

    <!-- 代理管理对话框 -->
    <ProxyDialog v-model:open="proxyDialogOpen" />

    <!-- 插件设置对话框 -->
    <PluginSettings />

    <!-- 工作流对话框 -->
    <WorkflowDialog v-model:open="workflowOpen" />
  </div>
</template>
