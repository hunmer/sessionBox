<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage as ChatMessageType, ToolCall } from '@/types'
import ThinkingBlock from './ThinkingBlock.vue'
import ToolCallCard from './ToolCallCard.vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

type ContentSegment =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolCall: ToolCall }

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

/**
 * 将文本内容和工具调用按顺序交替排列。
 * 每个 tool call 记录了 textPosition（在文本中的字符偏移量），
 * 据此将文本切分为段，穿插渲染。
 */
const segments = computed<ContentSegment[]>(() => {
  const content = displayContent.value || ''
  const toolCalls = displayToolCalls.value

  if (!toolCalls?.length) {
    return content ? [{ type: 'text', content }] : []
  }

  // 按 textPosition 排序，无 textPosition 的排在末尾
  const sorted = [...toolCalls].sort((a, b) => {
    const posA = a.textPosition ?? Infinity
    const posB = b.textPosition ?? Infinity
    return posA - posB
  })

  const result: ContentSegment[] = []
  let cursor = 0

  for (const tc of sorted) {
    const pos = tc.textPosition ?? cursor
    // 插入工具调用前的文本段
    if (pos > cursor) {
      result.push({ type: 'text', content: content.slice(cursor, pos) })
    }
    result.push({ type: 'tool-call', toolCall: tc })
    cursor = pos
  }

  // 剩余文本
  if (cursor < content.length) {
    result.push({ type: 'text', content: content.slice(cursor) })
  }

  return result
})
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

      <!-- 正在思考占位 -->
      <div
        v-if="isStreaming && !displayContent && !displayToolCalls?.length"
        class="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground bg-muted"
      >
        <span class="thinking-dots">正在思考</span>
      </div>

      <!-- 按顺序穿插渲染文本和工具调用 -->
      <template v-for="(seg, i) in segments" :key="i">
        <div
          v-if="seg.type === 'text' && seg.content"
          class="inline-block rounded-lg px-3 py-2 text-sm leading-relaxed break-words max-w-[85%] overflow-hidden"
          :class="isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'"
        >
          <div class="chat-markdown prose prose-sm dark:prose-invert max-w-none" v-html="renderMarkdown(seg.content)" />
        </div>
        <div v-else-if="seg.type === 'tool-call'" class="max-w-[85%]">
          <ToolCallCard :tool-call="seg.toolCall" />
        </div>
      </template>
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

<style scoped>
.chat-markdown :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}

.chat-markdown :deep(pre) {
  max-width: 100%;
  overflow-x: auto;
}

.thinking-dots::after {
  content: '';
  animation: dots 1.5s steps(4, end) infinite;
}

@keyframes dots {
  0%   { content: ''; }
  25%  { content: '.'; }
  50%  { content: '..'; }
  75%  { content: '...'; }
  100% { content: ''; }
}
</style>
