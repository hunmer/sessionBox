import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { ChatSession, ChatMessage, ToolCall } from '@/types'
import {
  createSession as dbCreateSession,
  listSessions as dbListSessions,
  deleteSession as dbDeleteSession,
  updateSessionTitle as dbUpdateSessionTitle,
  addMessage as dbAddMessage,
  listMessages as dbListMessages,
  updateMessage as dbUpdateMessage,
  deleteMessage as dbDeleteMessage,
  deleteMessages as dbDeleteMessages,
  clearMessages as dbClearMessages,
} from '@/lib/chat-db'
import { useAIProviderStore } from './ai-provider'
import { useTabStore } from './tab'
import { runAgentStream } from '@/lib/agent/agent'
import { BROWSER_TOOL_LIST } from '@/lib/agent/tools'

const PANEL_VISIBLE_KEY = 'sessionbox-chat-panel-visible'
const TARGET_TAB_KEY = 'sessionbox-chat-target-tab'
const ENABLED_TOOLS_KEY = 'sessionbox-chat-enabled-tools'

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const isPanelVisible = ref(localStorage.getItem(PANEL_VISIBLE_KEY) === '1')
  const targetTabId = ref<string | null>(localStorage.getItem(TARGET_TAB_KEY))

  // 流式输出临时状态
  const streamingToken = ref('')
  const streamingToolCalls = ref<ToolCall[]>([])
  const streamingThinking = ref('')
  const streamingUsage = ref<{ inputTokens: number; outputTokens: number } | null>(null)
  const retryStatus = ref<{ attempt: number; maxRetries: number; delayMs: number; status: number } | null>(null)
  const abortController = ref<AbortController | null>(null)

  // ===== 工具启用状态 =====

  /** 从 localStorage 恢复已启用工具，默认全部启用 */
  function loadEnabledTools(): Record<string, boolean> {
    try {
      const stored = localStorage.getItem(ENABLED_TOOLS_KEY)
      if (stored) return JSON.parse(stored)
    } catch { /* ignore */ }
    // 默认全部启用
    const defaults: Record<string, boolean> = {}
    for (const tool of BROWSER_TOOL_LIST) {
      defaults[tool.name] = true
    }
    return defaults
  }

  const enabledTools = ref<Record<string, boolean>>(loadEnabledTools())

  function toggleTool(name: string) {
    enabledTools.value[name] = !enabledTools.value[name]
    localStorage.setItem(ENABLED_TOOLS_KEY, JSON.stringify(enabledTools.value))
  }

  function isToolEnabled(name: string): boolean {
    return enabledTools.value[name] !== false
  }

  /** 获取当前启用的工具名称集合 */
  const enabledToolNames = computed(() => {
    return new Set(
      BROWSER_TOOL_LIST
        .filter((t) => enabledTools.value[t.name] !== false)
        .map((t) => t.name),
    )
  })

  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value) ?? null,
  )

  // ===== 会话管理 =====

  async function loadSessions() {
    sessions.value = await dbListSessions()
  }

  async function createSession() {
    const providerStore = useAIProviderStore()
    if (!providerStore.currentProvider || !providerStore.currentModel) {
      throw new Error('请先选择 AI 模型')
    }
    const session = await dbCreateSession(
      providerStore.currentModel.id,
      providerStore.currentProvider.id,
      targetTabId.value,
    )
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    messages.value = []
    return session
  }

  async function deleteSessionById(id: string) {
    await dbDeleteSession(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (currentSessionId.value === id) {
      currentSessionId.value = null
      messages.value = []
    }
  }

  async function switchSession(id: string) {
    currentSessionId.value = id
    messages.value = await dbListMessages(id)
  }

  async function clearSessionMessages(id: string) {
    await dbClearMessages(id)
    if (currentSessionId.value === id) {
      messages.value = []
    }
    const session = sessions.value.find((s) => s.id === id)
    if (session) {
      session.messageCount = 0
    }
  }

  // ===== 消息发送 =====

  /**
   * 核心流式请求：创建助手占位消息，发送请求，处理回调和持久化。
   * 被 sendMessage（新消息）和 retryMessage（重试）共用。
   */
  async function streamAssistantReply(content: string, images?: string[]) {
    const sessionId = currentSessionId.value!
    const providerStore = useAIProviderStore()

    const assistantMsg = await dbAddMessage({
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      modelId: providerStore.currentModel?.id,
    })
    messages.value.push(assistantMsg)

    isStreaming.value = true
    streamingToken.value = ''
    streamingToolCalls.value = []
    streamingThinking.value = ''
    streamingUsage.value = null
    retryStatus.value = null

    try {
      const controller = new AbortController()
      abortController.value = controller

      const history = messages.value
        .filter((m) => m.id !== assistantMsg.id)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }))

      await runAgentStream(
        history,
        content,
        images,
        {
          onToken: (token: string) => {
            streamingToken.value += token
          },
          onToolCall: (call: ToolCall) => {
            // 记录工具调用在当前文本中的位置，用于按顺序穿插渲染
            call.textPosition = streamingToken.value.length
            streamingToolCalls.value.push(call)
          },
          onToolCallArgs: (event: { toolUseId: string; args: Record<string, unknown> }) => {
            const tc = streamingToolCalls.value.find((t) => t.id === event.toolUseId)
            if (tc) {
              tc.args = event.args
            }
          },
          onToolResult: (event: { toolUseId: string; name: string; result: unknown }) => {
            const tc = streamingToolCalls.value.find((t) => t.id === event.toolUseId)
            if (tc) {
              tc.status = 'completed'
              tc.result = event.result
              tc.completedAt = Date.now()
            }
          },
          onThinking: (thinkContent: string) => {
            streamingThinking.value += thinkContent
          },
          onUsage: (usage) => {
            streamingUsage.value = usage
          },
          onRetry: (event) => {
            retryStatus.value = {
              attempt: event.attempt,
              maxRetries: event.maxRetries,
              delayMs: event.delayMs,
              status: event.status,
            }
          },
          onDone: async () => {
            try {
              const updates: Partial<ChatMessage> = {
                content: streamingToken.value,
                thinking: streamingThinking.value || undefined,
                toolCalls: streamingToolCalls.value.length > 0
                  ? JSON.parse(JSON.stringify(toRaw(streamingToolCalls.value)))
                  : undefined,
                usage: streamingUsage.value
                  ? { ...toRaw(streamingUsage.value) }
                  : undefined,
              }
              await dbUpdateMessage(assistantMsg.id, updates)
              const msgIndex = messages.value.findIndex((m) => m.id === assistantMsg.id)
              if (msgIndex !== -1) {
                messages.value[msgIndex] = { ...messages.value[msgIndex], ...updates }
              }
            } finally {
              retryStatus.value = null
              isStreaming.value = false
              abortController.value = null
            }
          },
          onError: async (error: Error) => {
            try {
              const updates: Partial<ChatMessage> = {
                content: streamingToken.value || `[错误] ${error.message}`,
              }
              await dbUpdateMessage(assistantMsg.id, updates)
              const msgIndex = messages.value.findIndex((m) => m.id === assistantMsg.id)
              if (msgIndex !== -1) {
                messages.value[msgIndex] = { ...messages.value[msgIndex], ...updates }
              }
            } finally {
              retryStatus.value = null
              isStreaming.value = false
              abortController.value = null
            }
          },
        },
        targetTabId.value,
        enabledToolNames.value,
      )
    } catch (error) {
      isStreaming.value = false
      abortController.value = null
      const msgIndex = messages.value.findIndex((m) => m.id === assistantMsg.id)
      if (msgIndex !== -1) {
        const errorContent = error instanceof Error ? error.message : String(error)
        messages.value[msgIndex] = { ...messages.value[msgIndex], content: `[错误] ${errorContent}` }
        await dbUpdateMessage(assistantMsg.id, { content: `[错误] ${errorContent}` })
      }
    }
  }

  async function sendMessage(content: string, images?: string[]) {
    if (isStreaming.value) return
    if (!currentSessionId.value) {
      await createSession()
    }
    const sessionId = currentSessionId.value!

    // 保存用户消息
    const userMsg = await dbAddMessage({
      sessionId,
      role: 'user',
      content,
      images,
      createdAt: Date.now(),
    })
    messages.value.push(userMsg)

    // 更新会话标题（首条消息时）
    const session = sessions.value.find((s) => s.id === sessionId)
    if (session && session.messageCount <= 1) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '')
      await dbUpdateSessionTitle(sessionId, title)
      session.title = title
    }

    await streamAssistantReply(content, images)
  }

  function stopGeneration() {
    if (abortController.value) {
      abortController.value.abort()
      isStreaming.value = false
      abortController.value = null
    }
  }

  // ===== 消息操作 =====

  /** 删除单条消息 */
  async function deleteMessageById(messageId: string) {
    await dbDeleteMessage(messageId)
    messages.value = messages.value.filter((m) => m.id !== messageId)
  }

  /** 删除指定消息及其之后的所有消息 */
  async function deleteMessageAndAfter(messageId: string) {
    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index === -1) return
    const idsToDelete = messages.value.slice(index).map((m) => m.id)
    await dbDeleteMessages(idsToDelete)
    messages.value = messages.value.slice(0, index)
  }

  /** 重试：删除最后一条 AI 回复，重新发送 */
  async function retryMessage(messageId: string) {
    if (isStreaming.value) return
    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index === -1) return

    // 找到这条 AI 消息之前最近的一条用户消息
    let userMsgIndex = -1
    for (let i = index - 1; i >= 0; i--) {
      if (messages.value[i].role === 'user') {
        userMsgIndex = i
        break
      }
    }
    if (userMsgIndex === -1) return

    const userMsg = messages.value[userMsgIndex]
    const userContent = userMsg.content
    const userImages = userMsg.images

    // 删除这条 AI 回复（及之后的所有消息），保留用户消息
    const idsToDelete = messages.value.slice(index).map((m) => m.id)
    await dbDeleteMessages(idsToDelete)
    messages.value = messages.value.slice(0, index)

    // 直接流式生成新回复，不再重复创建用户消息
    await streamAssistantReply(userContent, userImages)
  }

  /** 编辑用户消息：更新内容后重新生成 AI 回复 */
  async function editMessage(messageId: string, newContent: string) {
    if (isStreaming.value) return
    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index === -1) return

    // 更新数据库中的消息
    await dbUpdateMessage(messageId, { content: newContent })
    messages.value[index] = { ...messages.value[index], content: newContent }

    // 删除这条消息之后的所有消息
    if (index < messages.value.length - 1) {
      const idsToDelete = messages.value.slice(index + 1).map((m) => m.id)
      await dbDeleteMessages(idsToDelete)
      messages.value = messages.value.slice(0, index + 1)
    }

    // 重新生成 AI 回复（用户消息已就地更新，无需重复创建）
    await streamAssistantReply(newContent, messages.value[index].images)
  }

  // ===== 面板控制 =====

  function togglePanel() {
    isPanelVisible.value = !isPanelVisible.value
    localStorage.setItem(PANEL_VISIBLE_KEY, isPanelVisible.value ? '1' : '0')
  }

  function setTargetTab(tabId: string | null) {
    targetTabId.value = tabId
    if (tabId) {
      localStorage.setItem(TARGET_TAB_KEY, tabId)
    } else {
      localStorage.removeItem(TARGET_TAB_KEY)
    }
  }

  // ===== 初始化 =====

  async function init() {
    await loadSessions()

    // 自动激活最近使用的会话
    if (sessions.value.length > 0 && !currentSessionId.value) {
      await switchSession(sessions.value[0].id)
    }

    // targetTabId 保持 null 表示"跟随当前激活标签页"
    // 由 BrowserViewPicker 的 __current__ 选项控制
  }

  return {
    sessions,
    currentSessionId,
    messages,
    isStreaming,
    isPanelVisible,
    targetTabId,
    streamingToken,
    streamingToolCalls,
    streamingThinking,
    streamingUsage,
    retryStatus,
    currentSession,
    enabledTools,
    enabledToolNames,
    loadSessions,
    createSession,
    deleteSessionById,
    switchSession,
    clearSessionMessages,
    sendMessage,
    stopGeneration,
    deleteMessageById,
    deleteMessageAndAfter,
    retryMessage,
    editMessage,
    togglePanel,
    setTargetTab,
    toggleTool,
    isToolEnabled,
    init,
  }
})
