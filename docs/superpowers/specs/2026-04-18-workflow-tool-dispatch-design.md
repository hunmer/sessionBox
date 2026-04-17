# Workflow Tool Dispatch 设计规范

**日期**: 2026-04-18
**状态**: 待实施

## 背景

工作流 AI 助手当前的 LLM tool loop 在主进程中完成：模型返回 `tool_use` 后，`electron/services/ai-proxy.ts` 直接调用 `electron/services/workflow-tool-executor.ts` 执行工具，再把 `tool_result` 追加到下一轮 LLM 请求。

这个结构适合读写磁盘文件和执行持久化编辑，但不适合获取渲染进程中的当前画布状态。当前画布数据属于渲染进程的 Pinia/VueFlow 状态，可能包含尚未保存到工作流 JSON 文件的节点、连线、位置和节点数据。

本规范定义一个混合 tool dispatch 方案：

- 文件/持久化工具继续由主进程执行。
- 当前画布工具由渲染进程执行。
- 主进程只作为 LLM tool loop 的调度者，不通过执行 JS 脚本读取画布。
- 主进程不得主动从渲染进程拉取画布数据再返回给渲染进程作为 UI 数据。
- 渲染进程执行 `get_current_workflow` 后，结果同时用于 UI tool result 展示和返回给主进程继续 LLM 轮次。

## 目标

- `get_workflow` 必须显式传入 `workflow_id`。
- `get_workflow` 读取指定 workflow 文件的最新保存数据，而不是隐式使用当前对话绑定 ID。
- 新增 `get_current_workflow`，用于获取当前画布的节点和连线数据。
- `get_current_workflow` 必须在渲染进程直接读取 `useWorkflowStore().currentWorkflow`，不能使用 `webContents.executeJavaScript()` 或类似脚本注入方式。
- LLM tools 支持按工具归属分派到主进程或渲染进程执行。
- 保持现有主进程 LLM tool loop，不整体迁移到渲染进程，降低改动范围。

## 非目标

- 不重写浏览器 agent 工具链。
- 不把所有 workflow 工具迁移到渲染进程。
- 不新增通过主进程查询 VueFlow DOM 或执行页面脚本的能力。
- 不改变现有 workflow 编辑类工具的持久化策略。
- 不引入通用 RPC 框架，只做 workflow tool 所需的最小 IPC 请求/响应。

## 工具归属

| 工具名 | 归属 | 原因 |
|--------|------|------|
| `get_workflow` | 主进程 | 读取 workflow JSON 文件，必须按 `workflow_id` 获取最新保存数据 |
| `get_current_workflow` | 渲染进程 | 读取当前画布状态，可能包含未保存改动 |
| `list_node_types` | 主进程 | 静态节点类型定义，目前已在主进程 executor 中维护 |
| `create_node` | 主进程 | 修改工作流文件，并通过 `on:workflow:updated` 通知画布 merge |
| `update_node` | 主进程 | 修改工作流文件，并通过 `on:workflow:updated` 通知画布 merge |
| `delete_node` | 主进程 | 修改工作流文件，并通过 `on:workflow:updated` 通知画布 merge |
| `create_edge` | 主进程 | 修改工作流文件，并通过 `on:workflow:updated` 通知画布 merge |
| `delete_edge` | 主进程 | 修改工作流文件，并通过 `on:workflow:updated` 通知画布 merge |
| `batch_update` | 主进程 | 原子化修改文件，失败时不写入 |
| `auto_layout` | 主进程 | 使用 dagre 修改节点 position 并写回文件 |

建议新增常量：

```typescript
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

## 工具 Schema

### `get_workflow`

`get_workflow` 读取磁盘中指定 workflow 文件的最新保存数据。它不表示当前画布状态。

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

主进程执行要求：

- 缺少 `workflow_id` 时返回 `{ success: false, message: '缺少必填参数: workflow_id' }`。
- 使用 `getWorkflow(workflow_id)` 读取文件。
- 每次调用都重新读文件，不能复用函数入口处提前读取的 `workflowId` 数据。
- `summarize` 默认值为 `true`，只有显式 `false` 才返回完整数据。
- 兼容字段可接受 `workflowId`，但 schema 和 prompt 只暴露 `workflow_id`。

### `get_current_workflow`

`get_current_workflow` 读取当前渲染进程画布状态。它不访问磁盘，不通过主进程执行脚本，不通过主进程从渲染进程拉取数据。

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

渲染进程执行要求：

- 直接读取 `useWorkflowStore().currentWorkflow`。
- 返回 JSON-compatible plain object，避免 Vue reactive proxy 进入 IPC。
- 如果没有当前工作流，返回 `{ success: false, message: '当前没有加载工作流画布' }`。
- 摘要字段应包含 `id/name/description/folderId/nodeCount/edgeCount/createdAt/updatedAt/nodes/edges`。
- 完整模式返回当前画布完整 workflow，包括 `nodes`、`edges`、`data`、`position`。

## IPC 设计

### 主进程请求渲染进程执行工具

主进程在 workflow tool loop 中遇到 renderer-owned tool 时，发送请求事件：

```typescript
mainWindow.webContents.send('on:workflow-tool:execute', {
  requestId: string,
  toolUseId: string,
  name: string,
  args: Record<string, unknown>,
  workflowId: string,
})
```

### 渲染进程返回工具结果

preload 暴露一个响应方法：

```typescript
workflowTool: {
  respond: (
    requestId: string,
    result: unknown,
  ) => ipcRenderer.invoke('workflow-tool:respond', requestId, result)
}
```

主进程注册：

```typescript
ipcMain.handle('workflow-tool:respond', (_event, requestId: string, result: unknown) => {
  resolvePendingRendererTool(requestId, result)
})
```

### 超时与清理

主进程等待渲染进程响应时必须设置超时。

建议超时：

- 默认 10 秒。
- 超时返回 `{ success: false, message: '渲染进程工具执行超时: get_current_workflow' }`。
- 请求完成、超时、窗口销毁、聊天 abort 时必须清理 pending map。

建议 pending map 结构：

```typescript
interface PendingRendererToolRequest {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const pendingRendererToolRequests = new Map<string, PendingRendererToolRequest>()
```

## 数据流

### `get_workflow`

```text
LLM tool_use: get_workflow({ workflow_id, summarize })
  |
  v
主进程 ai-proxy
  |
  v
workflow tool dispatcher: owner = main
  |
  v
workflow-tool-executor.get_workflow
  |
  v
getWorkflow(workflow_id) 重新读取磁盘文件
  |
  v
tool_result 返回 LLM，UI 展示 tool result
```

### `get_current_workflow`

```text
LLM tool_use: get_current_workflow({ summarize })
  |
  v
主进程 ai-proxy
  |
  v
workflow tool dispatcher: owner = renderer
  |
  v
webContents.send('on:workflow-tool:execute', request)
  |
  v
渲染进程 listener
  |
  v
useWorkflowStore().currentWorkflow 直接读取当前画布
  |
  v
window.api.workflowTool.respond(requestId, result)
  |
  v
主进程继续当前 LLM tool loop，将 result 作为 tool_result
  |
  v
UI 已在渲染进程本地拥有同一 result，可直接更新对应 tool call
```

## 安全与边界

- 禁止使用 `webContents.executeJavaScript()` 获取当前画布节点。
- 禁止从主进程读取 Vue/VueFlow 内部状态。
- 主进程只能通过明确的 renderer-owned tool 请求等待结果，用于继续 LLM tool loop。
- 渲染进程只能响应白名单中的 renderer-owned workflow tool。
- 渲染进程收到非白名单工具请求必须返回错误。
- 返回结果必须 JSON 序列化后再跨 IPC，避免 reactive proxy 和不可克隆对象。

## UI 行为

- `on:chat:tool-call` 仍由主进程 SSE 解析后转发。
- `get_current_workflow` 的 tool result 可由渲染进程执行完成后立即更新当前 streaming tool call。
- 主进程收到 renderer result 后仍发送 `on:chat:tool-result`，但渲染进程应避免重复覆盖造成闪烁。
- 推荐通过 `toolUseId` 去重：如果 tool call 已有相同 `completedAt/result`，忽略重复事件。

## Prompt 规则

工作流 system prompt 应明确区分两个读取工具：

- “查看当前正在编辑的画布”时，优先使用 `get_current_workflow`。
- “查看磁盘中最新已保存文件”时，使用 `get_workflow` 并传入 `workflow_id`。
- 修改工作流前优先读取 `get_current_workflow`，避免基于过期文件数据编辑。
- 如果用户明确要求对已保存文件进行审计或对比，则使用 `get_workflow`。

系统 prompt 应包含当前 `workflow_id`：

```text
当前 workflow_id: <id>
```

## 错误处理

统一工具结果格式：

```typescript
interface ToolResult {
  success: boolean
  message: string
  data?: unknown
}
```

错误场景：

| 场景 | 返回 |
|------|------|
| `get_workflow` 缺少 `workflow_id` | `success=false`, `message='缺少必填参数: workflow_id'` |
| workflow 文件不存在 | `success=false`, `message='工作流 <id> 不存在'` |
| 当前画布不存在 | `success=false`, `message='当前没有加载工作流画布'` |
| renderer tool 超时 | `success=false`, `message='渲染进程工具执行超时: <name>'` |
| renderer 请求窗口已销毁 | `success=false`, `message='渲染进程不可用'` |
| renderer 收到未知工具 | `success=false`, `message='未知渲染进程工作流工具: <name>'` |

## 测试要求

手动测试：

- 在工作流 AI 助手中要求“查看当前画布”，确认模型调用 `get_current_workflow`。
- 当前画布未保存时，`get_current_workflow` 返回未保存节点。
- 当前画布未保存时，`get_workflow({ workflow_id })` 返回文件中的已保存状态。
- 缺少 `workflow_id` 调用 `get_workflow` 返回错误。
- 修改类工具仍写入文件，并触发 `on:workflow:updated` merge 到画布。
- 停止生成时，pending renderer tool request 被清理。

自动/构建验证：

- `pnpm exec tsc -b --pretty false`
- `pnpm exec electron-vite build` 或项目现有构建命令

## 不推荐方案

不要采用以下方案：

- 把整个 workflow tool loop 移到渲染进程。
- 为了 `get_current_workflow` 增加 `_singleRound` 之类的模型单轮模式。
- 在主进程通过 `webContents.executeJavaScript()` 获取 Pinia/VueFlow 状态。
- 让 `get_workflow` 隐式使用当前 `_workflowId`，因为这会导致模型无法明确读取哪个文件。
- 把 `get_current_workflow` 放进 `workflow-tool-executor.ts` 里执行实际读取逻辑。
