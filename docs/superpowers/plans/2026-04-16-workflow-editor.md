# Workflow Editor 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 Vue Flow 实现可视化工作流编辑器，将 agent tools 转换为可拖拽节点，支持编排、参数配置、线性执行控制。

**Architecture:** 中心化 WorkflowEngine 编排线性执行，全局 context 变量传递数据。节点注册表从 tools.ts 自动转换 + 3 个新增节点。electron-store 持久化，三处类型同步。

**Tech Stack:** Vue 3 + Vue Flow + Pinia + shadcn-vue + electron-store

**Design Spec:** `docs/superpowers/specs/2026-04-16-workflow-editor-design.md`

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/lib/workflow/types.ts` | 工作流类型定义 |
| `src/lib/workflow/nodeRegistry.ts` | 节点注册表（tools.ts 转换 + 新增节点） |
| `src/lib/workflow/engine.ts` | WorkflowEngine 执行引擎 |
| `src/stores/workflow.ts` | Pinia store（CRUD + 编辑状态 + 执行状态） |
| `src/components/workflow/WorkflowDialog.vue` | Dialog 容器 |
| `src/components/workflow/WorkflowEditor.vue` | 编辑器主组件 |
| `src/components/workflow/NodeSidebar.vue` | 左侧节点列表（折叠分组 + 搜索 + 拖拽） |
| `src/components/workflow/CustomNodeWrapper.vue` | 公用自定义节点包装器 |
| `src/components/workflow/NodeProperties.vue` | 右侧节点属性表单 |
| `src/components/workflow/ExecutionBar.vue` | 底部执行控制器 |
| `src/components/workflow/WorkflowListDialog.vue` | 打开工作流选择对话框 |
| `src/components/workflow/WorkflowFolderTree.vue` | 工作流文件夹树 |
| `src/components/workflow/WorkflowList.vue` | 工作流列表 |
| `electron/ipc/workflow.ts` | 工作流 IPC handler |

### 需修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/types/index.ts` | 导入工作流类型 |
| `electron/services/store.ts` | 新增 WorkflowFolder / Workflow 类型 + CRUD 函数 |
| `electron/ipc/index.ts` | 注册工作流 IPC handler |
| `preload/index.ts` | 暴露工作流 IPC API |
| `src/components/common/RightPanel.vue` | 添加工作流入口按钮 |

### 需安装依赖

```bash
pnpm add @vue-flow/background @vue-flow/minimap @vue-flow/controls @vue-flow/node-toolbar
```

---

## Task 1: 安装 Vue Flow 附加依赖

- [ ] **Step 1: 安装包**

```bash
pnpm add @vue-flow/background @vue-flow/minimap @vue-flow/controls @vue-flow/node-toolbar
```

- [ ] **Step 2: 验证安装**

```bash
grep -E "@vue-flow" package.json
```

Expected: 显示 `@vue-flow/core`、`@vue-flow/background`、`@vue-flow/mini-map`、`@vue-flow/controls`、`@vue-flow/node-toolbar` 共 5 行。

- [ ] **Step 3: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install vue-flow addons for workflow editor"
```

---

## Task 2: 工作流类型定义 (src/lib/workflow/types.ts)

**Files:**
- Create: `src/lib/workflow/types.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: 创建类型文件**

```typescript
// src/lib/workflow/types.ts

/** 工作流文件夹（树形结构） */
export interface WorkflowFolder {
  id: string
  name: string
  parentId: string | null // null = 根级
  order: number
  createdAt: number
}

/** 工作流节点 */
export interface WorkflowNode {
  id: string
  type: string // 节点类型标识
  label: string // 用户可编辑的节点名称
  position: { x: number; y: number }
  data: Record<string, any> // 节点参数
}

/** 工作流连线 */
export interface WorkflowEdge {
  id: string
  source: string
  target: string
}

/** 工作流 */
export interface Workflow {
  id: string
  name: string
  folderId: string | null
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
}

/** 节点属性表单字段定义 */
export interface NodeProperty {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code'
  required?: boolean
  readonly?: boolean
  default?: any
  options?: { label: string; value: string }[]
  description?: string
}

/** 节点注册表项 */
export interface NodeTypeDefinition {
  type: string
  label: string
  category: string
  icon: string
  description: string
  properties: NodeProperty[]
}

/** 执行步骤记录 */
export interface ExecutionStep {
  nodeId: string
  nodeLabel: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'error'
  input?: any
  output?: any
  error?: string
}

/** 执行日志 */
export interface ExecutionLog {
  workflowId: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'paused' | 'error'
  steps: ExecutionStep[]
}
```

- [ ] **Step 2: 在 src/types/index.ts 末尾添加导出**

在文件末尾追加：

```typescript
// 工作流
export type {
  WorkflowFolder,
  WorkflowNode,
  WorkflowEdge,
  Workflow,
  NodeProperty,
  NodeTypeDefinition,
  ExecutionStep,
  ExecutionLog,
} from '@/lib/workflow/types'
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: 无相关错误。

- [ ] **Step 4: 提交**

```bash
git add src/lib/workflow/types.ts src/types/index.ts
git commit -m "feat(workflow): add workflow type definitions"
```

---

## Task 3: 主进程数据层 + IPC (electron/store + ipc + preload)

**Files:**
- Modify: `electron/services/store.ts` — 新增 WorkflowFolder / Workflow 类型定义 + StoreSchema 键 + CRUD 函数
- Create: `electron/ipc/workflow.ts` — 工作流 IPC handler
- Modify: `electron/ipc/index.ts` — 注册工作流 IPC
- Modify: `preload/index.ts` — 暴露工作流 API

- [ ] **Step 1: 在 electron/services/store.ts 中添加类型定义**

在已有 BookmarkFolder 接口之后（约 line 76），追加：

```typescript
export interface WorkflowFolder {
  id: string
  name: string
  parentId: string | null
  order: number
  createdAt: number
}

export interface WorkflowNode {
  id: string
  type: string
  label: string
  position: { x: number; y: number }
  data: Record<string, any>
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
}

export interface Workflow {
  id: string
  name: string
  folderId: string | null
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
}
```

- [ ] **Step 2: 在 StoreSchema 接口中添加键**

找到 `StoreSchema` 接口（约 line 200+），在已有键之后追加：

```typescript
workflowFolders: WorkflowFolder[]
workflows: Workflow[]
```

- [ ] **Step 3: 在 defaults 对象中添加默认值**

找到 `defaults` 对象，追加：

```typescript
workflowFolders: [],
workflows: [],
```

- [ ] **Step 4: 添加辅助函数 collectChildWorkflowFolderIds**

在书签文件夹辅助函数 `collectChildFolderIds` 附近追加：

```typescript
function collectChildWorkflowFolderIds(folders: WorkflowFolder[], parentId: string): string[] {
  const children = folders.filter((f) => f.parentId === parentId)
  return children.reduce<string[]>(
    (acc, child) => [...acc, child.id, ...collectChildWorkflowFolderIds(folders, child.id)],
    [],
  )
}
```

- [ ] **Step 5: 添加工作流文件夹 CRUD 函数**

在书签文件夹操作区域之后追加：

```typescript
// ====== 工作流文件夹操作 ======

export function listWorkflowFolders(): WorkflowFolder[] {
  return getCollection('workflowFolders').sort((a, b) => a.order - b.order)
}

export function createWorkflowFolder(data: Omit<WorkflowFolder, 'id'>): WorkflowFolder {
  const folders = getCollection('workflowFolders')
  const folder: WorkflowFolder = { ...data, id: randomUUID() }
  folders.push(folder)
  setCollection('workflowFolders', folders)
  return folder
}

export function updateWorkflowFolder(id: string, data: Partial<Omit<WorkflowFolder, 'id'>>): void {
  const folders = getCollection('workflowFolders')
  const idx = folders.findIndex((f) => f.id === id)
  if (idx === -1) throw new Error(`工作流文件夹 ${id} 不存在`)
  folders[idx] = { ...folders[idx], ...data }
  setCollection('workflowFolders', folders)
}

export function deleteWorkflowFolder(id: string): void {
  const folders = getCollection('workflowFolders')
  const childIds = collectChildWorkflowFolderIds(folders, id)
  const idsToDelete = [id, ...childIds]
  setCollection('workflowFolders', folders.filter((f) => !idsToDelete.includes(f.id)))
  // 级联删除文件夹内的工作流
  const workflows = getCollection('workflows').filter((w) => !idsToDelete.includes(w.folderId))
  setCollection('workflows', workflows)
}
```

- [ ] **Step 6: 添加工作流 CRUD 函数**

```typescript
// ====== 工作流操作 ======

export function listWorkflows(folderId?: string | null): Workflow[] {
  const items = getCollection('workflows').sort((a, b) => a.updatedAt - b.updatedAt)
  if (folderId !== undefined) return items.filter((w) => w.folderId === folderId)
  return items
}

export function getWorkflow(id: string): Workflow | undefined {
  return getCollection('workflows').find((w) => w.id === id)
}

export function createWorkflow(data: Omit<Workflow, 'id'>): Workflow {
  const items = getCollection('workflows')
  const item: Workflow = { ...data, id: randomUUID() }
  items.push(item)
  setCollection('workflows', items)
  return item
}

export function updateWorkflow(id: string, data: Partial<Omit<Workflow, 'id'>>): void {
  const items = getCollection('workflows')
  const idx = items.findIndex((w) => w.id === id)
  if (idx === -1) throw new Error(`工作流 ${id} 不存在`)
  items[idx] = { ...items[idx], ...data }
  setCollection('workflows', items)
}

export function deleteWorkflow(id: string): void {
  const items = getCollection('workflows').filter((w) => w.id !== id)
  setCollection('workflows', items)
}
```

- [ ] **Step 7: 创建 electron/ipc/workflow.ts**

```typescript
import { ipcMain } from 'electron'
import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  listWorkflowFolders,
  createWorkflowFolder,
  updateWorkflowFolder,
  deleteWorkflowFolder,
} from '../services/store'

export function registerWorkflowIpcHandlers(): void {
  // 工作流
  ipcMain.handle('workflow:list', (_e, folderId?: string | null) => listWorkflows(folderId))
  ipcMain.handle('workflow:get', (_e, id: string) => getWorkflow(id))
  ipcMain.handle('workflow:create', (_e, data) => createWorkflow(data))
  ipcMain.handle('workflow:update', (_e, id: string, data) => updateWorkflow(id, data))
  ipcMain.handle('workflow:delete', (_e, id: string) => deleteWorkflow(id))

  // 工作流文件夹
  ipcMain.handle('workflowFolder:list', () => listWorkflowFolders())
  ipcMain.handle('workflowFolder:create', (_e, data) => createWorkflowFolder(data))
  ipcMain.handle('workflowFolder:update', (_e, id: string, data) => updateWorkflowFolder(id, data))
  ipcMain.handle('workflowFolder:delete', (_e, id: string) => deleteWorkflowFolder(id))
}
```

- [ ] **Step 8: 在 electron/ipc/index.ts 中注册**

在 `registerIpcHandlers()` 函数内添加导入和调用：

文件顶部导入：
```typescript
import { registerWorkflowIpcHandlers } from './workflow'
```

函数体内追加：
```typescript
// ====== 工作流 ======
registerWorkflowIpcHandlers()
```

- [ ] **Step 9: 在 preload/index.ts 中暴露工作流 API**

在 `api` 对象中追加 `workflow` 和 `workflowFolder` 模块：

```typescript
workflow: {
  list: (folderId?: string | null): Promise<any[]> =>
    ipcRenderer.invoke('workflow:list', folderId),
  get: (id: string): Promise<any | undefined> =>
    ipcRenderer.invoke('workflow:get', id),
  create: (data: any): Promise<any> =>
    ipcRenderer.invoke('workflow:create', data),
  update: (id: string, data: any): Promise<void> =>
    ipcRenderer.invoke('workflow:update', id, data),
  delete: (id: string): Promise<void> =>
    ipcRenderer.invoke('workflow:delete', id),
},
workflowFolder: {
  list: (): Promise<any[]> =>
    ipcRenderer.invoke('workflowFolder:list'),
  create: (data: any): Promise<any> =>
    ipcRenderer.invoke('workflowFolder:create', data),
  update: (id: string, data: any): Promise<void> =>
    ipcRenderer.invoke('workflowFolder:update', id, data),
  delete: (id: string): Promise<void> =>
    ipcRenderer.invoke('workflowFolder:delete', id),
},
```

- [ ] **Step 10: 验证编译**

```bash
pnpm build 2>&1 | tail -10
```

Expected: 编译成功无错误。

- [ ] **Step 11: 提交**

```bash
git add electron/services/store.ts electron/ipc/workflow.ts electron/ipc/index.ts preload/index.ts
git commit -m "feat(workflow): add store CRUD, IPC handlers, and preload API"
```

---

## Task 4: 节点注册表 (src/lib/workflow/nodeRegistry.ts)

**Files:**
- Create: `src/lib/workflow/nodeRegistry.ts`

将 tools.ts 的 25 个工具 + 3 个新增节点转换为 `NodeTypeDefinition[]`，提供按类别分组和搜索功能。

- [ ] **Step 1: 创建节点注册表**

```typescript
// src/lib/workflow/nodeRegistry.ts
import { BROWSER_TOOL_LIST } from '@/lib/agent/tools'
import type { NodeTypeDefinition, NodeProperty } from './types'

/** 工具 schema property 到 NodeProperty 的转换 */
function schemaToProps(
  properties: Record<string, any>,
  required?: string[],
): NodeProperty[] {
  return Object.entries(properties).map(([key, schema]) => {
    const prop: NodeProperty = {
      key,
      label: schema.description || key,
      type: inferPropType(schema),
      required: required?.includes(key),
      description: schema.description,
    }
    if (schema.enum) {
      prop.type = 'select'
      prop.options = schema.enum.map((v: string) => ({ label: v, value: v }))
    }
    if (schema.default !== undefined) {
      prop.default = schema.default
    }
    return prop
  })
}

function inferPropType(schema: any): NodeProperty['type'] {
  if (schema.enum) return 'select'
  switch (schema.type) {
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'checkbox'
    case 'string':
      return 'text'
    default:
      return 'text'
  }
}

/** 从 tools.ts 的 createBrowserTools 提取节点定义 */
function buildToolNodeDefinitions(): NodeTypeDefinition[] {
  // 导入 createBrowserTools 来获取完整的 input_schema
  // 但为了避免循环依赖，这里使用静态定义
  // BROWSER_TOOL_LIST 提供分类信息，详细 schema 由以下映射提供
  const toolSchemas: Record<string, { properties: Record<string, any>; required?: string[] }> = {
    click_element: {
      properties: {
        selector: { type: 'string', description: 'CSS 选择器，例如 "#login-btn", ".submit-button"' },
        tabId: { type: 'string', description: '目标标签页 ID' },
      },
      required: ['selector'],
    },
    type_text: {
      properties: {
        text: { type: 'string', description: '要输入的文字' },
        selector: { type: 'string', description: 'CSS 选择器定位输入框' },
        tabId: { type: 'string', description: '目标标签页 ID' },
      },
      required: ['text'],
    },
    scroll_page: {
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: '滚动方向' },
        amount: { type: 'number', description: '滚动像素数', default: 300 },
        tabId: { type: 'string', description: '目标标签页 ID' },
      },
      required: ['direction'],
    },
    select_option: {
      properties: {
        selector: { type: 'string', description: 'select 元素的 CSS 选择器' },
        value: { type: 'string', description: '要选中的选项值' },
        tabId: { type: 'string', description: '目标标签页 ID' },
      },
      required: ['selector', 'value'],
    },
    hover_element: {
      properties: {
        selector: { type: 'string', description: 'CSS 选择器' },
        tabId: { type: 'string', description: '目标标签页 ID' },
      },
      required: ['selector'],
    },
    get_page_content: {
      properties: { tabId: { type: 'string', description: '目标标签页 ID' } },
    },
    get_dom: {
      properties: {
        selector: { type: 'string', description: 'CSS 选择器' },
        tabId: { type: 'string', description: '目标标签页 ID' },
      },
      required: ['selector'],
    },
    get_page_screenshot: {
      properties: {
        tabId: { type: 'string', description: '目标标签页 ID' },
        format: { type: 'string', enum: ['png', 'jpeg'], description: '截图格式' },
      },
    },
    get_page_summary: {
      properties: { tabId: { type: 'string', description: '目标标签页 ID' } },
    },
    get_page_markdown: {
      properties: {
        tabId: { type: 'string', description: '目标标签页 ID' },
        maxLength: { type: 'number', description: 'Markdown 内容最大字符数，默认 10000', default: 10000 },
      },
    },
    get_interactive_nodes: {
      properties: {
        tabId: { type: 'string', description: '目标标签页 ID' },
        viewportOnly: { type: 'boolean', description: '是否仅返回视口内元素，默认 true', default: true },
      },
    },
    get_interactive_node_detail: {
      properties: {
        selector: { type: 'string', description: 'CSS 选择器' },
        tabId: { type: 'string', description: '目标标签页 ID' },
      },
      required: ['selector'],
    },
    list_tabs: { properties: {} },
    create_tab: {
      properties: {
        url: { type: 'string', description: '要打开的 URL' },
        pageId: { type: 'string', description: '已有页面 ID' },
      },
      required: ['url'],
    },
    navigate_tab: {
      properties: {
        url: { type: 'string', description: '目标 URL' },
        tabId: { type: 'string', description: '目标标签页 ID' },
      },
      required: ['url'],
    },
    switch_tab: {
      properties: { tabId: { type: 'string', description: '要切换到的标签页 ID' } },
      required: ['tabId'],
    },
    close_tab: {
      properties: { tabId: { type: 'string', description: '要关闭的标签页 ID' } },
      required: ['tabId'],
    },
    list_groups: { properties: {} },
    list_pages: { properties: {} },
    get_active_tab: { properties: {} },
    write_skill: {
      properties: {
        name: { type: 'string', description: 'Skill 名称，小写英文+短横线' },
        description: { type: 'string', description: 'Skill 一句话说明' },
        content: { type: 'string', description: 'Skill 的 Markdown 正文' },
      },
      required: ['name', 'description', 'content'],
    },
    read_skill: {
      properties: { name: { type: 'string', description: 'Skill 名称' } },
      required: ['name'],
    },
    list_skills: { properties: {} },
    search_skill: {
      properties: { name: { type: 'string', description: '搜索关键词' } },
      required: ['name'],
    },
    exec_skill: {
      properties: {
        name: { type: 'string', description: '要执行的 Skill 名称' },
        params: { type: 'object', description: '传给 Skill 的参数键值对' },
      },
      required: ['name'],
    },
  }

  return BROWSER_TOOL_LIST.map((tool) => {
    const schema = toolSchemas[tool.name] || { properties: {} }
    return {
      type: tool.name,
      label: tool.description,
      category: tool.category,
      icon: getToolIcon(tool.name),
      description: tool.description,
      properties: schemaToProps(schema.properties, schema.required),
    }
  })
}

function getToolIcon(name: string): string {
  const iconMap: Record<string, string> = {
    click_element: 'MousePointerClick',
    type_text: 'Type',
    scroll_page: 'ArrowUpDown',
    select_option: 'List',
    hover_element: 'Pointer',
    get_page_content: 'FileText',
    get_dom: 'Code',
    get_page_screenshot: 'Camera',
    get_page_summary: 'ClipboardList',
    get_page_markdown: 'BookOpen',
    get_interactive_nodes: 'MousePointer',
    get_interactive_node_detail: 'Search',
    list_tabs: 'LayoutList',
    create_tab: 'Plus',
    navigate_tab: 'Navigation',
    switch_tab: 'ArrowRightLeft',
    close_tab: 'X',
    list_groups: 'FolderTree',
    list_pages: 'Layers',
    get_active_tab: 'AppWindow',
    write_skill: 'Save',
    read_skill: 'BookOpen',
    list_skills: 'List',
    search_skill: 'Search',
    exec_skill: 'Play',
    run_code: 'Terminal',
    toast: 'Bell',
    agent_chat: 'Bot',
  }
  return iconMap[name] || 'Circle'
}

/** 新增节点定义 */
const customNodeDefinitions: NodeTypeDefinition[] = [
  {
    type: 'run_code',
    label: '运行 JS 代码',
    category: '流程控制',
    icon: 'Terminal',
    description: '执行自定义 JavaScript 代码，可通过 context 访问上游数据',
    properties: [
      {
        key: 'code',
        label: '代码',
        type: 'code',
        required: true,
        description: 'JavaScript 代码，可使用 context 变量。返回值将写入 context[this.id]',
      },
    ],
  },
  {
    type: 'toast',
    label: 'Toast 消息',
    category: '流程控制',
    icon: 'Bell',
    description: '显示 Toast 通知消息',
    properties: [
      {
        key: 'message',
        label: '消息内容',
        type: 'text',
        required: true,
        description: '要显示的消息文本',
      },
      {
        key: 'type',
        label: '消息类型',
        type: 'select',
        default: 'info',
        options: [
          { label: '信息', value: 'info' },
          { label: '成功', value: 'success' },
          { label: '警告', value: 'warning' },
          { label: '错误', value: 'error' },
        ],
      },
    ],
  },
  {
    type: 'agent_chat',
    label: 'AI 对话',
    category: 'AI',
    icon: 'Bot',
    description: '调用 AI 处理文本，prompt 支持 $context 变量替换',
    properties: [
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        required: true,
        description: 'AI 提示词，可用 {{context.nodeId.field}} 引用上下文变量',
      },
      {
        key: 'systemPrompt',
        label: '系统提示词',
        type: 'textarea',
        description: '可选的系统级提示词',
      },
    ],
  },
]

/** 所有节点定义（合并） */
export const allNodeDefinitions: NodeTypeDefinition[] = [
  ...buildToolNodeDefinitions(),
  ...customNodeDefinitions,
]

/** 按类别分组 */
export function getNodeDefinitionsByCategory(): Record<string, NodeTypeDefinition[]> {
  const groups: Record<string, NodeTypeDefinition[]> = {}
  for (const def of allNodeDefinitions) {
    if (!groups[def.category]) groups[def.category] = []
    groups[def.category].push(def)
  }
  return groups
}

/** 按类型查找定义 */
export function getNodeDefinition(type: string): NodeTypeDefinition | undefined {
  return allNodeDefinitions.find((d) => d.type === type)
}

/** 搜索节点 */
export function searchNodeDefinitions(query: string): NodeTypeDefinition[] {
  const q = query.toLowerCase()
  return allNodeDefinitions.filter(
    (d) => d.label.toLowerCase().includes(q) || d.type.toLowerCase().includes(q),
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/workflow/nodeRegistry.ts
git commit -m "feat(workflow): add node registry with tool-to-node conversion"
```

---

## Task 5: 执行引擎 (src/lib/workflow/engine.ts)

**Files:**
- Create: `src/lib/workflow/engine.ts`

- [ ] **Step 1: 创建执行引擎**

```typescript
// src/lib/workflow/engine.ts
import type { WorkflowNode, WorkflowEdge, ExecutionLog, ExecutionStep } from './types'
import { getNodeDefinition } from './nodeRegistry'

export type EngineStatus = 'idle' | 'running' | 'paused' | 'error'

export class WorkflowEngine {
  private nodes: WorkflowNode[]
  private edges: WorkflowEdge[]
  private context: Record<string, any>
  private _status: EngineStatus = 'idle'
  private executionOrder: WorkflowNode[] = []
  private currentIndex = 0
  private pauseRequested = false
  private stopRequested = false
  private startTime = 0
  private steps: ExecutionStep[] = []
  private onLogUpdate?: (log: ExecutionLog) => void
  private onNodeStatusChange?: (nodeId: string, status: ExecutionStep['status']) => void

  constructor(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    callbacks?: {
      onLogUpdate?: (log: ExecutionLog) => void
      onNodeStatusChange?: (nodeId: string, status: ExecutionStep['status']) => void
    },
  ) {
    this.nodes = nodes
    this.edges = edges
    this.context = {}
    this.onLogUpdate = callbacks?.onLogUpdate
    this.onNodeStatusChange = callbacks?.onNodeStatusChange
  }

  get status(): EngineStatus {
    return this._status
  }

  get currentContext(): Record<string, any> {
    return { ...this.context }
  }

  get currentLog(): ExecutionLog {
    return {
      workflowId: '',
      startedAt: this.startTime,
      status: this._status === 'running' ? 'running' : this._status === 'paused' ? 'paused' : this._status,
      steps: [...this.steps],
      finishedAt: this._status !== 'running' && this._status !== 'paused' ? Date.now() : undefined,
    }
  }

  async start(): Promise<ExecutionLog> {
    this.reset()
    this.executionOrder = this.buildExecutionOrder()
    if (this.executionOrder.length === 0) {
      this._status = 'error'
      return this.currentLog
    }
    this._status = 'running'
    this.startTime = Date.now()
    this.emitLogUpdate()
    await this.runFromIndex(0)
    return this.currentLog
  }

  pause(): void {
    if (this._status === 'running') {
      this.pauseRequested = true
    }
  }

  async resume(): Promise<ExecutionLog> {
    if (this._status !== 'paused') return this.currentLog
    this._status = 'running'
    this.pauseRequested = false
    this.emitLogUpdate()
    await this.runFromIndex(this.currentIndex)
    return this.currentLog
  }

  stop(): void {
    this.stopRequested = true
  }

  private reset(): void {
    this.context = {}
    this.steps = []
    this.currentIndex = 0
    this.pauseRequested = false
    this.stopRequested = false
    this._status = 'idle'
    this.startTime = 0
  }

  private async runFromIndex(startIndex: number): Promise<void> {
    for (let i = startIndex; i < this.executionOrder.length; i++) {
      if (this.stopRequested) {
        this._status = 'error'
        this.emitLogUpdate()
        return
      }

      if (this.pauseRequested) {
        this.currentIndex = i
        this._status = 'paused'
        this.pauseRequested = false
        this.emitLogUpdate()
        return
      }

      this.currentIndex = i
      const node = this.executionOrder[i]
      await this.executeNode(node)
    }

    this._status = this.stopRequested ? 'error' : 'completed'
    this.emitLogUpdate()
  }

  private async executeNode(node: WorkflowNode): Promise<void> {
    const step: ExecutionStep = {
      nodeId: node.id,
      nodeLabel: node.label,
      startedAt: Date.now(),
      status: 'running',
    }
    this.steps.push(step)
    this.onNodeStatusChange?.(node.id, 'running')
    this.emitLogUpdate()

    try {
      const result = await this.dispatchNode(node)
      step.finishedAt = Date.now()
      step.status = 'completed'
      step.output = result
      this.context[node.id] = result
      this.onNodeStatusChange?.(node.id, 'completed')
    } catch (err: any) {
      step.finishedAt = Date.now()
      step.status = 'error'
      step.error = err?.message || String(err)
      this._status = 'error'
      this.onNodeStatusChange?.(node.id, 'error')
    }

    this.emitLogUpdate()
  }

  private async dispatchNode(node: WorkflowNode): Promise<any> {
    const def = getNodeDefinition(node.type)
    if (!def) throw new Error(`未知节点类型: ${node.type}`)

    // 替换参数中的上下文变量 {{context.nodeId.field}}
    const resolvedData = this.resolveContextVariables(node.data)

    switch (node.type) {
      case 'run_code':
        return this.executeCode(resolvedData.code || '')
      case 'toast':
        return this.executeToast(resolvedData.message || '', resolvedData.type || 'info')
      case 'agent_chat':
        return this.executeAgentChat(resolvedData.prompt || '', resolvedData.systemPrompt || '')
      default:
        // 浏览器工具节点 — 通过 IPC 执行
        return this.executeBrowserTool(node.type, resolvedData)
    }
  }

  /** 执行 JS 代码 */
  private executeCode(code: string): any {
    const fn = new Function('context', code)
    return fn(this.context)
  }

  /** 显示 Toast */
  private executeToast(message: string, type: string): any {
    // 使用 vue-sonner 的 toast
    const { toast } = require('vue-sonner')
    const toastFn = (toast as any)[type] || toast.info
    toastFn(message)
    return { message, type }
  }

  /** AI 对话 */
  private async executeAgentChat(prompt: string, systemPrompt: string): Promise<any> {
    // 通过 chat store 的 AI 调用能力
    // 这里仅作为接口定义，实际实现需要与 chat store 集成
    throw new Error('agent_chat 节点需要集成 AI provider，待后续实现')
  }

  /** 浏览器工具执行 */
  private async executeBrowserTool(toolType: string, params: Record<string, any>): Promise<any> {
    // 通过 window.api 调用主进程 IPC 执行浏览器操作
    // 复用现有的 agent tool 执行通道
    const api = (window as any).api
    if (!api?.agent?.execTool) {
      throw new Error('agent.execTool IPC 通道不可用')
    }
    return api.agent.execTool(toolType, params)
  }

  /** 替换上下文变量 */
  private resolveContextVariables(data: Record<string, any>): Record<string, any> {
    const resolved: Record<string, any> = {}
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        resolved[key] = value.replace(/\{\{context\.([^}]+)\}\}/g, (_, path) => {
          return this.getContextValue(path)
        })
      } else {
        resolved[key] = value
      }
    }
    return resolved
  }

  private getContextValue(path: string): any {
    const parts = path.split('.')
    let current: any = this.context
    for (const part of parts) {
      if (current == null) return undefined
      current = current[part]
    }
    return current ?? ''
  }

  /** 按连线拓扑排序（线性：从入度为 0 的节点开始） */
  private buildExecutionOrder(): WorkflowNode[] {
    const nodeMap = new Map(this.nodes.map((n) => [n.id, n]))
    const inDegree = new Map(this.nodes.map((n) => [n.id, 0]))

    for (const edge of this.edges) {
      const deg = inDegree.get(edge.target) ?? 0
      inDegree.set(edge.target, deg + 1)
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id)
    }

    const order: WorkflowNode[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      const node = nodeMap.get(id)
      if (node) order.push(node)

      for (const edge of this.edges) {
        if (edge.source === id) {
          const deg = (inDegree.get(edge.target) ?? 1) - 1
          inDegree.set(edge.target, deg)
          if (deg === 0) queue.push(edge.target)
        }
      }
    }

    return order
  }

  private emitLogUpdate(): void {
    this.onLogUpdate?.(this.currentLog)
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/workflow/engine.ts
git commit -m "feat(workflow): add WorkflowEngine with linear execution, pause/resume, context"
```

---

## Task 6: Pinia Store (src/stores/workflow.ts)

**Files:**
- Create: `src/stores/workflow.ts`

- [ ] **Step 1: 创建 workflow store**

```typescript
// src/stores/workflow.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Workflow, WorkflowFolder, WorkflowNode, WorkflowEdge, ExecutionLog } from '@/lib/workflow/types'
import { WorkflowEngine, type EngineStatus } from '@/lib/workflow/engine'

export const useWorkflowStore = defineStore('workflow', () => {
  // ====== 数据 ======
  const workflows = ref<Workflow[]>([])
  const workflowFolders = ref<WorkflowFolder[]>([])
  const currentWorkflow = ref<Workflow | null>(null)
  const selectedNodeId = ref<string | null>(null)

  // ====== 执行状态 ======
  const executionStatus = ref<EngineStatus>('idle')
  const executionLog = ref<ExecutionLog | null>(null)
  const executionContext = ref<Record<string, any>>({})
  const engine = ref<WorkflowEngine | null>(null)

  // ====== 计算属性 ======
  const rootFolders = computed(() =>
    workflowFolders.value.filter((f) => f.parentId === null).sort((a, b) => a.order - b.order),
  )

  const selectedNode = computed(() => {
    if (!selectedNodeId.value || !currentWorkflow.value) return null
    return currentWorkflow.value.nodes.find((n) => n.id === selectedNodeId.value) || null
  })

  // ====== 数据 CRUD ======
  async function loadData() {
    const api = (window as any).api
    workflows.value = await api.workflow.list()
    workflowFolders.value = await api.workflowFolder.list()
  }

  async function saveWorkflow(workflow: Workflow): Promise<void> {
    const api = (window as any).api
    const existing = workflows.value.find((w) => w.id === workflow.id)
    const now = Date.now()
    if (existing) {
      await api.workflow.update(workflow.id, { ...workflow, updatedAt: now })
      Object.assign(existing, { ...workflow, updatedAt: now })
    } else {
      const created = await api.workflow.create({ ...workflow, createdAt: now, updatedAt: now })
      workflows.value.push(created)
      currentWorkflow.value = created
    }
  }

  async function deleteWorkflow(id: string): Promise<void> {
    const api = (window as any).api
    await api.workflow.delete(id)
    workflows.value = workflows.value.filter((w) => w.id !== id)
    if (currentWorkflow.value?.id === id) {
      currentWorkflow.value = null
    }
  }

  async function createFolder(name: string, parentId: string | null = null): Promise<void> {
    const api = (window as any).api
    const folder = await api.workflowFolder.create({
      name,
      parentId,
      order: workflowFolders.value.filter((f) => f.parentId === parentId).length,
      createdAt: Date.now(),
    })
    workflowFolders.value.push(folder)
  }

  async function deleteFolder(id: string): Promise<void> {
    const api = (window as any).api
    await api.workflowFolder.delete(id)
    workflowFolders.value = workflowFolders.value.filter((f) => f.id !== id)
  }

  async function updateFolder(id: string, data: Partial<WorkflowFolder>): Promise<void> {
    const api = (window as any).api
    await api.workflowFolder.update(id, data)
    const idx = workflowFolders.value.findIndex((f) => f.id === id)
    if (idx !== -1) Object.assign(workflowFolders.value[idx], data)
  }

  // ====== 编辑操作 ======
  function newWorkflow(folderId: string | null = null) {
    currentWorkflow.value = {
      id: crypto.randomUUID(),
      name: '未命名工作流',
      folderId,
      nodes: [],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    selectedNodeId.value = null
    executionStatus.value = 'idle'
    executionLog.value = null
    executionContext.value = {}
  }

  function addNode(type: string, position: { x: number; y: number }): WorkflowNode {
    const node: WorkflowNode = {
      id: crypto.randomUUID(),
      type,
      label: type,
      position,
      data: {},
    }
    currentWorkflow.value!.nodes.push(node)
    return node
  }

  function removeNode(nodeId: string): void {
    if (!currentWorkflow.value) return
    currentWorkflow.value.nodes = currentWorkflow.value.nodes.filter((n) => n.id !== nodeId)
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId,
    )
    if (selectedNodeId.value === nodeId) selectedNodeId.value = null
  }

  function updateNodeData(nodeId: string, data: Record<string, any>): void {
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.data = { ...node.data, ...data }
  }

  function updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.position = position
  }

  function updateNodeLabel(nodeId: string, label: string): void {
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.label = label
  }

  function addEdge(source: string, target: string): void {
    if (!currentWorkflow.value) return
    if (currentWorkflow.value.edges.some((e) => e.source === source && e.target === target)) return
    currentWorkflow.value.edges.push({
      id: `e-${source}-${target}`,
      source,
      target,
    })
  }

  function removeEdge(edgeId: string): void {
    if (!currentWorkflow.value) return
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter((e) => e.id !== edgeId)
  }

  // ====== 执行控制 ======
  async function startExecution(): Promise<void> {
    if (!currentWorkflow.value) return
    executionStatus.value = 'running'
    executionLog.value = null
    executionContext.value = {}

    engine.value = new WorkflowEngine(
      currentWorkflow.value.nodes,
      currentWorkflow.value.edges,
      {
        onLogUpdate: (log) => {
          executionLog.value = { ...log }
        },
        onNodeStatusChange: (nodeId, status) => {
          // 可用于 UI 高亮正在执行的节点
        },
      },
    )

    const log = await engine.value.start()
    executionStatus.value = engine.value.status as EngineStatus
    executionContext.value = engine.value.currentContext
    executionLog.value = log
  }

  function pauseExecution(): void {
    engine.value?.pause()
  }

  async function resumeExecution(): Promise<void> {
    if (!engine.value) return
    const log = await engine.value.resume()
    executionStatus.value = engine.value.status as EngineStatus
    executionContext.value = engine.value.currentContext
    executionLog.value = log
  }

  function stopExecution(): void {
    engine.value?.stop()
  }

  return {
    // 数据
    workflows,
    workflowFolders,
    currentWorkflow,
    selectedNodeId,
    // 计算属性
    rootFolders,
    selectedNode,
    // 执行状态
    executionStatus,
    executionLog,
    executionContext,
    // CRUD
    loadData,
    saveWorkflow,
    deleteWorkflow,
    createFolder,
    deleteFolder,
    updateFolder,
    // 编辑
    newWorkflow,
    addNode,
    removeNode,
    updateNodeData,
    updateNodePosition,
    updateNodeLabel,
    addEdge,
    removeEdge,
    // 执行
    startExecution,
    pauseExecution,
    resumeExecution,
    stopExecution,
  }
})
```

- [ ] **Step 2: 提交**

```bash
git add src/stores/workflow.ts
git commit -m "feat(workflow): add Pinia store with CRUD, editing, and execution control"
```

---

## Task 7: CustomNodeWrapper 自定义节点组件

**Files:**
- Create: `src/components/workflow/CustomNodeWrapper.vue`

Vue Flow 自定义节点组件，显示图标 + 类型名 + 执行状态指示器 + 可编辑名称。

- [ ] **Step 1: 创建组件**

```vue
<!-- src/components/workflow/CustomNodeWrapper.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { useWorkflowStore } from '@/stores/workflow'

const props = defineProps<NodeProps>()
const store = useWorkflowStore()

const isEditing = ref(false)
const editLabel = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const definition = computed(() => getNodeDefinition(props.data?.nodeType || props.type))
const IconComponent = computed(() => resolveLucideIcon(definition.value?.icon || 'Circle'))

const nodeStatus = computed(() => {
  const step = store.executionLog?.steps.find((s) => s.nodeId === props.id)
  return step?.status || 'idle'
})

const statusColor = computed(() => {
  switch (nodeStatus.value) {
    case 'running': return 'border-blue-500 shadow-blue-500/30 shadow-md animate-pulse'
    case 'completed': return 'border-green-500'
    case 'error': return 'border-red-500'
    default: return 'border-border'
  }
})

function startEdit() {
  editLabel.value = props.data?.label || ''
  isEditing.value = true
  setTimeout(() => inputRef.value?.focus(), 0)
}

function finishEdit() {
  isEditing.value = false
  store.updateNodeLabel(String(props.id), editLabel.value)
}

const displayLabel = computed(() => props.data?.label || definition.value?.label || props.type)
</script>

<template>
  <div
    class="bg-background border-2 rounded-lg shadow-sm min-w-[140px] max-w-[200px] cursor-pointer transition-colors"
    :class="[statusColor, props.selected ? 'ring-2 ring-primary' : '']"
    @click="store.selectedNodeId = String(id)"
  >
    <!-- 头部：图标 + 类型 -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-border/50">
      <component :is="IconComponent" v-if="IconComponent" class="w-4 h-4 text-muted-foreground shrink-0" />
      <span class="text-xs text-muted-foreground truncate">{{ definition?.label || type }}</span>
    </div>

    <!-- 底部：可编辑名称 -->
    <div class="px-3 py-1.5">
      <input
        v-if="isEditing"
        ref="inputRef"
        v-model="editLabel"
        class="w-full text-xs bg-transparent outline-none border-b border-primary"
        @blur="finishEdit"
        @keyup.enter="finishEdit"
        @click.stop
      />
      <div
        v-else
        class="text-xs truncate hover:bg-muted/50 rounded px-1 py-0.5"
        @dblclick.stop="startEdit"
      >
        {{ displayLabel }}
      </div>
    </div>

    <!-- 连接点 -->
    <Handle type="target" :position="Position.Top" class="!w-3 !h-3 !bg-muted-foreground" />
    <Handle type="source" :position="Position.Bottom" class="!w-3 !h-3 !bg-muted-foreground" />
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add src/components/workflow/CustomNodeWrapper.vue
git commit -m "feat(workflow): add CustomNodeWrapper with editable label and status indicator"
```

---

## Task 8: NodeSidebar 左侧节点列表面板

**Files:**
- Create: `src/components/workflow/NodeSidebar.vue`

折叠分组 + 搜索 + 拖拽源。

- [ ] **Step 1: 创建组件**

```vue
<!-- src/components/workflow/NodeSidebar.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { getNodeDefinitionsByCategory, searchNodeDefinitions } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Search } from 'lucide-vue-next'

const searchQuery = ref('')
const openCategories = ref<Record<string, boolean>>({})

const categories = computed(() => {
  if (searchQuery.value.trim()) {
    const results = searchNodeDefinitions(searchQuery.value)
    const grouped: Record<string, typeof results> = {}
    for (const def of results) {
      if (!grouped[def.category]) grouped[def.category] = []
      grouped[def.category].push(def)
    }
    return grouped
  }
  return getNodeDefinitionsByCategory()
})

function toggleCategory(cat: string) {
  openCategories.value[cat] = !openCategories.value[cat]
}

function onDragStart(event: DragEvent, nodeType: string) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/vueflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }
}

function getIcon(name: string) {
  return resolveLucideIcon(name)
}
</script>

<template>
  <div class="w-56 border-r border-border bg-background flex flex-col h-full">
    <!-- 搜索框 -->
    <div class="p-2 border-b border-border">
      <div class="relative">
        <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="搜索节点..."
          class="pl-7 h-7 text-xs"
        />
      </div>
    </div>

    <!-- 节点列表 -->
    <ScrollArea class="flex-1">
      <div class="p-2 space-y-1">
        <Collapsible
          v-for="(nodes, category) in categories"
          :key="category"
          :open="openCategories[category] ?? true"
          @update:open="openCategories[category] = $event"
        >
          <CollapsibleTrigger class="flex items-center w-full px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground rounded hover:bg-muted/50">
            <span>{{ category }}</span>
            <span class="ml-auto text-[10px]">{{ nodes.length }}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="space-y-0.5 mt-0.5">
              <div
                v-for="node in nodes"
                :key="node.type"
                draggable="true"
                class="flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-grab hover:bg-muted/50 active:cursor-grabbing"
                @dragstart="onDragStart($event, node.type)"
              >
                <component
                  :is="getIcon(node.icon)"
                  v-if="getIcon(node.icon)"
                  class="w-3.5 h-3.5 text-muted-foreground shrink-0"
                />
                <div class="min-w-0">
                  <div class="truncate">{{ node.label }}</div>
                  <div v-if="node.description" class="text-[10px] text-muted-foreground truncate">
                    {{ node.description }}
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </ScrollArea>
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add src/components/workflow/NodeSidebar.vue
git commit -m "feat(workflow): add NodeSidebar with collapsible groups, search, and drag source"
```

---

## Task 9: NodeProperties 右侧属性面板

**Files:**
- Create: `src/components/workflow/NodeProperties.vue`

根据 NodeTypeDefinition.properties 动态渲染表单。

- [ ] **Step 1: 创建组件**

```vue
<!-- src/components/workflow/NodeProperties.vue -->
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { resolveLucideIcon } from '@/lib/lucide-resolver'

const store = useWorkflowStore()

const definition = computed(() => {
  if (!store.selectedNode) return null
  return getNodeDefinition(store.selectedNode.type)
})

const IconComponent = computed(() => {
  if (!definition.value) return null
  return resolveLucideIcon(definition.value.icon)
})

function getFieldValue(key: string): any {
  return store.selectedNode?.data[key] ?? ''
}

function setFieldValue(key: string, value: any) {
  if (store.selectedNodeId) {
    store.updateNodeData(store.selectedNodeId, { [key]: value })
  }
}

watch(() => store.selectedNodeId, () => {
  // 切换节点时无额外操作
})
</script>

<template>
  <div class="w-64 border-l border-border bg-background flex flex-col h-full">
    <!-- 空状态 -->
    <div v-if="!store.selectedNode || !definition" class="flex-1 flex items-center justify-center">
      <p class="text-xs text-muted-foreground">点击节点查看属性</p>
    </div>

    <!-- 属性面板 -->
    <template v-else>
      <!-- 标题 -->
      <div class="flex items-center gap-2 p-3 border-b border-border">
        <component :is="IconComponent" v-if="IconComponent" class="w-4 h-4 text-muted-foreground" />
        <div>
          <div class="text-sm font-medium">{{ definition.label }}</div>
          <div v-if="definition.description" class="text-[10px] text-muted-foreground">
            {{ definition.description }}
          </div>
        </div>
      </div>

      <!-- 表单 -->
      <ScrollArea class="flex-1">
        <div class="p-3 space-y-3">
          <div v-for="prop in definition.properties" :key="prop.key" class="space-y-1">
            <label class="text-xs font-medium">
              {{ prop.label }}
              <span v-if="prop.required" class="text-red-500">*</span>
            </label>

            <p v-if="prop.description" class="text-[10px] text-muted-foreground">
              {{ prop.description }}
            </p>

            <!-- text -->
            <Input
              v-if="prop.type === 'text'"
              :model-value="getFieldValue(prop.key)"
              :readonly="prop.readonly"
              :placeholder="prop.label"
              class="h-7 text-xs"
              @update:model-value="setFieldValue(prop.key, $event)"
            />

            <!-- textarea -->
            <Textarea
              v-else-if="prop.type === 'textarea'"
              :model-value="getFieldValue(prop.key)"
              :readonly="prop.readonly"
              :placeholder="prop.label"
              class="text-xs min-h-[60px]"
              @update:model-value="setFieldValue(prop.key, $event)"
            />

            <!-- code -->
            <Textarea
              v-else-if="prop.type === 'code'"
              :model-value="getFieldValue(prop.key)"
              :readonly="prop.readonly"
              placeholder="// JavaScript code"
              class="text-xs font-mono min-h-[120px]"
              @update:model-value="setFieldValue(prop.key, $event)"
            />

            <!-- number -->
            <Input
              v-else-if="prop.type === 'number'"
              type="number"
              :model-value="getFieldValue(prop.key)"
              :readonly="prop.readonly"
              class="h-7 text-xs"
              @update:model-value="setFieldValue(prop.key, Number($event))"
            />

            <!-- select -->
            <Select
              v-else-if="prop.type === 'select'"
              :model-value="getFieldValue(prop.key)"
              @update:model-value="setFieldValue(prop.key, $event)"
            >
              <SelectTrigger class="h-7 text-xs">
                <SelectValue :placeholder="prop.label" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in (prop.options || [])" :key="opt.value" :value="opt.value" class="text-xs">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>

            <!-- checkbox -->
            <div v-else-if="prop.type === 'checkbox'" class="flex items-center gap-2">
              <Switch
                :checked="getFieldValue(prop.key)"
                :disabled="prop.readonly"
                @update:checked="setFieldValue(prop.key, $event)"
              />
              <span class="text-xs text-muted-foreground">{{ prop.readonly ? '(只读)' : '' }}</span>
            </div>
          </div>

          <!-- 无属性提示 -->
          <div v-if="definition.properties.length === 0" class="text-xs text-muted-foreground text-center py-4">
            该节点无配置参数
          </div>
        </div>
      </ScrollArea>
    </template>
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add src/components/workflow/NodeProperties.vue
git commit -m "feat(workflow): add NodeProperties panel with dynamic form rendering"
```

---

## Task 10: ExecutionBar 底部执行控制器

**Files:**
- Create: `src/components/workflow/ExecutionBar.vue`

- [ ] **Step 1: 创建组件**

```vue
<!-- src/components/workflow/ExecutionBar.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Play, Pause, Square, ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, Circle } from 'lucide-vue-next'

const store = useWorkflowStore()
const expanded = ref(false)

const isRunning = computed(() => store.executionStatus === 'running')
const isPaused = computed(() => store.executionStatus === 'paused')
const canStart = computed(() => store.executionStatus === 'idle' || store.executionStatus === 'completed' || store.executionStatus === 'error')
const canPause = computed(() => isRunning.value)
const canResume = computed(() => isPaused.value)
const canStop = computed(() => isRunning.value || isPaused.value)

const progressText = computed(() => {
  if (!store.executionLog) return ''
  const completed = store.executionLog.steps.filter((s) => s.status === 'completed').length
  const total = store.executionLog.steps.length
  return `${completed}/${total}`
})

const elapsedText = computed(() => {
  if (!store.executionLog) return ''
  const start = store.executionLog.startedAt
  const end = store.executionLog.finishedAt || Date.now()
  const seconds = ((end - start) / 1000).toFixed(1)
  return `${seconds}s`
})

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function formatDuration(start: number, end?: number): string {
  const ms = (end || Date.now()) - start
  return `${(ms / 1000).toFixed(1)}s`
}
</script>

<template>
  <div class="border-t border-border bg-background">
    <!-- 控制栏 -->
    <div class="flex items-center gap-2 px-3 py-1.5">
      <Button
        v-if="canResume"
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        @click="store.resumeExecution()"
      >
        <Play class="w-3 h-3" /> 继续
      </Button>
      <Button
        v-else
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        :disabled="!canStart"
        @click="store.startExecution()"
      >
        <Play class="w-3 h-3" /> 执行
      </Button>

      <Button
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        :disabled="!canPause"
        @click="store.pauseExecution()"
      >
        <Pause class="w-3 h-3" /> 暂停
      </Button>

      <Button
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        :disabled="!canStop"
        @click="store.stopExecution()"
      >
        <Square class="w-3 h-3" /> 停止
      </Button>

      <div class="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
        <span v-if="progressText">进度: {{ progressText }}</span>
        <span v-if="elapsedText">耗时: {{ elapsedText }}</span>
        <span>{{ store.executionStatus }}</span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="h-5 w-5 p-0"
        @click="expanded = !expanded"
      >
        <ChevronDown v-if="!expanded" class="w-3 h-3" />
        <ChevronUp v-else class="w-3 h-3" />
      </Button>
    </div>

    <!-- 执行日志（可展开） -->
    <div v-if="expanded && store.executionLog" class="border-t border-border">
      <ScrollArea class="max-h-[150px]">
        <div class="px-3 py-1 space-y-0.5">
          <div
            v-for="step in store.executionLog.steps"
            :key="step.nodeId"
            class="flex items-center gap-2 text-[10px] py-0.5"
          >
            <CheckCircle v-if="step.status === 'completed'" class="w-3 h-3 text-green-500 shrink-0" />
            <XCircle v-else-if="step.status === 'error'" class="w-3 h-3 text-red-500 shrink-0" />
            <Loader2 v-else-if="step.status === 'running'" class="w-3 h-3 text-blue-500 animate-spin shrink-0" />
            <Circle v-else class="w-3 h-3 text-muted-foreground shrink-0" />

            <span class="truncate flex-1">{{ step.nodeLabel }}</span>
            <span class="text-muted-foreground">
              {{ step.finishedAt ? formatDuration(step.startedAt, step.finishedAt) : '...' }}
            </span>
          </div>
        </div>
      </ScrollArea>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add src/components/workflow/ExecutionBar.vue
git commit -m "feat(workflow): add ExecutionBar with play/pause/stop and execution log"
```

---

## Task 11: WorkflowFolderTree + WorkflowList + WorkflowListDialog

**Files:**
- Create: `src/components/workflow/WorkflowFolderTree.vue`
- Create: `src/components/workflow/WorkflowList.vue`
- Create: `src/components/workflow/WorkflowListDialog.vue`

- [ ] **Step 1: 创建 WorkflowFolderTree.vue**

```vue
<!-- src/components/workflow/WorkflowFolderTree.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Folder, FolderOpen, Plus } from 'lucide-vue-next'

const store = useWorkflowStore()
const selectedFolderId = defineModel<string | null>('selectedFolderId', { default: null })

const rootFolders = computed(() =>
  store.workflowFolders.filter((f) => f.parentId === null).sort((a, b) => a.order - b.order),
)

function getChildren(parentId: string) {
  return store.workflowFolders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

async function addFolder(parentId: string | null) {
  const name = '新文件夹'
  await store.createFolder(name, parentId)
}
</script>

<template>
  <ScrollArea class="h-full">
    <div class="p-2 space-y-0.5">
      <!-- 根级：全部工作流 -->
      <div
        class="flex items-center gap-1.5 px-2 py-1 text-xs rounded cursor-pointer hover:bg-muted/50"
        :class="selectedFolderId === null ? 'bg-muted' : ''"
        @click="selectedFolderId = null"
      >
        <Folder class="w-3.5 h-3.5 text-muted-foreground" />
        <span>全部工作流</span>
      </div>

      <!-- 文件夹树 -->
      <template v-for="folder in rootFolders" :key="folder.id">
        <div
          class="flex items-center gap-1.5 px-2 py-1 text-xs rounded cursor-pointer hover:bg-muted/50"
          :class="selectedFolderId === folder.id ? 'bg-muted' : ''"
          @click="selectedFolderId = folder.id"
        >
          <component :is="selectedFolderId === folder.id ? FolderOpen : Folder" class="w-3.5 h-3.5 text-muted-foreground" />
          <span class="truncate">{{ folder.name }}</span>
        </div>
        <!-- 子文件夹 -->
        <div v-for="child in getChildren(folder.id)" :key="child.id" class="ml-4">
          <div
            class="flex items-center gap-1.5 px-2 py-1 text-xs rounded cursor-pointer hover:bg-muted/50"
            :class="selectedFolderId === child.id ? 'bg-muted' : ''"
            @click="selectedFolderId = child.id"
          >
            <component :is="selectedFolderId === child.id ? FolderOpen : Folder" class="w-3.5 h-3.5 text-muted-foreground" />
            <span class="truncate">{{ child.name }}</span>
          </div>
        </div>
      </template>

      <Button
        variant="ghost"
        size="sm"
        class="w-full h-6 text-xs justify-start gap-1 px-2"
        @click="addFolder(null)"
      >
        <Plus class="w-3 h-3" /> 新建文件夹
      </Button>
    </div>
  </ScrollArea>
</template>
```

- [ ] **Step 2: 创建 WorkflowList.vue**

```vue
<!-- src/components/workflow/WorkflowList.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Workflow } from 'lucide-vue-next'

const props = defineProps<{ folderId: string | null }>()
const emit = defineEmits<{ select: [workflow: any] }>()
const store = useWorkflowStore()

const filteredWorkflows = computed(() => {
  if (props.folderId === null) return store.workflows
  return store.workflows.filter((w) => w.folderId === props.folderId)
})

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <ScrollArea class="h-full">
    <div class="p-2 space-y-1">
      <div
        v-for="wf in filteredWorkflows"
        :key="wf.id"
        class="flex items-center gap-2 px-3 py-2 text-xs rounded cursor-pointer hover:bg-muted/50 group"
        @click="emit('select', wf)"
      >
        <Workflow class="w-4 h-4 text-muted-foreground shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="truncate font-medium">{{ wf.name }}</div>
          <div class="text-[10px] text-muted-foreground">
            {{ wf.nodes.length }} 个节点 · {{ formatDate(wf.updatedAt) }}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
          @click.stop="store.deleteWorkflow(wf.id)"
        >
          <Trash2 class="w-3 h-3 text-muted-foreground" />
        </Button>
      </div>

      <div v-if="filteredWorkflows.length === 0" class="text-xs text-muted-foreground text-center py-8">
        暂无工作流
      </div>
    </div>
  </ScrollArea>
</template>
```

- [ ] **Step 3: 创建 WorkflowListDialog.vue**

```vue
<!-- src/components/workflow/WorkflowListDialog.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import WorkflowFolderTree from './WorkflowFolderTree.vue'
import WorkflowList from './WorkflowList.vue'
import type { Workflow } from '@/lib/workflow/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [workflow: Workflow | null]
}>()

const store = useWorkflowStore()
const selectedFolderId = ref<string | null>(null)
const selectedWorkflow = ref<Workflow | null>(null)

onMounted(() => {
  store.loadData()
})

function onSelectWorkflow(wf: Workflow) {
  selectedWorkflow.value = wf
}

function confirm() {
  emit('select', selectedWorkflow.value)
  emit('update:open', false)
}

function createNew() {
  store.newWorkflow(selectedFolderId.value)
  emit('select', null) // null 表示新建
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[700px] h-[500px] flex flex-col p-0">
      <DialogHeader class="px-4 pt-4">
        <DialogTitle class="text-sm">打开工作流</DialogTitle>
      </DialogHeader>

      <ResizablePanelGroup direction="horizontal" class="flex-1 min-h-0 px-4">
        <ResizablePanel :default-size="30" :min-size="20" :max-size="40">
          <WorkflowFolderTree v-model:selected-folder-id="selectedFolderId" />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>
          <WorkflowList :folder-id="selectedFolderId" @select="onSelectWorkflow" />
        </ResizablePanel>
      </ResizablePanelGroup>

      <DialogFooter class="px-4 pb-4 gap-2">
        <Button variant="outline" size="sm" class="text-xs" @click="createNew">
          新建工作流
        </Button>
        <Button size="sm" class="text-xs" :disabled="!selectedWorkflow" @click="confirm">
          打开
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
```

- [ ] **Step 4: 提交**

```bash
git add src/components/workflow/WorkflowFolderTree.vue src/components/workflow/WorkflowList.vue src/components/workflow/WorkflowListDialog.vue
git commit -m "feat(workflow): add folder tree, workflow list, and open dialog"
```

---

## Task 12: WorkflowEditor 编辑器主组件

**Files:**
- Create: `src/components/workflow/WorkflowEditor.vue`

整合 Vue Flow 画布 + Menubar + NodeSidebar + NodeProperties + ExecutionBar。实现拖拽创建节点。

- [ ] **Step 1: 创建组件**

```vue
<!-- src/components/workflow/WorkflowEditor.vue -->
<script setup lang="ts">
import { ref, computed, markRaw } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/mini-map/dist/style.css'

import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from '@/components/ui/menubar'
import { useWorkflowStore } from '@/stores/workflow'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import CustomNodeWrapper from './CustomNodeWrapper.vue'
import NodeSidebar from './NodeSidebar.vue'
import NodeProperties from './NodeProperties.vue'
import ExecutionBar from './ExecutionBar.vue'
import WorkflowListDialog from './WorkflowListDialog.vue'

const store = useWorkflowStore()
const listDialogOpen = ref(false)

// Vue Flow 实例
const { onConnect, addEdges, project, vueFlowRef } = useVueFlow()

// 注册自定义节点类型
const nodeTypes = {
  custom: markRaw(CustomNodeWrapper),
}

// Vue Flow 响应式数据
const nodes = computed({
  get: () =>
    (store.currentWorkflow?.nodes || []).map((n) => ({
      id: n.id,
      type: 'custom',
      position: n.position,
      data: { ...n.data, label: n.label, nodeType: n.type },
    })),
  set: (val) => {
    // 由 onNodesChange 处理
  },
})

const edges = computed(() =>
  (store.currentWorkflow?.edges || []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
    style: { stroke: 'hsl(var(--border))' },
  })),
)

// 连线事件
onConnect((params) => {
  store.addEdge(params.source, params.target)
})

// 拖拽放置
function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData('application/vueflow')
  if (!type) return

  const bounds = vueFlowRef.value?.getBoundingClientRect()
  if (!bounds) return

  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  })

  store.addNode(type, position)
}

// 节点位置更新
function onNodesChange(changes: any[]) {
  for (const change of changes) {
    if (change.type === 'position' && change.position) {
      store.updateNodePosition(change.id, change.position)
    }
  }
}

// 菜单操作
function openWorkflow() {
  listDialogOpen.value = true
}

async function saveWorkflow() {
  if (store.currentWorkflow) {
    await store.saveWorkflow(store.currentWorkflow)
  }
}

async function onListSelect(workflow: any) {
  if (workflow) {
    store.currentWorkflow = workflow
    store.selectedNodeId = null
  }
}

// 节点点击
function onNodeClick(event: any) {
  store.selectedNodeId = event.node?.id || null
}

function onPaneClick() {
  store.selectedNodeId = null
}
</script>

<template>
  <div class="flex flex-col h-full bg-background">
    <!-- 顶部 Menubar -->
    <div class="flex items-center border-b border-border px-2 py-1">
      <Menubar class="border-0 bg-transparent h-7">
        <MenubarMenu>
          <MenubarTrigger class="text-xs h-6 px-2">文件</MenubarTrigger>
          <MenubarContent>
            <MenubarItem class="text-xs" @click="openWorkflow">
              打开...
            </MenubarItem>
            <MenubarItem class="text-xs" @click="saveWorkflow">
              保存
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      <span class="ml-3 text-xs text-muted-foreground truncate">
        {{ store.currentWorkflow?.name || '未命名工作流' }}
      </span>
    </div>

    <!-- 主体区域 -->
    <div class="flex flex-1 min-h-0">
      <!-- 左侧节点列表 -->
      <NodeSidebar />

      <!-- Vue Flow 画布 -->
      <div class="flex-1">
        <VueFlow
          :nodes="nodes"
          :edges="edges"
          :node-types="nodeTypes"
          :default-viewport="{ zoom: 1, x: 0, y: 0 }"
          :min-zoom="0.2"
          :max-zoom="4"
          fit-view-on-init
          @dragover="onDragOver"
          @drop="onDrop"
          @nodes-change="onNodesChange"
          @node-click="onNodeClick"
          @pane-click="onPaneClick"
          class="h-full"
        >
          <Background />
          <MiniMap />
          <Controls />
        </VueFlow>
      </div>

      <!-- 右侧属性面板 -->
      <NodeProperties />
    </div>

    <!-- 底部执行控制器 -->
    <ExecutionBar />

    <!-- 工作流列表对话框 -->
    <WorkflowListDialog
      :open="listDialogOpen"
      @update:open="listDialogOpen = $event"
      @select="onListSelect"
    />
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add src/components/workflow/WorkflowEditor.vue
git commit -m "feat(workflow): add WorkflowEditor with VueFlow canvas, drag-drop, and menubar"
```

---

## Task 13: WorkflowDialog + RightPanel 入口

**Files:**
- Create: `src/components/workflow/WorkflowDialog.vue`
- Modify: `src/components/common/RightPanel.vue`

- [ ] **Step 1: 创建 WorkflowDialog.vue**

```vue
<!-- src/components/workflow/WorkflowDialog.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { useWorkflowStore } from '@/stores/workflow'
import WorkflowEditor from './WorkflowEditor.vue'

const open = defineModel<boolean>('open', { default: false })
const store = useWorkflowStore()

onMounted(() => {
  store.loadData()
})

function onOpenChange(val: boolean) {
  open.value = val
  if (val && !store.currentWorkflow) {
    store.newWorkflow()
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-[95vw] h-[90vh] p-0 gap-0" :show-close="true">
      <WorkflowEditor />
    </DialogContent>
  </Dialog>
</template>
```

- [ ] **Step 2: 修改 RightPanel.vue 添加工作流入口**

在 `<script setup>` 中添加导入：

```typescript
import { Workflow } from 'lucide-vue-next'
import WorkflowDialog from '@/components/workflow/WorkflowDialog.vue'
```

添加状态 ref（在其他 `*Open` ref 附近）：

```typescript
const workflowOpen = ref(false)
```

在模板中添加入口按钮（在书签入口之前，即 `<!-- 书签 -->` 注释之前）：

```vue
<!-- 工作流 -->
<Button
  variant="ghost"
  size="icon"
  class="h-8 w-8"
  @click="workflowOpen = true"
>
  <Workflow class="h-4 w-4" />
</Button>
```

在模板底部（`<PluginSettings />` 之后）添加 Dialog 组件：

```vue
<!-- 工作流对话框 -->
<WorkflowDialog v-model:open="workflowOpen" />
```

- [ ] **Step 3: 验证编译**

```bash
pnpm build 2>&1 | tail -10
```

Expected: 编译成功。

- [ ] **Step 4: 提交**

```bash
git add src/components/workflow/WorkflowDialog.vue src/components/common/RightPanel.vue
git commit -m "feat(workflow): add WorkflowDialog and RightPanel entry button"
```

---

## Task 14: 集成验证

- [ ] **Step 1: 启动开发模式验证**

```bash
pnpm dev
```

手动验证：
1. RightPanel 出现工作流图标（Workflow 图标）
2. 点击打开 WorkflowDialog
3. 左侧节点列表可折叠、可搜索
4. 拖拽节点到画布可创建节点
5. 点击节点右侧显示属性表单
6. 双击节点底部可编辑名称
7. 节点之间可连线
8. Menubar 文件菜单可打开/保存
9. 底部执行栏有播放/暂停/停止按钮

- [ ] **Step 2: 最终提交**

```bash
git add -A
git commit -m "feat(workflow): complete workflow editor integration"
```
