# 工作流版本控制与操作历史 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在工作流编辑器右侧面板增加"版本控制"Tab，包含版本历史（用户手动保存快照，持久化到 JsonStore）和操作历史（内存中最多 1000 条，支持 Ctrl+Z / Ctrl+Shift+Z undo/redo）。

**Architecture:** 右侧面板从单一 `<NodeProperties />` 升级为 `<RightPanel />` 容器，顶部 Tabs 切换"节点属性"和"版本控制"。版本控制内部嵌套子 Tabs 分别展示版本历史和操作历史。版本快照通过主进程 JsonStore 持久化，操作历史为纯内存 undo/redo 栈。

**Tech Stack:** Vue 3 Composition API, Pinia, shadcn-vue Tabs, JsonStore (主进程), IPC 通信

---

## File Structure

| 文件 | 变更 | 职责 |
|------|------|------|
| `src/lib/workflow/types.ts` | 修改 | 新增 `WorkflowVersion` 类型 |
| `electron/services/workflow-version.ts` | **新增** | 版本快照的 JsonStore CRUD |
| `electron/ipc/workflow-version.ts` | **新增** | 版本数据 IPC 通道注册 |
| `electron/main.ts` | 修改 | 注册版本 IPC |
| `preload/index.ts` | 修改 | 暴露版本 IPC API |
| `src/stores/workflow.ts` | 修改 | 增加 undo/redo 栈 + 操作记录 + 版本调用 |
| `src/components/workflow/RightPanel.vue` | **新增** | 右侧面板容器（顶部 Tabs） |
| `src/components/workflow/VersionControl.vue` | **新增** | 版本控制 Tab 内容（子 Tabs + 版本列表 + 操作列表） |
| `src/components/workflow/WorkflowEditor.vue` | 修改 | 替换 `<NodeProperties />` 为 `<RightPanel />`，注册 Ctrl+Z / Ctrl+Shift+Z 快捷键 |

---

### Task 1: 新增 WorkflowVersion 类型

**Files:**
- Modify: `src/lib/workflow/types.ts`

- [ ] **Step 1: 在 types.ts 末尾添加 WorkflowVersion 类型**

在 `src/lib/workflow/types.ts` 文件末尾追加：

```typescript
/** 工作流版本快照 */
export interface WorkflowVersion {
  id: string
  workflowId: string
  name: string          // 版本名称，默认 "v1"、"v2"...
  snapshot: {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
  }
  createdAt: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/workflow/types.ts
git commit -m "feat(workflow): add WorkflowVersion type definition"
```

---

### Task 2: 主进程版本快照存储服务

**Files:**
- Create: `electron/services/workflow-version.ts`

参考现有 `electron/services/execution-log.ts` 的模式，使用 JsonStore 实现版本存储。

- [ ] **Step 1: 创建 workflow-version.ts 服务**

创建 `electron/services/workflow-version.ts`：

```typescript
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { JsonStore } from '../utils/json-store'
import type { WorkflowNode, WorkflowEdge } from './store'

export interface WorkflowVersion {
  id: string
  workflowId: string
  name: string
  snapshot: {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
  }
  createdAt: number
}

const MAX_VERSIONS_PER_WORKFLOW = 100

export class WorkflowVersionStore {
  private store: JsonStore<Record<string, WorkflowVersion[]>>

  constructor() {
    const filePath = join(app.getPath('userData'), 'workflow-data', 'workflow-versions.json')
    this.store = new JsonStore(filePath)
  }

  list(workflowId: string): WorkflowVersion[] {
    return this.store.get(workflowId) || []
  }

  add(workflowId: string, name: string, nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowVersion {
    const versions = this.list(workflowId)
    const version: WorkflowVersion = {
      id: randomUUID(),
      workflowId,
      name,
      snapshot: {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      },
      createdAt: Date.now(),
    }
    versions.unshift(version)
    if (versions.length > MAX_VERSIONS_PER_WORKFLOW) versions.length = MAX_VERSIONS_PER_WORKFLOW
    this.store.set(workflowId, versions)
    return version
  }

  get(workflowId: string, versionId: string): WorkflowVersion | undefined {
    return this.list(workflowId).find((v) => v.id === versionId)
  }

  delete(workflowId: string, versionId: string): void {
    const versions = this.list(workflowId).filter((v) => v.id !== versionId)
    this.store.set(workflowId, versions)
  }

  clear(workflowId: string): void {
    this.store.delete(workflowId)
  }

  /** 生成下一个版本名称 */
  nextVersionName(workflowId: string): string {
    const count = this.list(workflowId).length
    return `v${count + 1}`
  }
}

export const workflowVersionStore = new WorkflowVersionStore()
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/workflow-version.ts
git commit -m "feat(workflow): add WorkflowVersionStore service with JsonStore persistence"
```

---

### Task 3: 主进程版本 IPC 注册

**Files:**
- Create: `electron/ipc/workflow-version.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: 创建 IPC 处理器**

创建 `electron/ipc/workflow-version.ts`：

```typescript
import { ipcMain } from 'electron'
import { workflowVersionStore } from '../services/workflow-version'

export function registerWorkflowVersionIpcHandlers(): void {
  ipcMain.handle('workflowVersion:list', (_e, workflowId: string) => {
    return workflowVersionStore.list(workflowId)
  })

  ipcMain.handle('workflowVersion:add', (_e, workflowId: string, name: string, nodes: any[], edges: any[]) => {
    return workflowVersionStore.add(workflowId, name, nodes, edges)
  })

  ipcMain.handle('workflowVersion:get', (_e, workflowId: string, versionId: string) => {
    return workflowVersionStore.get(workflowId, versionId)
  })

  ipcMain.handle('workflowVersion:delete', (_e, workflowId: string, versionId: string) => {
    workflowVersionStore.delete(workflowId, versionId)
  })

  ipcMain.handle('workflowVersion:clear', (_e, workflowId: string) => {
    workflowVersionStore.clear(workflowId)
  })

  ipcMain.handle('workflowVersion:nextName', (_e, workflowId: string) => {
    return workflowVersionStore.nextVersionName(workflowId)
  })
}
```

- [ ] **Step 2: 在 main.ts 中注册**

在 `electron/main.ts` 的 import 区添加：

```typescript
import { registerWorkflowVersionIpcHandlers } from './ipc/workflow-version'
```

在 `registerExecutionLogIpcHandlers()` 之后添加调用：

```typescript
registerWorkflowVersionIpcHandlers()
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/workflow-version.ts electron/main.ts
git commit -m "feat(workflow): register workflow version IPC handlers"
```

---

### Task 4: Preload 暴露版本 API

**Files:**
- Modify: `preload/index.ts`

- [ ] **Step 1: 在 preload/index.ts 的 api 对象中添加 workflowVersion 命名空间**

在 `executionLog` 对象之后添加：

```typescript
  workflowVersion: {
    list: (workflowId: string): Promise<any[]> =>
      ipcRenderer.invoke('workflowVersion:list', workflowId),
    add: (workflowId: string, name: string, nodes: any[], edges: any[]): Promise<any> =>
      ipcRenderer.invoke('workflowVersion:add', workflowId, name, nodes, edges),
    get: (workflowId: string, versionId: string): Promise<any | undefined> =>
      ipcRenderer.invoke('workflowVersion:get', workflowId, versionId),
    delete: (workflowId: string, versionId: string): Promise<void> =>
      ipcRenderer.invoke('workflowVersion:delete', workflowId, versionId),
    clear: (workflowId: string): Promise<void> =>
      ipcRenderer.invoke('workflowVersion:clear', workflowId),
    nextName: (workflowId: string): Promise<string> =>
      ipcRenderer.invoke('workflowVersion:nextName', workflowId),
  },
```

- [ ] **Step 2: Commit**

```bash
git add preload/index.ts
git commit -m "feat(workflow): expose workflowVersion API in preload"
```

---

### Task 5: Workflow Store 增加 Undo/Redo 与版本管理

**Files:**
- Modify: `src/stores/workflow.ts`

这是最核心的修改。需要在现有编辑方法中注入 undo 栈记录逻辑。

- [ ] **Step 1: 在 workflow store 中添加 undo/redo 栈和操作记录**

在 `src/stores/workflow.ts` 中：

1. 在 store 函数顶部（`const debugNodeId = ref<string | null>(null)` 之后）添加：

```typescript
  // ====== Undo/Redo ======
  const MAX_HISTORY = 1000
  const undoStack = ref<string[]>([])    // 存储 JSON 序列化的快照
  const redoStack = ref<string[]>([])
  const operationLog = ref<{ description: string; timestamp: number }[]>([])
```

2. 添加辅助函数（在 `// ====== 编辑操作 ======` 之前）：

```typescript
  // ====== Undo/Redo 辅助 ======
  function captureSnapshot(): string {
    if (!currentWorkflow.value) return ''
    return JSON.stringify({ nodes: currentWorkflow.value.nodes, edges: currentWorkflow.value.edges })
  }

  function applySnapshot(snapshot: string): void {
    if (!currentWorkflow.value || !snapshot) return
    const parsed = JSON.parse(snapshot)
    currentWorkflow.value.nodes = parsed.nodes
    currentWorkflow.value.edges = parsed.edges
  }

  function pushUndo(description: string): void {
    const snapshot = captureSnapshot()
    if (!snapshot) return
    undoStack.value.push(snapshot)
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    redoStack.value = [] // 新操作清空 redo 栈
    operationLog.value.unshift({ description, timestamp: Date.now() })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
  }

  function undo(): void {
    if (undoStack.value.length === 0) return
    const current = captureSnapshot()
    const prev = undoStack.value.pop()!
    redoStack.value.push(current)
    applySnapshot(prev)
    operationLog.value.unshift({ description: '撤销操作', timestamp: Date.now() })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
  }

  function redo(): void {
    if (redoStack.value.length === 0) return
    const current = captureSnapshot()
    const next = redoStack.value.pop()!
    undoStack.value.push(current)
    applySnapshot(next)
    operationLog.value.unshift({ description: '重做操作', timestamp: Date.now() })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)
```

3. 在以下编辑方法的**开头**加入 `pushUndo(description)` 调用：
   - `addNode`: pushUndo(`添加节点: ${type}`)
   - `removeNode`: pushUndo(`删除节点`)
   - `cloneNode`: pushUndo(`克隆节点`)
   - `updateNodeData` (store 的): pushUndo(`修改节点属性`)
   - `updateNodeLabel`: pushUndo(`修改节点标签`)
   - `addEdge`: pushUndo(`添加连线`)
   - `removeEdge`: pushUndo(`删除连线`)

注意：`updateNodePosition` 不需要记录 undo（拖拽太频繁），只在 node drag end 时才需要，但 VueFlow 的 `onNodesChange` 是实时触发的，所以 position 变更**不记录** undo。

4. 添加版本管理方法（在 `// ====== 草稿持久化 ======` 之前）：

```typescript
  // ====== 版本管理 ======
  const versions = ref<any[]>([])

  async function loadVersions(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) { versions.value = []; return }
    versions.value = await api().workflowVersion.list(workflowId)
  }

  async function saveVersion(name?: string): Promise<void> {
    const wf = currentWorkflow.value
    if (!wf) return
    const versionName = name || await api().workflowVersion.nextName(wf.id)
    const version = await api().workflowVersion.add(wf.id, versionName, wf.nodes, wf.edges)
    versions.value.unshift(version)
  }

  async function deleteVersion(versionId: string): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().workflowVersion.delete(workflowId, versionId)
    versions.value = versions.value.filter((v) => v.id !== versionId)
  }

  async function restoreVersion(versionId: string): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    const version = await api().workflowVersion.get(workflowId, versionId)
    if (!version) return
    pushUndo('恢复版本')
    currentWorkflow.value!.nodes = JSON.parse(JSON.stringify(version.snapshot.nodes))
    currentWorkflow.value!.edges = JSON.parse(JSON.stringify(version.snapshot.edges))
  }

  // 切换工作流时加载版本
  watch(() => currentWorkflow.value?.id, () => {
    loadVersions()
    // 切换工作流时清空 undo/redo 和操作记录
    undoStack.value = []
    redoStack.value = []
    operationLog.value = []
  })
```

5. 在 return 对象中导出新增的状态和方法：

```typescript
    // Undo/Redo
    undo,
    redo,
    canUndo,
    canRedo,
    operationLog,
    // 版本管理
    versions,
    loadVersions,
    saveVersion,
    deleteVersion,
    restoreVersion,
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/workflow.ts
git commit -m "feat(workflow): add undo/redo stack, operation log and version management to store"
```

---

### Task 6: 创建 RightPanel 组件

**Files:**
- Create: `src/components/workflow/RightPanel.vue`

- [ ] **Step 1: 创建右侧面板容器**

创建 `src/components/workflow/RightPanel.vue`：

```vue
<script setup lang="ts">
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import NodeProperties from './NodeProperties.vue'
import VersionControl from './VersionControl.vue'
</script>

<template>
  <div class="border-l border-border bg-background flex flex-col h-full">
    <Tabs default-value="properties" class="flex flex-col h-full">
      <div class="px-2 pt-2">
        <TabsList class="w-full h-7">
          <TabsTrigger value="properties" class="text-xs h-5">
            节点属性
          </TabsTrigger>
          <TabsTrigger value="version" class="text-xs h-5">
            版本控制
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="properties" class="flex-1 min-h-0 mt-0">
        <NodeProperties :embedded="true" />
      </TabsContent>

      <TabsContent value="version" class="flex-1 min-h-0 mt-0">
        <VersionControl />
      </TabsContent>
    </Tabs>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/workflow/RightPanel.vue
git commit -m "feat(workflow): create RightPanel with tabs for properties and version control"
```

---

### Task 7: 修改 NodeProperties 支持嵌入模式

**Files:**
- Modify: `src/components/workflow/NodeProperties.vue`

当 NodeProperties 被 RightPanel 嵌入时，需要去掉外层 `border-l`（因为 RightPanel 已有）。

- [ ] **Step 1: 添加 embedded prop 并调整样式**

在 `NodeProperties.vue` 中：

1. 在 `<script setup>` 顶部添加：

```typescript
const props = defineProps<{ embedded?: boolean }>()
```

2. 修改最外层 div 的 class：

将：
```html
<div class="border-l border-border bg-background flex flex-col h-full">
```

改为：
```html
<div :class="[!props.embedded && 'border-l', 'border-border bg-background flex flex-col h-full']">
```

- [ ] **Step 2: Commit**

```bash
git add src/components/workflow/NodeProperties.vue
git commit -m "feat(workflow): add embedded prop to NodeProperties for panel integration"
```

---

### Task 8: 创建 VersionControl 组件

**Files:**
- Create: `src/components/workflow/VersionControl.vue`

这是版本控制的核心 UI 组件。

- [ ] **Step 1: 创建 VersionControl.vue**

创建 `src/components/workflow/VersionControl.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { History, RotateCcw, RotateCw, Save, Trash2, ArrowDownToLine } from 'lucide-vue-next'

const store = useWorkflowStore()

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function handleSaveVersion() {
  await store.saveVersion()
}

async function handleRestoreVersion(versionId: string) {
  await store.restoreVersion(versionId)
}

async function handleDeleteVersion(versionId: string) {
  await store.deleteVersion(versionId)
}

function handleUndo() {
  store.undo()
}

function handleRedo() {
  store.redo()
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Undo/Redo 工具栏 -->
    <div class="flex items-center gap-1 px-3 py-1.5 border-b border-border">
      <Button
        variant="ghost"
        size="sm"
        class="h-6 w-6 p-0"
        :disabled="!store.canUndo"
        @click="handleUndo"
      >
        <RotateCcw class="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-6 w-6 p-0"
        :disabled="!store.canRedo"
        @click="handleRedo"
      >
        <RotateCw class="w-3.5 h-3.5" />
      </Button>
      <span class="text-[10px] text-muted-foreground ml-1">
        {{ store.canUndo ? `${store.undoStack.length} 步可撤销` : '无可撤销' }}
      </span>
    </div>

    <Tabs default-value="history" class="flex flex-col flex-1 min-h-0">
      <div class="px-3 pt-2">
        <TabsList class="w-full h-7">
          <TabsTrigger value="history" class="text-xs h-5">
            版本历史
          </TabsTrigger>
          <TabsTrigger value="operations" class="text-xs h-5">
            操作历史
          </TabsTrigger>
        </TabsList>
      </div>

      <!-- 版本历史 -->
      <TabsContent value="history" class="flex-1 min-h-0 mt-0">
        <div class="flex flex-col h-full">
          <!-- 保存按钮 -->
          <div class="px-3 py-2 border-b border-border">
            <Button
              size="sm"
              variant="outline"
              class="w-full h-7 text-xs gap-1.5"
              :disabled="!store.currentWorkflow"
              @click="handleSaveVersion"
            >
              <Save class="w-3 h-3" />
              保存版本快照
            </Button>
          </div>

          <!-- 版本列表 -->
          <ScrollArea class="flex-1">
            <div class="p-2 space-y-1">
              <div
                v-for="version in store.versions"
                :key="version.id"
                class="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium truncate">{{ version.name }}</div>
                  <div class="text-[10px] text-muted-foreground">
                    {{ formatTime(version.createdAt) }}
                  </div>
                  <div class="text-[10px] text-muted-foreground">
                    {{ version.snapshot.nodes.length }} 个节点, {{ version.snapshot.edges.length }} 条连线
                  </div>
                </div>
                <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-5 w-5 p-0"
                    title="恢复此版本"
                    @click="handleRestoreVersion(version.id)"
                  >
                    <ArrowDownToLine class="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-5 w-5 p-0 text-destructive hover:text-destructive"
                    title="删除此版本"
                    @click="handleDeleteVersion(version.id)"
                  >
                    <Trash2 class="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div v-if="store.versions.length === 0" class="text-xs text-muted-foreground text-center py-6">
                暂无保存的版本
              </div>
            </div>
          </ScrollArea>
        </div>
      </TabsContent>

      <!-- 操作历史 -->
      <TabsContent value="operations" class="flex-1 min-h-0 mt-0">
        <ScrollArea class="h-full">
          <div class="p-2 space-y-0.5">
            <div
              v-for="(op, index) in store.operationLog"
              :key="index"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
            >
              <History class="w-3 h-3 text-muted-foreground shrink-0" />
              <span class="flex-1 truncate">{{ op.description }}</span>
              <span class="text-[10px] text-muted-foreground shrink-0">
                {{ formatTime(op.timestamp) }}
              </span>
            </div>

            <div v-if="store.operationLog.length === 0" class="text-xs text-muted-foreground text-center py-6">
              暂无操作记录
            </div>

            <div v-if="store.operationLog.length > 0" class="text-[10px] text-muted-foreground text-center pt-2">
              共 {{ store.operationLog.length }} 条操作记录（最多 1000 条）
            </div>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/workflow/VersionControl.vue
git commit -m "feat(workflow): create VersionControl component with version history and operation log"
```

---

### Task 9: 更新 WorkflowEditor 集成 RightPanel 和快捷键

**Files:**
- Modify: `src/components/workflow/WorkflowEditor.vue`

- [ ] **Step 1: 替换 NodeProperties 为 RightPanel**

1. 修改 import：将 `import NodeProperties from './NodeProperties.vue'` 替换为：

```typescript
import RightPanel from './RightPanel.vue'
```

2. 在 template 中，将：

```html
<ResizablePanel :default-size="panelSizes[2]" :min-size="15" :max-size="50">
  <NodeProperties />
</ResizablePanel>
```

替换为：

```html
<ResizablePanel :default-size="panelSizes[2]" :min-size="15" :max-size="50">
  <RightPanel />
</ResizablePanel>
```

- [ ] **Step 2: 添加 Ctrl+Z / Ctrl+Shift+Z 快捷键**

在 `<script setup>` 中添加快捷键处理（在 `cancelEditName` 函数之后）：

```typescript
// ====== Undo/Redo 快捷键 ======
function handleKeyDown(e: KeyboardEvent) {
  if (!store.currentWorkflow) return
  // Ctrl+Shift+Z = Redo
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    store.redo()
    return
  }
  // Ctrl+Z = Undo
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    store.undo()
  }
}
```

在 template 的最外层 div 上添加 `@keydown="handleKeyDown"`：

```html
<div class="flex flex-col h-full min-h-0 bg-background overflow-hidden" tabindex="0" @keydown="handleKeyDown">
```

- [ ] **Step 3: Commit**

```bash
git add src/components/workflow/WorkflowEditor.vue
git commit -m "feat(workflow): integrate RightPanel and Ctrl+Z/Ctrl+Shift+Z shortcuts in editor"
```

---

### Task 10: 清理 - 删除无用 import

**Files:**
- Modify: `src/components/workflow/WorkflowEditor.vue`

- [ ] **Step 1: 确认移除 NodeProperties 的 import**

检查 `WorkflowEditor.vue` 中不再有 `import NodeProperties` 的引用（Task 9 已替换）。如果有遗漏，手动清理。

- [ ] **Step 2: 最终验证**

1. 运行 `pnpm dev` 确认编译无报错
2. 打开工作流编辑器，确认右侧面板显示双 Tab（节点属性 / 版本控制）
3. 添加一个节点，确认操作历史有记录
4. 按 Ctrl+Z 撤销，确认节点消失
5. 按 Ctrl+Shift+Z 重做，确认节点恢复
6. 点击"保存版本快照"，确认版本历史有记录
7. 恢复一个版本，确认画布恢复到快照状态

- [ ] **Step 3: Final Commit**

```bash
git add -A
git commit -m "feat(workflow): complete version control panel with undo/redo and version snapshots"
```
