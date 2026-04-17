[根目录](../CLAUDE.md) > **src**

# src/ -- 渲染进程模块

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-04-17 18:08:25 | 增量更新 | 大幅更新：21 个 Pinia Store（新增 AI Provider/Chat/MCP/Plugin/Sniffer/Password/Workflow）、AI Agent 系统（agent.ts/stream.ts/tools.ts/system-prompt.ts）、工作流编辑器引擎（engine.ts/nodeRegistry.ts/types.ts）、Dexie 聊天数据库（chat-db.ts）、命令面板（useCommandPalette.ts）、Chat/Workflow/Plugins/Passwords/CommandPalette 组件目录、SnifferMiniPopover/PluginMiniPopover/ContainerMiniPopover 等迷你面板 |
| 2026-04-13 10:44:52 | 增量更新 | 大幅更新：14 个 Pinia Store（含工作区、容器、页面、下载、分屏、快捷键、历史、主页、用户资料、扩展）、Dexie IndexedDB、分屏布局算法、书签导入导出、主题预设、WebView 覆盖层检测等 |
| 2026-04-09 02:12:31 | 初始化 | 首次生成模块文档 |

---

## 模块职责

Vue 3 渲染进程，负责：
- 应用 UI 界面渲染（侧边栏、标签栏、工具栏、对话框、分屏、下载面板、历史面板、AI 聊天面板、工作流编辑器、密码管理、插件管理、命令面板等）
- 用户交互处理
- 通过 IPC API 与主进程通信
- Pinia 状态管理（21 个 Store，本地缓存 + IPC 同步）
- 主题切换（亮色/暗色，6 种预设主题）
- 布局管理（可调整大小的面板、标签栏方向、分屏视图）
- 本地浏览历史记录（Dexie/IndexedDB）
- AI 聊天记录（Dexie/IndexedDB）
- AI Agent 工具发现与执行
- 可视化工作流编辑器（Vue Flow）
- 书签导入导出（Chrome HTML 格式）
- 命令面板（多提供者搜索）

---

## 入口与启动

**入口文件**：`src/main.ts`

启动流程：
1. 创建 Vue 应用实例
2. 安装 Pinia 状态管理
3. 挂载到 `#app`
4. `App.vue` 的 `onMounted` 中并行初始化 Store

---

## 对外接口

### Pinia Stores（src/stores/）

| Store | 文件 | 职责 |
|-------|------|------|
| `useWorkspaceStore` | `stores/workspace.ts` | 工作区 CRUD、激活切换、历史栈、视图模式 |
| `useContainerStore` | `stores/container.ts` | 容器 CRUD、排序 |
| `usePageStore` | `stores/page.ts` | 页面 CRUD、按分组归类 |
| `useTabStore` | `stores/tab.ts` | 标签页 CRUD、导航、代理信息、冻结状态、静音、缩放、标签栏布局、IPC 事件监听 |
| `useProxyStore` | `stores/proxy.ts` | 代理 CRUD、代理测试 |
| `useBookmarkStore` | `stores/bookmark.ts` | 书签/文件夹 CRUD、移动、导入/导出 Chrome HTML |
| `useThemeStore` | `stores/theme.ts` | 主题切换（亮/暗）+ 6 种预设主题 |
| `useDownloadStore` | `stores/download.ts` | Aria2 下载管理 |
| `useSplitStore` | `stores/split.ts` | 分屏视图管理 |
| `useShortcutStore` | `stores/shortcut.ts` | 快捷键管理 |
| `useExtensionStore` | `stores/extension.ts` | Chrome 扩展管理 |
| `useHistoryStore` | `stores/history.ts` | 浏览历史（Dexie/IndexedDB） |
| `useHomepageStore` | `stores/homepage.ts` | 主页设置（localStorage） |
| `useUserProfileStore` | `stores/userProfile.ts` | 用户资料（localStorage） |
| `useAIProviderStore` | `stores/ai-provider.ts` | AI 供应商/模型管理、当前选择 |
| `useChatStore` | `stores/chat.ts` | AI 聊天会话管理、消息收发、流式回调、工具调用追踪 |
| `useMcpStore` | `stores/mcp.ts` | MCP Server 状态管理（启停、状态查询） |
| `usePluginStore` | `stores/plugin.ts` | 插件列表、启用/禁用、导入/安装/卸载 |
| `useSnifferStore` | `stores/sniffer.ts` | 网络嗅探器（资源捕获、域名管理） |
| `usePasswordStore` | `stores/password.ts` | 密码/笔记管理（按站点分组） |
| `useWorkflowStore` | `stores/workflow.ts` | 工作流/文件夹管理、工作流编辑器状态 |

### UI 组件结构

**核心业务组件**：

| 组件目录 | 说明 |
|----------|------|
| `sidebar/` | 侧边栏（Sidebar、WorkspaceBar、GroupList、GroupItem、ContainerItem、各种 Dialog） |
| `tabs/` | 标签栏（TabBar、TabBarVertical、TabItem、SplitView、SplitLayoutTree、TabOverviewDialog、NewTabDialog） |
| `toolbar/` | 工具栏（BrowserToolbar、ExtensionActionList、PasswordPopover） |
| `bookmarks/` | 书签（BookmarkBar、BookmarkList、BookmarkItem、FolderTree、各种 Dialog） |
| `settings/` | 设置（SettingsDialog、SettingsGeneral、SettingsTheme、SettingsShortcut、SettingsMCP、SettingsDownload 等 14 个面板） |
| `chat/` | AI 聊天（ChatPanel、ChatInput、ChatMessage、ChatMessageList、ToolCallCard、ThinkingBlock、SessionManager、ProviderManager、ModelSelector、BrowserViewPicker） |
| `workflow/` | 工作流编辑器（WorkflowEditor、NodeSidebar、NodeProperties、CustomNodeWrapper、CustomEdge、ExecutionBar、VersionControl、WorkflowList、WorkflowFolderTree 等 17 个组件） |
| `download/` | 下载管理（DownloadsPage、AddDownloadDialog、DownloadFilterPanel） |
| `history/` | 历史记录（HistoryPage） |
| `passwords/` | 密码管理（PasswordsPage） |
| `plugins/` | 插件管理（PluginsPage、PluginCard、PluginSettings） |
| `command-palette/` | 命令面板（CommandPaletteDialog） |
| `common/` | 通用组件（RightPanel、UpdateNotification、InternalPageHost、IconSelector、EmojiRenderer、各种 MiniPopover） |
| `proxy/` | 代理管理（ProxyDialog） |
| `containers/` | 容器选择（ContainerSelectDialog） |

**UI 基础组件**（`components/ui/`）：基于 shadcn-vue + Radix Vue/reka-ui 的标准组件集，包括：
alert-dialog, avatar, badge, breadcrumb, button, checkbox, collapsible, command, context-menu, dialog, dropdown-menu, input, input-group, kbd, menubar, popover, progress, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, sonner, switch, tabs, textarea, toggle, tooltip

---

## 关键依赖与配置

| 依赖 | 用途 |
|------|------|
| `vue` ^3.5 | UI 框架 |
| `pinia` ^2.3 | 状态管理 |
| `radix-vue` ^1.9 / `reka-ui` ^2.9 | 无障碍 UI 原语 |
| `lucide-vue-next` ^0.460 | 图标库 |
| `vuedraggable` ^4.1 | 拖拽排序 |
| `tailwind-merge` + `clsx` + `class-variance-authority` | 样式工具 |
| `@vueuse/core` | Vue 组合函数工具集 |
| `tailwindcss` ^4.1 | CSS 框架 |
| `dexie` ^4.4 | IndexedDB 封装（浏览历史 + 聊天记录） |
| `vue-sonner` ^2.0 | Toast 通知 |
| `vue3-emoji-picker` ^1.1 | Emoji 选择器 |
| `@vue-flow/core` + 插件 | 工作流可视化编辑器 |
| `vue-stream-markdown` ^0.7 | Markdown 流式渲染（AI 聊天） |
| `vue-waterfall-plugin-next` ^3.0 | 瀑布流布局 |
| `zod` ^4.3 | 运行时类型校验 |
| `@langchain/anthropic` + `langchain` | LangChain AI 框架 |

---

## 数据模型

类型定义在 `src/types/index.ts`、`src/types/split.ts`、`src/types/plugin.ts`、`src/types/command.ts`。

| 模型 | 说明 |
|------|------|
| `Workspace` | 工作区 |
| `Group` | 分组 |
| `Container` | 容器 |
| `Page` | 页面 |
| `Proxy` | 代理配置 |
| `Tab` | 标签页 |
| `Bookmark` / `BookmarkFolder` | 书签/书签文件夹 |
| `Extension` | Chrome 扩展 |
| `NavState` | 导航状态运行时数据 |
| `SplitLayout` / `SavedSplitScheme` / `SplitNode` | 分屏布局 |
| `PluginInfo` / `PluginMeta` / `PluginContext` / `RemotePlugin` | 插件系统 |
| `CommandItem` / `CommandProvider` | 命令面板 |
| `SniffedResource` | 嗅探到的网络资源 |
| `PasswordEntry` / `PasswordField` | 密码/笔记 |
| `AIProvider` / `AIModel` / `ChatSession` / `ChatMessage` / `ToolCall` / `TokenUsage` | AI 聊天 |
| `ChatCompletionParams` | AI 请求参数 |
| `BrowserClickArgs` / `BrowserTypeArgs` / ... | 浏览器交互工具参数 |
| `WorkflowFolder` / `WorkflowNode` / `WorkflowEdge` / `Workflow` | 工作流 |
| `WorkflowVersion` / `ExecutionLog` / `ExecutionStep` | 工作流版本/日志 |
| `SearchEngine` | 搜索引擎 |
| `DefaultBrowserResult` | 默认浏览器检测结果 |

---

## 测试与质量

当前无测试文件。ESLint 配置存在于 `package.json`（`@eslint/js` + `typescript-eslint` + `eslint-plugin-vue`）。

---

## 组合函数（src/composables/）

| 函数 | 文件 | 用途 |
|------|------|------|
| `useDragSort` | `composables/useDragSort.ts` | 封装 vuedraggable 拖拽排序逻辑 |
| `useIpcEvent` | `composables/useIpc.ts` | IPC 事件监听（组件卸载自动清理） |
| `useDragState` | `composables/useBookmarkDragDrop.ts` | 书签拖拽状态管理（全局单例、落点计算、数据协议） |
| `useNotification` | `composables/useNotification.ts` | 通知中心（基于 vue-sonner） |
| `useCommandPalette` | `composables/useCommandPalette.ts` | 命令面板（多提供者搜索、前缀触发、快捷键） |

---

## 工具函数（src/lib/）

| 函数/模块 | 文件 | 用途 |
|-----------|------|------|
| `cn()` | `lib/utils.ts` | Tailwind class 合并工具 |
| `startWebviewOverlayDetection` | `lib/webview-overlay.ts` | WebView 覆盖层检测 |
| `buildPresetTree` 等 | `lib/split-layout.ts` | 分屏布局树操作 |
| `db` | `lib/db.ts` | Dexie IndexedDB（浏览历史，最多 10000 条） |
| `chatDb` | `lib/chat-db.ts` | Dexie IndexedDB（AI 聊天，每个会话最多 5000 条） |
| `resolveLucideIcon` | `lib/lucide-resolver.ts` | Lucide 图标动态解析 |
| `runAgentStream` | `lib/agent/agent.ts` | Agent 流式请求（构造消息、监听回调） |
| `listenToChatStream` | `lib/agent/stream.ts` | SSE 流监听（IPC 事件 -> 回调） |
| `BROWSER_AGENT_SYSTEM_PROMPT` | `lib/agent/system-prompt.ts` | Agent 系统提示词 |
| `createToolDiscoveryTools` / `TOOL_CATEGORY_INFOS` | `lib/agent/tools.ts` | 工具发现系统（分类/列表/详情/执行 四层披露） |
| `WorkflowEngine` | `lib/workflow/engine.ts` | 工作流执行引擎（拓扑排序、暂停/继续/停止） |
| `getNodeDefinition` / `registerNodeType` | `lib/workflow/nodeRegistry.ts` | 节点类型注册表（工具 schema -> NodeProperty） |
| `Workflow/Node/Edge/Version/Log` 类型 | `lib/workflow/types.ts` | 工作流类型定义 |
| `externalDropHandler` | `lib/external-drop.ts` | 外部文件拖拽处理 |

---

## 相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `src/main.ts` | 渲染进程入口 |
| `src/App.vue` | 根组件（三面板布局） |
| `src/types/index.ts` | 核心类型定义（30+ 接口/类型） |
| `src/types/split.ts` | 分屏相关类型定义 |
| `src/types/plugin.ts` | 插件类型定义 |
| `src/types/command.ts` | 命令面板类型定义 |
| `src/env.d.ts` | 环境类型声明 |
| `src/styles/globals.css` | 全局样式（Tailwind + CSS 变量主题） |
| `src/stores/*.ts` | Pinia 状态管理（21 个 Store） |
| `src/components/**/*.vue` | UI 组件（250+ 个 .vue 文件） |
| `src/composables/*.ts` | 组合函数（5 个） |
| `src/lib/*.ts` | 工具函数 |
| `src/lib/agent/*.ts` | AI Agent 模块（agent/stream/tools/system-prompt） |
| `src/lib/workflow/*.ts` | 工作流模块（engine/nodeRegistry/types） |
