[根目录](../../CLAUDE.md) > [src](../CLAUDE.md) > 详情

# src/ 对外接口

渲染进程内部无对外 HTTP；通过 `window.api` 与主进程通信（见 [preload/claude/public-interfaces.md](../../preload/claude/public-interfaces.md)）。本文件列内部页面与 Store/composable。

## 内部页面（sessionbox:// 协议，渲染进程渲染）

`sessionbox://bookmarks` `history` `downloads` `passwords` `plugins` 等（由 `components/common/InternalPageHost.vue` 承载，不走 WebContentsView）。

## Pinia Stores（src/stores/，共 21 个）

| Store | 文件 | 职责 |
|-------|------|------|
| useWorkspaceStore | workspace.ts | 工作区 CRUD、激活切换、历史栈、视图模式 |
| useContainerStore | container.ts | 容器 CRUD、排序 |
| usePageStore | page.ts | 页面 CRUD、按分组归类 |
| useTabStore | tab.ts | 标签 CRUD、导航、代理信息、冻结、静音、缩放、布局、IPC 监听 |
| useProxyStore | proxy.ts | 代理 CRUD、测试 |
| useBookmarkStore | bookmark.ts | 书签/文件夹 CRUD、移动、导入/导出 Chrome HTML |
| useThemeStore | theme.ts | 主题切换（亮/暗）+ 6 预设 |
| useDownloadStore | download.ts | Aria2 下载管理 |
| useSplitStore | split.ts | 分屏视图管理 |
| useShortcutStore | shortcut.ts | 快捷键管理 |
| useExtensionStore | extension.ts | Chrome 扩展管理 |
| useHistoryStore | history.ts | 浏览历史（Dexie） |
| useHomepageStore | homepage.ts | 主页设置（localStorage） |
| useUserProfileStore | userProfile.ts | 用户资料（localStorage） |
| useAIProviderStore | ai-provider.ts | AI 供应商/模型、当前选择 |
| useChatStore | chat.ts | AI 聊天会话、消息收发、流式回调、工具调用追踪（多作用域工厂） |
| useChatUIStore | chat-ui.ts | 聊天 UI 状态 |
| useMcpStore | mcp.ts | MCP Server 状态（启停/状态） |
| usePluginStore | plugin.ts | 插件列表、启用/禁用、导入/安装/卸载 |
| useSnifferStore | sniffer.ts | 网络嗅探（资源捕获、域名管理） |
| usePasswordStore | password.ts | 密码/笔记（按站点分组） |

> 无 workflow store（工作流已移除）。

## Composables（src/composables/，5 个）

| 函数 | 文件 | 用途 |
|------|------|------|
| useDragSort | useDragSort.ts | 封装 vuedraggable 拖拽排序 |
| useIpcEvent | useIpc.ts | IPC 事件监听（卸载自动清理） |
| useDragState | useBookmarkDragDrop.ts | 书签拖拽状态（全局单例、落点计算） |
| useNotification | useNotification.ts | 通知中心（vue-sonner） |
| useCommandPalette | useCommandPalette.ts | 命令面板（多提供者、前缀触发、快捷键） |

## 工具函数（src/lib/）

| 模块 | 文件 | 用途 |
|------|------|------|
| cn() | utils.ts | Tailwind class 合并 |
| startWebviewOverlayDetection | webview-overlay.ts | WebView 覆盖层检测 |
| buildPresetTree 等 | split-layout.ts | 分屏布局树操作 |
| db | db.ts | Dexie（历史，最多 10000） |
| chatDb | chat-db.ts | Dexie（聊天，每会话最多 5000） |
| resolveLucideIcon | lucide-resolver.ts | Lucide 图标动态解析 |
| externalDropHandler | external-drop.ts | 外部文件拖拽处理 |
| runAgentStream | agent/agent.ts | Agent 流式请求 |
| listenToChatStream | agent/stream.ts | SSE 流监听 |
| BROWSER_AGENT_SYSTEM_PROMPT | agent/system-prompt.ts | Agent 系统提示词 |
| createToolDiscoveryTools | agent/tools.ts | 工具发现系统（分类/列表/详情/执行） |
