[根目录](../CLAUDE.md) > 详情

# 对外接口（根级）

本文件只列**跨进程 / 跨系统 / 对外**的接口；模块内部 IPC 详情见 [electron/public-interfaces.md](../electron/claude/public-interfaces.md)，渲染进程内部页面与 Store 见 [src/public-interfaces.md](../src/claude/public-interfaces.md)。

## 自定义协议

| 协议 | 用途 | 注册位置 |
|------|------|----------|
| `sessionbox://openContainer?id={containerId}` | 深度链接，桌面快捷方式直接打开容器 | `main.ts`（`setAsDefaultProtocolClient`） |
| `account-icon://{filename}` | 账号/容器自定义图标（`userData/container-icons/`） | `main.ts` |
| `extension-icon://{extensionId}` | Chrome 扩展图标 | `main.ts` |
| `site-icon://{domain}` | 网站图标（本地缓存 + 自动下载兜底） | `main.ts` + `services/favicon-cache.ts` |
| `screenshot://{filename}` | AI 截图（`userData/ai-screenshots/`） | `main.ts` |

> 另注册一批第三方协议（`BLOCKED_SCHEMES`，见 `electron/services/webview/blocked-protocols.ts`）返回 204，阻止网站唤起外部应用弹窗。

## 默认浏览器

- 可注册为系统默认浏览器（http/https 处理器）。Windows 走 `services/default-browser.ts`。
- 外部 http/https 链接：聚焦主窗口 → `webContents.send('on:open-external-url', url)` → 渲染进程用默认容器开新 tab。

## MCP Server（对外 HTTP+SSE 端点）

- 默认端口 **9527**，按需启动/停止（`getMcpEnabled()`）。
- `GET /sse` 握手 + `POST /messages?sessionId=...`。
- 暴露约 20 个工具：浏览器/工作区/书签查询、标签页控制、JS/CDP 执行、截图、独立窗口管理。详见 [electron/claude/data-model.md](../electron/claude/data-model.md)。
- 实现在 `electron/services/mcp/`，启停 IPC：`mcp:start` / `mcp:stop` / `mcp:get-status`。

## IPC 通信契约（高层）

- 渲染进程通过 `window.api.{namespace}.{method}` 调用（32 个命名空间，见 [preload/claude/public-interfaces.md](../preload/claude/public-interfaces.md)）。
- 主进程→渲染进程推送：`webContents.send('on:...')`，事件前缀统一 `on:`。
- 所有 IPC handle 调用经包装层广播 `ipc:{channel}` 到 `pluginEventBus`，供插件监听。

## 协议 URL 入口路径

- 协议 URL 与外部链接统一经 `handleProtocolUrl` / `handleExternalUrl`（`electron/main.ts`）流入主窗口。
