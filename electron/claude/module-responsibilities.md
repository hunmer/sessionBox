[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 模块职责

## 子目录

| 子目录 | 职责 |
|--------|------|
| `electron/ipc/` | IPC handler 注册（30+ 模块，`ipc/index.ts` 聚合 + 各专项文件） |
| `electron/services/` | 30+ 服务（持久化、webview、代理、扩展、下载、托盘、更新、快捷键、AI、MCP、插件、密码、Favicon、技能、页面提取、调试器、操作录制/回放等） |
| `electron/services/webview/` | webview-manager 委托子模块（types/blocked-protocols/proxy/events/freeze/sniffer/zoom） |
| `electron/services/ai-proxy/` | AI 代理子目录（当前仅 `handlers/` 空目录） |
| `electron/services/mcp/` | MCP Server（server/types + tools/index|query|tab|cdp|window） |
| `electron/utils/` | 通用工具（`json-store.ts`、`user-agent.ts`） |
| `electron/composables/` | `useAutoUpdater.ts` |

## 调试器资产

| 文件 | 用途 |
|------|------|
| `electron/debugger-window.html` | 调试器窗口 HTML（构建时复制到 out/preload） |
| `electron/debugger-replay.html` | rrweb 回放窗口 HTML |
| `electron/debugger-preload.ts` | 调试器预加载 |
| `electron/debugger-replay-preload.ts` | 回放预加载 |
| `electron/debugger-assets/` | 调试器静态资源 |

## 核心能力清单

应用生命周期、单实例锁、协议注册、默认浏览器、窗口状态持久化、WebContentsView 生命周期、标签冻结、IPC（30+）、electron-store 持久化、JsonStore 持久化、数据迁移、代理测试与热更新、自定义协议（sessionbox/account-icon/extension-icon/site-icon/screenshot）、Chrome 扩展按 partition 加载、Aria2 下载拦截、系统托盘与任务栏窗口、自动更新、全局/本地快捷键、第三方协议拦截、AI 代理网关（SSE + tool_use 多轮 + 30+ 工具）、MCP Server（SSE 9527）、插件系统（加载/卸载/启用/禁用/ZIP 导入/URL 安装/事件总线/独立存储）、密码/笔记、技能存储（Markdown + JS 代码块）、Favicon 缓存（魔术字节验证）、页面内容提取（Readability/Turndown）、网络嗅探、搜索引擎管理、rrweb 录制/回放、操作录制/回放。
