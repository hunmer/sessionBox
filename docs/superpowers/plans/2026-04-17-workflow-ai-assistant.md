# Workflow AI Assistant 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在工作流编辑器的 RightPanel 中集成 AI 助手，让 AI 通过专用工具直接操作工作流节点和连线。

**Architecture:** 复用现有 ChatPanel 组件和 ai-proxy 基础设施。工作流工具在主进程执行，直接读写磁盘 JSON 文件，通过 IPC 通知渲染进程增量 merge 更新。dagre 自动布局在主进程中运行。会话按 workflowId 绑定。

**Tech Stack:** Electron (主进程), Vue 3 + Pinia (渲染进程), @dagrejs/dagre (自动布局), Anthropic Messages API (SSE + tool_use)

**Spec:** `docs/superpowers/specs/2026-04-17-workflow-ai-assistant-design.md`

---

## 分批概览

| 批次 | 任务 | 说明 |
|------|------|------|
| **1** | Task 1-2 | 基础设施：类型定义 + Dexie 迁移 + 工具 schema + dagre 依赖 |
| **2** | Task 3 | 主进程：工具执行器（核心 CRUD + dagre 布局） |
| **3** | Task 4 | 主进程集成：ai-proxy 路由 + IPC 桥接 |
| **4** | Task 5-6 | 渲染进程：agent 支持 workflow 模式 + workflow store merge |
| **5** | Task 7 | UI：RightPanel 新 tab + ChatPanel 集成 |

---

## Task 1: 类型定义与 Dexie 数据库升级

**Files:**
- Modify: `src/types/index.ts:166-175` (ChatSession)
- Modify: `src/types/index.ts:229-237` (ChatCompletionParams)
- Modify: `preload/index.ts:202-213` (ChatCompletionParams)
- Modify: `src/lib/chat-db.ts:1-127` (Dexie version + createSession)
- Modify: `package.json` (add @dagrejs/dagre)

- [ ] **Step 1: ChatSession 类型添加 workflowId**

`src/types/index.ts:166-175` — 在 `browserViewId` 后新增字段：

```typescript
export interface ChatSession {
  id: string
  title: string
  workflowId?: string | null  // 新增：绑定的工作流 ID
  browserViewId: string | null
  modelId: string
  providerId: string
  createdAt: number
  updatedAt: number
  messageCount: number
}
```

- [ ] **Step 2: ChatCompletionParams 添加 workflow 模式字段**

`src/types/index.ts:229-237` — 新增三个字段：

```typescript
export interface ChatCompletionParams {
  providerId: string
  modelId: string
  system?: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
  _mode?: 'workflow'           // 新增
  _workflowId?: string         // 新增
  targetTabId?: string         // 新增（对齐 preload 定义）
  enabledToolNames?: string[]  // 新增（对齐 preload 定义）
}
```

- [ ] **Step 3: Preload ChatCompletionParams 同步更新**

`preload/index.ts:202-213` — 新增 `_mode` 和 `_workflowId`：

```typescript
export interface ChatCompletionParams {
  providerId: string
  modelId: string
  system?: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
  targetTabId?: string
  enabledToolNames?: string[]
  _mode?: 'workflow'       // 新增
  _workflowId?: string     // 新增
}
```

- [ ] **Step 4: Dexie version 2 升级 + createSession 扩展**

`src/lib/chat-db.ts`:

在 `this.version(1)...` 后新增 version 2：

```typescript
this.version(2).stores({
  sessions: 'id, updatedAt, createdAt, workflowId',
  messages: 'id, sessionId, createdAt, [sessionId+createdAt]',
})
```

修改 `createSession` 函数签名和实现：

```typescript
export async function createSession(
  modelId: string,
  providerId: string,
  browserViewId: string | null = null,
  workflowId: string | null = null,  // 新增
): Promise<ChatSession> {
  const id = crypto.randomUUID()
  const now = Date.now()
  const session: ChatSession = {
    id,
    title: '新对话',
    workflowId,        // 新增
    browserViewId,
    modelId,
    providerId,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  }
  await chatDb.sessions.add(session)
  return session
}
```

- [ ] **Step 5: 安装 dagre 依赖**

```bash
cd G:/programming/nodejs/sessionBox && pnpm add @dagrejs/dagre
```

- [ ] **Step 5b: 添加 dagre 类型声明**

`@dagrejs/dagre` 不含 TypeScript 声明，需手动添加。创建 `electron/dagre.d.ts`：

```typescript
declare module '@dagrejs/dagre' {
  export namespace graphlib {
    class Graph {
      setNode(id: string, options?: Record<string, unknown>): void
      setEdge(source: string, target: string, options?: Record<string, unknown>): void
      node(id: string): { x: number; y: number; width: number; height: number }
      setDefaultEdgeLabel(fn: () => Record<string, unknown>): void
    }
  }
  export function layout(graph: graphlib.Graph): void
}
```

- [ ] **Step 6: 提交**

```bash
git add src/types/index.ts preload/index.ts src/lib/chat-db.ts package.json pnpm-lock.yaml
git commit -m "feat(workflow-ai): add types, Dexie migration, and dagre dependency"
```

---

## Task 2: 工作流工具 Schema 定义

**Files:**
- Create: `src/lib/agent/workflow-tools.ts`

这个文件定义 9 个工具的 Anthropic tool schema，供渲染进程在 workflow 模式下传给 IPC。

- [ ] **Step 1: 创建 workflow-tools.ts**

创建 `src/lib/agent/workflow-tools.ts`：

```typescript
/**
 * 工作流 AI 助手工具定义。
 * 全量暴露给 LLM，9 个工具直接调用，无需渐进式发现。
 */

import type { ToolDefinition } from './tools'

export const WORKFLOW_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_workflow',
    description: '获取当前工作流结构。默认返回摘要（不含节点 data/position），设置 summarize=false 获取完整数据。',
    input_schema: {
      type: 'object',
      properties: {
        summarize: {
          type: 'boolean',
          description: '是否返回摘要。默认 true，省略 data/position 节省 token。设为 false 获取完整节点数据。',
        },
      },
    },
  },
  {
    name: 'list_node_types',
    description: '查询所有可用的工作流节点类型。返回每个类型的 type、label、category、description。',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: '按类别过滤，如 "流程控制"、"页面交互"、"标签页管理" 等。不传则返回全部。',
        },
      },
    },
  },
  {
    name: 'create_node',
    description: '在工作流中创建一个新节点。至少需要指定 type（节点类型）。创建后建议调用 auto_layout。',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '节点类型，如 "click_element"、"start"、"end"、"run_code" 等' },
        label: { type: 'string', description: '节点标签，默认使用 type 值' },
        data: { type: 'object', description: '节点参数数据，如 { selector: "#btn", tabId: "xxx" }' },
      },
      required: ['type'],
    },
  },
  {
    name: 'update_node',
    description: '更新节点的属性数据（partial merge）。只修改指定的字段，不影响其他字段。',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '要更新的节点 ID' },
        data: { type: 'object', description: '要合并的属性数据，如 { selector: "#new-btn" }' },
      },
      required: ['nodeId', 'data'],
    },
  },
  {
    name: 'delete_node',
    description: '删除一个节点，同时自动删除与该节点关联的所有连线。',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '要删除的节点 ID' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'create_edge',
    description: '创建一条连线，连接两个节点。source 节点的输出连接到 target 节点的输入。',
    input_schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: '源节点 ID（连线的起点）' },
        targetId: { type: 'string', description: '目标节点 ID（连线的终点）' },
        sourceHandle: { type: 'string', description: '源节点的 handle 标识（可选）' },
        targetHandle: { type: 'string', description: '目标节点的 handle 标识（可选）' },
      },
      required: ['sourceId', 'targetId'],
    },
  },
  {
    name: 'delete_edge',
    description: '删除一条连线。',
    input_schema: {
      type: 'object',
      properties: {
        edgeId: { type: 'string', description: '要删除的连线 ID' },
      },
      required: ['edgeId'],
    },
  },
  {
    name: 'batch_update',
    description: '批量执行多个工作流操作（创建/删除节点和连线）。事务性：任一子操作失败则全部回滚。',
    input_schema: {
      type: 'object',
      properties: {
        createNodes: {
          type: 'array',
          description: '要创建的节点列表',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              label: { type: 'string' },
              data: { type: 'object' },
            },
            required: ['type'],
          },
        },
        deleteNodeIds: {
          type: 'array',
          description: '要删除的节点 ID 列表',
          items: { type: 'string' },
        },
        createEdges: {
          type: 'array',
          description: '要创建的连线列表',
          items: {
            type: 'object',
            properties: {
              sourceId: { type: 'string' },
              targetId: { type: 'string' },
              sourceHandle: { type: 'string' },
              targetHandle: { type: 'string' },
            },
            required: ['sourceId', 'targetId'],
          },
        },
        deleteEdgeIds: {
          type: 'array',
          description: '要删除的连线 ID 列表',
          items: { type: 'string' },
        },
      },
    },
  },
  {
    name: 'auto_layout',
    description: '使用 dagre 算法自动排列所有节点位置。建议在创建/删除节点后调用。',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
]

/** 工作流 AI 助手专用 system prompt */
export const WORKFLOW_SYSTEM_PROMPT = `你是一个工作流编辑助手。你可以帮助用户创建、修改和管理工作流。

可用操作：
- get_workflow: 查看工作流（设置 summarize=false 获取完整节点数据）
- list_node_types: 查询所有可用节点类型
- create_node: 创建节点（至少指定 type）
- update_node: 更新节点属性
- delete_node: 删除节点（自动删除关联连线）
- create_edge / delete_edge: 管理连线
- batch_update: 批量操作（事务性）
- auto_layout: 自动排列所有节点位置

操作规范：
1. 创建或删除节点后，建议调用 auto_layout 重新排列
2. 使用 batch_update 一次性完成多步操作
3. 可用 list_node_types 查询所有可用节点类型
4. 删除节点会自动删除关联的连线
5. 需要查看节点详细参数时，用 get_workflow(summarize=false)`

/** 构建注入工作流摘要的 system prompt */
export function buildWorkflowSystemPrompt(workflow: {
  name: string
  description?: string
  nodes: Array<{ id: string; type: string; label: string }>
  edges: Array<{ id: string; source: string; target: string }>
}): string {
  const summary = {
    name: workflow.name,
    description: workflow.description || '无',
    nodeCount: workflow.nodes.length,
    edgeCount: workflow.edges.length,
    nodes: workflow.nodes.map(n => ({ id: n.id, type: n.type, label: n.label })),
    edges: workflow.edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
  }
  return WORKFLOW_SYSTEM_PROMPT + '\n\n当前工作流：\n' + JSON.stringify(summary, null, 2)
}
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/agent/workflow-tools.ts
git commit -m "feat(workflow-ai): add workflow tool schema definitions and system prompt"
```

---

## Task 3: 主进程工具执行器

**Files:**
- Create: `electron/services/workflow-tool-executor.ts`

核心模块：读取工作流 JSON → 执行工具操作 → 写回 JSON → 通知渲染进程。

- [ ] **Step 1: 创建 workflow-tool-executor.ts**

创建 `electron/services/workflow-tool-executor.ts`：

```typescript
/**
 * 工作流 AI 助手工具执行器。
 * 在主进程中执行，直接读写工作流 JSON 文件。
 */
import { BrowserWindow } from 'electron'
import dagre from '@dagrejs/dagre'
import { getWorkflow, updateWorkflow } from './workflow-store'

/**
 * 节点类型定义（从 nodeRegistry 提取的精简版本，避免跨进程导入 renderer 模块）。
 * 如果 nodeRegistry 更新，需同步更新此列表。
 */
const NODE_TYPE_DEFINITIONS = [
  // 流程控制
  { type: 'start', label: '开始', category: '流程控制', description: '工作流入口节点' },
  { type: 'end', label: '结束', category: '流程控制', description: '工作流出口节点' },
  { type: 'run_code', label: '运行 JS 代码', category: '流程控制', description: '执行自定义 JavaScript 代码' },
  { type: 'toast', label: 'Toast 消息', category: '流程控制', description: '显示 Toast 通知' },
  { type: 'agent_chat', label: 'AI 对话', category: 'AI', description: '调用 AI 处理文本' },
  // 页面交互
  { type: 'click_element', label: '点击元素', category: '页面交互', description: '点击页面上的元素' },
  { type: 'input_text', label: '输入文字', category: '页面交互', description: '在输入框中输入文字' },
  { type: 'scroll_page', label: '滚动页面', category: '页面交互', description: '滚动页面' },
  { type: 'select_option', label: '选择选项', category: '页面交互', description: '选择下拉菜单选项' },
  { type: 'hover_element', label: '悬停元素', category: '页面交互', description: '鼠标悬停在元素上' },
  // 页面信息
  { type: 'get_page_content', label: '获取页面内容', category: '页面信息', description: '获取页面文本内容' },
  { type: 'get_dom', label: '获取 DOM', category: '页面信息', description: '获取元素 outerHTML' },
  { type: 'get_page_screenshot', label: '截图', category: '页面信息', description: '截取页面截图' },
  { type: 'get_page_summary', label: '页面摘要', category: '页面信息', description: '提取页面摘要' },
  { type: 'get_page_markdown', label: '页面 Markdown', category: '页面信息', description: '提取页面 Markdown' },
  { type: 'get_interactive_nodes', label: '交互节点', category: '页面信息', description: '获取可交互元素列表' },
  { type: 'get_interactive_node_detail', label: '节点详情', category: '页面信息', description: '获取元素详情' },
  // 标签页管理
  { type: 'list_tabs', label: '列出标签页', category: '标签页管理', description: '列出所有标签页' },
  { type: 'create_tab', label: '创建标签页', category: '标签页管理', description: '创建新标签页' },
  { type: 'navigate_tab', label: '导航标签页', category: '标签页管理', description: '导航到指定 URL' },
  { type: 'switch_tab', label: '切换标签页', category: '标签页管理', description: '切换到指定标签页' },
  { type: 'close_tab', label: '关闭标签页', category: '标签页管理', description: '关闭标签页' },
  { type: 'get_active_tab', label: '当前标签页', category: '标签页管理', description: '获取当前激活标签页' },
  // 窗口管理
  { type: 'create_window', label: '创建窗口', category: '窗口管理', description: '创建新窗口' },
  { type: 'navigate_window', label: '导航窗口', category: '窗口管理', description: '窗口中导航到 URL' },
  { type: 'close_window', label: '关闭窗口', category: '窗口管理', description: '关闭窗口' },
  { type: 'list_windows', label: '列出窗口', category: '窗口管理', description: '列出所有窗口' },
  { type: 'focus_window', label: '聚焦窗口', category: '窗口管理', description: '聚焦到指定窗口' },
  { type: 'screenshot_window', label: '窗口截图', category: '窗口管理', description: '截取窗口截图' },
  { type: 'get_window_detail', label: '窗口详情', category: '窗口管理', description: '获取窗口详情' },
  // 工作区管理
  { type: 'list_workspaces', label: '列出工作区', category: '工作区管理', description: '列出所有工作区' },
  { type: 'list_groups', label: '列出分组', category: '工作区管理', description: '列出所有分组' },
  { type: 'list_pages', label: '列出页面', category: '工作区管理', description: '列出所有页面' },
  // 技能管理
  { type: 'write_skill', label: '写入技能', category: '技能管理', description: '创建或更新技能' },
  { type: 'read_skill', label: '读取技能', category: '技能管理', description: '读取技能内容' },
  { type: 'list_skills', label: '列出技能', category: '技能管理', description: '列出所有技能' },
  { type: 'search_skill', label: '搜索技能', category: '技能管理', description: '搜索技能' },
  { type: 'exec_skill', label: '执行技能', category: '技能管理', description: '执行技能' },
  // 辅助工具
  { type: 'inject_js', label: '注入 JS', category: '辅助工具', description: '注入执行 JavaScript' },
]

interface ToolResult {
  success: boolean
  message: string
  data?: any
}

interface WorkflowChanges {
  upsertNodes: any[]
  deleteNodeIds: string[]
  upsertEdges: any[]
  deleteEdgeIds: string[]
}

/** 执行工作流工具 */
export async function executeWorkflowTool(
  name: string,
  args: any,
  workflowId: string,
  mainWindow: BrowserWindow,
): Promise<ToolResult> {
  try {
    let workflow = getWorkflow(workflowId)

    if (!workflow) {
      return { success: false, message: `工作流不存在: ${workflowId}` }
    }

    // 深拷贝，避免在操作过程中污染原始数据
    let nodes = JSON.parse(JSON.stringify(workflow.nodes))
    let edges = JSON.parse(JSON.stringify(workflow.edges))
    const changes: WorkflowChanges = {
      upsertNodes: [],
      deleteNodeIds: [],
      upsertEdges: [],
      deleteEdgeIds: [],
    }

    switch (name) {
      case 'get_workflow': {
        const summarize = args.summarize !== false
        if (summarize) {
          return {
            success: true,
            message: `工作流 "${workflow.name}" 共 ${nodes.length} 个节点、${edges.length} 条连线`,
            data: {
              name: workflow.name,
              description: workflow.description || '',
              nodeCount: nodes.length,
              edgeCount: edges.length,
              nodes: nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label })),
              edges: edges.map((e: any) => ({ id: e.id, source: e.source, target: e.target })),
            },
          }
        }
        return {
          success: true,
          message: `工作流 "${workflow.name}" 完整数据`,
          data: { ...workflow },
        }
      }

      case 'list_node_types': {
        const category = args.category
        const defs = category
          ? NODE_TYPE_DEFINITIONS.filter(d => d.category === category)
          : NODE_TYPE_DEFINITIONS
        return {
          success: true,
          message: `共 ${defs.length} 个可用节点类型`,
          data: defs.map(d => ({
            type: d.type,
            label: d.label,
            category: d.category,
            description: d.description,
            properties: d.properties.map(p => ({ key: p.key, label: p.label, type: p.type })),
          })),
        }
      }

      case 'create_node': {
        const nodeType = args.type
        const def = NODE_TYPE_DEFINITIONS.find(d => d.type === nodeType)
        if (!def) {
          return { success: false, message: `未知节点类型: ${nodeType}，请使用 list_node_types 查询可用类型` }
        }
        const nodeId = crypto.randomUUID()
        const newNode = {
          id: nodeId,
          type: nodeType,
          label: args.label || def.label,
          position: { x: 0, y: 0 }, // auto_layout 会重新计算
          data: args.data || {},
        }
        nodes.push(newNode)
        changes.upsertNodes.push(newNode)
        break
      }

      case 'update_node': {
        const nodeIdx = nodes.findIndex((n: any) => n.id === args.nodeId)
        if (nodeIdx === -1) {
          return { success: false, message: `节点不存在: ${args.nodeId}` }
        }
        nodes[nodeIdx].data = { ...nodes[nodeIdx].data, ...args.data }
        changes.upsertNodes.push(nodes[nodeIdx])
        break
      }

      case 'delete_node': {
        const nodeExists = nodes.some((n: any) => n.id === args.nodeId)
        if (!nodeExists) {
          return { success: false, message: `节点不存在: ${args.nodeId}` }
        }
        // 删除关联的边
        const relatedEdges = edges.filter((e: any) => e.source === args.nodeId || e.target === args.nodeId)
        edges = edges.filter((e: any) => e.source !== args.nodeId && e.target !== args.nodeId)
        nodes = nodes.filter((n: any) => n.id !== args.nodeId)
        changes.deleteNodeIds.push(args.nodeId)
        changes.deleteEdgeIds.push(...relatedEdges.map((e: any) => e.id))
        break
      }

      case 'create_edge': {
        const sourceExists = nodes.some((n: any) => n.id === args.sourceId)
        const targetExists = nodes.some((n: any) => n.id === args.targetId)
        if (!sourceExists || !targetExists) {
          return { success: false, message: `源节点或目标节点不存在` }
        }
        // 检查重复边
        const duplicate = edges.some((e: any) =>
          e.source === args.sourceId && e.target === args.targetId
        )
        if (duplicate) {
          return { success: false, message: '连线已存在' }
        }
        const edgeId = `e-${args.sourceId}-${args.sourceHandle || 'default'}-${args.targetId}-${args.targetHandle || 'default'}`
        const newEdge = {
          id: edgeId,
          source: args.sourceId,
          target: args.targetId,
          sourceHandle: args.sourceHandle || null,
          targetHandle: args.targetHandle || null,
        }
        edges.push(newEdge)
        changes.upsertEdges.push(newEdge)
        break
      }

      case 'delete_edge': {
        const edgeExists = edges.some((e: any) => e.id === args.edgeId)
        if (!edgeExists) {
          return { success: false, message: `连线不存在: ${args.edgeId}` }
        }
        edges = edges.filter((e: any) => e.id !== args.edgeId)
        changes.deleteEdgeIds.push(args.edgeId)
        break
      }

      case 'batch_update': {
        const batchChanges: WorkflowChanges = {
          upsertNodes: [],
          deleteNodeIds: [],
          upsertEdges: [],
          deleteEdgeIds: [],
        }

        try {
          // 1. 创建节点
          if (args.createNodes?.length) {
            for (const nodeSpec of args.createNodes) {
              const def = NODE_TYPE_DEFINITIONS.find(d => d.type === nodeSpec.type)
              if (!def) throw new Error(`未知节点类型: ${nodeSpec.type}`)
              const nodeId = crypto.randomUUID()
              const newNode = {
                id: nodeId,
                type: nodeSpec.type,
                label: nodeSpec.label || def.label,
                position: { x: 0, y: 0 },
                data: nodeSpec.data || {},
              }
              nodes.push(newNode)
              batchChanges.upsertNodes.push(newNode)
            }
          }

          // 2. 删除节点
          if (args.deleteNodeIds?.length) {
            for (const nodeId of args.deleteNodeIds) {
              if (!nodes.some((n: any) => n.id === nodeId)) {
                throw new Error(`节点不存在: ${nodeId}`)
              }
              const relatedEdges = edges.filter((e: any) => e.source === nodeId || e.target === nodeId)
              edges = edges.filter((e: any) => e.source !== nodeId && e.target !== nodeId)
              nodes = nodes.filter((n: any) => n.id !== nodeId)
              batchChanges.deleteNodeIds.push(nodeId)
              batchChanges.deleteEdgeIds.push(...relatedEdges.map((e: any) => e.id))
            }
          }

          // 3. 创建连线
          if (args.createEdges?.length) {
            for (const edgeSpec of args.createEdges) {
              if (!nodes.some((n: any) => n.id === edgeSpec.sourceId) ||
                  !nodes.some((n: any) => n.id === edgeSpec.targetId)) {
                throw new Error(`连线源节点或目标节点不存在`)
              }
              const edgeId = `e-${edgeSpec.sourceId}-${edgeSpec.sourceHandle || 'default'}-${edgeSpec.targetId}-${edgeSpec.targetHandle || 'default'}`
              const newEdge = {
                id: edgeId,
                source: edgeSpec.sourceId,
                target: edgeSpec.targetId,
                sourceHandle: edgeSpec.sourceHandle || null,
                targetHandle: edgeSpec.targetHandle || null,
              }
              edges.push(newEdge)
              batchChanges.upsertEdges.push(newEdge)
            }
          }

          // 4. 删除连线
          if (args.deleteEdgeIds?.length) {
            for (const edgeId of args.deleteEdgeIds) {
              if (!edges.some((e: any) => e.id === edgeId)) {
                throw new Error(`连线不存在: ${edgeId}`)
              }
              edges = edges.filter((e: any) => e.id !== edgeId)
              batchChanges.deleteEdgeIds.push(edgeId)
            }
          }

          // 合并变更
          changes.upsertNodes.push(...batchChanges.upsertNodes)
          changes.deleteNodeIds.push(...batchChanges.deleteNodeIds)
          changes.upsertEdges.push(...batchChanges.upsertEdges)
          changes.deleteEdgeIds.push(...batchChanges.deleteEdgeIds)
        } catch (batchError) {
          return {
            success: false,
            message: `批量操作失败: ${batchError instanceof Error ? batchError.message : String(batchError)}`,
          }
        }
        break
      }

      case 'auto_layout': {
        const layoutedNodes = autoLayout(nodes, edges)
        nodes = layoutedNodes
        // 所有节点位置都变了，全部加入 upsert
        changes.upsertNodes.push(...nodes)
        break
      }

      default:
        return { success: false, message: `未知工具: ${name}` }
    }

    // 写回文件
    workflow.nodes = nodes
    workflow.edges = edges
    workflow.updatedAt = Date.now()
    updateWorkflow(workflowId, { nodes, edges, updatedAt: workflow.updatedAt })

    // 通知渲染进程
    notifyRenderer(mainWindow, workflowId, changes)

    // 构造返回消息
    const parts: string[] = []
    if (changes.upsertNodes.length) parts.push(`新增/更新 ${changes.upsertNodes.length} 个节点`)
    if (changes.deleteNodeIds.length) parts.push(`删除 ${changes.deleteNodeIds.length} 个节点`)
    if (changes.upsertEdges.length) parts.push(`新增/更新 ${changes.upsertEdges.length} 条连线`)
    if (changes.deleteEdgeIds.length) parts.push(`删除 ${changes.deleteEdgeIds.length} 条连线`)
    const message = parts.length > 0 ? parts.join('，') : '操作完成'

    return {
      success: true,
      message,
      data: {
        upsertedNodeIds: changes.upsertNodes.map(n => n.id),
        deletedNodeIds: changes.deleteNodeIds,
        upsertedEdgeIds: changes.upsertEdges.map(e => e.id),
        deletedEdgeIds: changes.deleteEdgeIds,
      },
    }
  } catch (error) {
    return {
      success: false,
      message: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/** dagre 自动布局 */
function autoLayout(nodes: any[], edges: any[]): any[] {
  if (nodes.length === 0) return nodes

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
    if (pos) {
      return { ...node, position: { x: pos.x - 100, y: pos.y - 40 } }
    }
    return node
  })
}

/** 通知渲染进程工作流变更 */
function notifyRenderer(
  mainWindow: BrowserWindow,
  workflowId: string,
  changes: WorkflowChanges,
): void {
  if (mainWindow.isDestroyed()) return
  mainWindow.webContents.send('on:workflow:updated', {
    workflowId,
    changes,
  })
}
```

- [ ] **Step 2: 验证 workflow-store 是否导出 getWorkflowStore**

检查 `electron/services/workflow-store.ts` 中是否有 `getWorkflowStore` 和 `getWorkflow`、`updateWorkflow` 方法。如果没有，需要确认实际的 API 并调整 executor 的调用方式。

Run: `grep -n "export.*getWorkflowStore\|export.*function.*getWorkflow\|export.*function.*updateWorkflow" electron/services/workflow-store.ts`

根据实际 API 调整 executor 中的读写方式。

- [ ] **Step 3: 提交**

```bash
git add electron/services/workflow-tool-executor.ts
git commit -m "feat(workflow-ai): add main process workflow tool executor with dagre layout"
```

---

## Task 4: ai-proxy 路由 + IPC 桥接

**Files:**
- Modify: `electron/services/ai-proxy.ts:15-27` (ProxyRequest)
- Modify: `electron/services/ai-proxy.ts:197-218` (tool_use 循环)
- Modify: `electron/ipc/chat.ts:1-3` (imports)

- [ ] **Step 1: ProxyRequest 接口新增字段**

`electron/services/ai-proxy.ts:15-27` — 在 `ProxyRequest` 接口末尾新增：

```typescript
interface ProxyRequest {
  _requestId: string
  providerId: string
  modelId: string
  system?: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
  targetTabId?: string
  enabledToolNames?: string[]
  _mode?: string         // 新增：标识工作流模式
  _workflowId?: string   // 新增：目标工作流 ID
}
```

- [ ] **Step 2: 解构新字段**

`electron/services/ai-proxy.ts:87` — 修改解构行：

```typescript
const { _requestId, providerId, modelId, system, messages, tools, stream, maxTokens, thinking, targetTabId, enabledToolNames, _mode, _workflowId } = params
```

- [ ] **Step 3: tool_use 循环中拦截工作流工具**

`electron/services/ai-proxy.ts:216-218` — 在执行工具的循环中，添加工作流工具路由。

在 `for (const tc of parsed.toolCalls) {` 循环体内，**替换**原有的直接 `executeTool` 调用：

原代码（约 L218）：
```typescript
const result = await executeTool(tc.name, tc.args, targetTabId, enabledToolNames)
```

替换为：
```typescript
let result: any
if (_mode === 'workflow' && _workflowId) {
  // 工作流模式：直接路由到 workflow-tool-executor
  const { executeWorkflowTool } = await import('./workflow-tool-executor')
  result = await executeWorkflowTool(tc.name, tc.args, _workflowId, mainWindow)
} else {
  result = await executeTool(tc.name, tc.args, targetTabId, enabledToolNames)
}
```

- [ ] **Step 4: 验证 chat.ts 无需修改**

`electron/ipc/chat.ts` 中的 `chat:completions` handler 直接将 `params` 透传给 `proxyChatCompletions(mainWindow, params)`，无需修改代码。新增的 `_mode` 和 `_workflowId` 字段会随 params 自动传递。

Run: `grep -A5 "chat:completions" electron/ipc/chat.ts`

确认 handler 是 `proxyChatCompletions(mainWindow, params)` 形式即可。

- [ ] **Step 5: 提交**

```bash
git add electron/services/ai-proxy.ts
git commit -m "feat(workflow-ai): route workflow tools to executor in ai-proxy"
```

---

## Task 5: 渲染进程 agent.ts 支持 workflow 模式

**Files:**
- Modify: `src/lib/agent/agent.ts:1-76`
- Modify: `src/stores/chat.ts:1-18` (imports + switchToWorkflowSession)

- [ ] **Step 1: 扩展 runAgentStream 支持 workflow 模式**

`src/lib/agent/agent.ts` — 重写整个文件：

```typescript
import { createToolDiscoveryTools } from './tools'
import { listenToChatStream, type StreamCallbacks } from './stream'
import { BROWSER_AGENT_SYSTEM_PROMPT } from './system-prompt'
import { WORKFLOW_TOOL_DEFINITIONS, buildWorkflowSystemPrompt } from './workflow-tools'
import { useAIProviderStore } from '@/stores/ai-provider'

export interface AgentStreamOptions {
  mode?: 'browser' | 'workflow'
  workflowId?: string
  workflowSummary?: {
    name: string
    description?: string
    nodes: Array<{ id: string; type: string; label: string }>
    edges: Array<{ id: string; source: string; target: string }>
  }
}

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
  options?: AgentStreamOptions,
): Promise<{ requestId: string; cleanup: () => void }> {
  const providerStore = useAIProviderStore()
  const provider = providerStore.currentProvider
  const model = providerStore.currentModel

  if (!provider || !model) {
    callbacks.onError(new Error('请先配置 AI 供应商和模型'))
    return { requestId: '', cleanup: () => {} }
  }

  const isWorkflow = options?.mode === 'workflow'

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

  // 选择工具集和 system prompt
  const tools = isWorkflow
    ? WORKFLOW_TOOL_DEFINITIONS
    : createToolDiscoveryTools()

  const system = isWorkflow && options?.workflowSummary
    ? buildWorkflowSystemPrompt(options.workflowSummary)
    : BROWSER_AGENT_SYSTEM_PROMPT

  const requestId = crypto.randomUUID()

  // 监听流式回调
  const cleanup = listenToChatStream(requestId, callbacks)

  // 发送请求到主进程
  try {
    await window.api.chat.completions({
      _requestId: requestId,
      providerId: provider.id,
      modelId: model.id,
      system,
      messages,
      tools: tools as unknown as Array<Record<string, unknown>>,
      stream: true,
      maxTokens: model.maxTokens || 4096,
      targetTabId: isWorkflow ? undefined : (targetTabId ?? undefined),
      enabledToolNames: isWorkflow ? undefined : (enabledToolNames ? Array.from(enabledToolNames) : undefined),
      _mode: isWorkflow ? 'workflow' : undefined,
      _workflowId: isWorkflow ? options?.workflowId : undefined,
      ...(model.supportsThinking ? { thinking: { type: 'enabled' as const, budgetTokens: 2000 } } : {}),
    })
  } catch (error) {
    cleanup()
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }

  return { requestId, cleanup }
}
```

- [ ] **Step 2: chat store 新增 switchToWorkflowSession**

`src/stores/chat.ts` — 在 imports 中添加：

```typescript
import { useWorkflowStore } from './workflow'
```

在 `return {}` 之前（约 L439），添加方法：

```typescript
  // ===== 工作流会话管理 =====

  async function switchToWorkflowSession(workflowId: string | undefined) {
    if (!workflowId) return

    // 查找已绑定的会话
    const existing = sessions.value.find(s => s.workflowId === workflowId)
    if (existing) {
      await switchSession(existing.id)
      return
    }

    // 创建新的工作流会话
    const providerStore = useAIProviderStore()
    if (!providerStore.currentProvider || !providerStore.currentModel) {
      throw new Error('请先选择 AI 模型')
    }
    const session = await dbCreateSession(
      providerStore.currentModel.id,
      providerStore.currentProvider.id,
      null,
      workflowId,
    )
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    messages.value = []
  }
```

在 `return {}` 中新增导出：

```typescript
    switchToWorkflowSession,
```

- [ ] **Step 3: 修改 streamAssistantReply 传递 workflow 选项**

`src/stores/chat.ts:169` — 修改 `runAgentStream` 调用，传入 workflow 选项。

在 `runAgentStream(` 调用之前，构造选项：

```typescript
      // 判断是否为工作流模式
      const workflowStore = useWorkflowStore()
      const currentSession_data = sessions.value.find(s => s.id === currentSessionId.value)
      const isWorkflowMode = !!currentSession_data?.workflowId
      const workflowOptions = isWorkflowMode && workflowStore.currentWorkflow ? {
        mode: 'workflow' as const,
        workflowId: workflowStore.currentWorkflow.id,
        workflowSummary: {
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
        { /* callbacks 不变 */ },
        targetTabId.value,
        enabledToolNames.value,
        workflowOptions,
      )
```

注意：需要保持现有的 callbacks 对象不变，只在最后一个参数传入 `workflowOptions`。

- [ ] **Step 4: 提交**

```bash
git add src/lib/agent/agent.ts src/stores/chat.ts
git commit -m "feat(workflow-ai): add workflow mode to agent stream and chat store"
```

---

## Task 6: Workflow Store 增量 Merge

**Files:**
- Modify: `src/stores/workflow.ts`

- [ ] **Step 1: 添加 mergeWorkflowChanges 和 listenForFileUpdates**

在 `src/stores/workflow.ts` 中，在 `return {}` 之前添加：

```typescript
  // ====== AI 助手增量更新 ======

  interface WorkflowChanges {
    upsertNodes: any[]
    deleteNodeIds: string[]
    upsertEdges: any[]
    deleteEdgeIds: string[]
  }

  function summarizeChanges(changes: WorkflowChanges): string {
    const parts: string[] = []
    if (changes.upsertNodes.length) parts.push(`+${changes.upsertNodes.length}节点`)
    if (changes.deleteNodeIds.length) parts.push(`-${changes.deleteNodeIds.length}节点`)
    if (changes.upsertEdges.length) parts.push(`+${changes.upsertEdges.length}连线`)
    if (changes.deleteEdgeIds.length) parts.push(`-${changes.deleteEdgeIds.length}连线`)
    return parts.join(' ') || '无变更'
  }

  function mergeWorkflowChanges(changes: WorkflowChanges) {
    if (!currentWorkflow.value) return

    // 记录到 undo 栈
    pushUndo('AI 修改: ' + summarizeChanges(changes))

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
    if (changes.deleteNodeIds.length > 0) {
      currentWorkflow.value.nodes = currentWorkflow.value.nodes
        .filter(n => !changes.deleteNodeIds.includes(n.id))
    }

    // 增量更新边
    for (const edge of changes.upsertEdges) {
      const idx = currentWorkflow.value.edges.findIndex(e => e.id === edge.id)
      if (idx >= 0) {
        currentWorkflow.value.edges[idx] = edge
      } else {
        currentWorkflow.value.edges.push(edge)
      }
    }

    // 删除边
    if (changes.deleteEdgeIds.length > 0) {
      currentWorkflow.value.edges = currentWorkflow.value.edges
        .filter(e => !changes.deleteEdgeIds.includes(e.id))
    }
  }

  function listenForFileUpdates() {
    const cleanup = (window as any).api.on('workflow:updated', (data: any) => {
      if (data.workflowId === currentWorkflow.value?.id && data.changes) {
        mergeWorkflowChanges(data.changes)
      }
    })
    // 注意：cleanup 函数可在 store 销毁时调用
    return cleanup
  }
```

在 `return {}` 中新增导出：

```typescript
    mergeWorkflowChanges,
    listenForFileUpdates,
```

- [ ] **Step 2: 提交**

```bash
git add src/stores/workflow.ts
git commit -m "feat(workflow-ai): add incremental merge and file update listener to workflow store"
```

---

## Task 7: RightPanel UI 集成

**Files:**
- Modify: `src/components/workflow/RightPanel.vue`

- [ ] **Step 1: 添加 AI 助手 tab**

完整替换 `src/components/workflow/RightPanel.vue`：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Settings2, GitBranch, History, Bot } from 'lucide-vue-next'
import NodeProperties from './NodeProperties.vue'
import VersionControl from './VersionControl.vue'
import OperationHistory from './OperationHistory.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import { useChatStore } from '@/stores/chat'
import { useWorkflowStore } from '@/stores/workflow'

const chatStore = useChatStore()
const workflowStore = useWorkflowStore()
const activeTab = ref('properties')

// 监听 tab 切换，自动绑定工作流会话
watch(activeTab, async (tab) => {
  if (tab === 'ai-assistant') {
    const workflowId = workflowStore.currentWorkflow?.id
    if (workflowId) {
      await chatStore.switchToWorkflowSession(workflowId)
    }
  }
})
</script>

<template>
  <div class="border-l border-border bg-background flex flex-col h-full">
    <Tabs v-model="activeTab" default-value="properties" class="flex flex-col h-full">
      <div class="px-2 pt-2">
        <TooltipProvider :delay-duration="300">
          <TabsList class="w-full h-7">
            <Tooltip>
              <TooltipTrigger as-child>
                <TabsTrigger value="properties" class="text-xs h-5">
                  <Settings2 class="w-3.5 h-3.5" />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" class="text-xs">节点属性</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <TabsTrigger value="version" class="text-xs h-5">
                  <GitBranch class="w-3.5 h-3.5" />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" class="text-xs">版本控制</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <TabsTrigger value="operations" class="text-xs h-5">
                  <History class="w-3.5 h-3.5" />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" class="text-xs">操作历史</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <TabsTrigger value="ai-assistant" class="text-xs h-5">
                  <Bot class="w-3.5 h-3.5" />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" class="text-xs">AI 助手</TooltipContent>
            </Tooltip>
          </TabsList>
        </TooltipProvider>
      </div>

      <TabsContent value="properties" class="flex-1 min-h-0 mt-0">
        <NodeProperties :embedded="true" />
      </TabsContent>

      <TabsContent value="version" class="flex-1 min-h-0 mt-0">
        <VersionControl />
      </TabsContent>

      <TabsContent value="operations" class="flex-1 min-h-0 mt-0">
        <OperationHistory />
      </TabsContent>

      <TabsContent value="ai-assistant" class="flex-1 min-h-0 mt-0">
        <ChatPanel />
      </TabsContent>
    </Tabs>
  </div>
</template>
```

- [ ] **Step 2: 初始化 workflow store 的文件监听**

需要在 workflow 编辑器组件（如 `WorkflowEditor.vue`）的 `onMounted` 中调用 `listenForFileUpdates()`。找到工作流编辑器的主入口组件：

Run: `grep -rn "useWorkflowStore" src/components/workflow/ --include="*.vue" | head -5`

在工作流编辑器组件的 setup 中添加：

```typescript
const workflowStore = useWorkflowStore()

// 在组件挂载时注册文件变更监听
let cleanupFileUpdates: (() => void) | null = null
onMounted(() => {
  cleanupFileUpdates = workflowStore.listenForFileUpdates()
})
onUnmounted(() => {
  cleanupFileUpdates?.()
})
```

如果已有 `onMounted`，在现有逻辑后追加。

- [ ] **Step 3: 提交**

```bash
git add src/components/workflow/RightPanel.vue
git commit -m "feat(workflow-ai): add AI assistant tab to workflow RightPanel"
```

---

## 验证清单

完成所有 Task 后，按以下步骤验证：

- [ ] TypeScript 编译无报错：`pnpm build`
- [ ] 启动开发服务器 `pnpm dev`
- [ ] 打开工作流编辑器，确认 RightPanel 有 4 个 tab
- [ ] 点击 "AI 助手" tab，确认 ChatPanel 正常渲染
- [ ] 在聊天框输入 "帮我创建一个简单的网页自动化工作流"
- [ ] 确认 AI 返回 tool_use 调用
- [ ] 确认节点被创建并出现在画布上
- [ ] 确认自动布局正常工作
- [ ] 切换到其他工作流，确认会话独立
- [ ] 切换回 AI 助手，确认历史消息保留
