[根目录](../CLAUDE.md) > **electron**

# electron/ -- 主进程模块

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-04-13 10:44:52 | 增量更新 | 新增工作区/页面/容器模型、分屏、下载(Aria2)、扩展、托盘/托盘窗口、自动更新、快捷键管理、书签健康检查、标签冻结/截图/静音、默认浏览器、窗口状态持久化等 |
| 2026-04-09 02:12:31 | 初始化 | 首次生成模块文档 |

---

## 模块职责

Electron 主进程，负责：
- 应用生命周期管理（单实例锁、协议注册、默认浏览器）
- BrowserWindow 窗口创建与控制（窗口状态持久化）
- WebContentsView（标签页 WebView）生命周期管理
- IPC 通信注册与处理（12 个 IPC 模块）
- 数据持久化（electron-store，含 15+ 数据模型）
- 代理配置、测试与热更新（SOCKS5/HTTP/HTTPS/PAC）
- 自定义协议处理（sessionbox://、account-icon://、extension-icon://）
- Chrome 扩展加载与管理（按 partition 隔离）
- Aria2 下载管理（进程管理、RPC 通信、下载拦截）
- 系统托盘与任务栏窗口
- 自动更新检查与安装
- 全局/本地快捷键管理
- 标签冻结（后台超时自动销毁，按需重建）
- 第三方协议拦截（阻止外部应用唤起）

---

## 入口与启动

**入口文件**：`electron/main.ts`

启动流程：
1. `setupUserAgent()` -- 设置全局 UA 回退值（模拟 Chrome 133）
2. 注册 `account-icon`、`extension-icon` 自定义协议（必须在 app ready 前）
3. 注册 `sessionbox://` 深度链接协议
4. 处理未捕获异常和 Promise rejection
5. 请求单实例锁 `app.requestSingleInstanceLock()`
6. 监听 `second-instance`（协议 URL、外部 http/https 链接）
7. `app.whenReady()` 后：
   - 注册所有 IPC 处理器（12 个模块）
   - 初始化标签冻结定时器
   - 注册 account-icon://、extension-icon:// 协议处理器
   - 注册第三方协议空处理器（阻止唤起）
   - 创建主窗口（恢复窗口位置/大小/最大化状态）
   - 初始化系统托盘
   - 注册全局快捷键
   - 3 秒后自动检查更新
8. 窗口关闭时隐藏到托盘（非真正退出），托盘菜单"退出"才真正退出

---

## 对外接口

### IPC 通道（electron/ipc/）

**工作区 (workspace:)** -- `electron/ipc/index.ts`
- `workspace:list` / `workspace:create` / `workspace:update` / `workspace:delete` / `workspace:reorder`

**分组管理 (group:)** -- `electron/ipc/index.ts`
- `group:list` / `group:create` / `group:update` / `group:delete` / `group:reorder`

**容器管理 (container:)** -- `electron/ipc/index.ts`
- `container:list` / `container:create` / `container:update` / `container:delete` / `container:reorder`
- `container:uploadIcon` -- 上传自定义图标
- `container:createDesktopShortcut` -- 创建桌面快捷方式（.url 文件）

**页面管理 (page:)** -- `electron/ipc/index.ts`
- `page:list` / `page:create` / `page:update` / `page:delete` / `page:reorder`

**标签页管理 (tab:)** -- `electron/ipc/tab.ts`
- `tab:list` / `tab:create` / `tab:close` / `tab:switch` / `tab:update` / `tab:reorder`
- `tab:navigate` / `tab:goBack` / `tab:goForward` / `tab:reload`
- `tab:openDevTools` / `tab:open-in-new-window` / `tab:open-in-browser`
- `tab:restore-all` -- 启动时恢复所有标签页
- `tab:save-all` -- 退出前保存标签页状态
- `tab:update-bounds` -- 同步 WebView 位置与大小（ipcMain.on，非 handle）
- `tab:set-overlay-visible` -- 控制 WebView 可见性
- `tab:detect-proxy` / `tab:set-proxy-enabled` / `tab:apply-proxy` -- 代理检测与应用
- `tab:set-muted` -- 标签静音
- `tab:capture` -- 批量截取标签页缩略图

**代理管理 (proxy:)** -- `electron/ipc/proxy.ts`
- `proxy:list` / `proxy:create` / `proxy:update` / `proxy:delete`
- `proxy:test` -- 测试已保存的代理（SOCKS5/HTTP 原生隧道、PAC 通过 Electron Session）
- `proxy:test-config` -- 测试未保存的代理配置
- 代理更新/删除时触发**热更新**

**书签 (bookmark:)** -- `electron/ipc/index.ts`
- `bookmark:list` / `bookmark:create` / `bookmark:update` / `bookmark:delete` / `bookmark:reorder`
- `bookmark:batchDelete` / `bookmark:batchCreate`
- `bookmark:importOpenFile` / `bookmark:exportSaveFile` -- 导入/导出 Chrome 书签 HTML

**书签文件夹 (bookmarkFolder:)** -- `electron/ipc/index.ts`
- `bookmarkFolder:list` / `bookmarkFolder:create` / `bookmarkFolder:update` / `bookmarkFolder:delete`
- `bookmarkFolder:deleteEmpty` / `bookmarkFolder:reorder`

**书签健康检查 (bookmark:)** -- `electron/ipc/bookmark-check.ts`
- `bookmark:checkStart` / `bookmark:checkCancel`

**分屏 (split:)** -- `electron/ipc/split.ts`
- `split:get-state` / `split:set-state` / `split:clear-state` -- 按工作区存取分屏状态
- `split:list-schemes` / `split:create-scheme` / `split:delete-scheme` -- 分屏方案管理
- `split:update-multi-bounds` -- 多视图同步 bounds（ipcMain.on）

**下载管理 (download:)** -- `electron/ipc/download.ts`
- `download:checkConnection` / `download:getConfig` / `download:updateConfig`
- `download:start` / `download:stop`
- `download:add` / `download:pause` / `download:resume` / `download:remove`
- `download:listActive` / `download:listWaiting` / `download:listStopped` / `download:globalStat`
- `download:purge` / `download:showInFolder` / `download:openFile`
- `download:startDrag` -- 原生文件拖拽
- `download:pickDirectory`

**扩展 (extension:)** -- `electron/ipc/extensions.ts`
- `extension:list` / `extension:select` / `extension:load` / `extension:unload` / `extension:delete`
- `extension:update` / `extension:getLoaded`
- `extension:openBrowserActionPopup`

**快捷键 (shortcut:)** -- `electron/ipc/shortcut.ts`
- `shortcut:list` / `shortcut:update` / `shortcut:clear` / `shortcut:reset`

**自动更新 (updater:)** -- `electron/ipc/updater.ts`
- `updater:check` / `updater:download` / `updater:install` / `updater:get-version` / `updater:get-info`

**窗口控制 (window:)** -- `electron/ipc/index.ts`
- `window:minimize` / `window:maximize` / `window:close` / `window:isMaximized` / `window:toggleFullscreen`

**应用设置 (settings:)** -- `electron/ipc/index.ts`
- `settings:getTabFreezeMinutes` / `settings:setTabFreezeMinutes`
- `settings:setDefaultBrowser` / `settings:checkDefaultBrowser`

**默认静音网站 (mutedSites:)** -- `electron/ipc/index.ts`
- `mutedSites:list` / `mutedSites:set` / `mutedSites:add` / `mutedSites:remove`

**外部链接**
- `openExternal` -- 使用系统默认浏览器打开 URL

### 主进程 -> 渲染进程事件（webContents.send）

- `on:tab:title-updated` (tabId, title)
- `on:tab:url-updated` (tabId, url)
- `on:tab:nav-state` (tabId, {canGoBack, canGoForward, isLoading})
- `on:tab:favicon-updated` (tabId, url)
- `on:tab:open-url` (pageId, url) -- 新窗口拦截
- `on:tab:request-bounds` -- 请求渲染进程同步 WebView bounds
- `on:tab:activated` (tabId) -- 标签激活
- `on:tab:created` (tab) -- 标签创建
- `on:tab:frozen` (tabId, isFrozen) -- 标签冻结/解冻
- `on:tab:proxy-info` (tabId, proxyInfo|null) -- 代理状态
- `on:tab:auto-muted` (tabId) -- 自动静音
- `on:window:maximized` / `on:window:unmaximized`
- `on:open-container` (containerId) -- 深度链接触发
- `on:tray:openInApp` (pageId) -- 托盘菜单打开页面
- `on:shortcut` (actionId) -- 快捷键触发
- `on:download:started` ({url, filename, tabId}) -- 下载开始
- `update:checking` / `update:available` / `update:not-available` / `update:download-progress` / `update:downloaded` / `update:error` -- 自动更新事件

---

## 关键依赖与配置

| 依赖 | 用途 |
|------|------|
| `electron-store` | JSON 文件持久化（15+ 数据模型） |
| `@electron-toolkit/utils` | Electron 应用工具 |
| `@electron-toolkit/preload` | 预加载工具 |
| `electron-updater` | 自动更新 |
| `electron-chrome-extensions` | Chrome 扩展运行时 |
| `electron-builder` | 打包为 DMG (Mac) / NSIS (Windows) |
| `queue` | 并发队列（书签健康检查） |

---

## 数据模型

数据定义在 `electron/services/store.ts`，使用 `electron-store` 持久化。

| 模型 | 字段 | 说明 |
|------|------|------|
| **Workspace** | id, title, color, order, isDefault? | 工作区 |
| **Group** | id, name, order, icon?, proxyId?, color?, workspaceId? | 分组（属于工作区，可绑定代理） |
| **Container** | id, name, icon, proxyId?, order | 容器（Session 隔离单元） |
| **Page** | id, groupId, containerId?, name, icon, url, order, proxyId?, userAgent? | 页面（属于分组，绑定容器） |
| **Proxy** | id, name, enabled?, proxyMode?, type?, host?, port?, username?, password?, pacScript?, pacUrl? | 代理配置 |
| **Tab** | id, pageId, title, url, order, pinned?, muted? | 标签页 |
| **Bookmark** | id, title, url, pageId?, favicon?, folderId, order | 书签 |
| **BookmarkFolder** | id, name, parentId?, order | 书签文件夹（树形） |
| **Extension** | id, name, path, enabled, icon? | Chrome 扩展 |
| **WindowState** | x?, y?, width, height, isMaximized | 窗口状态 |
| **ShortcutBindingStore** | id, accelerator, global | 快捷键绑定 |
| **SplitLayoutData** | presetType, panes[], direction, sizes[], manualAdjustEnabled?, root? | 分屏布局 |
| **SavedSplitSchemeData** | id, name, presetType, direction, paneCount, sizes[], root? | 保存的分屏方案 |
| **TrayWindowSizes** | newWindow, desktop, mobile (各含 width, height) | 托盘窗口尺寸 |

---

## 测试与质量

当前无测试文件。无 lint 配置。

---

## 相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `electron/main.ts` | 主进程入口 |
| `electron/ipc/index.ts` | IPC 注册（工作区、分组、容器、页面、书签、窗口控制、设置、静音网站） |
| `electron/ipc/tab.ts` | Tab 相关 IPC（WebView + 数据 + 导航 + 代理 + 截图） |
| `electron/ipc/proxy.ts` | 代理 IPC（含热更新） |
| `electron/ipc/split.ts` | 分屏 IPC |
| `electron/ipc/download.ts` | 下载管理 IPC（Aria2） |
| `electron/ipc/extensions.ts` | 扩展管理 IPC |
| `electron/ipc/updater.ts` | 自动更新 IPC |
| `electron/ipc/shortcut.ts` | 快捷键 IPC |
| `electron/ipc/bookmark-check.ts` | 书签健康检查 IPC |
| `electron/services/store.ts` | 数据持久化层（electron-store CRUD，15+ 模型，数据迁移） |
| `electron/services/webview-manager.ts` | WebContentsView 生命周期管理（标签冻结、代理、下载拦截、截图、右键菜单） |
| `electron/services/proxy.ts` | 代理测试与配置构建（SOCKS5/HTTP 原生隧道、PAC、Session 应用） |
| `electron/services/extensions.ts` | Chrome 扩展管理（按 partition 隔离、加载/卸载） |
| `electron/services/aria2.ts` | Aria2 下载服务（进程管理、RPC 通信、任务管理、通知监控） |
| `electron/services/tray.ts` | 系统托盘管理（动态菜单、页面快速访问） |
| `electron/services/tray-window.ts` | 托盘窗口管理（新窗口、任务栏桌面/手机窗口） |
| `electron/services/shortcut-manager.ts` | 快捷键管理（全局/本地、冲突检测、12 个预定义功能） |
| `electron/services/bookmark-checker.ts` | 书签健康检查（并发检测、进度通知） |
| `electron/composables/useAutoUpdater.ts` | 自动更新 composable（检查、下载、安装） |
| `electron/utils/user-agent.ts` | UA 管理（全局回退 Chrome 133 + 账号自定义） |
