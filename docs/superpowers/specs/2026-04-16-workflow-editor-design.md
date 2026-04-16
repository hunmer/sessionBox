# Workflow Editor 设计文档

**日期**: 2026-04-16
**状态**: 已批准

## 概述

基于 Vue Flow 实现类似 n8n 的工作流编辑器，将 `src/lib/agent/tools.ts` 中的 23 个工具方法转换为可拖拽节点，支持可视化编排、参数配置、线性执行控制。工作流通过 electron-store 持久化，从 RightPanel 入口打开。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 执行模型 | 线性顺序执行，架构预留 DAG | MVP 简单，后续可扩展 |
| 数据流 | 全局上下文变量 `$context` | 简单直接，`context[nodeId]` 存储每个节点的输出 |
| 存储 | electron-store | 与项目现有数据模式一致，三处同步 |
| IPC 执行 | 复用现有工具 IPC 通道 | 无需新建通道，工具已在主进程实现 |
| 架构模式 | 中心化编排器 (WorkflowEngine) | 执行逻辑集中，暂停/恢复容易实现 |
| Agent 节点 | AI 处理节点 | 调用 AI API，传入 prompt + context，返回响应 |

## 数据模型

```typescript
// 工作流文件夹（树形结构）
interface WorkflowFolder {
  id: string
  name: string
  parentId: string | null  // null = 根级
  order: number
  createdAt: number
}

// 工作流
interface Workflow {
  id: string
  name: string
  folderId: string | null  // 所属文件夹
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
}

// 工作流节点（Vue Flow node 的业务数据）
interface WorkflowNode {
  id: string
  type: string              // 节点类型标识
  label: string             // 用户可编辑的节点名称
  position: { x: number; y: number }
  data: Record<string, any> // 节点参数
}

// 工作流连线
interface WorkflowEdge {
  id: string
  source: string  // 上游节点 id
  target: string  // 下游节点 id
}

// 节点注册表项
interface NodeTypeDefinition {
  type: string
  label: string
  category: string  // '页面交互' | '页面信息' | '标签管理' | '技能管理' | '流程控制' | 'AI'
  icon: string      // lucide icon name
  description: string
  properties: NodeProperty[]
}

// 节点属性表单字段
interface NodeProperty {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code'
  required?: boolean
  readonly?: boolean
  default?: any
  options?: { label: string; value: string }[]
  description?: string
}

// 执行记录
interface ExecutionLog {
  workflowId: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'paused' | 'error'
  steps: ExecutionStep[]
}

interface ExecutionStep {
  nodeId: string
  nodeLabel: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'error'
  input?: any
  output?: any
  error?: string
}
```

### 存储

- `workflows` 键：`Workflow[]`
- `workflowFolders` 键：`WorkflowFolder[]`
- 三处同步：`src/types/index.ts`、`electron/services/store.ts`、`preload/index.ts`

## 组件架构

```
RightPanel.vue
  └─ WorkflowDialog.vue (Dialog 包装器)
       └─ WorkflowEditor.vue (编辑器主组件)
            ├─ Menubar (顶部：文件-打开/保存)
            │    └─ WorkflowListDialog.vue (打开选择)
            ├─ VueFlow 画布
            │    ├─ CustomNodeWrapper (公用节点)
            │    ├─ MiniMap
            │    ├─ Controls
            │    └─ Background
            ├─ NodeSidebar.vue (左侧：节点列表)
            └─ NodeProperties.vue (右侧：属性表单)
                 └─ 动态表单组件
```

### 组件职责

| 组件 | 职责 |
|------|------|
| `WorkflowDialog` | shadcn Dialog 容器，管理打开/关闭 |
| `WorkflowEditor` | 编辑器主入口，组合所有子组件 |
| `NodeSidebar` | 左侧面板，折叠分组 + 搜索 + 拖拽源 |
| `CustomNodeWrapper` | Vue Flow 自定义节点，显示图标+类型+可编辑名称+执行状态 |
| `NodeProperties` | 右侧属性面板，根据 NodeTypeDefinition.properties 动态渲染表单 |
| `ExecutionBar` | 画布底部，执行控制按钮 + 进度 + 日志 |
| `WorkflowListDialog` | 工作流选择，左侧文件夹树 + 右侧工作流列表 |
| `WorkflowFolderTree` | 多层级文件夹树组件 |
| `WorkflowList` | 工作流列表组件 |

### CustomNodeWrapper 布局

```
┌──────────────────────┐
│  [图标]  节点类型名    │  ← 固定头部
│  ─────────────────── │
│  [执行状态指示器]      │  ← 运行时显示
│  ─────────────────── │
│  ▸ 可编辑的节点名称    │  ← 底部，click 变 input
└──────────────────────┘
```

执行状态颜色：idle(灰) → running(蓝+动画) → completed(绿) → error(红)

### WorkflowListDialog 布局

```
┌──────────────┬───────────────────────┐
│  文件夹树     │  工作流列表            │
│  ──────────  │  ─────────────────── │
│  🔍 搜索     │  🔍 搜索              │
│  ▸ 日常任务  │  ☐ 自动登录流程        │
│  ▾ 测试流程  │  ☐ 数据采集脚本        │
│    子文件夹A │  ☐ 页面截图工具        │
│    子文件夹B │                       │
│  ▸ 采集任务  │  [+ 新建工作流]        │
│              │                       │
│  [+ 新建文件夹]│  [确认选择]  [取消]  │
└──────────────┴───────────────────────┘
```

复用 BookmarksPage 的 ResizablePanelGroup 左右分栏模式。

### ExecutionBar 布局

```
┌─────────────────────────────────────────────────┐
│ [▶ 执行]  [⏸ 暂停]  [⏹ 停止]  │ 进度: 3/12 │ 耗时: 2.3s │
├─────────────────────────────────────────────────┤
│ ✓ click_element    完成  0.1s                     │
│ ● type_text        执行中...                      │
│ ○ get_page_content 等待中                         │
└─────────────────────────────────────────────────┘
```

### NodeProperties 布局

选中节点后：
- 标题区：节点类型图标 + 类型名
- 表单区：根据 `properties` 动态渲染（text / textarea / number / select / checkbox / code）
- `readonly` 字段显示为只读
- `required` 字段显示红色星号
- 无选中节点时显示空状态提示

### 顶部 Menubar

```
[文件] ─── 打开 (→ WorkflowListDialog)
      └── 保存 (保存当前工作流，新建时弹出命名)
```

## 节点注册表

### 节点分类

| 类别 | 节点 | 来源 |
|------|------|------|
| 页面交互 | click_element, type_text, scroll_page, select_option, hover_element | tools.ts |
| 页面信息 | get_page_content, get_dom, get_page_screenshot, get_page_summary, get_page_markdown, get_interactive_nodes, get_interactive_node_detail | tools.ts |
| 标签管理 | list_tabs, create_tab, navigate_tab, switch_tab, close_tab, list_groups, list_pages, get_active_tab | tools.ts |
| 技能管理 | write_skill, read_skill, list_skills, search_skill, exec_skill | tools.ts |
| 流程控制 | run_code, toast | 新增 |
| AI | agent_chat | 新增 |

### tools.ts 自动转换规则

从 `BROWSER_TOOL_LIST` 的 `input_schema.properties` 自动生成 `NodeProperty[]`：

| JSON Schema type | NodeProperty type |
|------------------|-------------------|
| string + enum    | select            |
| string (long)    | textarea          |
| string           | text              |
| integer/number   | number            |
| boolean          | checkbox          |

### 新增节点

- **run_code**：`new Function('context', code)(context)` 执行 JS，返回值写入 context
- **toast**：调用 `window.api.showToast()` IPC，不改变 context
- **agent_chat**：调用 AI API，prompt 支持 `$context` 变量替换，复用现有 chat store 的 provider/model 配置

## 执行引擎

```typescript
class WorkflowEngine {
  private nodes: WorkflowNode[]
  private edges: WorkflowEdge[]
  private context: Record<string, any>  // $context
  private status: 'idle' | 'running' | 'paused' | 'error'
  private currentNodeIndex: number
  private abortController: AbortController

  async start(): Promise<void>
  async pause(): Promise<void>
  async resume(): Promise<void>
  async stop(): Promise<void>

  private async executeNode(node: WorkflowNode): Promise<any>
  private resolveNextNode(currentId: string): WorkflowNode | null
  private buildExecutionOrder(): WorkflowNode[]
}
```

执行流程：
1. `start()` → 按 edge 连线线性排序 → 逐个执行
2. 每个节点执行前检查 `abortController`，支持暂停
3. 执行结果写入 `context[nodeId]`
4. 暂停时记录 `currentNodeIndex`，`resume()` 从下一个继续
5. 错误时停止并记录到执行日志

执行记录存在内存中（Pinia store），不持久化。每次执行新工作流时清空旧记录。

## Pinia Store

```typescript
// useWorkflowStore
{
  workflows: Workflow[]
  workflowFolders: WorkflowFolder[]
  currentWorkflow: Workflow | null
  selectedNodeId: string | null

  executionStatus: 'idle' | 'running' | 'paused' | 'error'
  executionLog: ExecutionLog | null
  executionContext: Record<string, any>

  // CRUD
  loadWorkflows(): Promise<void>
  saveWorkflow(workflow: Workflow): Promise<void>
  deleteWorkflow(id: string): Promise<void>
  createFolder(name: string, parentId?: string): Promise<void>
  deleteFolder(id: string): Promise<void>

  // 编辑
  updateNodePosition(nodeId: string, position: { x: number; y: number }): void
  updateNodeData(nodeId: string, data: Record<string, any>): void
  addNode(type: string, position: { x: number; y: number }): void
  removeNode(nodeId: string): void
  addEdge(source: string, target: string): void
  removeEdge(edgeId: string): void
}
```

## 文件结构

### 新增文件

```
src/
├── components/workflow/
│   ├── WorkflowDialog.vue
│   ├── WorkflowEditor.vue
│   ├── NodeSidebar.vue
│   ├── CustomNodeWrapper.vue
│   ├── NodeProperties.vue
│   ├── ExecutionBar.vue
│   ├── WorkflowListDialog.vue
│   ├── WorkflowFolderTree.vue
│   └── WorkflowList.vue
├── lib/workflow/
│   ├── nodeRegistry.ts
│   ├── engine.ts
│   └── types.ts
├── stores/
│   └── workflow.ts
```

### 需修改文件

| 文件 | 修改 |
|------|------|
| `src/types/index.ts` | 导入工作流类型 |
| `electron/services/store.ts` | 新增 `workflows`、`workflowFolders` 键 |
| `preload/index.ts` | 新增工作流 CRUD IPC |
| `electron/ipc/workflow.ts` | 新增 IPC handler |
| `src/components/common/RightPanel.vue` | 添加工作流入口 |

### 新增依赖

- `@vue-flow/background` — 网格背景
- `@vue-flow/mini-map` — 小地图
- `@vue-flow/controls` — 缩放控制
- `@vue-flow/node-toolbar` — 节点工具栏

`@vue-flow/core` 已安装 (v1.48.2)，上述 4 个包需新增安装。
