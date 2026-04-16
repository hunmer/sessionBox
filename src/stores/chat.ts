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

  async function sendMessage(content: string, images?: string[]) {
    if (isStreaming.value) return
    if (!currentSessionId.value) {
      await createSession()
    }
    const sessionId = currentSessionId.value!
    const providerStore = useAIProviderStore()

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

    // 创建助手消息占位
    const assistantMsg = await dbAddMessage({
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      modelId: providerStore.currentModel?.id,
    })
    messages.value.push(assistantMsg)

    // 开始流式请求
    isStreaming.value = true
    streamingToken.value = ''
    streamingToolCalls.value = []
    streamingThinking.value = ''

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
            streamingToolCalls.value.push(call)
          },
          onToolResult: (event: { toolUseId: string; name: string; result: unknown }) => {
            // 找到对应的 ToolCall，更新状态和结果
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
          onDone: async () => {
            // toRaw 解除 Vue 响应式 Proxy，确保 IndexedDB 可序列化
            const updates: Partial<ChatMessage> = {
              content: streamingToken.value,
              thinking: streamingThinking.value || undefined,
              toolCalls: streamingToolCalls.value.length > 0
                ? JSON.parse(JSON.stringify(toRaw(streamingToolCalls.value)))
                : undefined,
            }
            await dbUpdateMessage(assistantMsg.id, updates)
            const msgIndex = messages.value.findIndex((m) => m.id === assistantMsg.id)
            if (msgIndex !== -1) {
              messages.value[msgIndex] = { ...messages.value[msgIndex], ...updates }
            }
            isStreaming.value = false
            abortController.value = null
          },
          onError: async (error: Error) => {
            const updates: Partial<ChatMessage> = {
              content: streamingToken.value || `[错误] ${error.message}`,
            }
            await dbUpdateMessage(assistantMsg.id, updates)
            const msgIndex = messages.value.findIndex((m) => m.id === assistantMsg.id)
            if (msgIndex !== -1) {
              messages.value[msgIndex] = { ...messages.value[msgIndex], ...updates }
            }
            isStreaming.value = false
            abortController.value = null
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

  function stopGeneration() {
    if (abortController.value) {
      abortController.value.abort()
      isStreaming.value = false
      abortController.value = null
    }
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

    const tabStore = useTabStore()
    if (!targetTabId.value && tabStore.activeTabId) {
      setTargetTab(tabStore.activeTabId)
    }
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
    togglePanel,
    setTargetTab,
    toggleTool,
    isToolEnabled,
    init,
  }
})
