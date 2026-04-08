[根目录](../CLAUDE.md) > **electron**

# electron/ -- 主进程模块

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-04-09 02:12:31 | 初始化 | 首次生成模块文档 |

---

## 模块职责

Electron 主进程，负责：
- 应用生命周期管理（单实例锁、协议注册）
- BrowserWindow 窗口创建与控制
- WebContentsView（标签页 WebView）生命周期管理
- IPC 通信注册与处理
- 数据持久化（electron-store）
- 代理配置与测试
- 自定义协议处理（sessionbox://、account-icon://）
- 第三方协议拦截（阻止外部应用唤起）

---

## 入口与启动

**入口文件**：`electron/main.ts`

启动流程：
1. `setupUserAgent()` -- 设置全局 UA 回退值（模拟 Chrome）
2. 注册 `account-icon` 自定义协议
3. 注册 `sessionbox://` 深度链接协议
4. 请求单实例锁 `app.requestSingleInstanceLock()`
5. `app.whenReady()` 后：注册 IPC、注册 account-icon 协议处理器、注册第三方协议空处理器、创建窗口
6. 窗口创建时初始化 `webviewManager.setMainWindow(mainWindow)`

---

## 对外接口

### IPC 通道（electron/ipc/）

**分组管理 (group:)**
- `group:list` -- 列出所有分组
- `group:create` -- 创建分组（名称、颜色）
- `group:update` -- 更新分组
- `group:delete` -- 删除分组（需无账号关联）
- `group:reorder` -- 重排分组顺序

**账号管理 (account:)**
- `account:list` -- 列出所有账号
- `account:create` -- 创建账号
- `account:update` -- 更新账号
- `account:delete` -- 删除账号（同时清理图标文件）
- `account:reorder` -- 重排账号顺序
- `account:uploadIcon` -- 上传自定义图标（弹出文件选择对话框）
- `account:createDesktopShortcut` -- 创建桌面快捷方式（.url 文件，使用 sessionbox:// 协议）

**标签页管理 (tab:)** -- `electron/ipc/tab.ts`
- `tab:list` / `tab:create` / `tab:close` / `tab:switch` / `tab:update` / `tab:reorder`
- `tab:navigate` / `tab:goBack` / `tab:goForward` / `tab:reload`
- `tab:openDevTools` / `tab:open-in-new-window` / `tab:open-in-browser`
- `tab:restore-all` -- 启动时恢复所有标签页
- `tab:save-all` -- 退出前保存标签页状态
- `tab:update-bounds` -- 同步 WebView 位置与大小（ipcMain.on，非 handle）
- `tab:set-overlay-visible` -- 控制 WebView 可见性（弹出对话框时隐藏）

**代理管理 (proxy:)** -- `electron/ipc/proxy.ts`
- `proxy:list` / `proxy:create` / `proxy:update` / `proxy:delete`
- `proxy:test` -- 测试已保存的代理
- `proxy:test-config` -- 测试未保存的代理配置
- 代理更新/删除时触发**热更新**：自动重新设置受影响 session 的代理并刷新标签页

**常用网站 (favoriteSite:)**
- `favoriteSite:list` / `favoriteSite:create` / `favoriteSite:update` / `favoriteSite:delete`

**窗口控制 (window:)**
- `window:minimize` / `window:maximize` / `window:close` / `window:isMaximized`

**其他**
- `openExternal` -- 使用系统默认浏览器打开 URL

### 主进程 -> 渲染进程事件（webContents.send）

- `on:tab:title-updated` (tabId, title)
- `on:tab:url-updated` (tabId, url)
- `on:tab:nav-state` (tabId, {canGoBack, canGoForward, isLoading})
- `on:tab:favicon-updated` (tabId, url)
- `on:tab:open-url` (accountId, url) -- 新窗口拦截
- `on:tab:request-bounds` -- 请求渲染进程同步 WebView bounds
- `on:window:maximized` / `on:window:unmaximized`
- `on:open-account` (accountId) -- 深度链接触发

---

## 关键依赖与配置

- `electron-store` -- JSON 文件持久化，schema 包含 groups/accounts/proxies/tabs/favoriteSites
- `@electron-toolkit/utils` -- Electron 应用工具（setAppUserModelId、watchWindowShortcuts）
- `@electron-toolkit/preload` -- 预加载工具（electronAPI）
- `electron-builder` -- 打包为 DMG (Mac) / NSIS (Windows)

---

## 数据模型

数据定义在 `electron/services/store.ts`，使用 `electron-store` 持久化。

| 模型 | 字段 | 说明 |
|------|------|------|
| **Proxy** | id, name, type(socks5/http/https), host, port, username?, password? | 代理配置 |
| **Group** | id, name, order, proxyId?, color? | 分组（可绑定代理） |
| **Account** | id, groupId, name, icon, proxyId?, userAgent?, defaultUrl, order | 账号（Session 隔离单元） |
| **Tab** | id, accountId, title, url, order | 标签页 |
| **FavoriteSite** | id, title, url, accountId?, favicon? | 常用网站 |

---

## 测试与质量

当前无测试文件。无 lint 配置。

---

## 相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `electron/main.ts` | 主进程入口 |
| `electron/ipc/index.ts` | IPC 注册（分组、账号、常用网站、窗口控制） |
| `electron/ipc/tab.ts` | Tab 相关 IPC（WebView + 数据） |
| `electron/ipc/proxy.ts` | 代理 IPC（含热更新） |
| `electron/services/store.ts` | 数据持久化层（electron-store CRUD） |
| `electron/services/webview-manager.ts` | WebContentsView 生命周期管理 |
| `electron/services/proxy.ts` | 代理测试与 proxyRules 构建 |
| `electron/utils/user-agent.ts` | UA 管理（全局回退 + 账号自定义） |
