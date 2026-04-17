# Workflow AI Assistant 设计文档

**日期**: 2026-04-17
**状态**: 待批准

## 概述

在工作流编辑器的 RightPanel 中新增 "AI 助手" tab，复用 ChatPanel 组件提供聊天界面。AI 使用一套专用的工作流操作工具（非浏览器 agent 工具），通过主进程直接修改工作流 JSON 文件，渲染进程监听文件变更后自动刷新画布。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 聊天组件 | 完整复用 ChatPanel | 最大化复用现有基础设施（会话管理、模型选择、Provider 设置、SSE 流） |
| 工具执行位置 | 主进程 | 安全（API Key 不暴露），可靠（直接修改磁盘文件），与现有架构一致 |
| 会话绑定 | 按 workflowId 绑定 | 不同工作流的 AI 对话互相独立，上下文清晰 |
| 工具暴露模式 | 全量暴露 | 工具数量少（约 9 个），无需渐进式发现 |
| 节点位置处理 | 触发全局自动布局（主进程执行 dagre） | AI 无需关心坐标，dagre 在主进程中运行，保持工具执行路径一致 |
| 架构模式 | 复用 ai-proxy + 独立工具分支 | 复用 SSE 流/重试/abort，与浏览器 agent 工具隔离 |
| 并发控制 | AI 修改后通知渲染进程 merge 更新 | 不全量 reload，只 merge 受影响的节点/边，保留用户 undo/redo 状态 |
| batch_update 原子性 | 全有或全无（事务性） | 部分失败会导致工作流处于不一致状态 |

## 工具定义

9 个工作流操作工具，全量暴露给 LLM，每个工具都有完整的 `input_schema`：

| 工具名 | 功能 | 输入参数 |
|--------|------|----------|
| `get_workflow` | 获取当前工作流结构（默认摘要模式） | `summarize?: boolean`（默认 true，返回精简摘要；false 返回完整数据） |
| `list_node_types` | 查询所有可用节点类型及描述 | `category?: string`（可选，按类别过滤）。返回所有类型：内置类型（start/end/run_code/toast/agent_chat）+ 浏览器工具类型 |
| `create_node` | 创建一个新节点 | `type: string, label?: string, data?: object` |
| `update_node` | 更新节点属性（partial merge） | `nodeId: string, data: object` |
| `delete_node` | 删除节点及其关联的边 | `nodeId: string` |
| `create_edge` | 连接两个节点 | `sourceId: string, targetId: string, sourceHandle?: string, targetHandle?: string` |
| `delete_edge` | 删除一条连线 | `edgeId: string` |
| `batch_update` | 批量创建/删除节点和边（事务性） | `{createNodes?: [], deleteNodeIds?: [], createEdges?: [], deleteEdgeIds?: []}`。任一子操作失败则全部回滚 |
| `auto_layout` | 触发全局 dagre 自动布局（主进程执行） | 无 |

> 注：不包含 `move_node`，因为节点位置完全由 `auto_layout` 管理。

工具返回值统一格式：
```typescript
{
  success: boolean
  message: string       // 人类可读的操作描述
  data?: any            // 操作结果数据（如新创建的节点 ID 列表）
}
```

### `get_workflow` 摘要格式

当 `summarize=true`（默认）时，返回精简视图以控制 token 消耗：

```typescript
{
  name: string
  description?: string
  nodeCount: number
  edgeCount: number
  nodes: Array<{
    id: string
    type: string
    label: string
    // 省略 data 和 position
  }>
  edges: Array<{
    id: string
    source: string
    target: string
  }>
}
```

## 数据流

```
用户在 RightPanel "AI 助手" tab 输入消息
  |
  v
ChatPanel (完整复用)
  |
  v
chatStore.sendMessage()
  → switchToWorkflowSession(workflowId) 确保会话绑定
  → runAgentStream({
      mode: 'workflow',
      workflowId,
      system: WORKFLOW_SYSTEM_PROMPT + workflowSummary
    })
  |
  v
IPC: chat:completions {
    ...,
    tools: WORKFLOW_TOOL_DEFINITIONS,
    system: '...',           // 工作流专用 system prompt（含摘要）
    _mode: 'workflow',
    _workflowId: 'xxx'
  }
  |
  v
主进程 ai-proxy.proxyChatCompletions():
  1. SSE 流式转发给 LLM（复用现有逻辑，使用传入的 system prompt）
  2. tool_use → executeWorkflowTool(name, args, workflowId)
  3. workflow-tool-executor 读写磁盘 JSON 文件
     - auto_layout: 主进程直接执行 dagre 算法，更新节点 position，写回文件
  4. webContents.send('on:workflow:updated', { workflowId, changes })
  |
  v
渲染进程 workflow store:
  → 监听 'on:workflow:updated'
  → mergeWorkflowChanges(changes) 增量更新 currentWorkflow
  → 保留 undo/redo 栈
  → Vue Flow 画布自动刷新
```

## 会话管理

### Dexie ChatSession 扩展

`ChatSession` 表新增 `workflowId` 字段（可为 `null`，普通聊天会话为 `null`）：

```typescript
interface ChatSession {
  id: string
  title: string
  workflowId?: string | null  // 新增：绑定的工作流 ID
  browserViewId?: string | null
  modelId: string
  providerId: string
  createdAt: number
  updatedAt: number
  messageCount: number
}
```

**Dexie 版本升级**（`src/lib/chat-db.ts`）：

```typescript
this.version(1).stores({
  sessions: 'id, updatedAt, createdAt',
  messages: 'id, sessionId, createdAt, [sessionId+createdAt]',
})

// 新增 version 2，添加 workflowId 索引
this.version(2).stores({
  sessions: 'id, updatedAt, createdAt, workflowId',
  messages: 'id, sessionId, createdAt, [sessionId+createdAt]',
})
```

### 会话切换逻辑

`chatStore` 新增方法：

```typescript
async switchToWorkflowSession(workflowId: string) {
  // 1. 查找已绑定的会话
  const sessions = this.sessions.filter(s => s.workflowId === workflowId)
  let session = sessions[0]

  // 2. 不存在则创建（使用当前 provider/model）
  if (!session) {
    const providerStore = useAIProviderStore()
    session = await dbCreateSession(
      providerStore.currentModel!.id,
      providerStore.currentProvider!.id,
      null,   // browserViewId
      workflowId  // 新增参数
    )
    this.sessions.push(session)
  }

  // 3. 切换到该会话
  await this.switchSession(session.id)
}
```

`chat-db.ts` 的 `createSession` 函数签名需扩展：

```typescript
export async function createSession(
  modelId: string,
  providerId: string,
  browserViewId: string | null = null,
  workflowId: string | null = null,  // 新增
): Promise<ChatSession>
```

## System Prompt

工作流 AI 助手使用专用 system prompt，由渲染进程构造并通过 IPC 传递到主进程。

**渲染进程构造**（在 `runAgentStream` 中）：

```typescript
if (mode === 'workflow') {
  const workflow = workflowStore.currentWorkflow
  const summary = buildWorkflowSummary(workflow)  // 使用摘要格式
  system = WORKFLOW_SYSTEM_PROMPT + '\n\n' + summary
}
```

**System prompt 内容**：

```
你是一个工作流编辑助手。你可以帮助用户创建、修改和管理工作流。

当前工作流：{name}
描述：{description || '无'}

当前工作流结构（摘要）：
{摘要格式的 nodes/edges 列表}

可用操作：
- get_workflow: 查看完整工作流（设置 summarize=false 获取完整数据）
- list_node_types: 查询所有可用节点类型
- create_node: 创建节点
- update_node: 更新节点属性
- delete_node: 删除节点
- create_edge / delete_edge: 管理连线
- batch_update: 批量操作（事务性）
- auto_layout: 自动排列所有节点位置

操作规范：
1. 创建或删除节点后，建议调用 auto_layout 重新排列
2. 使用 batch_update 一次性完成多步操作
3. 创建节点时至少需要指定 type 参数，可用 list_node_types 查询
4. 删除节点会自动删除关联的连线
5. 需要查看节点详细参数时，用 get_workflow(summarize=false)
```

## 主进程工具执行器

新增 `electron/services/workflow-tool-executor.ts`：

```typescript
export async function executeWorkflowTool(
  name: string,
  args: any,
  workflowId: string
): Promise<{ success: boolean; message: string; data?: any }>
```

核心实现：
1. 从 `workflows/{workflowId}.json` 读取完整工作流数据
2. 根据工具名执行对应操作（内存中修改 nodes/edges 数组）
3. 写回 JSON 文件
4. 返回操作结果

`batch_update` 使用事务性语义：在内存中执行所有子操作，任一失败则不写入文件，返回错误。

### BrowserWindow 引用传递

`workflow-tool-executor` 接收 `BrowserWindow` 引用以发送 IPC 通知：

```typescript
export async function executeWorkflowTool(
  name: string,
  args: any,
  workflowId: string,
  mainWindow: BrowserWindow  // 由 ai-proxy 传入
): Promise<ToolResult>
```

操作完成后通过 `mainWindow.webContents.send('on:workflow:updated', ...)` 通知渲染进程。

## 自动布局

### 依赖

新增 `@dagrejs/dagre` npm 包（主进程依赖）。

### 主进程布局实现

在 `electron/services/workflow-tool-executor.ts` 中直接实现：

```typescript
import dagre from '@dagrejs/dagre'

function autoLayout(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 80 })

  for (const node of nodes) {
    g.setNode(node.id, { width: 200, height: 80 })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map(node => {
    const pos = g.node(node.id)
    return { ...node, position: { x: pos.x - 100, y: pos.y - 40 } }
  })
}
```

`auto_layout` 工具在主进程中执行：读取工作流 → 运行 dagre → 更新节点 position → 写回文件 → 通知渲染进程。

### 触发时机

1. AI 显式调用 `auto_layout` 工具
2. `batch_update` 创建/删除节点后不自动触发（由 AI 决定是否调用）

## 并发控制

AI 修改工作流时，渲染进程采用**增量 merge**策略，而非全量 reload：

### 主进程通知格式

```typescript
mainWindow.webContents.send('on:workflow:updated', {
  workflowId: string
  changes: {
    upsertNodes: WorkflowNode[]   // 新增或更新的节点
    deleteNodeIds: string[]       // 删除的节点 ID
    upsertEdges: WorkflowEdge[]   // 新增或更新的边
    deleteEdgeIds: string[]       // 删除的边 ID
  }
})
```

### 渲染进程处理

`workflow store` 新增 `mergeWorkflowChanges(changes)` 方法：

```typescript
function mergeWorkflowChanges(changes: WorkflowChanges) {
  if (!currentWorkflow.value) return

  // 增量更新节点
  for (const node of changes.upsertNodes) {
    const idx = currentWorkflow.value.nodes.findIndex(n => n.id === node.id)
    if (idx >= 0) {
      currentWorkflow.value.nodes[idx] = node
    } else {
      currentWorkflow.value.nodes.push(node)
    }
  }

  // 删除节点
  currentWorkflow.value.nodes = currentWorkflow.value.nodes
    .filter(n => !changes.deleteNodeIds.includes(n.id))

  // 同理处理 edges...

  // AI 修改记录到 undo 栈，用户可以撤销 AI 操作
  pushUndo('AI 修改: ' + summarizeChanges(changes))
}
```

### 用户操作冲突

- AI 正在执行工具时（isStreaming=true），用户的画布编辑正常进行
- AI 操作完成后通过 merge 更新，不影响用户正在进行的拖拽
- 如果用户正在进行敏感操作（如正在编辑节点属性表单），merge 不会中断表单状态

## Preload Bridge 变更

### ChatCompletionParams 扩展

`preload/index.ts` 的 `ChatCompletionParams` 类型新增字段：

```typescript
interface ChatCompletionParams {
  // ... 现有字段
  system?: string           // 新增：自定义 system prompt
  _mode?: 'workflow'        // 新增：标识工作流模式
  _workflowId?: string      // 新增：目标工作流 ID
}
```

### 事件监听

渲染进程通过现有的通用 `on()` 监听器接收通知：

```typescript
window.api.on('workflow:updated', (data) => {
  workflowStore.mergeWorkflowChanges(data.changes)
})
```

无需在 preload 中新增专门的事件桥接，现有的 `on()` 机制已支持。

## 文件变更清单

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/lib/agent/workflow-tools.ts` | 工作流工具 schema 定义（9 个工具的 name, description, input_schema） |
| `electron/services/workflow-tool-executor.ts` | 主进程工具执行器（读写工作流 JSON + dagre 自动布局） |

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| `src/components/workflow/RightPanel.vue` | 新增第 4 个 tab "AI 助手"（Bot 图标），内嵌 ChatPanel，tab 切换时调用 `chatStore.switchToWorkflowSession(workflowStore.currentWorkflow?.id)` |
| `src/stores/chat.ts` | 新增 `switchToWorkflowSession(workflowId)` 方法；`runAgentStream` 支持 `mode='workflow'` 参数并传递 `system` prompt |
| `src/lib/agent/agent.ts` | `runAgentStream` 新增 `mode` 和 `workflowId` 参数，workflow 模式下传入 `WORKFLOW_TOOL_DEFINITIONS`、`system` 和 `_workflowId` |
| `electron/services/ai-proxy.ts` | `ProxyRequest` 接口新增 `_mode?: string`、`_workflowId?: string` 字段；`proxyChatCompletions` 在 tool_use 循环中拦截工作流工具名（通过 `_mode === 'workflow'`），直接路由到 `executeWorkflowTool(name, args, _workflowId, mainWindow)`，不走通用 `executeTool` |
| `electron/ipc/chat.ts` | `chat:completions` handler 传递 `_workflowId`、`_mode`、`system` 参数 |
| `src/stores/workflow.ts` | 新增 `mergeWorkflowChanges(changes)` 增量更新方法（自动 pushUndo）；新增 `listenForFileUpdates()` 在 store 初始化时注册监听，检查 `currentWorkflow?.id === data.workflowId` 才执行 merge |
| `src/lib/chat-db.ts` | Dexie version 2 升级：sessions 表新增 `workflowId` 索引；`createSession` 新增 `workflowId` 参数 |
| `src/types/index.ts` | `ChatSession` 类型新增 `workflowId?: string \| null`；`ChatCompletionParams` 同步新增 `system`、`_mode`、`_workflowId` 字段 |
| `preload/index.ts` | `ChatCompletionParams` 类型新增 `system`、`_mode`、`_workflowId` 字段 |
| `package.json` | 新增 `@dagrejs/dagre` 依赖 |

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 工作流文件不存在 | 返回 `{ success: false, message: '工作流不存在' }` |
| 节点类型无效 | 返回 `{ success: false, message: '未知节点类型: xxx，请使用 list_node_types 查询可用类型' }` |
| 节点 ID 不存在 | 返回 `{ success: false, message: '节点不存在: xxx' }` |
| 边的 source/target 不存在 | 返回 `{ success: false, message: '源节点或目标节点不存在' }` |
| batch_update 部分失败 | 全部回滚，返回 `{ success: false, message: '批量操作失败: ...', data: { failedStep } }` |
| 文件写入失败 | 返回 `{ success: false, message: '保存失败: ...' }` |
| AI 请求超时/中断 | 复用现有 ai-proxy 的重试和 abort 机制 |

## 安全考虑

- API Key 始终在主进程中组装，不暴露给渲染进程（与现有设计一致）
- 工具仅能操作指定 workflowId 的工作流，不能跨工作流操作
- 文件读写通过 workflow-store 的 JsonStore 工具类，确保数据完整性
- dagre 在主进程执行，避免渲染进程计算开销
