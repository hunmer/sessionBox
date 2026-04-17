import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { ChatSession, ChatMessage, ToolCall } from '@/types'
import {
  createSession as dbCreateSession,
  listSessionsByScope as dbListSessionsByScope,
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
import { useChatUIStore } from './chat-ui'
import { useWorkflowStore } from './workflow'
import { runAgentStream } from '@/lib/agent/agent'

export function createChatStore(scope: string) {
  const storeId = `chat-${scope}`
  return defineStore(storeId, () => {
    const sessions = ref<ChatSession[]>([])
    const currentSessionId = ref<string | null>(null)
    const messages = ref<ChatMessage[]>([])
    const isStreaming = ref(false)

    // 流式输出临时状态
    const streamingToken = ref('')
    const streamingToolCalls = ref<ToolCall[]>([])
    const streamingThinking = ref('')
    const streamingUsage = ref<{ inputTokens: number; outputTokens: number } | null>(null)
    const retryStatus = ref<{ attempt: number; maxRetries: number; delayMs: number; status: number } | null>(null)
    const abortController = ref<AbortController | null>(null)
    const streamingMessageId = ref<string | null>(null)
    let streamCleanup: (() => void) | null = null
    let currentRequestId: string | null = null

    const currentSession = computed(() =>
      sessions.value.find((s) => s.id === currentSessionId.value) ?? null,
    )

    // ===== 会话管理 =====

    async function loadSessions() {
      sessions.value = await dbListSessionsByScope(scope)
    }

    async function createSession() {
      const providerStore = useAIProviderStore()
      const uiStore = useChatUIStore()
      if (!providerStore.currentProvider || !providerStore.currentModel) {
        throw new Error('请先选择 AI 模型')
      }
      const session = await dbCreateSession(
        scope,
        providerStore.currentModel.id,
        providerStore.currentProvider.id,
        uiStore.targetTabId,
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

    async function streamAssistantReply(content: string, images?: string[]) {
      const sessionId = currentSessionId.value!
      const providerStore = useAIProviderStore()
      const uiStore = useChatUIStore()

      const assistantMsg = await dbAddMessage({
        sessionId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        modelId: providerStore.currentModel?.id,
      })
      messages.value.push(assistantMsg)
      streamingMessageId.value = assistantMsg.id

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
          .filter((m) => m.id !== assistantMsg.id && m.role !== 'system')
          .map((m) => ({
            role: m.role,
            content: m.content,
          }))

        // 工作流模式：注入工作流上下文
        const workflowStore = useWorkflowStore()
        const currentSessionData = sessions.value.find((s) => s.id === currentSessionId.value)
        const isWorkflowMode = !!currentSessionData?.workflowId
        const workflowOptions = isWorkflowMode && workflowStore.currentWorkflow ? {
          mode: 'workflow' as const,
          workflowId: workflowStore.currentWorkflow.id,
          workflowSummary: {
            id: workflowStore.currentWorkflow.id,
            name: workflowStore.currentWorkflow.name,
            description: workflowStore.currentWorkflow.description,
            nodes: workflowStore.currentWorkflow.nodes.map(n => ({ id: n.id, type: n.type, label: n.label })),
            edges: workflowStore.currentWorkflow.edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
          },
        } : undefined

        const result = await runAgentStream(
          history,
          content,
          images,
          {
            onToken: (token: string) => {
              streamingToken.value += token
            },
            onToolCall: (call: ToolCall) => {
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
                if (tc.completedAt && tc.status === 'completed') {
                  return
                }
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
                streamingMessageId.value = null
                streamCleanup = null
                currentRequestId = null
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
                streamingMessageId.value = null
                streamCleanup = null
                currentRequestId = null
              }
            },
          },
          uiStore.targetTabId,
          uiStore.enabledToolNames,
          workflowOptions,
        )

        if (result) {
          currentRequestId = result.requestId
          streamCleanup = result.cleanup
        }
      } catch (error) {
        isStreaming.value = false
        abortController.value = null
        streamingMessageId.value = null
        streamCleanup = null
        currentRequestId = null
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

      const userMsg = await dbAddMessage({
        sessionId,
        role: 'user',
        content,
        images,
        createdAt: Date.now(),
      })
      messages.value.push(userMsg)

      // 首条消息时自动设置标题
      const session = sessions.value.find((s) => s.id === sessionId)
      if (session && session.messageCount <= 1) {
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '')
        await dbUpdateSessionTitle(sessionId, title)
        session.title = title
      }

      await streamAssistantReply(content, images)
    }

    async function stopGeneration() {
      if (!abortController.value) return

      if (currentRequestId) {
        window.api.chat.abort(currentRequestId).catch(() => {})
        currentRequestId = null
      }
      abortController.value = null

      streamCleanup?.()
      streamCleanup = null

      const msgId = streamingMessageId.value
      if (msgId) {
        const updates: Partial<ChatMessage> = {
          content: streamingToken.value,
          thinking: streamingThinking.value || undefined,
          toolCalls: streamingToolCalls.value.length > 0
            ? JSON.parse(JSON.stringify(toRaw(streamingToolCalls.value)))
            : undefined,
        }
        await dbUpdateMessage(msgId, updates)
        const msgIndex = messages.value.findIndex((m) => m.id === msgId)
        if (msgIndex !== -1) {
          messages.value[msgIndex] = { ...messages.value[msgIndex], ...updates }
        }
      }

      // 追加系统消息
      const sessionId = currentSessionId.value
      if (sessionId) {
        const systemMsg = await dbAddMessage({
          sessionId,
          role: 'system',
          content: '用户已中断操作',
          createdAt: Date.now(),
        })
        messages.value.push(systemMsg)
      }

      isStreaming.value = false
      streamingMessageId.value = null
      retryStatus.value = null
    }

    // ===== 消息操作 =====

    async function deleteMessageById(messageId: string) {
      await dbDeleteMessage(messageId)
      messages.value = messages.value.filter((m) => m.id !== messageId)
    }

    async function deleteMessageAndAfter(messageId: string) {
      const index = messages.value.findIndex((m) => m.id === messageId)
      if (index === -1) return
      const idsToDelete = messages.value.slice(index).map((m) => m.id)
      await dbDeleteMessages(idsToDelete)
      messages.value = messages.value.slice(0, index)
    }

    async function retryMessage(messageId: string) {
      if (isStreaming.value) return
      const index = messages.value.findIndex((m) => m.id === messageId)
      if (index === -1) return

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

      const idsToDelete = messages.value.slice(index).map((m) => m.id)
      await dbDeleteMessages(idsToDelete)
      messages.value = messages.value.slice(0, index)

      await streamAssistantReply(userContent, userImages)
    }

    async function editMessage(messageId: string, newContent: string) {
      if (isStreaming.value) return
      const index = messages.value.findIndex((m) => m.id === messageId)
      if (index === -1) return

      await dbUpdateMessage(messageId, { content: newContent })
      messages.value[index] = { ...messages.value[index], content: newContent }

      if (index < messages.value.length - 1) {
        const idsToDelete = messages.value.slice(index + 1).map((m) => m.id)
        await dbDeleteMessages(idsToDelete)
        messages.value = messages.value.slice(0, index + 1)
      }

      await streamAssistantReply(newContent, messages.value[index].images)
    }

    async function rerunTool(messageId: string, toolCallId: string) {
      const msgIndex = messages.value.findIndex((m) => m.id === messageId)
      if (msgIndex === -1) return
      const msg = messages.value[msgIndex]
      if (!msg.toolCalls) return
      const tcIndex = msg.toolCalls.findIndex((tc) => tc.id === toolCallId)
      if (tcIndex === -1) return

      const tc = msg.toolCalls[tcIndex]

      const updatedCalls = [...msg.toolCalls]
      updatedCalls[tcIndex] = { ...tc, status: 'running' as const, result: undefined, error: undefined, startedAt: Date.now(), completedAt: undefined }
      const updates: Partial<ChatMessage> = { toolCalls: updatedCalls }
      messages.value[msgIndex] = { ...msg, ...updates }

      try {
        const rawResult = await window.api.agent.execTool(tc.name, tc.args)
        const result = JSON.parse(JSON.stringify(rawResult))
        const now = Date.now()
        const hasError = result && typeof result === 'object' && 'error' in result
        const finalCalls = [...updatedCalls]
        finalCalls[tcIndex] = {
          ...updatedCalls[tcIndex],
          status: hasError ? 'error' : ('completed' as const),
          result: hasError ? undefined : result,
          error: hasError ? (result as { error: string }).error : undefined,
          completedAt: now,
        }
        const finalUpdates: Partial<ChatMessage> = { toolCalls: finalCalls }
        await dbUpdateMessage(messageId, finalUpdates)
        messages.value[msgIndex] = { ...messages.value[msgIndex], ...finalUpdates }
      } catch (err) {
        const now = Date.now()
        const finalCalls = [...updatedCalls]
        finalCalls[tcIndex] = {
          ...updatedCalls[tcIndex],
          status: 'error' as const,
          error: err instanceof Error ? err.message : String(err),
          completedAt: now,
        }
        const finalUpdates: Partial<ChatMessage> = { toolCalls: finalCalls }
        await dbUpdateMessage(messageId, finalUpdates)
        messages.value[msgIndex] = { ...messages.value[msgIndex], ...finalUpdates }
      }
    }

    // ===== 工作流会话管理 =====

    async function switchToWorkflowSession(workflowId: string | undefined) {
      if (!workflowId) return

      const existing = sessions.value.find((s) => s.workflowId === workflowId)
      if (existing) {
        if (currentSessionId.value === existing.id) return
        currentSessionId.value = existing.id
        messages.value = await dbListMessages(existing.id)
        return
      }

      const providerStore = useAIProviderStore()
      if (!providerStore.currentProvider || !providerStore.currentModel) {
        throw new Error('请先选择 AI 模型')
      }
      const session = await dbCreateSession(
        scope,
        providerStore.currentModel.id,
        providerStore.currentProvider.id,
        null,
        workflowId,
      )
      sessions.value.unshift(session)
      currentSessionId.value = session.id
      messages.value = []
    }

    // ===== 初始化 =====

    async function init() {
      await loadSessions()

      if (sessions.value.length > 0 && !currentSessionId.value) {
        await switchSession(sessions.value[0].id)
      }
    }

    return {
      scope,
      sessions,
      currentSessionId,
      messages,
      isStreaming,
      streamingToken,
      streamingToolCalls,
      streamingThinking,
      streamingUsage,
      retryStatus,
      currentSession,
      loadSessions,
      createSession,
      deleteSessionById,
      switchSession,
      clearSessionMessages,
      sendMessage,
      streamAssistantReply,
      stopGeneration,
      deleteMessageById,
      deleteMessageAndAfter,
      retryMessage,
      editMessage,
      rerunTool,
      switchToWorkflowSession,
      init,
    }
  })()
}

export type ChatStoreInstance = ReturnType<typeof createChatStore>
