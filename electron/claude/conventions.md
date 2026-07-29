[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 开发约定

- 改 IPC 通道须同步 `preload/index.ts`（暴露）、`electron/ipc/*`（handler）、`src/types/index.ts`（类型）。
- 改数据模型须同步 `electron/services/store.ts`、`src/types/index.ts`、`preload/index.ts`。
- 主进程→渲染进程推送统一用 `webContents.send('on:...')`，前缀 `on:`。
- WebView 操作走 `webviewManager` 单例；新逻辑优先放入 `webview/` 子模块，避免 manager 膨胀。
- 新 IPC handler 注册在对应 `electron/ipc/*.ts`，并经 `ipc/index.ts` 聚合（或独立 register 函数如 `registerDownloadIpcHandlers`）。
- 自定义协议 scheme 必须在 app ready 前 `registerSchemesAsPrivileged`。
- 第三方协议屏蔽用 `webview/blocked-protocols.ts` 的 `BLOCKED_SCHEMES`，统一返回 204。
- AI 工具实现放 `ai-proxy-tools.ts`（浏览器/页面/窗口/技能/JS 注入），勿在渲染进程组装 Key。
- MCP 工具按类别分文件（`mcp/tools/query|tab|cdp|window.ts`），在 `mcp/tools/index.ts` 聚合 `registerAllTools`。
