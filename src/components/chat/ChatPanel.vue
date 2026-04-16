<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAIProviderStore } from '@/stores/ai-provider'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'
import ModelSelector from './ModelSelector.vue'
import BrowserViewPicker from './BrowserViewPicker.vue'
import SessionManager from './SessionManager.vue'
import ProviderManager from './ProviderManager.vue'
import { Button } from '@/components/ui/button'
import { Settings, X } from 'lucide-vue-next'

const chatStore = useChatStore()
const providerStore = useAIProviderStore()
const showProviderManager = ref(false)

function handleSend(content: string, images: string[]) {
  chatStore.sendMessage(content, images.length > 0 ? images : undefined)
}

function handleClose() {
  chatStore.togglePanel()
}

function handleClear() {
  if (chatStore.currentSessionId) {
    chatStore.clearSessionMessages(chatStore.currentSessionId)
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-background border-l border-border">
    <!-- 头部工具栏 -->
    <div class="flex items-center gap-1.5 px-3 py-2 border-b shrink-0">
      <BrowserViewPicker />
      <ModelSelector />
      <SessionManager />
      <Button variant="ghost" size="icon" class="h-7 w-7" @click="showProviderManager = true">
        <Settings class="h-4 w-4" />
      </Button>
      <div class="flex-1" />
      <Button variant="ghost" size="icon" class="h-7 w-7" @click="handleClose">
        <X class="h-4 w-4" />
      </Button>
    </div>

    <!-- 消息列表 -->
    <ChatMessageList
      :messages="chatStore.messages"
      :is-streaming="chatStore.isStreaming"
      :streaming-token="chatStore.streamingToken"
      :streaming-tool-calls="chatStore.streamingToolCalls"
      :streaming-thinking="chatStore.streamingThinking"
    />

    <!-- 输入区域 -->
    <ChatInput
      :is-streaming="chatStore.isStreaming"
      :disabled="!providerStore.currentModel"
      @send="handleSend"
      @stop="chatStore.stopGeneration()"
      @clear="handleClear"
    />

    <!-- 供应商管理对话框 -->
    <ProviderManager v-model:open="showProviderManager" />
  </div>
</template>
