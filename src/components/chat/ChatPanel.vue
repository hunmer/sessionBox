<script setup lang="ts">
import { computed } from 'vue'
import type { ChatStoreInstance } from '@/stores/chat'
import { useAIProviderStore } from '@/stores/ai-provider'
import { useChatUIStore } from '@/stores/chat-ui'
import { BROWSER_TOOL_LIST } from '@/lib/agent/tools'
import type { ToolDisplayItem } from '@/types'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'
import BrowserViewPicker from './BrowserViewPicker.vue'
import SessionManager from './SessionManager.vue'
import ProviderManager from './ProviderManager.vue'
import { Button } from '@/components/ui/button'
import { Settings, Trash2, X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  chat: ChatStoreInstance
  embedded?: boolean
}>(), {
  embedded: false,
})

const providerStore = useAIProviderStore()
const uiStore = useChatUIStore()

const toolDisplayItems = computed<ToolDisplayItem[]>(() => {
  return BROWSER_TOOL_LIST.map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
  }))
})

const enabledTools = computed(() => {
  return uiStore.enabledTools
})

function handleToggleTool(toolName: string) {
  uiStore.toggleTool(toolName)
}

function handleSend(content: string, images: string[]) {
  props.chat.sendMessage(content, images.length > 0 ? images : undefined)
}

function handleClose() {
  uiStore.togglePanel()
}

function handleClear() {
  if (props.chat.currentSessionId) {
    props.chat.clearSessionMessages(props.chat.currentSessionId)
  }
}

function handleEdit(messageId: string, newContent: string) {
  props.chat.editMessage(messageId, newContent)
}
</script>

<template>
  <div class="flex flex-col h-full bg-background">
    <!-- 头部工具栏 -->
    <div class="flex items-center gap-1.5 px-3 py-2 border-b shrink-0">
      <BrowserViewPicker v-if="!embedded" />
      <SessionManager
        v-if="!embedded"
        :chat="chat"
      />
      <Button
        v-if="!embedded"
        variant="ghost"
        size="icon"
        class="h-7 w-7"
        @click="uiStore.openProviderManager()"
      >
        <Settings class="h-4 w-4" />
      </Button>
      <div class="flex-1" />
      <!-- 清空对话 -->
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7"
        :disabled="chat.isStreaming"
        @click="handleClear"
      >
        <Trash2 class="h-4 w-4" />
      </Button>
      <Button
        v-if="!embedded"
        variant="ghost"
        size="icon"
        class="h-7 w-7"
        @click="handleClose"
      >
        <X class="h-4 w-4" />
      </Button>
    </div>

    <!-- 消息列表 -->
    <ChatMessageList
      :chat="chat"
      :messages="chat.messages"
      :is-streaming="chat.isStreaming"
      :streaming-token="chat.streamingToken"
      :streaming-tool-calls="chat.streamingToolCalls"
      :streaming-thinking-blocks="chat.streamingThinkingBlocks"
      :streaming-usage="chat.streamingUsage"
      @retry="chat.retryMessage($event)"
      @delete="chat.deleteMessageAndAfter($event)"
      @edit="handleEdit"
    />

    <!-- 输入区域 -->
    <ChatInput
      :is-streaming="chat.isStreaming"
      :disabled="!providerStore.currentModel"
      :tools="toolDisplayItems"
      :enabled-tools="enabledTools"
      @send="handleSend"
      @stop="chat.stopGeneration()"
      @toggle-tool="handleToggleTool"
    />

    <!-- 供应商管理对话框 -->
    <ProviderManager v-model:open="uiStore.providerManagerOpen" />
  </div>
</template>
