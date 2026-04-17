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
| 工具暴露模式 | 全量暴露 | 工具数量少（约 10 个），无需渐进式发现 |
| 节点位置处理 | 触发全局自动布局 | AI 无需关心坐标，dagre 自动排列更美观 |
| 架构模式 | 复用 ai-proxy + 独立工具分支 | 复用 SSE 流/重试/abort，与浏览器 agent 工具隔离 |

## 工具定义

10 个工作流操作工具，全量暴露给 LLM，每个工具都有完整的 `input_schema`：

| 工具名 | 功能 | 输入参数 |
|--------|------|----------|
| `get_workflow` | 获取当前工作流完整结构（节点+边） | 无 |
| `list_node_types` | 查询所有可用节点类型及描述 | `category?`（可选，按类别过滤） |
| `create_node` | 创建一个新节点 | `type, label?, data?, position?` |
| `update_node` | 更新节点属性（partial merge） | `nodeId, data` |
| `delete_node` | 删除节点及其关联的边 | `nodeId` |
| `create_edge` | 连接两个节点 | `sourceId, targetId, sourceHandle?, targetHandle?` |
| `delete_edge` | 删除一条连线 | `edgeId` |
| `move_node` | 移动节点位置 | `nodeId, position: {x, y}` |
| `batch_update` | 批量创建/删除节点和边 | `{createNodes[], deleteNodeIds[], createEdges[], deleteEdgeIds[]}` |
| `auto_layout` | 触发全局 dagre 自动布局 | 无 |

工具返回值统一格式：
```typescript
{
  success: boolean
  message: string       // 人类可读的操作描述
  data?: any            // 操作结果数据（如新创建的节点 ID）
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
  → runAgentStream(mode='workflow', workflowId)
  |
  v
IPC: chat:completions {
    ...,
    tools: WORKFLOW_TOOL_DEFINITIONS,
    _mode: 'workflow',
    _workflowId: 'xxx'
  }
  |
  v
主进程 ai-proxy.proxyChatCompletions():
  1. SSE 流式转发给 LLM（复用现有逻辑）
  2. tool_use → executeWorkflowTool(name, args, workflowId)
  3. workflow-tool-executor 读写磁盘 JSON 文件
  4. webContents.send('workflow:file-updated', workflowId)
  |
  v
渲染进程 workflow store:
  → 监听 'workflow:file-updated'
  → loadData() 重新加载工作流数据
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

Dexie 索引新增 `workflowId`，支持按工作流 ID 快速查找会话。

### 会话切换逻辑

`chatStore` 新增方法：

```typescript
async switchToWorkflowSession(workflowId: string) {
  // 1. 查找已绑定的会话
  let session = sessions.find(s => s.workflowId === workflowId)
  // 2. 不存在则创建
  if (!session) {
    session = await createSession({ workflowId })
  }
  // 3. 切换到该会话
  await switchSession(session.id)
}
```

当用户在 RightPanel 切换到 "AI 助手" tab 时自动调用。

## System Prompt

工作流 AI 助手使用专用 system prompt，每次请求时动态注入当前工作流上下文：

```
你是一个工作流编辑助手。你可以帮助用户创建、修改和管理工作流。

当前工作流：{workflow.name}
工作流描述：{workflow.description || '无'}

当前工作流结构：
{JSON.stringify({ nodes, edges }, null, 2)}

可用操作：
- 查看和修改当前工作流的节点和连线
- 创建新节点（需指定节点类型）
- 删除节点或连线
- 批量更新
- 触发自动布局

操作规范：
1. 修改节点或连线后，建议调用 auto_layout 重新排列
2. 使用 batch_update 可以一次性完成多步操作
3. 创建节点时至少需要指定 type 参数
4. 删除节点会自动删除关联的连线
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

每个操作自动计算受影响的节点/边，返回摘要信息。

## 自动布局

### 依赖

新增 `@dagrejs/dagre` npm 包。

### 渲染进程布局函数

在 `src/lib/workflow/auto-layout.ts` 中实现：

```typescript
export function autoLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  direction: 'LR' | 'TB' = 'LR'
): WorkflowNode[]
```

使用 dagre 算法：
- 方向默认从左到右（LR）
- 节点间距：水平 80px，垂直 60px
- 返回带新 position 的节点数组

### 触发时机

1. AI 调用 `auto_layout` 工具 → 主进程通知 → 渲染进程执行 dagre 布局 → 写回节点位置
2. AI 调用 `batch_update` 后自动触发（可选配置）

## 文件变更清单

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/lib/agent/workflow-tools.ts` | 工作流工具 schema 定义（10 个工具的 name, description, input_schema） |
| `electron/services/workflow-tool-executor.ts` | 主进程工具执行器（读写工作流 JSON 文件） |
| `src/lib/workflow/auto-layout.ts` | dagre 自动布局算法封装 |

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| `src/components/workflow/RightPanel.vue` | 新增第 4 个 tab "AI 助手"（Bot 图标），内嵌 ChatPanel，tab 切换时调用 `chatStore.switchToWorkflowSession()` |
| `src/stores/chat.ts` | 新增 `switchToWorkflowSession(workflowId)` 方法；`runAgentStream` 支持 `mode='workflow'` 参数 |
| `src/lib/agent/agent.ts` | `runAgentStream` 新增 `mode` 参数，workflow 模式下传入 `WORKFLOW_TOOL_DEFINITIONS` 和 `_workflowId` |
| `electron/services/ai-proxy.ts` | `executeTool` switch 新增工作流工具分支，委托给 `workflow-tool-executor` |
| `electron/ipc/chat.ts` | `chat:completions` handler 传递 `_workflowId` 和 `_mode` 参数 |
| `src/stores/workflow.ts` | 新增 `listenForFileUpdates()` 监听主进程 `workflow:file-updated` 事件，触发 `loadData()` 刷新 |
| `src/lib/chat-db.ts` | ChatSession 表新增 `workflowId` 索引 |
| `src/types/index.ts` | `ChatSession` 类型新增 `workflowId?: string \| null` 字段 |
| `preload/index.ts` | 新增 `workflow:file-updated` IPC 监听桥接 |
| `package.json` | 新增 `@dagrejs/dagre` 依赖 |

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 工作流文件不存在 | 返回 `{ success: false, message: '工作流不存在' }` |
| 节点类型无效 | 返回 `{ success: false, message: '未知节点类型: xxx' }` |
| 节点 ID 不存在 | 返回 `{ success: false, message: '节点不存在: xxx' }` |
| 边的 source/target 不存在 | 返回 `{ success: false, message: '源节点或目标节点不存在' }` |
| 文件写入失败 | 返回 `{ success: false, message: '保存失败: ...' }` |
| AI 请求超时/中断 | 复用现有 ai-proxy 的重试和 abort 机制 |

## 安全考虑

- API Key 始终在主进程中组装，不暴露给渲染进程（与现有设计一致）
- 工具仅能操作指定 workflowId 的工作流，不能跨工作流操作
- 文件读写通过 workflow-store 的 JsonStore 工具类，确保数据完整性
