[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 模块职责

## 子目录

| 子目录 | 职责 |
|--------|------|
| `electron/ipc/` | IPC handler 注册（20 模块，`ipc/index.ts` 聚合 + 各专项文件） |
| `electron/services/` | 50+ 文件（持久化、webview/、代理、扩展、下载、托盘、更新、快捷键、AI、MCP、插件、密码、Favicon、技能、页面提取、操作录制/回放、sync-*、external-auth-*、procm 等） |
| `electron/services/webview/` | webview-manager 委托子模块（types/blocked-protocols/proxy/events/freeze/sniffer/zoom） |
| `electron/services/ai-proxy/` | AI 代理子目录（当前仅 `handlers/` 空目录） |
| `electron/services/mcp/` | MCP Server（server/types + tools/index|query|tab|cdp|window） |
| `electron/utils/` | 通用工具（`json-store.ts`、`user-agent.ts`） |
| `electron/composables/` | `useAutoUpdater.ts` |

## 调试器资产

| 文件 | 用途 |
|------|------|
| `electron/floating-ball-preload.ts` | 悬浮球第二预加载入口（构建到 out/preload，暴露 `window.floatingBall` 指针事件） |

## 核心能力清单

应用生命周期、多 Profile 启动（bootstrap 重定向 userData）、单实例锁、协议注册、默认浏览器、窗口状态持久化、WebContentsView 生命周期、标签冻结、IPC（20 模块）、electron-store 持久化、JsonStore 持久化、数据迁移、代理测试与热更新、自定义协议（sessionbox/account-icon/extension-icon/site-icon/screenshot）、Chrome 扩展按 partition 加载（vendored 子包）、Aria2 下载拦截、系统托盘与任务栏窗口、自动更新、全局/本地快捷键、第三方协议拦截、AI 代理网关（SSE + tool_use 多轮 + 30+ 工具）、MCP Server（SSE 9527）、插件系统（加载/卸载/启用/禁用/ZIP 导入/URL 安装/事件总线/独立存储）、密码/笔记、技能存储（Markdown + JS 代码块）、Favicon 缓存（魔术字节验证）、页面内容提取（Readability/Turndown）、网络嗅探、搜索引擎管理、数据同步（sync-store/sync-cookies ↔ server/sync-server.mjs）、操作录制/回放、悬浮球。
