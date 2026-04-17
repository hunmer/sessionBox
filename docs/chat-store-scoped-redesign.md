# Chat Store 多作用域重构设计

## 问题

当前 `useChatStore` 内部硬编码了 `agent` / `workflow` 两种 source，通过 `source` 参数在函数间传递来区分行为。这种方式：

1. **不可扩展**：每新增一个聊天场景（如插件内聊天、命令面板对话），就要加新的 ref + 新的 if/else 分支
2. **代码膨胀**：每个方法都要处理 source 参数，`resolveMessageSource` 靠遍历两个数组猜测消息归属
3. **流式状态冲突**：全局只有一个 `isStreaming`、`streamingToken` 等，同一时刻只能有一个源在流式输出

## 目标

将 `useChatStore` 改造为**可参数化的 Store 工厂**，通过 `scope` 参数创建独立隔离的聊天实例，每个实例拥有自己的会话列表、消息列表、流式状态。

## 方案：Pinia 动态 Store ID

Pinia 的 `defineStore` 支持用函数形式返回 store ID，可以利用这一点创建多实例：

```ts
// stores/chat.ts
export function createChatStore(scope: string) {
  const storeId = `chat-${scope}`
  return defineStore(storeId, () => {
    // 每个 scope 独立的状态
    const currentSessionId = ref<string | null>(null)
    const messages = ref<ChatMessage[]>([])
    const isStreaming = ref(false)
    // ... 其他流式状态
    // ... 所有方法（sendMessage, retryMessage 等）无需 source 参数
  })()
}
```

### ChatSession 增加 `scope` 字段

```ts
// types/index.ts
export interface ChatSession {
  id: string
  title: string
  scope: string              // 新增：会话归属的作用域
  workflowId?: string | null  // 保留，用于工作流场景的业务关联
  browserViewId: string | null
  modelId: string
  providerId: string
  createdAt: number
  updatedAt: number
  messageCount: number
}
```

Dexie 需要新版本：

```ts
this.version(3).stores({
  sessions: 'id, updatedAt, createdAt, scope, workflowId',
  messages: 'id, sessionId, createdAt, [sessionId+createdAt]',
})
```

### 使用方式

```vue
<!-- App.vue - agent 聊天面板 -->
<script setup>
import { createChatStore } from '@/stores/chat'
const agentChat = createChatStore('agent')
</script>
<template>
  <ChatPanel :chat="agentChat" />
</template>
```

```vue
<!-- workflow/RightPanel.vue - 工作流聊天 -->
<script setup>
import { createChatStore } from '@/stores/chat'
import { useWorkflowStore } from '@/stores/workflow'
const workflowStore = useWorkflowStore()
// 以 workflowId 为 scope，自动隔离
const workflowChat = createChatStore(`workflow-${workflowStore.currentWorkflow?.id}`)
</script>
<template>
  <ChatPanel :chat="workflowChat" embedded />
</template>
```

### chat-db.ts 增加按 scope 过滤

```ts
export async function listSessionsByScope(scope: string): Promise<ChatSession[]> {
  return chatDb.sessions
    .where('scope')
    .equals(scope)
    .reverse()
    .sortBy('updatedAt')
}
```

### 全局共享状态提取

有些状态应该是跨 scope 共享的，不属于任何单个聊天实例：

| 状态 | 归属 | 说明 |
|------|------|------|
| `isPanelVisible` | 全局 `useChatUIStore` | 主界面聊天面板显隐 |
| `targetTabId` | 全局 `useChatUIStore` | 目标标签页 |
| `enabledTools` | 全局 `useChatUIStore` | 工具启用状态 |
| `sessions` / `messages` | 每个 scope 独立 | 按作用域隔离 |
| `isStreaming` / `streamingToken` 等 | 每个 scope 独立 | 支持并发流式 |

可拆出一个轻量的 `useChatUIStore` 管理面板 UI 状态，或直接把 UI 状态留在各组件的 local state 里。

## 实施步骤

### Step 1: ChatSession 类型 + Dexie 迁移

1. `src/types/index.ts` - `ChatSession` 增加 `scope: string`
2. `src/lib/chat-db.ts` - Dexie version(3) 添加 `scope` 索引，`createSession` 接收 `scope` 参数，新增 `listSessionsByScope`

### Step 2: 重构 chat.ts 为工厂函数

1. 将 `useChatStore` 的 setup 函数体提取为通用的 `createChatStore(scope)` 工厂
2. 每个 scope 拥有独立的：`sessions`、`currentSessionId`、`messages`、`isStreaming`、`streamingToken` 等全部状态
3. 删除所有 `source` 参数、`resolveMessageSource`、`getActiveSessionId`、`getActiveMessages`
4. `streamAssistantReply` / `sendMessage` 等方法无需 source，直接操作本 scope 状态
5. 全局 UI 状态（`isPanelVisible`、`targetTabId`、`enabledTools`）移到 `useChatUIStore` 或组件 local state

### Step 3: ChatPanel 接收 store 实例

1. ChatPanel props 改为 `chat` (chat store 实例) + `embedded` (boolean)
2. 删除 `source` prop，所有数据直接从传入的 store 实例获取
3. `embedded` 控制头部工具栏显隐（隐藏 BrowserViewPicker/SessionManager/关闭按钮）

### Step 4: 更新使用方

1. `App.vue` - `const agentChat = createChatStore('agent')` 传入 ChatPanel
2. `workflow/RightPanel.vue` - `const workflowChat = createChatStore('workflow')` 传入 ChatPanel
3. `workflow/RightPanel.vue` - watch 中调 `workflowChat.switchToWorkflowSession(id)`
4. `SessionManager.vue` - 从传入的 store 实例获取会话列表（天然按 scope 过滤）

### Step 5: 数据迁移

为已有的无 scope 会话补充 `scope: 'agent'`：

```ts
// chat-db.ts 迁移逻辑
this.version(3).upgrade(tx => {
  return tx.table('sessions').toCollection().modify(session => {
    if (!session.scope) {
      session.scope = session.workflowId ? 'workflow' : 'agent'
    }
  })
})
```

## 验证

1. 主界面聊天面板发消息 -> 只在 agent 会话列表显示
2. 工作流 AI 助手发消息 -> 只在 workflow 会话列表显示，切 tab 不创建新会话
3. 两者可同时存在，互不干扰
4. 新增 scope（如 `createChatStore('plugin-xxx')`）零改动 store 代码
