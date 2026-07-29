[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 文件清单

## 入口与 IPC

| 文件 | 说明 |
|------|------|
| `electron/main.ts` | 主进程入口（启动序列、协议、窗口、托盘、快捷键、MCP、更新） |
| `electron/ipc/index.ts` | IPC 聚合 + 广播代理包装 + 工作区/分组/容器/页面/书签/密码/搜索引擎/技能/窗口/设置/静音站点 |
| `electron/ipc/tab.ts` | 标签 IPC（WebView+数据+导航+代理+截图+缩放） |
| `electron/ipc/proxy.ts` | 代理 IPC（含热更新） |
| `electron/ipc/split.ts` `download.ts` `extensions.ts` `updater.ts` `shortcut.ts` `bookmark-check.ts` `sniffer.ts` | 各域 IPC |
| `electron/ipc/chat.ts` | AI 聊天/Agent/浏览器交互 IPC |
| `electron/ipc/ai-provider.ts` | AI 供应商 IPC |
| `electron/ipc/mcp.ts` `plugin.ts` | MCP / 插件 IPC |
| `electron/ipc/debugger.ts` | 调试器/操作录制回放 IPC（18 通道） |

## 服务（services/）

| 文件 | 说明 |
|------|------|
| `services/store.ts` | electron-store 持久化（25 schema keys + 模型 + getter/setter） |
| `services/bookmark-store.ts` `password-store.ts` | JsonStore 独立存储 |
| `services/skill-store.ts` | 技能 Markdown 存储 |
| `services/webview-manager.ts` | WebContentsView 生命周期单例 |
| `services/webview/` | types/blocked-protocols/proxy/events/freeze/sniffer/zoom 子模块 |
| `services/proxy.ts` | 代理测试与配置 |
| `services/extensions.ts` | 扩展管理（按 partition） |
| `services/aria2.ts` | Aria2 下载 |
| `services/tray.ts` `tray-window.ts` | 托盘 / 托盘窗口 |
| `services/shortcut-manager.ts` | 快捷键 |
| `services/bookmark-checker.ts` | 书签健康检查 |
| `services/favicon-cache.ts` | Favicon 缓存 |
| `services/page-extractor.ts` | 页面内容提取 |
| `services/default-browser.ts` | 默认浏览器注册（Win） |
| `services/migration.ts` | 数据迁移 |
| `services/ai-proxy.ts` | AI 代理网关（SSE、tool_use 多轮） |
| `services/ai-proxy-tools.ts` | AI 工具执行（浏览器/页面/窗口/技能/JS 注入） |
| `services/mcp/` | server.ts / types.ts / tools/(index\|query\|tab\|cdp\|window).ts |
| `services/plugin-manager.ts` `plugin-context.ts` `plugin-storage.ts` `plugin-event-bus.ts` `plugin-types.ts` | 插件系统 |
| `services/debugger.ts` | rrweb 录制/回放（CDN 注入） |
| `services/action-recorder.ts` `action-player.ts` | 操作录制 / 回放 |

## 工具与 composables

| 文件 | 说明 |
|------|------|
| `utils/json-store.ts` | 通用 JSON 文件存储 |
| `utils/user-agent.ts` | UA 管理 |
| `composables/useAutoUpdater.ts` | 自动更新 composable |
