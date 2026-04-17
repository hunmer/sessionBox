[根目录](../CLAUDE.md) > **preload**

# preload/ -- 预加载模块

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-04-17 18:08:25 | 增量更新 | 大幅更新 IPC API 列表：新增 AI 聊天（chat:completions/abort）、AI 供应商（ai-provider:*）、浏览器交互（browser:click/type/scroll等）、工作流（workflow:*）、工作流版本（workflowVersion:*）、执行日志（executionLog:*）、MCP（mcp:*）、插件（plugin:*）、网络嗅探（sniffer:*）、技能（skill:*）、密码（password:*）、搜索引擎（searchEngine:*）、缩放（tab:zoom*）、更多设置（settings:*）等。新增 ChatCompletionParams/PluginMeta/SearchEngine/PasswordField/PasswordEntry 等类型导出 |
| 2026-04-13 10:44:52 | 增量更新 | 更新 IPC API 完整列表：新增工作区、容器、页面、下载、扩展、快捷键、分屏、自动更新、书签健康检查等 |
| 2026-04-09 02:12:31 | 初始化 | 首次生成模块文档 |

---

## 模块职责

Electron 预加载脚本，运行在渲染进程的独立上下文中，通过 `contextBridge` 安全地将 IPC API 暴露给渲染进程。是主进程与渲染进程之间的通信桥梁。

---

## 入口与启动

**入口文件**：`preload/index.ts`

在 `BrowserWindow` 创建时通过 `webPreferences.preload` 加载。使用 `contextBridge.exposeInMainWorld('api', api)` 将 IPC API 挂载到 `window.api`。

---

## 对外接口

`window.api` 对象结构（25+ 命名空间）：

```
api.workspace       -- 工作区 CRUD
api.group           -- 分组 CRUD
api.container       -- 容器 CRUD（含图标上传/URL下载、桌面快捷方式）
api.page            -- 页面 CRUD
api.proxy           -- 代理 CRUD（含测试）
api.tab             -- 标签页 CRUD + 导航 + bounds + 代理 + 截图 + 静音 + 缩放
api.bookmark        -- 书签 CRUD + 批量操作 + 导入/导出
api.bookmarkFolder  -- 书签文件夹 CRUD + 删除空文件夹
api.bookmarkCheck   -- 书签健康检查（开始/取消）
api.extension       -- 扩展管理（选择/加载/卸载/删除/BrowserAction弹窗）
api.window          -- 窗口控制（最小化/最大化/关闭/全屏）
api.settings        -- 应用设置（标签冻结/默认浏览器/默认容器/默认工作区/关闭行为等）
api.mutedSites      -- 静音网站管理
api.shortcut        -- 快捷键管理（列表/更新/清除/重置）
api.split           -- 分屏管理（状态存取/方案管理/多视图 bounds）
api.download        -- 下载管理（Aria2 完整控制）
api.updater         -- 自动更新（检查/下载/安装/事件监听）
api.sniffer         -- 网络嗅探器（开关/域名管理/状态查询）
api.password        -- 密码管理（CRUD + 按站点查询 + 清空）
api.searchEngine    -- 搜索引擎管理（列表/设置/默认引擎）
api.chat            -- AI 聊天（流式请求/中止）
api.agent           -- Agent 工具执行（execTool）
api.browser         -- 浏览器交互工具（click/type/scroll/select/hover/content/dom/screenshot）
api.aiProvider      -- AI 供应商管理（CRUD + 连接测试）
api.workflow        -- 工作流管理（CRUD + 导入/导出）
api.workflowFolder  -- 工作流文件夹管理
api.workflowVersion -- 工作流版本控制（列表/新增/获取/删除/清空/下一名称）
api.executionLog    -- 执行日志（列表/保存/删除/清空）
api.mcp             -- MCP Server（启动/停止/状态查询）
api.plugin          -- 插件管理（列表/启用/禁用/视图/图标/ZIP导入/URL安装/卸载/打开目录）
api.skill           -- 技能管理（列表/搜索/读取/写入/删除）
api.openExternal(url) -- 打开外部链接
api.on(event, callback) -- 监听主进程事件，返回清理函数
```

### 导出类型

| 类型 | 说明 |
|------|------|
| `Proxy` | 代理配置 |
| `Workspace` | 工作区 |
| `Group` | 分组 |
| `Container` | 容器 |
| `Page` | 页面 |
| `Tab` | 标签页 |
| `NavState` | 导航状态 |
| `BookmarkFolder` | 书签文件夹 |
| `Bookmark` | 书签 |
| `Extension` | Chrome 扩展 |
| `ShortcutItem` / `ShortcutGroup` | 快捷键条目/分组 |
| `SplitPaneData` / `SplitNodeData` / `SplitLayoutData` / `SavedSplitSchemeData` | 分屏数据 |
| `PluginMeta` | 插件展示信息 |
| `SearchEngine` | 搜索引擎 |
| `PasswordField` / `PasswordEntry` | 密码字段/条目 |
| `DefaultBrowserResult` | 默认浏览器检测结果 |
| `ChatCompletionParams` | AI 聊天请求参数 |
| `IpcAPI` | 完整 API 类型 |

---

## 关键依赖与配置

| 依赖 | 用途 |
|------|------|
| `@electron-toolkit/preload` | 提供 `electronAPI`（暴露给 `window.electron`） |

---

## 测试与质量

当前无测试文件。

---

## 相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `preload/index.ts` | 预加载脚本（IPC API 定义 + contextBridge + 25+ 命名空间 + 20+ 类型导出） |
| `preload/index.d.ts` | TypeScript 类型声明（IpcAPI 接口） |
