[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 架构总览

Electron **主进程**，承担除 UI 渲染外的全部系统职责：应用生命周期、多 Profile 启动、窗口、WebContentsView、IPC、持久化、代理、协议、扩展、下载、托盘、更新、快捷键、AI 代理网关、MCP Server、插件、密码/Favicon/技能存储、页面提取、数据同步、操作录制/回放、悬浮球。

## 运行时形态

- 单实例（`requestSingleInstanceLock`），协议 URL / 外部链接经 `second-instance`（Win）/ `open-url`（macOS）流入。
- 主窗口**无边框透明**，状态持久化（位置/大小/最大化）。
- WebView 由 `webviewManager` 单例统一管理 `WebContentsView`；后台标签超时可冻结（销毁视图、留数据，按需重建）。
- 操作录制/回放走 `action-recorder/player` + `ipc/debugger.ts`（独立调试器窗口与 `services/debugger.ts` 已移除）；悬浮球是独立小窗 + 第二预加载入口（`floating-ball-preload.ts`）。

## 设计取舍

- **webview-manager 已拆分**：`webview-manager.ts` 保留单例与会话状态，逻辑委托给 `webview/` 子模块（types/blocked-protocols/proxy/events/freeze/sniffer/zoom）。
- **AI Key 安全中转**：`ai-proxy.ts` 组装 Key、解析 SSE、驱动 tool_use 多轮；工具执行在 `ai-proxy-tools.ts`。`ai-proxy/handlers/` 目录当前为空。
- **IPC 广播**：所有 handle 调用经包装层广播 `ipc:{channel}` 到 `pluginEventBus`。
- **数据分层**：electron-store（核心）+ JsonStore（书签/密码/插件）+ 启动时幂等迁移（`migration.ts`）。
- **操作录制/回放**：确定性录制/回放（`action-recorder`/`action-player`，定位符驱动，经 `ipc/debugger.ts` 18 通道）；rrweb 双窗口系统已随调试器窗口一并移除。
