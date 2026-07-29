[根目录](../../CLAUDE.md) > [preload](../CLAUDE.md) > 详情

# preload/ 架构总览

Electron **预加载脚本**，运行在渲染进程的隔离上下文，通过 `contextBridge` 安全地把 IPC API 暴露为 `window.api`。是主进程与渲染进程唯一的通信桥梁。

- 入口 `preload/index.ts`，在主窗口创建时经 `webPreferences.preload` 加载。
- 类型声明在 `preload/index.d.ts`（`IpcAPI` 接口）。
- 另有调试器专用预加载（`electron/debugger-preload.ts`、`debugger-replay-preload.ts`），属独立窗口，不在本目录。

## 设计取舍

- 暴露的 API 与主进程 handler 一一对应；新增 IPC 须三处同步（`preload/index.ts` ↔ `electron/ipc/*` ↔ `src/types/index.ts`）。
- 预加载只做桥接，不持有业务状态。
