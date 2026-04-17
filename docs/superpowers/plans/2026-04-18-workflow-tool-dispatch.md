# Workflow Tool Dispatch 实施计划

**Goal:** 为工作流 AI 助手增加按归属分派的 LLM tools：`get_workflow` 在主进程按 `workflow_id` 读取最新保存文件，`get_current_workflow` 在渲染进程直接读取当前画布数据。

**Architecture:** 保留主进程 `ai-proxy` 的 LLM tool loop。新增轻量 workflow tool dispatcher：main-owned tools 继续调用 `executeWorkflowTool()`；renderer-owned tools 通过 IPC 请求渲染进程执行并等待响应。不要把整个 workflow tool loop 迁移到渲染进程。

**Spec:** `docs/superpowers/specs/2026-04-18-workflow-tool-dispatch-design.md`

**Important Reset Note:** 这个计划假设从干净工作树开始。上一轮被中断的代码改动不要沿用，尤其不要采用 `_singleRound`、前端完整 workflow tool loop、`workflow-tool-runner.ts` 这条路线。

---


## Task 1: 更新 Workflow Tool Schema 和 Prompt

**Files:**

- Modify: `src/lib/agent/workflow-tools.ts`

### Step 1: `WorkflowSummary` 支持 workflow id

为 `WorkflowSummary` 添加 `id`，用于 system prompt 注入当前 workflow_id。

```typescript
export interface WorkflowSummary {
  id: string
  name: string
  description?: string
  nodes: Array<{ id: string; type: string; label: string }>
  edges: Array<{ id: string; source: string; target: string }>
}
```

### Step 2: 修改 `get_workflow` schema

要求 `workflow_id` 必填。

```typescript
{
  name: 'get_workflow',
  description:
    '按 workflow_id 从磁盘读取指定工作流的最新已保存文件数据。默认返回摘要，summarize=false 返回完整数据。注意：它不包含当前画布未保存改动。',
  input_schema: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: '要读取的工作流 ID，必须显式传入。',
      },
      summarize: {
        type: 'boolean',
        description: '是否返回摘要。默认 true；false 返回完整 nodes/edges/data/position。',
        default: true,
      },
    },
    required: ['workflow_id'],
  },
}
```

### Step 3: 新增 `get_current_workflow` schema

添加到 `WORKFLOW_TOOL_DEFINITIONS`，位置建议紧跟 `get_workflow`。

```typescript
{
  name: 'get_current_workflow',
  description:
    '读取当前渲染进程画布中的工作流节点和连线，包含尚未保存到文件的最新编辑状态。默认返回摘要，summarize=false 返回完整数据。',
  input_schema: {
    type: 'object',
    properties: {
      summarize: {
        type: 'boolean',
        description: '是否返回摘要。默认 true；false 返回完整 nodes/edges/data/position。',
        default: true,
      },
    },
  },
}
```

### Step 4: 更新 system prompt 指引

在 prompt 中明确：

- 查看当前画布：用 `get_current_workflow`。
- 查看已保存文件：用 `get_workflow({ workflow_id })`。
- 修改前优先使用 `get_current_workflow`。
- `get_workflow` 必须传 `workflow_id`。

### Step 5: 在 prompt 中注入 workflow_id

`buildWorkflowSystemPrompt()` 输出中加入：

```text
当前 workflow_id: ${workflow.id}
```

并在 JSON summary 中包含 `id`。

---

## Task 2: 传入 Workflow Summary ID

**Files:**

- Modify: `src/lib/agent/agent.ts`
- Modify: `src/stores/chat.ts`

### Step 1: 更新 `AgentStreamOptions.workflowSummary`

```typescript
workflowSummary?: {
  id: string
  name: string
  description?: string
  nodes: Array<{ id: string; type: string; label: string }>
  edges: Array<{ id: string; source: string; target: string }>
}
```

### Step 2: 构造 workflow options 时传入 id

`src/stores/chat.ts` 中：

```typescript
workflowSummary: {
  id: workflowStore.currentWorkflow.id,
  name: workflowStore.currentWorkflow.name,
  description: workflowStore.currentWorkflow.description,
  nodes: workflowStore.currentWorkflow.nodes.map(n => ({ id: n.id, type: n.type, label: n.label })),
  edges: workflowStore.currentWorkflow.edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
}
```

---

## Task 3: 修改主进程 `get_workflow`

**Files:**

- Modify: `electron/services/workflow-tool-executor.ts`

### Step 1: 不要在函数入口强制读取 active workflow

当前函数入口会先根据参数 `workflowId` 读取工作流，然后所有工具共享 `nodes/edges`。为了让 `get_workflow` 显式按 `workflow_id` 读取文件，建议分两段处理：

```typescript
if (name === 'get_workflow') {
  return executeGetWorkflow(args)
}

const workflow = getWorkflow(workflowId)
if (!workflow) {
  return { success: false, message: `工作流 ${workflowId} 不存在` }
}
```

这样 `get_workflow` 不会被入口处的 `_workflowId` 影响。

### Step 2: 新增 `executeGetWorkflow`

```typescript
function getArgWorkflowId(args: any): string {
  return typeof args?.workflow_id === 'string'
    ? args.workflow_id
    : (typeof args?.workflowId === 'string' ? args.workflowId : '')
}

function executeGetWorkflow(args: any): ToolResult {
  const workflowId = getArgWorkflowId(args)
  if (!workflowId) {
    return { success: false, message: '缺少必填参数: workflow_id' }
  }

  const workflow = getWorkflow(workflowId)
  if (!workflow) {
    return { success: false, message: `工作流 ${workflowId} 不存在` }
  }

  const nodes = JSON.parse(JSON.stringify(workflow.nodes))
  const edges = JSON.parse(JSON.stringify(workflow.edges))
  const summarize = args?.summarize !== false

  if (summarize) {
    return {
      success: true,
      message: '工作流文件摘要',
      data: {
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          folderId: workflow.folderId,
          nodeCount: nodes.length,
          edgeCount: edges.length,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
          nodes: nodes.map((n: any) => ({
            id: n.id,
            type: n.type,
            label: n.label,
            nodeState: n.nodeState,
          })),
          edges: edges.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })),
        },
      },
    }
  }

  return {
    success: true,
    message: '工作流文件完整数据',
    data: { workflow: { ...workflow, nodes, edges } },
  }
}
```

### Step 3: 不在主进程实现 `get_current_workflow`

如果 `workflow-tool-executor.ts` 收到 `get_current_workflow`，只返回错误：

```typescript
case 'get_current_workflow':
  result = {
    success: false,
    message: 'get_current_workflow 只能在渲染进程直接读取当前画布数据',
  }
  break
```

正常情况下 dispatcher 不会把这个工具发给 `workflow-tool-executor.ts`。

---

## Task 4: 新增 Workflow Tool Dispatcher

**Files:**

- Create: `electron/services/workflow-tool-dispatcher.ts`
- Modify: `electron/services/ai-proxy.ts`

### Step 1: 创建 dispatcher 文件

创建 `electron/services/workflow-tool-dispatcher.ts`。

核心接口：

```typescript
import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { executeWorkflowTool, type ToolResult } from './workflow-tool-executor'

type WorkflowToolOwner = 'main' | 'renderer'

const WORKFLOW_TOOL_OWNERS: Record<string, WorkflowToolOwner> = {
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
}
```

### Step 2: 实现 pending renderer requests

```typescript
interface PendingRendererToolRequest {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const pendingRendererToolRequests = new Map<string, PendingRendererToolRequest>()
const RENDERER_TOOL_TIMEOUT_MS = 10_000
```

### Step 3: 实现 renderer tool 等待函数

```typescript
function executeRendererWorkflowTool(
  mainWindow: BrowserWindow,
  name: string,
  args: any,
  workflowId: string,
  toolUseId?: string,
): Promise<unknown> {
  if (mainWindow.isDestroyed()) {
    return Promise.resolve({ success: false, message: '渲染进程不可用' })
  }

  const requestId = randomUUID()

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRendererToolRequests.delete(requestId)
      resolve({ success: false, message: `渲染进程工具执行超时: ${name}` })
    }, RENDERER_TOOL_TIMEOUT_MS)

    pendingRendererToolRequests.set(requestId, {
      resolve: (result) => {
        clearTimeout(timer)
        pendingRendererToolRequests.delete(requestId)
        resolve(result)
      },
      reject: (error) => {
        clearTimeout(timer)
        pendingRendererToolRequests.delete(requestId)
        resolve({ success: false, message: error.message })
      },
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
```

### Step 4: 实现公开 dispatch 函数

```typescript
export async function executeDispatchedWorkflowTool(
  name: string,
  args: any,
  workflowId: string,
  mainWindow: BrowserWindow,
  toolUseId?: string,
): Promise<unknown> {
  const owner = WORKFLOW_TOOL_OWNERS[name]
  if (!owner) {
    return { success: false, message: `未知工作流工具: ${name}` }
  }

  if (owner === 'renderer') {
    return executeRendererWorkflowTool(mainWindow, name, args, workflowId, toolUseId)
  }

  return executeWorkflowTool(name, args, workflowId, mainWindow)
}
```

### Step 5: 实现 renderer response 入口

```typescript
export function respondRendererWorkflowTool(requestId: string, result: unknown): boolean {
  const pending = pendingRendererToolRequests.get(requestId)
  if (!pending) return false
  pending.resolve(result)
  return true
}

export function clearPendingRendererWorkflowTools(): void {
  for (const [requestId, pending] of pendingRendererToolRequests) {
    clearTimeout(pending.timer)
    pending.resolve({ success: false, message: '请求已取消' })
    pendingRendererToolRequests.delete(requestId)
  }
}
```

### Step 6: `ai-proxy` 使用 dispatcher

`electron/services/ai-proxy.ts`：

替换导入：

```typescript
import { executeDispatchedWorkflowTool } from './workflow-tool-dispatcher'
```

替换 workflow tool 执行：

```typescript
if (_mode === 'workflow' && _workflowId) {
  result = await executeDispatchedWorkflowTool(tc.name, tc.args, _workflowId, mainWindow, tc.id)
} else {
  result = await executeTool(tc.name, tc.args, targetTabId, enabledToolNames)
}
```

不要添加 `_singleRound`。

---

## Task 5: IPC 注册 Renderer Tool Response

**Files:**

- Modify: `electron/ipc/chat.ts`
- Modify: `preload/index.ts`

### Step 1: 注册主进程 handler

`electron/ipc/chat.ts`：

```typescript
import { respondRendererWorkflowTool } from '../services/workflow-tool-dispatcher'
```

在 `registerChatIpcHandlers()` 中添加：

```typescript
ipcMain.handle('workflow-tool:respond', (_event, requestId: string, result: unknown) => {
  return { handled: respondRendererWorkflowTool(requestId, result) }
})
```

不要添加 `workflow:execTool`。

### Step 2: preload 暴露 response API

`preload/index.ts`：

```typescript
workflowTool: {
  respond: (requestId: string, result: unknown): Promise<{ handled: boolean }> =>
    ipcRenderer.invoke('workflow-tool:respond', requestId, result),
},
```

现有通用 `api.on()` 已能监听 `on:workflow-tool:execute`，不需要新增监听方法。

---

## Task 6: 渲染进程实现 `get_current_workflow`

**Files:**

- Create: `src/lib/agent/workflow-renderer-tools.ts`
- Modify: `src/stores/workflow.ts`

### Step 1: 创建渲染进程工具文件

创建 `src/lib/agent/workflow-renderer-tools.ts`：

```typescript
import { useWorkflowStore } from '@/stores/workflow'
import type { Workflow } from '@/lib/workflow/types'

interface ToolResult {
  success: boolean
  message: string
  data?: unknown
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function summarizeWorkflow(workflow: Workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    folderId: workflow.folderId,
    nodeCount: workflow.nodes.length,
    edgeCount: workflow.edges.length,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    nodes: workflow.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      nodeState: n.nodeState,
    })),
    edges: workflow.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  }
}

function getCurrentWorkflow(args: Record<string, unknown> = {}): ToolResult {
  const workflowStore = useWorkflowStore()
  const workflow = workflowStore.currentWorkflow
  if (!workflow) {
    return { success: false, message: '当前没有加载工作流画布' }
  }

  const plain = clone(workflow)
  if (args.summarize === false) {
    return { success: true, message: '当前画布完整数据', data: { workflow: plain } }
  }

  return {
    success: true,
    message: '当前画布摘要',
    data: { workflow: summarizeWorkflow(plain) },
  }
}

export function executeRendererWorkflowTool(
  name: string,
  args: Record<string, unknown> = {},
): ToolResult {
  switch (name) {
    case 'get_current_workflow':
      return getCurrentWorkflow(args)
    default:
      return { success: false, message: `未知渲染进程工作流工具: ${name}` }
  }
}
```

### Step 2: workflow store 监听主进程请求

`src/stores/workflow.ts`：

```typescript
import { executeRendererWorkflowTool } from '@/lib/agent/workflow-renderer-tools'
```

新增函数：

```typescript
function listenForRendererToolRequests() {
  return (window as any).api.on('workflow-tool:execute', async (data: any) => {
    const result = executeRendererWorkflowTool(data.name, data.args || {})
    await (window as any).api.workflowTool.respond(data.requestId, JSON.parse(JSON.stringify(result)))
  })
}
```

在 store return 中导出。

### Step 3: WorkflowEditor 挂载监听

`src/components/workflow/WorkflowEditor.vue` 已经在 `onMounted` 中调用 `store.listenForFileUpdates()`。增加一个 cleanup：

```typescript
let cleanupRendererToolRequests: (() => void) | null = null

onMounted(() => {
  cleanupFileUpdates = store.listenForFileUpdates()
  cleanupRendererToolRequests = store.listenForRendererToolRequests()
})

onUnmounted(() => {
  cleanupFileUpdates?.()
  cleanupRendererToolRequests?.()
})
```

确保不要重复注册。如果 WorkflowEditor 会多次挂载，cleanup 必须生效。

---

## Task 7: UI Tool Result 去重

**Files:**

- Modify: `src/stores/chat.ts`

### Step 1: 当前逻辑评估

现有 `onToolResult` 按 `toolUseId` 找 streaming tool call 并写入 result。如果渲染进程本地执行后已经写入，主进程随后也发送同一个 result，可能重复赋值。

### Step 2: 添加轻量去重

在 `onToolResult` 中：

```typescript
if (tc.completedAt && tc.result !== undefined) {
  return
}
```

或者只允许后来的主进程事件覆盖 error 状态：

```typescript
if (tc.completedAt && tc.status === 'completed') return
```

本任务只处理重复 UI 更新，不改变 LLM tool loop。

---

## Task 8: Abort 与清理

**Files:**

- Modify: `electron/services/workflow-tool-dispatcher.ts`
- Modify: `electron/services/ai-proxy.ts`

### Step 1: 聊天 abort 时清理 pending renderer tool

如果实现了 `clearPendingRendererWorkflowTools()`，在 `proxyChatCompletions()` 的 `finally` 中按当前 request 清理更好。

最低要求：

- 超时一定清理。
- `mainWindow.isDestroyed()` 时返回错误。
- `chat:abort` 至少不会导致 pending request 永久留在 Map。

### Step 2: 更精确的 request 级清理

推荐 pending map 存储 `chatRequestId`：

```typescript
interface PendingRendererToolRequest {
  chatRequestId: string
  resolve: (result: unknown) => void
  timer: NodeJS.Timeout
}
```

`executeDispatchedWorkflowTool()` 增加 `chatRequestId` 参数，然后在 `proxyChatCompletions()` 传 `_requestId`。

清理：

```typescript
clearPendingRendererWorkflowToolsForRequest(_requestId)
```

如果想保持最小改动，可以先只实现超时清理。

---

## Task 9: 验证

### Static Checks

```bash
pnpm exec tsc -b --pretty false
```

如项目没有单独 typecheck script，使用上面的 TypeScript build mode。

### Manual Tests

- 打开一个工作流，新增节点但不保存。
- 在 AI 助手中问“当前画布有哪些节点”，确认调用 `get_current_workflow`，并返回未保存节点。
- 要求“读取已保存文件数据”，确认调用 `get_workflow` 且参数包含 `workflow_id`。
- 人为让模型或手动调用缺少 `workflow_id` 的 `get_workflow`，确认返回缺参错误。
- 调用 `create_node`，确认仍由主进程写文件，并触发 `on:workflow:updated` merge 到画布。
- 停止生成，确认没有控制台 pending request 报错或内存泄漏迹象。

### Code Review Checklist

- 没有 `_singleRound`。
- 没有 `workflow:execTool`。
- 没有 `src/lib/agent/workflow-tool-runner.ts`。
- 没有把完整 workflow tool loop 搬到渲染进程。
- 没有 `webContents.executeJavaScript()` 用于读取画布数据。
- `get_workflow` schema 必填 `workflow_id`。
- `get_current_workflow` 只在渲染进程读取 `useWorkflowStore().currentWorkflow`。
- renderer-owned tool 有超时和 cleanup。
