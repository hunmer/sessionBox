[根目录](../../CLAUDE.md) > [preload](../CLAUDE.md) > 详情

# preload/ 开发约定

- 新增 IPC 通道：在 `preload/index.ts` 对应命名空间加方法（`ipcRenderer.invoke`），同时加 `electron/ipc/*` handler 与 `src/types/index.ts` 类型。
- 主进程推送事件经 `api.on(event, cb)` 订阅，返回清理函数（组件卸载应调用）。
- 暴露的类型与 `src/types/index.ts`、`electron/services/store.ts` 保持一致。
- 调试器相关 API 在 `api.debugger` 命名空间，对应独立调试器窗口与 IPC。
