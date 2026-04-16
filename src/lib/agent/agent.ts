import { createBrowserTools } from './tools'
import { listenToChatStream, type StreamCallbacks } from './stream'
import { useAIProviderStore } from '@/stores/ai-provider'

/**
 * 通过主进程 API 代理运行 Agent 流式请求。
 * 渲染进程构造请求参数，主进程注入 API Key 并转发到 LLM 供应商。
 * 返回 requestId（用于 abort）和 cleanup（用于清理 IPC 监听器）。
 */
export async function runAgentStream(
  history: Array<{ role: string; content: string }>,
  input: string,
  images: string[] | undefined,
  callbacks: StreamCallbacks,
  targetTabId: string | null,
  enabledToolNames?: Set<string>,
): Promise<{ requestId: string; cleanup: () => void }> {
  const providerStore = useAIProviderStore()
  const provider = providerStore.currentProvider
  const model = providerStore.currentModel

  if (!provider || !model) {
    callbacks.onError(new Error('请先配置 AI 供应商和模型'))
    return { requestId: '', cleanup: () => {} }
  }

  // 构造消息（含图片支持）
  const userContent = images?.length
    ? [
        ...images.map((img) => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: 'image/png' as const, data: img },
        })),
        { type: 'text' as const, text: input },
      ]
    : input

  const messages = [
    ...history.map((h) => ({
      role: h.role,
      content: h.content,
    })),
    { role: 'user', content: userContent },
  ]

  // 构造工具定义（Anthropic 格式，纯 JSON Schema，可安全通过 IPC 序列化）
  const allTools = createBrowserTools(targetTabId)
  const tools = enabledToolNames
    ? allTools.filter((t) => enabledToolNames.has(t.name))
    : allTools

  const requestId = crypto.randomUUID()

  // 监听流式回调
  const cleanup = listenToChatStream(requestId, callbacks)

  // 发送请求到主进程
  try {
    await window.api.chat.completions({
      _requestId: requestId,
      providerId: provider.id,
      modelId: model.id,
      messages,
      tools,
      stream: true,
      maxTokens: model.maxTokens || 4096,
      targetTabId: targetTabId ?? undefined,
      ...(model.supportsThinking ? { thinking: { type: 'enabled' as const, budgetTokens: 2000 } } : {}),
    })
  } catch (error) {
    cleanup()
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }

  return { requestId, cleanup }
}
