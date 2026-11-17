[根目录](../CLAUDE.md) > 详情

# 入口与构建

## 应用入口

| 角色 | 路径 | 备注 |
|------|------|------|
| 主进程入口 | `electron/main.ts` | package.json `main` 指向 `./out/main/index.js`（构建产物） |
| 预加载入口 | `preload/index.ts` | 挂载到主窗口 `webPreferences.preload` |
| 悬浮球预加载 | `electron/floating-ball-preload.ts` | 第二 preload 入口，暴露 `window.floatingBall` 指针事件 |
| 渲染进程入口 | `src/main.ts` → `index.html` | Vue 应用挂载 `#app` |

## 构建配置（electron.vite.config.ts）

`defineConfig` 三个构建目标：

- **main**：`electron/main.ts` → `out/main/index.js`
- **preload**：两个入口 → `out/preload/`
  - `index` ← `preload/index.ts`
  - `floating-ball-preload` ← `electron/floating-ball-preload.ts`
  - 自定义插件 `copyChromeExtensionPreload()`：构建后复制 `electron-chrome-extensions` 的 `chrome-extension-api.preload.js` 到 `out/preload/`
- **renderer**：`root: '.'`，入口 `index.html`；别名 `@` → `src`，`vue` → `vue/dist/vue.esm-bundler.js`；插件 `@vitejs/plugin-vue` + `@tailwindcss/vite` + （仅 dev）`vite-plugin-vue-devtools`；`optimizeDeps.exclude: ['electron-chrome-extensions']`

## 主进程启动序列（electron/main.ts）

0. `bootstrap.ts` 必须第一个 import：解析 `--profile=` / `--profile-selector` 并重定向 `userData`（所有服务的存储根）。
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
- `scripts/pack-mac-quick.js`：`pnpm pack:mac` mac 快速打包。
- `pnpm build:extensions`：先构建 `packages/electron-chrome-extensions` 子包（dev/build 前置步骤）。
- `scripts/plugins-build.js`：把 `resources/plugins/*` 打成 `plugins/*.zip` 内置插件。

## 独立服务入口

- `server/sync-server.mjs`：数据同步后端（`node server/sync-server.mjs [--port 37400] [--dir ./data]`），详见 [public-interfaces.md](public-interfaces.md)。
- `scripts/plugins-server.js`：插件开发本地服务器。
