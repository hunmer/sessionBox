<script setup lang="ts">
import { ref } from 'vue'
import type { ChatStoreInstance } from '@/stores/chat'
import { useAIProviderStore } from '@/stores/ai-provider'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'
import ModelSelector from './ModelSelector.vue'
import BrowserViewPicker from './BrowserViewPicker.vue'
import SessionManager from './SessionManager.vue'
import ProviderManager from './ProviderManager.vue'
import { Button } from '@/components/ui/button'
import { Settings, X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  chat: ChatStoreInstance
  embedded?: boolean
}>(), {
  embedded: false,
})

const providerStore = useAIProviderStore()
const showProviderManager = ref(false)

function handleSend(content: string, images: string[]) {
  props.chat.sendMessage(content, images.length > 0 ? images : undefined)
}

function handleClose() {
  // 由父组件处理
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
  <div class="flex flex-col h-full bg-background" :class="{ 'border-l border-border': !embedded }">
    <!-- 头部工具栏 -->
    <div class="flex items-center gap-1.5 px-3 py-2 border-b shrink-0">
      <BrowserViewPicker v-if="!embedded" />
      <ModelSelector />
      <SessionManager v-if="!embedded" :chat="chat" />
      <Button v-if="!embedded" variant="ghost" size="icon" class="h-7 w-7" @click="showProviderManager = true">
        <Settings class="h-4 w-4" />
      </Button>
      <div class="flex-1" />
      <Button v-if="!embedded" variant="ghost" size="icon" class="h-7 w-7" @click="handleClose">
        <X class="h-4 w-4" />
      </Button>
    </div>

    <!-- 消息列表 -->
    <ChatMessageList
      :messages="chat.messages"
      :is-streaming="chat.isStreaming"
      :streaming-token="chat.streamingToken"
      :streaming-tool-calls="chat.streamingToolCalls"
      :streaming-thinking="chat.streamingThinking"
      :streaming-usage="chat.streamingUsage"
      @retry="chat.retryMessage($event)"
      @delete="chat.deleteMessageAndAfter($event)"
      @edit="handleEdit"
    />

    <!-- 输入区域 -->
    <ChatInput
      :is-streaming="chat.isStreaming"
      :disabled="!providerStore.currentModel"
      @send="handleSend"
      @stop="chat.stopGeneration()"
      @clear="handleClear"
    />

    <!-- 供应商管理对话框 -->
    <ProviderManager v-if="!embedded" v-model:open="showProviderManager" />
  </div>
</template>
