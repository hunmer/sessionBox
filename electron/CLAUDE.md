[根目录](../CLAUDE.md) > **electron**

# electron/ -- 主进程模块

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-04-17 18:08:25 | 增量更新 | 新增 AI 代理网关（ai-proxy）、MCP Server（mcp/）、插件系统（plugin-manager/plugin-context/plugin-storage/plugin-event-bus/plugin-types）、工作流存储（workflow-store）、工作流版本（workflow-version）、执行日志（execution-log）、密码存储（password-store）、技能存储（skill-store）、Favicon 缓存（favicon-cache）、页面内容提取（page-extractor）、网络嗅探 IPC、数据迁移（migration）、JsonStore 工具、搜索引擎管理、AI Provider 管理、Chat IPC、浏览器交互工具（CDP）、site-icon/screenshot 自定义协议等 |
| 2026-04-13 10:44:52 | 增量更新 | 新增工作区/页面/容器模型、分屏、下载(Aria2)、扩展、托盘/托盘窗口、自动更新、快捷键管理、书签健康检查、标签冻结/截图/静音、默认浏览器、窗口状态持久化等 |
| 2026-04-09 02:12:31 | 初始化 | 首次生成模块文档 |

---

## 模块职责

Electron 主进程，负责：
- 应用生命周期管理（单实例锁、协议注册、默认浏览器）
- BrowserWindow 窗口创建与控制（窗口状态持久化）
- WebContentsView（标签页 WebView）生命周期管理
- IPC 通信注册与处理（25+ IPC 模块）
- 数据持久化（electron-store 核心数据 + JsonStore 独立文件）
- 代理配置、测试与热更新（SOCKS5/HTTP/HTTPS/PAC）
- 自定义协议处理（sessionbox://、account-icon://、extension-icon://、site-icon://、screenshot://）
- Chrome 扩展加载与管理（按 partition 隔离）
- Aria2 下载管理（进程管理、RPC 通信、下载拦截）
- 系统托盘与任务栏窗口
- 自动更新检查与安装
- 全局/本地快捷键管理
- 标签冻结（后台超时自动销毁，按需重建）
- 第三方协议拦截（阻止外部应用唤起）
- AI 代理网关（API Key 安全中转、SSE 流解析、tool_use 多轮循环、浏览器交互工具执行）
- MCP Server（SSE 传输、工具注册、按需启停）
- 插件系统（加载/卸载/启用/禁用、ZIP 导入/URL 安装、事件总线、独立存储）
- 工作流存储（独立文件、文件夹管理、导入/导出）
- 工作流版本控制（快照管理）
- 工作流执行日志
- 密码/笔记管理
- 技能存储（Markdown 文件 + JS 代码块执行）
- Favicon 缓存（本地缓存 + 自动下载 + 魔术字节验证）
- 页面内容提取（Readability 摘要、Turndown Markdown、交互节点检测）
- 网络嗅探器（资源捕获、域名自动启用）
- 搜索引擎管理
- 数据迁移（electron-store -> JsonStore 幂等迁移）

---

## 入口与启动

**入口文件**：`electron/main.ts`

启动流程：
1. `setupUserAgent()` -- 设置全局 UA 回退值（模拟 Chrome 133）
2. 注册 `account-icon`、`extension-icon`、`site-icon`、`screenshot` 自定义协议（必须在 app ready 前）
3. 注册 `sessionbox://` 深度链接协议
4. 处理未捕获异常和 Promise rejection
5. 请求单实例锁 `app.requestSingleInstanceLock()`
6. 监听 `second-instance`（协议 URL、外部 http/https 链接）
7. `app.whenReady()` 后：
   - 迁移 bookmark/password/workflow 数据到独立 JsonStore（幂等）
   - 注册所有 IPC 处理器（含 IPC 广播代理包装）
   - 初始化插件系统（`pluginManager.loadAll()`）
   - 初始化标签冻结定时器
   - 注册所有自定义协议处理器（account-icon、extension-icon、screenshot、site-icon）
   - 注册第三方协议空处理器
   - 创建主窗口（恢复窗口位置/大小/最大化状态）
   - 初始化系统托盘
   - 注册全局快捷键
   - 启动 MCP Server（如果已启用）
   - 3 秒后自动检查更新
8. 窗口关闭时根据 `minimizeOnClose` 设置决定隐藏到托盘或直接退出
9. 退出时：停止 MCP Server、卸载所有插件、销毁托盘窗口

---

## 对外接口

### IPC 通道（electron/ipc/）

**工作区 (workspace:)** -- `electron/ipc/index.ts`
- `workspace:list` / `workspace:create` / `workspace:update` / `workspace:delete` / `workspace:reorder`

**分组管理 (group:)** -- `electron/ipc/index.ts`
- `group:list` / `group:create` / `group:update` / `group:delete` / `group:reorder`

**容器管理 (container:)** -- `electron/ipc/index.ts`
- `container:list` / `container:create` / `container:update` / `container:delete` / `container:reorder`
- `container:uploadIcon` / `container:uploadIconFromUrl` -- 上传自定义图标
- `container:createDesktopShortcut` -- 创建桌面快捷方式

**页面管理 (page:)** -- `electron/ipc/index.ts`
- `page:list` / `page:create` / `page:update` / `page:delete` / `page:reorder`

**标签页管理 (tab:)** -- `electron/ipc/tab.ts`
- `tab:list` / `tab:create` / `tab:close` / `tab:switch` / `tab:update` / `tab:reorder`
- `tab:navigate` / `tab:goBack` / `tab:goForward` / `tab:reload` / `tab:forceReload`
- `tab:zoomIn` / `tab:zoomOut` / `tab:zoomReset` / `tab:getZoomLevel`
- `tab:openDevTools` / `tab:open-in-new-window` / `tab:open-in-browser`
- `tab:restore-all` / `tab:save-all`
- `tab:update-bounds` / `tab:set-overlay-visible`
- `tab:detect-proxy` / `tab:set-proxy-enabled` / `tab:apply-proxy`
- `tab:set-muted` / `tab:capture`

**代理管理 (proxy:)** -- `electron/ipc/proxy.ts`
- `proxy:list` / `proxy:create` / `proxy:update` / `proxy:delete`
- `proxy:test` / `proxy:test-config`

**书签 (bookmark:)** -- `electron/ipc/index.ts`
- `bookmark:list` / `bookmark:create` / `bookmark:update` / `bookmark:delete` / `bookmark:reorder`
- `bookmark:batchDelete` / `bookmark:batchCreate`
- `bookmark:importOpenFile` / `bookmark:exportSaveFile`

**书签文件夹 (bookmarkFolder:)** -- `electron/ipc/index.ts`
- `bookmarkFolder:list` / `bookmarkFolder:create` / `bookmarkFolder:update` / `bookmarkFolder:delete`
- `bookmarkFolder:deleteEmpty` / `bookmarkFolder:reorder`

**书签健康检查** -- `electron/ipc/bookmark-check.ts`
- `bookmark:checkStart` / `bookmark:checkCancel`

**密码管理 (password:)** -- `electron/ipc/index.ts`
- `password:list` / `password:listBySite` / `password:create` / `password:update` / `password:delete`
- `password:clearAll`

**搜索引擎** -- `electron/ipc/index.ts`
- `searchEngine:list` / `searchEngine:set` / `searchEngine:getDefault` / `searchEngine:setDefault`

**分屏 (split:)** -- `electron/ipc/split.ts`
- `split:get-state` / `split:set-state` / `split:clear-state`
- `split:list-schemes` / `split:create-scheme` / `split:delete-scheme`
- `split:update-multi-bounds`

**下载管理 (download:)** -- `electron/ipc/download.ts`
- `download:checkConnection` / `download:getConfig` / `download:updateConfig`
- `download:start` / `download:stop`
- `download:add` / `download:pause` / `download:resume` / `download:remove`
- `download:listActive` / `download:listWaiting` / `download:listStopped` / `download:globalStat`
- `download:purge` / `download:showInFolder` / `download:openFile`
- `download:startDrag` / `download:pickDirectory`

**扩展 (extension:)** -- `electron/ipc/extensions.ts`
- `extension:list` / `extension:select` / `extension:load` / `extension:unload` / `extension:delete`
- `extension:update` / `extension:getLoaded`
- `extension:openBrowserActionPopup`

**快捷键 (shortcut:)** -- `electron/ipc/shortcut.ts`
- `shortcut:list` / `shortcut:update` / `shortcut:clear` / `shortcut:reset`

**自动更新 (updater:)** -- `electron/ipc/updater.ts`
- `updater:check` / `updater:download` / `updater:install` / `updater:get-version` / `updater:get-info`

**网络嗅探 (sniffer:)** -- `electron/ipc/sniffer.ts`
- `sniffer:toggle` / `sniffer:setDomainEnabled` / `sniffer:getDomainList`
- `sniffer:clearResources` / `sniffer:getState`

**AI 聊天 (chat:)** -- `electron/ipc/chat.ts`
- `chat:completions` -- 流式聊天请求（异步代理，SSE 流通过 webContents.send 转发）
- `chat:abort` -- 中止请求
- `agent:execTool` -- 工作流引擎工具执行
- `browser:click` / `browser:type` / `browser:scroll` / `browser:select` / `browser:hover` -- 浏览器交互
- `browser:get-content` / `browser:get-dom` / `browser:screenshot` -- 页面信息获取

**AI 供应商 (ai-provider:)** -- `electron/ipc/ai-provider.ts`
- `ai-provider:list` / `ai-provider:create` / `ai-provider:update` / `ai-provider:delete`
- `ai-provider:test` -- 测试连接

**工作流 (workflow:)** -- `electron/ipc/workflow.ts`
- `workflow:list` / `workflow:get` / `workflow:create` / `workflow:update` / `workflow:delete`
- `workflow:importOpenFile` / `workflow:exportSaveFile`

**工作流文件夹 (workflowFolder:)** -- `electron/ipc/workflow.ts`
- `workflowFolder:list` / `workflowFolder:create` / `workflowFolder:update` / `workflowFolder:delete`

**工作流版本 (workflowVersion:)** -- `electron/ipc/workflow-version.ts`
- `workflowVersion:list` / `workflowVersion:add` / `workflowVersion:get`
- `workflowVersion:delete` / `workflowVersion:clear` / `workflowVersion:nextName`

**执行日志 (executionLog:)** -- `electron/ipc/execution-log.ts`
- `executionLog:list` / `executionLog:save` / `executionLog:delete` / `executionLog:clear`

**MCP Server (mcp:)** -- `electron/ipc/mcp.ts`
- `mcp:start` / `mcp:stop` / `mcp:get-status`

**插件 (plugin:)** -- `electron/ipc/plugin.ts`
- `plugin:list` / `plugin:enable` / `plugin:disable`
- `plugin:get-view` / `plugin:get-icon`
- `plugin:import-zip` / `plugin:open-folder` / `plugin:install` / `plugin:uninstall`

**技能 (skill:)** -- `electron/ipc/index.ts`
- `skill:list` / `skill:search` / `skill:read` / `skill:write` / `skill:delete`

**窗口控制 (window:)** -- `electron/ipc/index.ts`
- `window:minimize` / `window:maximize` / `window:close` / `window:isMaximized` / `window:toggleFullscreen`

**应用设置 (settings:)** -- `electron/ipc/index.ts`
- `settings:getTabFreezeMinutes` / `settings:setTabFreezeMinutes`
- `settings:setDefaultBrowser` / `settings:checkDefaultBrowser`
- `settings:getDefaultContainerId` / `settings:setDefaultContainerId`
- `settings:getDefaultWorkspaceId` / `settings:setDefaultWorkspaceId`
- `settings:getMinimizeOnClose` / `settings:setMinimizeOnClose`
- `settings:getAskContainerOnOpen` / `settings:setAskContainerOnOpen`

**默认静音网站 (mutedSites:)** -- `electron/ipc/index.ts`
- `mutedSites:list` / `mutedSites:set` / `mutedSites:add` / `mutedSites:remove`

**外部链接**
- `openExternal` -- 使用系统默认浏览器打开 URL

### 主进程 -> 渲染进程事件（webContents.send）

- `on:tab:title-updated` / `on:tab:url-updated` / `on:tab:nav-state` / `on:tab:favicon-updated`
- `on:tab:open-url` / `on:tab:request-bounds` / `on:tab:activated` / `on:tab:created`
- `on:tab:frozen` / `on:tab:proxy-info` / `on:tab:auto-muted`
- `on:window:maximized` / `on:window:unmaximized`
- `on:open-container` / `on:open-external-url` / `on:tray:openInApp`
- `on:shortcut` / `on:download:started`
- `on:chat:chunk` / `on:chat:thinking` / `on:chat:error` / `on:chat:done`
- `on:chat:tool-call` / `on:chat:tool-call-args` / `on:chat:tool-call-args-delta` / `on:chat:tool-call-update` / `on:chat:tool-result`
- `on:chat:stop-reason` / `on:chat:usage` / `on:chat:retry`
- `update:checking` / `update:available` / `update:not-available` / `update:download-progress` / `update:downloaded` / `update:error`

---

## 关键依赖与配置

| 依赖 | 用途 |
|------|------|
| `electron-store` | JSON 文件持久化（核心数据模型） |
| `@electron-toolkit/utils` | Electron 应用工具 |
| `@electron-toolkit/preload` | 预加载工具 |
| `electron-updater` | 自动更新 |
| `electron-chrome-extensions` | Chrome 扩展运行时 |
| `electron-builder` | 打包为 DMG (Mac) / NSIS (Windows) |
| `queue` | 并发队列（书签健康检查） |
| `adm-zip` | ZIP 文件解压（插件导入） |
| `eventemitter2` | 事件总线（插件系统） |
| `@modelcontextprotocol/sdk` | MCP Server SDK |
| `zod` | MCP 工具参数校验 |
| `@mozilla/readability` | 页面正文提取 |
| `turndown` | HTML 转 Markdown |
| `langchain` / `@langchain/anthropic` | LangChain AI 框架 |

---

## 数据模型

### electron-store 模型（`electron/services/store.ts`）

| 模型 | 字段 | 说明 |
|------|------|------|
| **Workspace** | id, title, color, order, isDefault? | 工作区 |
| **Group** | id, name, order, icon?, proxyId?, color?, workspaceId? | 分组 |
| **Container** | id, name, icon, proxyId?, autoProxyEnabled?, order | 容器 |
| **Page** | id, groupId, containerId?, name, icon, url, order, proxyId?, userAgent? | 页面 |
| **Proxy** | id, name, enabled?, proxyMode?, type?, host?, port?, username?, password?, pacScript?, pacUrl? | 代理配置 |
| **Tab** | id, pageId, title, url, order, pinned?, muted?, workspaceId? | 标签页 |
| **Extension** | id, name, path, enabled, icon? | Chrome 扩展 |
| **WindowState** | x?, y?, width, height, isMaximized | 窗口状态 |
| **ShortcutBindingStore** | id, accelerator, global | 快捷键绑定 |
| **SplitLayoutData** | presetType, panes[], direction, sizes[], root? | 分屏布局 |
| **SavedSplitSchemeData** | id, name, presetType, direction, paneCount, sizes[], root? | 分屏方案 |
| **TrayWindowSizes** | newWindow, desktop, mobile | 托盘窗口尺寸 |
| **AIProviderStore** | id, name, apiBase, apiKey, models[], enabled, createdAt | AI 供应商 |
| **AIModelStore** | id, name, providerId, maxTokens, supportsVision, supportsThinking | AI 模型 |
| **PasswordEntry** | id, siteOrigin, siteName?, name, fields[], order, createdAt, updatedAt | 密码/笔记 |
| **SearchEngine** | id, name, url, icon? | 搜索引擎 |
| **UpdateSource** | id, name, type, owner?, repo?, url? | 更新源 |
| **WorkflowFolder** | id, name, parentId?, order, createdAt | 工作流文件夹 |
| **WorkflowNode** | id, type, label, position, data, nodeState? | 工作流节点 |
| **WorkflowEdge** | id, source, target | 工作流连线 |
| **Workflow** | id, name, folderId?, description?, nodes[], edges[], createdAt, updatedAt | 工作流 |

### JsonStore 独立文件模型

| 文件 | 模型 | 说明 |
|------|------|------|
| `bookmark-store.json` | Bookmark, BookmarkFolder | 书签（从 electron-store 迁移） |
| `password-store.json` | PasswordEntry | 密码/笔记（从 electron-store 迁移） |
| `workflow-folders.json` | WorkflowFolder[] | 工作流文件夹索引 |
| `workflows/{id}.json` | Workflow | 每个工作流独立文件 |
| `workflow-data/workflow-versions.json` | WorkflowVersion[] | 版本快照（按 workflowId 分组） |
| `workflow-data/execution-logs.json` | ExecutionLog[] | 执行日志（按 workflowId 分组，每组最多 50 条） |
| `plugin-data/disabled.json` | string[] | 已禁用插件 ID 列表 |
| `plugin-data/{pluginId}/storage.json` | Record<string, any> | 插件独立存储 |

### Skill Store（Markdown 文件）

路径：`{userData}/skills/{name}.md`，格式含 frontmatter（name, description, created, updated）+ Markdown 正文（含 JS 代码块）。

### MCP Server 工具（`electron/services/mcp/tools/`）

| 文件 | 注册工具 | 说明 |
|------|----------|------|
| `query.ts` | list_workspaces, list_groups, list_pages, list_tabs, get_active_tab, list_bookmarks, list_containers | 数据查询类工具 |
| `tab.ts` | create_tab, navigate_tab, switch_tab, close_tab, activate_tab | 标签页操作工具 |
| `cdp.ts` | click_element, input_text, scroll_page, select_option, hover_element, get_page_content, get_dom, screenshot | CDP 调试协议工具 |
| `window.ts` | create_window, navigate_window, close_window, list_windows, focus_window, screenshot_window, get_window_detail | 窗口操作工具 |

---

## 测试与质量

当前无测试文件。无 lint 配置。

---

## 相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `electron/main.ts` | 主进程入口（含完整启动流程） |
| `electron/ipc/index.ts` | IPC 注册中心（含 IPC 广播代理包装、工作区/分组/容器/页面/书签/密码/搜索引擎/技能/设置/窗口控制） |
| `electron/ipc/tab.ts` | Tab 相关 IPC（WebView + 数据 + 导航 + 代理 + 截图 + 缩放） |
| `electron/ipc/proxy.ts` | 代理 IPC（含热更新） |
| `electron/ipc/split.ts` | 分屏 IPC |
| `electron/ipc/download.ts` | 下载管理 IPC（Aria2） |
| `electron/ipc/extensions.ts` | 扩展管理 IPC |
| `electron/ipc/updater.ts` | 自动更新 IPC |
| `electron/ipc/shortcut.ts` | 快捷键 IPC |
| `electron/ipc/bookmark-check.ts` | 书签健康检查 IPC |
| `electron/ipc/sniffer.ts` | 网络嗅探 IPC |
| `electron/ipc/chat.ts` | AI 聊天/Agent/浏览器交互工具 IPC |
| `electron/ipc/ai-provider.ts` | AI 供应商管理 IPC |
| `electron/ipc/workflow.ts` | 工作流/文件夹 CRUD + 导入/导出 IPC |
| `electron/ipc/workflow-version.ts` | 工作流版本控制 IPC |
| `electron/ipc/execution-log.ts` | 工作流执行日志 IPC |
| `electron/ipc/mcp.ts` | MCP Server 启停 IPC |
| `electron/ipc/plugin.ts` | 插件管理 IPC |
| `electron/services/store.ts` | 数据持久化层（electron-store，20+ 模型，Page 迁移） |
| `electron/services/bookmark-store.ts` | 书签独立存储（JsonStore） |
| `electron/services/password-store.ts` | 密码独立存储（JsonStore） |
| `electron/services/workflow-store.ts` | 工作流独立存储（每个工作流独立文件） |
| `electron/services/workflow-version.ts` | 工作流版本快照（JsonStore，每个工作流最多 100 版本） |
| `electron/services/execution-log.ts` | 工作流执行日志（JsonStore，每个工作流最多 50 条） |
| `electron/services/skill-store.ts` | 技能存储（Markdown 文件，含 JS 代码块执行） |
| `electron/services/webview-manager.ts` | WebContentsView 生命周期管理（标签冻结、代理、下载拦截、截图、右键菜单、嗅探） |
| `electron/services/proxy.ts` | 代理测试与配置构建 |
| `electron/services/extensions.ts` | Chrome 扩展管理（按 partition 隔离） |
| `electron/services/aria2.ts` | Aria2 下载服务 |
| `electron/services/tray.ts` | 系统托盘管理 |
| `electron/services/tray-window.ts` | 托盘窗口管理 |
| `electron/services/shortcut-manager.ts` | 快捷键管理 |
| `electron/services/bookmark-checker.ts` | 书签健康检查 |
| `electron/services/ai-proxy.ts` | AI 代理网关（SSE 流解析、tool_use 多轮循环、30+ 工具执行） |
| `electron/services/mcp/server.ts` | MCP Server（SSE 传输，端口 9527） |
| `electron/services/mcp/types.ts` | MCP 工具上下文类型定义 |
| `electron/services/mcp/tools/index.ts` | MCP 工具注册入口 |
| `electron/services/mcp/tools/query.ts` | MCP 数据查询工具 |
| `electron/services/mcp/tools/tab.ts` | MCP 标签页操作工具 |
| `electron/services/mcp/tools/cdp.ts` | MCP CDP 调试工具 |
| `electron/services/mcp/tools/window.ts` | MCP 窗口操作工具 |
| `electron/services/plugin-manager.ts` | 插件管理器（加载/卸载/启用/禁用/ZIP 导入/URL 安装） |
| `electron/services/plugin-context.ts` | 插件上下文 API（事件/存储/日志/渲染进程通信） |
| `electron/services/plugin-storage.ts` | 插件独立存储（每个插件一个 JSON 文件） |
| `electron/services/plugin-event-bus.ts` | 插件事件总线（EventEmitter2） |
| `electron/services/plugin-types.ts` | 插件类型定义（PluginInfo/PluginMeta/PluginContext/PluginInstance） |
| `electron/services/favicon-cache.ts` | Favicon 本地缓存（下载/验证/缓存查找） |
| `electron/services/page-extractor.ts` | 页面内容提取（Readability 摘要/Turndown Markdown/交互节点） |
| `electron/services/default-browser.ts` | 默认浏览器注册（Windows） |
| `electron/services/migration.ts` | 数据迁移（bookmark/password/workflow 从 electron-store 到 JsonStore） |
| `electron/composables/useAutoUpdater.ts` | 自动更新 composable |
| `electron/utils/user-agent.ts` | UA 管理 |
| `electron/utils/json-store.ts` | 通用 JSON 文件存储工具类 |
