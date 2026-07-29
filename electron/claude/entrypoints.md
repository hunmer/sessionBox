[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 入口与启动

**入口文件**：`electron/main.ts`（构建产物 `out/main/index.js`，即 package.json `main`）。

## 启动序列（详见根 [entrypoints.md](../../claude/entrypoints.md)）

1. `setupUserAgent()`（app ready 前）。
2. `registerSchemesAsPrivileged`：account-icon / extension-icon / site-icon / screenshot。
3. 注册 `sessionbox://`；Windows `ensureWindowsBrowserRegistration()`。
4. 全局异常处理。
5. 单实例锁 + `second-instance` / `open-url`。
6. `app.whenReady()`：
   - `migrateBookmarksAndPasswords()`
   - 注册 IPC（`registerIpcHandlers` + `registerDownloadIpcHandlers`）
   - `pluginManager.loadAll()`
   - `webviewManager.setFreezeMinutes(...)`
   - 注册协议 handler（account-icon/extension-icon/screenshot/site-icon + BLOCKED_SCHEMES 空处理）
   - `createWindow()`（窗口状态、主窗口、webviewManager、autoUpdater）
   - `trayManager.init()`、`pluginManager.setMainWindow()`
   - `registerGlobalShortcuts()`
   - 若 `getMcpEnabled()` 启动 MCP
   - 3s 后检查更新
7. 窗口关闭：按 `getMinimizeOnClose()` 隐藏到托盘 / 退出。
8. `before-quit`：停 MCP、`pluginManager.shutdown()`、销毁托盘窗口。

## 关键 init 调用

- `webviewManager.setMainWindow(mainWindow)`、暴露到 `global.__webviewManager`（供浏览器交互 IPC 访问）。
- `getAutoUpdater().setMainWindow(mainWindow)`。
- `trayManager.init(mainWindow)`、`pluginManager.setMainWindow(mainWindow)`。
