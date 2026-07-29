[根目录](../../CLAUDE.md) > [preload](../CLAUDE.md) > 详情

# preload/ 入口与启动

- **入口**：`preload/index.ts`（构建产物 `out/preload/index.js`）。
- 加载时机：主窗口 `new BrowserWindow({ webPreferences: { preload, sandbox:false } })`。
- `contextBridge.exposeInMainWorld('api', api)` 将 IPC API 挂到 `window.api`。
- 构建入口由 `electron.vite.config.ts` 的 `preload` 段定义（含 `index` 与两个调试器入口）；自定义插件还会复制 `chrome-extension-api.preload.js`。
