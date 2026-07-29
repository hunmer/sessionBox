[根目录](../CLAUDE.md) > 详情

# 入口与构建

## 应用入口

| 角色 | 路径 | 备注 |
|------|------|------|
| 主进程入口 | `electron/main.ts` | package.json `main` 指向 `./out/main/index.js`（构建产物） |
| 预加载入口 | `preload/index.ts` | 挂载到主窗口 `webPreferences.preload` |
| 渲染进程入口 | `src/main.ts` → `index.html` | Vue 应用挂载 `#app` |
| 调试器预加载 | `electron/debugger-preload.ts` | 独立构建入口 |
| 调试器回放预加载 | `electron/debugger-replay-preload.ts` | 独立构建入口 |

## 构建配置（electron.vite.config.ts）

`defineConfig` 三个构建目标：

- **main**：`electron/main.ts` → `out/main/index.js`
- **preload**：三个入口 → `out/preload/`
  - `index` ← `preload/index.ts`
  - `debugger-preload` ← `electron/debugger-preload.ts`
  - `debugger-replay-preload` ← `electron/debugger-replay-preload.ts`
  - 自定义插件 `copyChromeExtensionPreload()`：构建后复制 `electron-chrome-extensions` 的 `chrome-extension-api.preload.js` 到 `out/preload/`
  - 自定义插件 `copyDebuggerWindowHtml()`：复制 `electron/debugger-window.html`、`debugger-replay.html` 及 `electron/debugger-assets/` 到 `out/preload/`
- **renderer**：`root: '.'`，入口 `index.html`；别名 `@` → `src`，`vue` → `vue/dist/vue.esm-bundler.js`；插件 `@vitejs/plugin-vue` + `@tailwindcss/vite` + （仅 dev）`vite-plugin-vue-devtools`；`optimizeDeps.exclude: ['electron-chrome-extensions']`

## 主进程启动序列（electron/main.ts）

1. `setupUserAgent()` 设置全局 UA 回退（app ready 前）。
2. 注册自定义协议 scheme：`account-icon`、`extension-icon`、`site-icon`、`screenshot`（app ready 前必须）。
3. 注册 `sessionbox://` 深度链接协议；Windows 调用 `ensureWindowsBrowserRegistration()`。
4. 注册全局异常处理（`uncaughtException` / `unhandledRejection`）。
5. 请求单实例锁 `requestSingleInstanceLock()`；监听 `second-instance`（协议 URL / 外部 http(s) 链接）与 `open-url`（macOS）。
6. `app.whenReady()`：
   - `migrateBookmarksAndPasswords()`（幂等迁移到 JsonStore）
   - 注册全部 IPC handlers（`registerIpcHandlers` + `registerDownloadIpcHandlers`）
   - `pluginManager.loadAll()`（初始化插件）
   - `webviewManager.setFreezeMinutes(...)`（标签冻结定时器）
   - 注册协议 handler：`account-icon://`、`extension-icon://`、`screenshot://`、`site-icon://`（含本地缓存 + 自动下载）；为 `BLOCKED_SCHEMES` 注册空处理器防外部唤起
   - `createWindow()`（恢复窗口状态、创建主窗口、初始化 webviewManager 与 autoUpdater）
   - `trayManager.init()`、`pluginManager.setMainWindow()`
   - `registerGlobalShortcuts()`
   - 若 `getMcpEnabled()` 则启动 MCP Server
   - 3 秒后自动检查更新
7. 窗口关闭：按 `getMinimizeOnClose()` 决定隐藏到托盘或退出。
8. `before-quit`：停 MCP、`pluginManager.shutdown()`、销毁托盘窗口。

## TypeScript 配置

- `tsconfig.json`：根引用（references）
- `tsconfig.node.json`：主进程 / 预加载 / 构建（Node 上下文）
- `tsconfig.web.json`：渲染进程（DOM 上下文）

## 打包

- `electron-builder.json`：DMG(Mac) / NSIS(Windows) 安装包配置。
- `electron-builder-local.json`：本地打包变体。
- `scripts/build-production.js`：`pnpm pack` / `pnpm pack:release` 的实现。
