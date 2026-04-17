<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import type { ChatMessage as ChatMessageType, ToolCall } from '@/types'
import ThinkingBlock from './ThinkingBlock.vue'
import ToolCallCard from './ToolCallCard.vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogScrollContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Copy, RefreshCw, Trash2, Pencil, Check } from 'lucide-vue-next'
import { Markdown } from 'vue-stream-markdown'
import 'vue-stream-markdown/index.css'
import { useThemeStore } from '@/stores/theme'
import { useChatStore } from '@/stores/chat'

const themeStore = useThemeStore()
const chatStore = useChatStore()

type ContentSegment =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolCall: ToolCall }

const props = defineProps<{
  message: ChatMessageType
  isStreaming?: boolean
  isLastAssistant?: boolean
  streamingContent?: string
  streamingThinking?: string
  streamingToolCalls?: ToolCall[]
  streamingUsage?: { inputTokens: number; outputTokens: number } | null
}>()

const emit = defineEmits<{
  retry: [messageId: string]
  delete: [messageId: string]
  edit: [messageId: string, newContent: string]
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
const isSystem = computed(() => props.message.role === 'system')

// --- 操作按钮 ---
const showActions = ref(false)
const copied = ref(false)
const isEditing = ref(false)
const editContent = ref('')
const showRawDialog = ref(false)

/** 是否可以重试（非流式且是 AI 消息） */
const canRetry = computed(() => !isUser.value && !props.isStreaming && props.isLastAssistant)

/** 复制消息内容到剪贴板 */
async function copyContent() {
  const text = props.message.content || ''
  if (!text) return
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

/** 重新运行单个工具调用 */
function handleRerunTool(toolCall: ToolCall) {
  chatStore.rerunTool(props.message.id, toolCall.id)
}

/** 进入编辑模式 */
function startEdit() {
  editContent.value = props.message.content
  isEditing.value = true
}

/** 取消编辑 */
function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
}

/** 确认编辑 */
function confirmEdit() {
  const trimmed = editContent.value.trim()
  if (!trimmed) return
  emit('edit', props.message.id, trimmed)
  isEditing.value = false
}

/** 删除消息 */
function handleDelete() {
  emit('delete', props.message.id)
}

/** 重试 */
function handleRetry() {
  emit('retry', props.message.id)
}

// --- 执行时间统计 ---
const elapsedMs = ref(0)
const frozenDuration = ref<number | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

function startTimer() {
  stopTimer()
  elapsedMs.value = Date.now() - props.message.createdAt
  timer = setInterval(() => {
    elapsedMs.value = Date.now() - props.message.createdAt
  }, 100)
}

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

// streaming 结束时冻结持续时间
watch(() => props.isStreaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming) {
    frozenDuration.value = Date.now() - props.message.createdAt
    stopTimer()
  }
  if (streaming && !wasStreaming) {
    startTimer()
  }
}, { immediate: true })

onUnmounted(() => stopTimer())

/** 实际展示的持续时间（毫秒），仅对 assistant 消息有值 */
const durationMs = computed(() => {
  if (isUser.value) return null
  if (frozenDuration.value !== null) return frozenDuration.value
  if (props.isStreaming) return elapsedMs.value
  return null
})

function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(0)
  return `${minutes}m ${seconds}s`
}

/** 格式化消息时间为 HH:mm */
function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

/** 展示的 token 用量，streaming 时取实时数据，否则取消息持久化数据 */
const displayUsage = computed(() => {
  if (isUser.value) return null
  if (props.isStreaming && props.streamingUsage) return props.streamingUsage
  return props.message.usage ?? null
})

/** 原始输入文本：对于 assistant 消息，取前一条 user 消息内容 */
const inputRawText = computed(() => {
  if (isUser.value) return props.message.content || ''
  const allMessages = chatStore.messages
  const idx = allMessages.findIndex(m => m.id === props.message.id)
  if (idx > 0) {
    const prev = allMessages[idx - 1]
    if (prev.role === 'user') return prev.content || ''
  }
  return ''
})

/** 原始输出文本：当前消息的内容 */
const outputRawText = computed(() => props.message.content || '')

/** 是否显示统计栏（时间或 token） */
const showStats = computed(() => !isUser.value && (durationMs.value !== null || displayUsage.value !== null))

/** 最后一个文本段的索引 */
const lastTextSegmentIndex = computed(() => {
  let last = -1
  segments.value.forEach((seg, i) => { if (seg.type === 'text' && seg.content) last = i })
  return last
})

function formatTokenCount(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

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
  <!-- 系统消息：居中显示 -->
  <div v-if="isSystem" class="flex justify-center py-2">
    <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 bg-muted/50 px-3 py-1.5 rounded-full">
      <svg class="w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      {{ message.content }}
    </span>
  </div>

  <!-- 用户/AI 消息 -->
  <div
    v-else
    class="group/msg flex gap-3 py-3"
    :class="isUser ? 'flex-row-reverse' : ''"
    @mouseenter="showActions = true"
    @mouseleave="showActions = false"
  >
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

      <!-- 编辑模式 -->
      <div v-if="isEditing" class="max-w-[85%]" :class="isUser ? 'ml-auto' : ''">
        <textarea
          v-model="editContent"
          class="w-full rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          rows="3"
          @keydown.enter.ctrl="confirmEdit"
          @keydown.escape="cancelEdit"
        />
        <div class="flex gap-2 mt-1" :class="isUser ? 'justify-end' : ''">
          <button class="text-xs px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors" @click="cancelEdit">
            取消
          </button>
          <button class="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" @click="confirmEdit">
            保存并发送
          </button>
        </div>
      </div>

      <!-- 按顺序穿插渲染文本和工具调用 -->
      <template v-if="!isEditing" v-for="(seg, i) in segments" :key="i">
        <div
          v-if="seg.type === 'text' && seg.content"
          class="inline-block rounded-lg px-3 py-2 text-sm leading-relaxed break-words max-w-[85%] overflow-hidden text-left"
          :class="isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'"
        >
          <Markdown
            class="chat-markdown"
            :content="seg.content"
            :mode="isStreaming ? 'streaming' : 'static'"
            :is-dark="themeStore.theme === 'dark'"
          />
          <!-- 统计信息嵌入最后一个文本气泡右下角 -->
          <div
            v-if="i === lastTextSegmentIndex && showStats"
            class="flex items-center justify-end gap-2 mt-1 pt-1 border-t border-border/10 text-[11px] text-muted-foreground/50 cursor-pointer hover:text-muted-foreground/80 transition-colors"
            @click="showRawDialog = true"
          >
            <span v-if="durationMs !== null" class="inline-flex items-center gap-1">
              <span v-if="isStreaming" class="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {{ formatDuration(durationMs) }}
            </span>
            <span v-if="displayUsage" class="inline-flex items-center gap-1.5">
              <span title="输入 tokens">↑ {{ formatTokenCount(displayUsage.inputTokens) }}</span>
              <span title="输出 tokens">↓ {{ formatTokenCount(displayUsage.outputTokens) }}</span>
            </span>
          </div>
        </div>
        <div v-else-if="seg.type === 'tool-call'" class="max-w-[85%]">
          <ToolCallCard :tool-call="seg.toolCall" @rerun="handleRerunTool" />
        </div>
      </template>

      <!-- 时间 + 操作按钮（同行，避免高度跳动） -->
      <div
        v-if="!isEditing"
        class="flex items-center gap-1 mt-0.5 h-5"
        :class="isUser ? 'justify-end' : ''"
      >
        <span class="text-[11px] text-muted-foreground/40">
          {{ formatMessageTime(props.message.createdAt) }}
        </span>
        <div
          v-if="!isStreaming && showActions && (displayContent || displayToolCalls?.length)"
          class="flex gap-0.5"
        >
          <TooltipProvider :delay-duration="300">
            <!-- 用户消息：编辑 -->
            <Tooltip v-if="isUser">
              <TooltipTrigger as-child>
                <button
                  class="inline-flex items-center justify-center h-5 w-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  @click="startEdit"
                >
                  <Pencil class="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" :side-offset="4">编辑</TooltipContent>
            </Tooltip>

            <!-- 复制 -->
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  class="inline-flex items-center justify-center h-5 w-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  @click="copyContent"
                >
                  <Check v-if="copied" class="h-3 w-3 text-green-500" />
                  <Copy v-else class="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" :side-offset="4">{{ copied ? '已复制' : '复制' }}</TooltipContent>
            </Tooltip>

            <!-- AI 消息：重试 -->
            <Tooltip v-if="canRetry">
              <TooltipTrigger as-child>
                <button
                  class="inline-flex items-center justify-center h-5 w-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  @click="handleRetry"
                >
                  <RefreshCw class="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" :side-offset="4">重新生成</TooltipContent>
            </Tooltip>

            <!-- 删除 -->
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  class="inline-flex items-center justify-center h-5 w-5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  @click="handleDelete"
                >
                  <Trash2 class="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" :side-offset="4">删除</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  </div>

  <!-- 原始文本查看对话框 -->
  <Dialog v-model:open="showRawDialog">
    <DialogScrollContent class="max-w-4xl">
      <DialogHeader>
        <DialogTitle>原始文本</DialogTitle>
        <DialogDescription>查看消息的原始输入和输出文本内容</DialogDescription>
      </DialogHeader>
      <div class="grid grid-cols-2 gap-4 mt-2">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">输入</span>
            <span v-if="displayUsage" class="text-xs text-muted-foreground/60">
              {{ formatTokenCount(displayUsage.inputTokens) }} tokens
            </span>
          </div>
          <pre class="bg-muted/50 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto font-mono border">{{ inputRawText }}</pre>
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">输出</span>
            <span v-if="displayUsage" class="text-xs text-muted-foreground/60">
              {{ formatTokenCount(displayUsage.outputTokens) }} tokens
            </span>
          </div>
          <pre class="bg-muted/50 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto font-mono border">{{ outputRawText }}</pre>
        </div>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>

<style scoped>

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
