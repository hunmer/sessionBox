# 书签健康检查功能设计

## 概述

在书签管理页面增加"检查失效书签"功能，使用 `queue` 包实现多队列并发检测，通过主进程 `net.fetch` 执行 HTTP 请求，实时推送检查结果到渲染进程。

## 架构

```
渲染进程 (Dialog)          IPC              主进程 (Service)
┌────────────────┐    bookmark:checkStart    ┌──────────────────┐
│ CheckDialog    │ ──────────────────────►   │ bookmarkChecker  │
│ - 配置参数     │                           │ - queue 并发控制  │
│ - 进度条       │    on:bookmark-check-*    │ - net.fetch 检测  │
│ - 结果列表     │ ◄──────────────────────   │ - 重试机制        │
│ - 批量删除     │                           │ - 代理支持        │
└────────────────┘                           └──────────────────┘
```

## 新增依赖

- `queue` — 轻量级并发控制队列（~100 行代码，无依赖）

## 模块设计

### 1. 主进程服务 — `electron/services/bookmark-checker.ts`

**单一职责**：接收书签列表和配置参数，使用 `queue` 并发检查 URL 可达性，通过 IPC 推送结果。

**输入参数**：
```typescript
interface CheckConfig {
  bookmarks: Array<{ id: string; url: string }>
  maxRetries: number     // 1-10，默认 5
  concurrency: number   // 1-20，默认 5
  useProxy: boolean      // 是否使用系统代理
  timeout: number        // 单次请求超时 ms，默认 10000
}
```

**检查逻辑**：
- 使用 Electron `net.fetch(url, { signal })` 发送 HEAD 请求（失败降级 GET）
- 单次超时 10 秒
- 状态码判断：
  - 2xx / 3xx → 有效
  - 4xx → 有效（URL 可达，服务端拒绝非问题）
  - 超时 / 网络错误 / DNS 失败 → 失效，进入重试
- 重试次数由用户配置，每次重试前等待 1s
- 代理支持：`useProxy` 为 true 时传入系统代理配置

**事件推送（通过 `webContents.send`）**：
```typescript
// 单个书签检查结果
'bookmark-check:progress' → {
  taskId: string
  bookmarkId: string
  status: 'valid' | 'invalid'
  statusCode?: number
  error?: string
  retries: number
}

// 全部完成
'bookmark-check:done' → {
  taskId: string
  total: number
  valid: number
  invalid: number
}
```

**取消机制**：
- 使用 `AbortController` 取消进行中的 fetch
- 清空 queue 队列
- 通过 `taskId` 标识每次检查会话

### 2. IPC 处理 — `electron/ipc/bookmark-check.ts`

**通道**：
- `bookmark:checkStart(config)` → `{ taskId: string }` 启动检查
- `bookmark:checkCancel(taskId)` → `void` 取消检查

在 `electron/ipc/index.ts` 中注册。

### 3. 预加载桥接 — `preload/index.ts`

新增 `bookmarkCheck` 命名空间：
```typescript
bookmarkCheck: {
  start: (config) => ipcRenderer.invoke('bookmark:checkStart', config),
  cancel: (taskId) => ipcRenderer.invoke('bookmark:checkCancel', taskId),
}
```

### 4. 渲染进程 UI — `BookmarkCheckDialog.vue`

**对话框三个阶段**：

#### 设置阶段
- 最大重试次数（数字输入，默认 5，范围 1-10）
- 并行数（数字输入，默认 5，范围 1-20）
- 是否使用系统代理（开关）
- 「开始检查」按钮
- 显示待检查书签数量

#### 检查阶段
- 进度条：`已检查 M / 总数 N`
- 实时结果列表（滚动区域）：
  - 有效：绿色对勾图标 + 标题 + URL
  - 失效：红色叉号图标 + 标题 + URL + 错误信息
- 「取消」按钮
- 实时统计：有效 N / 失效 N

#### 结果阶段
- 统计摘要：有效 N / 失效 N / 总数 N
- 失效书签列表（每项可勾选，默认全选）：
  - 标题 + URL + 错误信息 + 重试次数
- 「批量删除选中」按钮
- 「关闭」按钮

### 5. 入口集成 — `BookmarksPage.vue`

在工具栏增加"检查失效"按钮（使用 `ShieldCheck` 图标），点击打开 `BookmarkCheckDialog`。

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 添加 `queue` 依赖 |
| `electron/services/bookmark-checker.ts` | 新增 | 书签健康检查服务 |
| `electron/ipc/bookmark-check.ts` | 新增 | IPC 处理 |
| `electron/ipc/index.ts` | 修改 | 注册新 IPC |
| `preload/index.ts` | 修改 | 新增 `bookmarkCheck` API |
| `src/components/bookmarks/BookmarkCheckDialog.vue` | 新增 | 检查对话框 UI |
| `src/components/bookmarks/BookmarksPage.vue` | 修改 | 添加按钮入口 |

## 错误处理

- 网络不可用时，提示用户并终止检查
- 单个 URL 检查失败不影响其他 URL
- 取消操作立即中止，已出结果保留显示
- `net.fetch` 异常捕获，不 crash 主进程
