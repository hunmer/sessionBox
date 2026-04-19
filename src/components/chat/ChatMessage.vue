<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import type { ChatMessage as ChatMessageType, ToolCall, ChatThinkingBlock } from '@/types'
import ThinkingBlock from './ThinkingBlock.vue'
import ToolCallCard from './ToolCallCard.vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { useUserProfileStore } from '@/stores/userProfile'
import { BROWSER_AGENT_SYSTEM_PROMPT } from '@/lib/agent/system-prompt'
import type { ChatStoreInstance } from '@/stores/chat'

const themeStore = useThemeStore()
const userProfile = useUserProfileStore()

type ContentSegment =
  | { type: 'thinking'; content: string }
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolCall: ToolCall }

const props = defineProps<{
  chat: ChatStoreInstance
  message: ChatMessageType
  allMessages?: ChatMessageType[]
  isStreaming?: boolean
  isLastAssistant?: boolean
  streamingContent?: string
  streamingThinkingBlocks?: ChatThinkingBlock[]
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

const displayThinkingBlocks = computed(() => {
  if (props.isStreaming && props.streamingThinkingBlocks !== undefined) return props.streamingThinkingBlocks
  return props.message.thinkingBlocks
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
  props.chat.rerunTool(props.message.id, toolCall.id)
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

/** 格式化单条消息为可读文本（含 tool_calls 和 tool_result） */
function formatRawMessage(m: ChatMessageType): string {
  const parts: string[] = []
  if (m.content) parts.push(m.content)
  if (m.toolCalls?.length) {
    for (const tc of m.toolCalls) {
      parts.push(`[tool_use:${tc.name}] ${JSON.stringify(tc.args, null, 2)}`)
      if (tc.result !== undefined) parts.push(`[tool_result] ${JSON.stringify(tc.result, null, 2)}`)
      if (tc.error) parts.push(`[tool_error] ${tc.error}`)
    }
  }
  if (m.toolResult !== undefined) parts.push(`[tool_result] ${JSON.stringify(m.toolResult, null, 2)}`)
  return parts.join('\n') || '(空)'
}

/** 原始输入文本：对于 assistant 消息，拼接当前消息之前所有非 system 消息 */
const inputRawText = computed(() => {
  if (isUser.value) return props.message.content || ''
  const msgs = props.allMessages ?? []
  const idx = msgs.findIndex(m => m.id === props.message.id)
  if (idx <= 0) return ''
  return msgs
    .slice(0, idx)
    .filter(m => m.role !== 'system')
    .map(m => `[${m.role}] ${formatRawMessage(m)}`)
    .join('\n\n')
})

/** System Prompt：内置的 Agent 系统提示词 */
const inputPromptText = computed(() => {
  const msgs = props.allMessages ?? []
  const idx = msgs.findIndex(m => m.id === props.message.id)
  if (idx <= 0) return ''
  // 优先取消息列表中的 system 消息，否则使用内置 prompt
  const systemMsgs = msgs.slice(0, idx).filter(m => m.role === 'system')
  if (systemMsgs.length) return systemMsgs.map(m => m.content || '').join('\n\n')
  return BROWSER_AGENT_SYSTEM_PROMPT
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
  const thinkingBlocks = displayThinkingBlocks.value
  const result: ContentSegment[] = []

  const events = [
    ...(toolCalls ?? []).map((toolCall) => ({
      type: 'tool-call' as const,
      pos: toolCall.textPosition ?? Infinity,
      order: toolCall.renderOrder ?? Infinity,
      toolCall,
    })),
    ...(thinkingBlocks ?? []).map((block) => ({
      type: 'thinking' as const,
      pos: block.textPosition ?? Infinity,
      order: block.renderOrder ?? Infinity,
      index: block.index,
      content: block.content,
    })),
  ].sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos
    if (a.order !== b.order) return a.order - b.order
    if (a.type !== b.type) return a.type === 'tool-call' ? -1 : 1
    return (a.type === 'thinking' ? a.index : 0) - (b.type === 'thinking' ? b.index : 0)
  })

  let cursor = 0
  for (const event of events) {
    const pos = Math.min(event.pos, content.length)
    if (pos > cursor) {
      result.push({ type: 'text', content: content.slice(cursor, pos) })
      cursor = pos
    }

    if (event.type === 'thinking') {
      if (event.content) result.push({ type: 'thinking', content: event.content })
    } else {
      result.push({ type: 'tool-call', toolCall: event.toolCall })
    }
  }

  if (cursor < content.length) {
    result.push({ type: 'text', content: content.slice(cursor) })
  }

  return result
})
</script>

<template>
  <!-- 系统消息：居中显示 -->
  <div
    v-if="isSystem"
    class="flex justify-center py-2"
  >
    <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 bg-muted/50 px-3 py-1.5 rounded-full">
      <svg
        class="w-3 h-3"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      ><circle
        cx="12"
        cy="12"
        r="10"
      /><line
        x1="12"
        y1="8"
        x2="12"
        y2="12"
      /><line
        x1="12"
        y1="16"
        x2="12.01"
        y2="16"
      /></svg>
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
      <AvatarImage
        v-if="isUser && userProfile.avatarSrc"
        :src="userProfile.avatarSrc"
      />
      <AvatarFallback
        class="text-xs"
        :class="isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'"
      >
        {{ isUser ? (userProfile.isEmojiAvatar ? userProfile.profile.avatar : userProfile.avatarFallback) : 'AI' }}
      </AvatarFallback>
    </Avatar>

    <!-- 消息体 -->
    <div
      class="flex-1 min-w-0 space-y-1"
      :class="isUser ? 'text-right' : ''"
    >
      <!-- 图片展示 -->
      <div
        v-if="message.images?.length"
        class="flex gap-2 flex-wrap"
        :class="isUser ? 'justify-end' : ''"
      >
        <img
          v-for="(img, i) in message.images"
          :key="i"
          :src="`data:image/png;base64,${img}`"
          class="max-w-[200px] max-h-[200px] rounded-md border"
        >
      </div>

      <!-- 正在思考占位 -->
      <div
        v-if="isStreaming && !displayContent && !displayToolCalls?.length"
        class="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground bg-muted"
      >
        <span class="thinking-dots">正在思考</span>
      </div>

      <!-- 编辑模式 -->
      <div
        v-if="isEditing"
        class="max-w-[85%]"
        :class="isUser ? 'ml-auto' : ''"
      >
        <textarea
          v-model="editContent"
          class="w-full rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          rows="3"
          @keydown.enter.ctrl="confirmEdit"
          @keydown.escape="cancelEdit"
        />
        <div
          class="flex gap-2 mt-1"
          :class="isUser ? 'justify-end' : ''"
        >
          <button
            class="text-xs px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors"
            @click="cancelEdit"
          >
            取消
          </button>
          <button
            class="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            @click="confirmEdit"
          >
            保存并发送
          </button>
        </div>
      </div>

      <!-- 按顺序穿插渲染思考、文本和工具调用 -->
      <template v-if="!isEditing">
        <template
          v-for="(seg, i) in segments"
          :key="i"
        >
          <ThinkingBlock
            v-if="seg.type === 'thinking'"
            :content="seg.content"
          />
          <div
            v-else-if="seg.type === 'text' && seg.content"
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
              <span
                v-if="durationMs !== null"
                class="inline-flex items-center gap-1"
              >
                <span
                  v-if="isStreaming"
                  class="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"
                />
                {{ formatDuration(durationMs) }}
              </span>
              <span
                v-if="displayUsage"
                class="inline-flex items-center gap-1.5"
              >
                <span title="输入 tokens">↑ {{ formatTokenCount(displayUsage.inputTokens) }}</span>
                <span title="输出 tokens">↓ {{ formatTokenCount(displayUsage.outputTokens) }}</span>
              </span>
            </div>
          </div>
          <div
            v-else-if="seg.type === 'tool-call'"
            class="max-w-[85%]"
          >
            <ToolCallCard
              :tool-call="seg.toolCall"
              @rerun="handleRerunTool"
            />
          </div>
        </template>
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
              <TooltipContent
                side="bottom"
                :side-offset="4"
              >
                编辑
              </TooltipContent>
            </Tooltip>

            <!-- 复制 -->
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  class="inline-flex items-center justify-center h-5 w-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  @click="copyContent"
                >
                  <Check
                    v-if="copied"
                    class="h-3 w-3 text-green-500"
                  />
                  <Copy
                    v-else
                    class="h-3 w-3"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                :side-offset="4"
              >
                {{ copied ? '已复制' : '复制' }}
              </TooltipContent>
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
              <TooltipContent
                side="bottom"
                :side-offset="4"
              >
                重新生成
              </TooltipContent>
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
              <TooltipContent
                side="bottom"
                :side-offset="4"
              >
                删除
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  </div>

  <!-- 原始文本查看对话框 -->
  <Dialog v-model:open="showRawDialog">
    <DialogScrollContent class="max-w-5xl">
      <DialogHeader>
        <DialogTitle>原始文本</DialogTitle>
        <DialogDescription>查看消息的原始输入和输出文本内容</DialogDescription>
      </DialogHeader>
      <div class="grid grid-cols-2 gap-4 mt-2">
        <!-- 左栏：输入侧 -->
        <div class="space-y-3 max-h-[70vh] overflow-y-auto">
          <!-- Prompt 卡片 -->
          <div
            v-if="inputPromptText"
            class="rounded-lg border bg-card p-3 space-y-1.5"
          >
            <div class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <svg
                class="w-3.5 h-3.5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              ><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" /><path d="M7 7h.01" /></svg>
              System Prompt
            </div>
            <pre class="bg-muted/50 rounded-md p-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono max-h-40 overflow-y-auto">{{ inputPromptText }}</pre>
          </div>
          <!-- 输入卡片 -->
          <div class="rounded-lg border bg-card p-3 space-y-1.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <svg
                  class="w-3.5 h-3.5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                ><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                输入
              </div>
              <span
                v-if="displayUsage"
                class="text-[11px] text-muted-foreground/50"
              >
                ↑ {{ formatTokenCount(displayUsage.inputTokens) }}
              </span>
            </div>
            <pre class="bg-muted/50 rounded-md p-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono max-h-60 overflow-y-auto">{{ inputRawText }}</pre>
          </div>
          <!-- 思考卡片 -->
          <div
            v-if="displayThinking"
            class="rounded-lg border bg-card p-3 space-y-1.5"
          >
            <div class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <svg
                class="w-3.5 h-3.5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              ><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              思考过程
            </div>
            <pre class="bg-muted/50 rounded-md p-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono max-h-40 overflow-y-auto">{{ displayThinking }}</pre>
          </div>
        </div>
        <!-- 右栏：输出 -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">输出</span>
            <span
              v-if="displayUsage"
              class="text-xs text-muted-foreground/60"
            >
              ↓ {{ formatTokenCount(displayUsage.outputTokens) }} tokens
            </span>
          </div>
          <pre class="bg-muted/50 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap break-words max-h-[70vh] overflow-y-auto font-mono border">{{ outputRawText }}</pre>
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
