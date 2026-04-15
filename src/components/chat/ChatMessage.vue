<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage as ChatMessageType, ToolCall } from '@/types'
import ThinkingBlock from './ThinkingBlock.vue'
import ToolCallCard from './ToolCallCard.vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const props = defineProps<{
  message: ChatMessageType
  isStreaming?: boolean
  streamingContent?: string
  streamingThinking?: string
  streamingToolCalls?: ToolCall[]
}>()

const displayContent = computed(() => {
  if (props.isStreaming && props.streamingContent !== undefined) return props.streamingContent
  return props.message.content
})

const displayThinking = computed(() => {
  if (props.isStreaming && props.streamingThinking !== undefined) return props.streamingThinking
  return props.message.thinking
})

const displayToolCalls = computed(() => {
  if (props.isStreaming && props.streamingToolCalls !== undefined) return props.streamingToolCalls
  return props.message.toolCalls
})

const isUser = computed(() => props.message.role === 'user')
</script>

<template>
  <div class="flex gap-3 py-3" :class="isUser ? 'flex-row-reverse' : ''">
    <!-- Avatar -->
    <Avatar class="h-7 w-7 shrink-0 mt-0.5">
      <AvatarFallback class="text-xs" :class="isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'">
        {{ isUser ? '你' : 'AI' }}
      </AvatarFallback>
    </Avatar>

    <!-- 消息体 -->
    <div class="flex-1 min-w-0 space-y-1" :class="isUser ? 'text-right' : ''">
      <!-- 图片展示 -->
      <div v-if="message.images?.length" class="flex gap-2 flex-wrap" :class="isUser ? 'justify-end' : ''">
        <img
          v-for="(img, i) in message.images"
          :key="i"
          :src="`data:image/png;base64,${img}`"
          class="max-w-[200px] max-h-[200px] rounded-md border"
        />
      </div>

      <!-- 思考内容 -->
      <ThinkingBlock v-if="displayThinking" :content="displayThinking" />

      <!-- 文本内容 -->
      <div
        v-if="displayContent"
        class="inline-block rounded-lg px-3 py-2 text-sm leading-relaxed break-words max-w-[85%]"
        :class="isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'"
      >
        <div class="prose prose-sm dark:prose-invert max-w-none" v-html="renderMarkdown(displayContent)" />
      </div>

      <!-- 工具调用卡片 -->
      <div v-if="displayToolCalls?.length" class="space-y-1 max-w-[85%]">
        <ToolCallCard v-for="tc in displayToolCalls" :key="tc.id" :tool-call="tc" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

// 配置 marked 高亮
marked.setOptions({
  highlight(code: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
})

function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}
</script>
