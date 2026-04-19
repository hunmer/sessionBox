<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ChatStoreInstance } from '@/stores/chat'
import { useAIProviderStore } from '@/stores/ai-provider'
import { useChatUIStore } from '@/stores/chat-ui'
import { BROWSER_TOOL_LIST } from '@/lib/agent/tools'
import { WORKFLOW_TOOL_DEFINITIONS } from '@/lib/agent/workflow-tools'
import type { ToolDisplayItem } from '@/types'
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
const uiStore = useChatUIStore()
const showProviderManager = ref(false)

const WORKFLOW_CATEGORY_MAP: Record<string, string> = {
  get_workflow: '读取',
  get_current_workflow: '读取',
  list_node_types: '读取',
  create_node: '编辑',
  update_node: '编辑',
  delete_node: '编辑',
  create_edge: '编辑',
  delete_edge: '编辑',
  batch_update: '编辑',
  auto_layout: '辅助',
  execute_workflow_sync: '执行',
  execute_workflow_async: '执行',
  get_workflow_result: '执行',
}

const toolDisplayItems = computed<ToolDisplayItem[]>(() => {
  if (props.embedded) {
    return WORKFLOW_TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      category: WORKFLOW_CATEGORY_MAP[t.name] ?? '其他',
    }))
  }
  return BROWSER_TOOL_LIST.map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
  }))
})

const enabledTools = computed(() => {
  if (props.embedded) return undefined
  return uiStore.enabledTools
})

function handleToggleTool(toolName: string) {
  if (!props.embedded) {
    uiStore.toggleTool(toolName)
  }
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
  <div
    class="flex flex-col h-full bg-background"
    :class="{ 'border-l border-border': !embedded }"
  >
    <!-- 头部工具栏 -->
    <div class="flex items-center gap-1.5 px-3 py-2 border-b shrink-0">
      <BrowserViewPicker v-if="!embedded" />
      <ModelSelector />
      <SessionManager
        v-if="!embedded"
        :chat="chat"
      />
      <Button
        v-if="!embedded"
        variant="ghost"
        size="icon"
        class="h-7 w-7"
        @click="showProviderManager = true"
      >
        <Settings class="h-4 w-4" />
      </Button>
      <div class="flex-1" />
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
      @clear="handleClear"
      @toggle-tool="handleToggleTool"
    />

    <!-- 供应商管理对话框 -->
    <ProviderManager
      v-if="!embedded"
      v-model:open="showProviderManager"
    />
  </div>
</template>
