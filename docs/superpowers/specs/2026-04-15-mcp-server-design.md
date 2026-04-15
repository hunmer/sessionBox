# SessionBox MCP Server 设计规格

## 概述

为 SessionBox 添加 MCP (Model Context Protocol) Server，允许外部 AI 客户端（Claude Code CLI、Claude Desktop、Cursor 等）通过标准化协议查询和操控浏览器标签页。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 传输方式 | Stdio | 标准 MCP 传输方式，CLI 工具直接连接 |
| 运行架构 | 内嵌主进程 | 零延迟访问 webviewManager 和 store |
| 代码组织 | 工具注册器模式 | 关注点分离，可扩展 |
| 启用方式 | 设置页开关 | 用户可控，持久化到 electron-store |
| 目标用户 | 任意 MCP 客户端 | Stdio 天然支持所有兼容客户端 |

## 文件结构

```
electron/services/mcp/
  ├── server.ts          ← MCP Server 生命周期管理
  ├── types.ts           ← 共享类型定义
  └── tools/
      ├── index.ts       ← 工具注册入口
      ├── query.ts       ← 查询类工具
      ├── tab.ts         ← 标签操作工具
      └── cdp.ts         ← CDP/JS 执行工具

electron/ipc/mcp.ts      ← IPC 处理器
src/stores/mcp.ts        ← Pinia Store（前端状态）
```

## 核心接口

### ToolContext

```typescript
interface ToolContext {
  store: AppStore
  webviewManager: WebviewManager
  mainWindow: BrowserWindow
}
```

所有工具函数通过 `ToolContext` 访问主进程能力，不直接依赖全局变量。

### 工具注册模式

每个工具模块导出注册函数：

```typescript
// tools/query.ts
export function registerQueryTools(server: McpServer, ctx: ToolContext): void {
  server.tool("list_workspaces", "列出所有工作区", {}, async () => { ... })
  server.tool("list_groups", "列出分组", { workspaceId: z.string().optional() }, async () => { ... })
  // ...
}
```

`tools/index.ts` 汇总注册：

```typescript
export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerQueryTools(server, ctx)
  registerTabTools(server, ctx)
  registerCdpTools(server, ctx)
}
```

## 查询类工具

只读操作，无副作用。

| 工具名 | 入参 | 返回 | 说明 |
|--------|------|------|------|
| `list_workspaces` | 无 | `Workspace[]` | 列出所有工作区 |
| `list_groups` | `workspaceId?` | `Group[]` | 列出分组，可按工作区过滤 |
| `list_containers` | `groupId?` | `Container[]` | 列出容器，可按分组过滤 |
| `list_pages` | `groupId?` | `Page[]` | 列出页面，可按分组过滤 |
| `list_tabs` | 无 | `TabInfo[]` | 列出所有运行时标签 |
| `list_bookmarks` | `folderId?` | `Bookmark[]` | 列出书签 |
| `list_proxies` | 无 | `Proxy[]` | 列出所有代理配置 |
| `get_tab_detail` | `tabId` | `TabDetail` | 标签详情（含关联数据） |

### TabInfo

```typescript
interface TabInfo {
  tabId: string
  pageId: string | null
  title: string
  url: string
  isActive: boolean
  isFrozen: boolean
  containerId: string | null
  groupName: string | null
  workspaceName: string | null
}
```

`list_tabs` 聚合运行时信息：从 `webviewManager` 获取冻结状态和活动状态，从 `store` 获取关联的分组/工作区名称。

### TabDetail

```typescript
interface TabDetail extends TabInfo {
  container: Container | null
  page: Page | null
  proxyInfo: ProxyInfo | null
  favicon: string | null
}
```

`get_tab_detail` 深度关联查询，一次返回标签相关的所有上下文数据。

## 标签操作工具

委托给 `webviewManager` 和现有 IPC 流程。

| 工具名 | 入参 | 返回 | 说明 |
|--------|------|------|------|
| `create_tab` | `pageId?` 或 `url` + `containerId?` | `{ tabId }` | 创建标签页 |
| `navigate_tab` | `tabId`, `url` | `{ success }` | 导航到指定 URL |
| `close_tab` | `tabId` | `{ success }` | 关闭标签页 |
| `switch_tab` | `tabId` | `{ success }` | 切换到指定标签 |
| `reload_tab` | `tabId`, `ignoreCache?` | `{ success }` | 刷新标签页 |
| `go_back` | `tabId` | `{ success }` | 后退 |
| `go_forward` | `tabId` | `{ success }` | 前进 |

### create_tab 两种模式

```typescript
// 模式1：通过已有页面创建（复用容器的 Session）
{ pageId: "page-123" }

// 模式2：直接打开 URL（可选指定容器）
{ url: "https://example.com", containerId?: "container-456" }
```

`create_tab` 需要通过 `pageId` 查找对应的 `groupId`，或通过 `containerId` 查找归属，确定新标签的分组位置。当同时传入 `pageId` 和 `url` 时，优先使用 `pageId` 模式（忽略 `url`）。

### 统一响应格式

所有操作返回 `{ success: boolean }` + 错误信息（失败时）：

```typescript
// 成功
{ content: [{ type: "text", text: JSON.stringify({ success: true, tabId: "tab-123" }) }] }

// 失败
{ content: [{ type: "text", text: JSON.stringify({ success: false, error: "Tab not found" }) }] }
```

标签不存在、WebContentsView 已冻结/销毁时返回明确错误。

## CDP/JS 执行工具

| 工具名 | 入参 | 返回 | 说明 |
|--------|------|------|------|
| `execute_js` | `tabId`, `code` | `{ result }` | 执行 JavaScript |
| `cdp_command` | `tabId`, `method`, `params?` | `{ result }` | 发送 CDP 指令 |
| `screenshot` | `tabId`, `format?` | `{ data, mimeType }` | 截取标签页截图 |

### execute_js

通过 `webContents.executeJavaScript(code)` 执行。

- 超时保护：默认 10 秒
- 执行失败（语法错误、运行时异常）返回错误信息，不抛出 MCP 异常

```typescript
// 成功
{ result: any, error?: undefined }

// 失败
{ result: undefined, error: "SyntaxError: Unexpected token..." }
```

### cdp_command

- 自动管理 `debugger.attach/detach`：首次对某个 tab 调用时自动 attach，tab 关闭时自动 detach
- 维护 `attachedTabs: Set<string>` 跟踪已 attach 的标签
- attach 时自动启用基础域（`Runtime.enable`、`Page.enable`、`Network.enable`）

```typescript
// 入参
{
  tabId: string,
  method: string,        // 如 "Network.getAllCookies"
  params?: object
}

// 返回
{ result: any }
```

### screenshot

复用项目已有的 `captureTab` 截图能力，返回 base64 数据。

```typescript
// 入参
{ tabId: string, format?: "png" | "jpeg" }

// 返回
{ data: string, mimeType: "image/png" | "image/jpeg" }
```

## IPC 集成

`electron/ipc/mcp.ts`：

| 通道 | 方向 | 说明 |
|------|------|------|
| `mcp:start` | 渲染→主 | 启动 MCP Server |
| `mcp:stop` | 渲染→主 | 停止 MCP Server |
| `mcp:get-status` | 渲染→主 | 获取状态 |
| `on:mcp:status-changed` | 主→渲染 | 状态变更通知 |

`mcp:get-status` 返回：

```typescript
{
  enabled: boolean       // 设置中是否开启
  running: boolean       // 是否正在运行
  toolCount: number      // 已注册工具数量
}
```

## 前端状态

`src/stores/mcp.ts`：

```typescript
// 状态
{ enabled: boolean, running: boolean }

// 操作
startServer()            // api.mcp.start()
stopServer()             // api.mcp.stop()
refreshStatus()          // api.mcp.getStatus()
```

## 设置页 UI

在现有设置页中新增 MCP 配置区块：

- 开关控制启用/禁用
- 显示运行状态和已注册工具数量
- 显示 MCP 客户端连接配置示例（JSON 格式，可复制）

设置持久化到 `electron-store` 的 `mcpEnabled` 字段。应用启动时读取设置，`mcpEnabled` 为 true 则自动启动 MCP Server。

## 生命周期

1. 应用启动 → 读取 `mcpEnabled` 设置
2. 如果 `mcpEnabled` → 调用 `server.start()` → 通过 Stdio 暴露工具
3. 用户关闭开关 → 调用 `server.stop()` → 断开 Stdio 连接
4. 用户重新开启 → 调用 `server.start()`
5. 应用退出 → 自动 `server.stop()`

## 依赖

- `@modelcontextprotocol/sdk` — MCP Server SDK
- `zod` — 参数校验（已有依赖）

## 安全考虑

- `execute_js` 和 `cdp_command` 是高危操作，仅在 MCP Server 启用时可用
- 未来可扩展：操作审计日志、工具粒度权限控制
