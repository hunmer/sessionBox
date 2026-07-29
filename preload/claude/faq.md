[根目录](../../CLAUDE.md) > [preload](../CLAUDE.md) > 详情

# preload/ 常见问题

- **新增 IPC 通道**：在 `index.ts` 对应命名空间加 `ipcRenderer.invoke` 方法 → 加 `electron/ipc/*` handler → 加 `src/types/index.ts` 类型。
- **订阅主进程事件**：用 `api.on('on:...', cb)`，记得在组件卸载时调用返回的清理函数（或用 `src/composables/useIpc.ts`）。
- **调试器 API**：在 `api.debugger`，对应独立调试器窗口（非 `window.api` 的常规标签通道）。
- **旧文档称 33 命名空间有误**：实际为 32（含 `theme/system/debugger`，无 workflow 系列）。
