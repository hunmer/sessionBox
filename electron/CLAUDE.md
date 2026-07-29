[根目录](../CLAUDE.md) > **electron**

# electron/ — 主进程

## 简介

Electron 主进程：应用生命周期、窗口、`WebContentsView`（标签页 WebView）生命周期、IPC（30+ 模块）、数据持久化（electron-store + JsonStore）、代理、自定义协议、Chrome 扩展、Aria2 下载、系统托盘、自动更新、快捷键、标签冻结、AI 代理网关（API Key 中转 + SSE + tool_use 多轮）、MCP Server、插件系统、密码/Favicon/技能存储、页面提取、rrweb 调试器与操作录制/回放。

## 约定（高优先级）

- 改 IPC 须同步 `preload/index.ts` + `electron/ipc/*` + `src/types/index.ts`；改模型须同步 `services/store.ts` + `src/types/index.ts` + `preload/index.ts`。
- 主进程→渲染进程推送统一 `on:` 前缀；新逻辑优先放 `webview/` 子模块。
- WebView 操作走 `webviewManager` 单例；AI Key 仅在 `ai-proxy` 组装。
- MCP 工具按类分文件（`mcp/tools/*`）；第三方协议屏蔽用 `webview/blocked-protocols.ts`。

> 详见 [claude/conventions.md](claude/conventions.md)。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|------|------|----------|
| [claude/overview.md](claude/overview.md) | 主进程运行时形态、设计取舍 | 了解主进程时 |
| [claude/conventions.md](claude/conventions.md) | IPC/模型同步、编码约定 | 改主进程代码前 |
| [claude/module-responsibilities.md](claude/module-responsibilities.md) | ipc/services/utils 子域 + 调试器资产 | 定位子目录时 |
| [claude/entrypoints.md](claude/entrypoints.md) | main.ts 启动序列、关键 init | 调启动时 |
| [claude/public-interfaces.md](claude/public-interfaces.md) | 全部 IPC 通道 + 主进程→渲染事件 | 改/查接口时 |
| [claude/dependencies-and-config.md](claude/dependencies-and-config.md) | 依赖、路径与参数约定 | 配置时 |
| [claude/data-model.md](claude/data-model.md) | store.ts schema + JsonStore + Skill + MCP 工具 | 改数据时 |
| [claude/testing-and-quality.md](claude/testing-and-quality.md) | 测试现状、质量风险 | 评估质量时 |
| [claude/file-map.md](claude/file-map.md) | 入口/IPC/服务文件清单 | 找文件时 |
| [claude/faq.md](claude/faq.md) | 服务层导航与注意点 | 排错时 |
| [claude/changelog.md](claude/changelog.md) | 模块文档变更记录 | 查历史时 |

## 扫描状态

- 更新时间：2026-07-29 15:39
- 已扫描：`electron/` 全部（main、ipc/、services/ 含 webview/·ai-proxy/·mcp/、utils/、composables/、调试器资产）。
- 纠正：webview-manager 拆分；补录调试器/操作录制回放；store.ts schema 补全。
