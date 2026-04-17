import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { executeWorkflowTool, type ToolResult } from './workflow-tool-executor'

export type WorkflowToolOwner = 'main' | 'renderer'

export const WORKFLOW_TOOL_OWNERS: Record<string, WorkflowToolOwner> = {
  get_workflow: 'main',
  get_current_workflow: 'renderer',
  list_node_types: 'main',
  create_node: 'main',
  update_node: 'main',
  delete_node: 'main',
  create_edge: 'main',
  delete_edge: 'main',
  batch_update: 'main',
  auto_layout: 'main',
  execute_workflow_sync: 'renderer',
  execute_workflow_async: 'renderer',
  get_workflow_result: 'renderer',
}

interface PendingRendererToolRequest {
  chatRequestId: string
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const RENDERER_TOOL_TIMEOUT_MS = 10_000
const WORKFLOW_EXECUTION_TIMEOUT_MS = 300_000 // 工作流执行最长等待 5 分钟
const pendingRendererToolRequests = new Map<string, PendingRendererToolRequest>()

function cleanupPendingRendererToolRequest(requestId: string): void {
  const pending = pendingRendererToolRequests.get(requestId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingRendererToolRequests.delete(requestId)
}

export function resolvePendingRendererTool(requestId: string, result: unknown): boolean {
  const pending = pendingRendererToolRequests.get(requestId)
  if (!pending) return false
  cleanupPendingRendererToolRequest(requestId)
  pending.resolve(result)
  return true
}

export function rejectPendingRendererToolsForRequest(chatRequestId: string, error: Error): void {
  for (const [requestId, pending] of pendingRendererToolRequests.entries()) {
    if (pending.chatRequestId !== chatRequestId) {
      continue
    }
    cleanupPendingRendererToolRequest(requestId)
    pending.reject(error)
  }
}

const WORKFLOW_EXECUTION_TOOLS = new Set([
  'execute_workflow_sync',
])

async function executeRendererWorkflowTool(
  mainWindow: BrowserWindow,
  chatRequestId: string,
  toolUseId: string,
  name: string,
  args: Record<string, unknown>,
  workflowId: string,
): Promise<unknown> {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return { success: false, message: '主窗口不可用，无法执行渲染进程工具' }
  }

  const requestId = randomUUID()
  const timeout = WORKFLOW_EXECUTION_TOOLS.has(name)
    ? WORKFLOW_EXECUTION_TIMEOUT_MS
    : RENDERER_TOOL_TIMEOUT_MS

  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanupPendingRendererToolRequest(requestId)
      resolve({ success: false, message: `渲染进程工具执行超时: ${name}` })
    }, timeout)

    pendingRendererToolRequests.set(requestId, {
      chatRequestId,
      resolve,
      reject: (error) => resolve({ success: false, message: error.message }),
      timer,
    })

    mainWindow.webContents.send('on:workflow-tool:execute', {
      requestId,
      toolUseId,
      name,
      args,
      workflowId,
    })
  })
}

export async function dispatchWorkflowTool(
  mainWindow: BrowserWindow,
  chatRequestId: string,
  toolUseId: string,
  name: string,
  args: Record<string, unknown>,
  workflowId: string,
): Promise<ToolResult | unknown> {
  const owner = WORKFLOW_TOOL_OWNERS[name]

  if (!owner) {
    return { success: false, message: `未知工作流工具: ${name}` }
  }

  if (owner === 'main') {
    return executeWorkflowTool(name, args, workflowId, mainWindow)
  }

  return executeRendererWorkflowTool(mainWindow, chatRequestId, toolUseId, name, args, workflowId)
}
