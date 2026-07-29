[根目录](../CLAUDE.md) > 详情

# 常见问题与导航（根级）

## "我要改 X，该看哪里？"

| 需求 | 入口 |
|------|------|
| UI 界面 | `src/components/`、`src/stores/` |
| 数据处理 / 持久化 | `electron/services/store.ts`（electron-store）或 `electron/services/*-store.ts`（JsonStore） |
| IPC 接口 | 同步改 `preload/index.ts`、`electron/ipc/`、`src/types/index.ts` |
| WebView / 标签页行为 | `electron/services/webview-manager.ts` + `electron/services/webview/` + `src/stores/tab.ts` |
| 代理 | `electron/services/proxy.ts`、`electron/ipc/proxy.ts`、`electron/services/webview/proxy.ts` |
| 新增数据模型 | 同步 `src/types/index.ts`、`electron/services/store.ts`、`preload/index.ts` |
| 分屏 | `src/stores/split.ts`、`src/lib/split-layout.ts`、`electron/ipc/split.ts` |
| 下载 | `electron/services/aria2.ts`、`electron/ipc/download.ts`、`src/stores/download.ts` |
| 扩展 | `electron/services/extensions.ts`、`electron/ipc/extensions.ts` |
| 托盘 | `electron/services/tray.ts`、`electron/services/tray-window.ts` |
| 快捷键 | `electron/services/shortcut-manager.ts`、`src/stores/shortcut.ts` |
| 历史记录 | `src/lib/db.ts`、`src/stores/history.ts` |
| AI 聊天 / Agent | `electron/services/ai-proxy.ts`、`electron/services/ai-proxy-tools.ts`、`electron/ipc/chat.ts`、`src/lib/agent/`、`src/stores/chat.ts`、`src/components/chat/` |
| MCP Server | `electron/services/mcp/`、`electron/ipc/mcp.ts`、`src/stores/mcp.ts` |
| 插件系统 | `electron/services/plugin-*.ts`、`electron/ipc/plugin.ts`、`src/stores/plugin.ts`、`src/components/plugins/` |
| 密码管理 | `electron/services/password-store.ts`、`src/components/passwords/`、`src/stores/password.ts` |
| 网络嗅探 | `electron/ipc/sniffer.ts`、`electron/services/webview/sniffer.ts`、`src/stores/sniffer.ts` |
| 命令面板 | `src/composables/useCommandPalette.ts`、`src/components/command-palette/`、`src/types/command.ts` |
| 技能系统 | `electron/services/skill-store.ts`、`src/lib/agent/tools.ts` |
| 页面内容提取 | `electron/services/page-extractor.ts` |
| 调试器 / 操作录制回放 | `electron/services/debugger.ts`、`action-recorder.ts`、`action-player.ts`、`electron/ipc/debugger.ts`、`electron/debugger-window.html` |
| Favicon 缓存 | `electron/services/favicon-cache.ts` |
| 书签 | `electron/services/bookmark-store.ts`、`src/stores/bookmark.ts`、`src/components/bookmarks/` |

## 关键注意事项

- **数据模型三处同步**：见上表"新增数据模型"。
- **WebView = WebContentsView**：主进程管理生命周期。
- **Partition 隔离**：每容器 `persist:container-{id}`。
- **代理热更新**：改代理后自动刷新使用该代理的标签页。
- **标签冻结**：后台标签超时自动销毁视图保留数据，激活按需重建。
- **下载拦截**：Aria2 启用时经 session `will-download` 拦截 WebView 下载。
- **扩展按 Partition 隔离**。
- **窗口无边框透明**：`frame:false, transparent:true`；拖拽靠 CSS。
- **关闭窗口可配置**：`minimizeOnClose` 决定隐藏到托盘 / 直接退出。
- **内部页面**：`sessionbox://bookmarks`、`history`、`downloads`、`passwords`、`plugins` 等在渲染进程渲染，不走 WebContentsView。
- **数据迁移**：启动时幂等执行 bookmark/password → JsonStore。
- **AI API Key 安全**：仅在主进程组装。
- **IPC 广播**：所有 IPC handle 调用广播到 `pluginEventBus`。
- **Favicon 策略**：本地缓存 → /favicon.ico → icon.horse 兜底，魔术字节校验。

## 已知不一致（旧文档 vs 现状）

- 旧 `CLAUDE.md` 描述的工作流编辑器（`src/lib/workflow/`、workflow store、workflow 组件、preload workflow 命名空间）**已不存在**于当前代码，本文档不再收录。
- 旧文档 preload 称 33 命名空间，实际为 **32**（含 `theme`、`system`、`debugger`，无 workflow 系列）。
