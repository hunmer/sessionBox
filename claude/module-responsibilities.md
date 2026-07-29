[根目录](../CLAUDE.md) > 详情

# 模块职责（根级视角）

仓库为单包（monorepo 无），主代码分布在 4 个核心目录 + 辅助目录。

## 核心模块

| 模块 | 目录 | 语言 | 职责 | 入口 |
|------|------|------|------|------|
| 主进程 | `electron/` | TypeScript | 应用生命周期、窗口、WebContentsView、IPC（30+ 模块）、持久化、代理、协议、扩展、Aria2、托盘、更新、快捷键、AI 代理、MCP、插件、密码/Favicon/技能存储、页面提取、调试器与操作录制回放 | `electron/main.ts` |
| 预加载 | `preload/` | TypeScript | `contextBridge` 暴露 `window.api`（32 命名空间）+ 类型导出 | `preload/index.ts` |
| 渲染进程 | `src/` | TypeScript + Vue | UI、Pinia（21 Store）、AI Agent、Dexie 历史/聊天 | `src/main.ts` |
| 构建脚本 | `scripts/` | JavaScript | 生产打包、插件构建、插件本地服务器 | `scripts/build-production.js` |

## 辅助资源

| 目录/文件 | 说明 |
|-----------|------|
| `resources/` | 应用图标、托盘图标、示例插件 |
| `docs/` | 设计文档与功能规划（含 `docs/superpowers/`） |
| `plugins/` | 示例插件源（group-tab-filter、test-plugin） |
| `win_packages/` `mac_packages/` | 平台附带二进制（aria2 等） |
| `electron-builder.json` | DMG(Mac) / NSIS(Win) 打包配置 |
| `electron.vite.config.ts` | main / preload（含 3 个入口） / renderer 构建配置 |
| `tsconfig*.json` | 根 + node + web 三套 TS 配置 |
| `eslint.config.js` | ESLint flat 配置 |

## 子域划分

- **主进程** 子域：`electron/ipc/`（IPC handlers）、`electron/services/`（30+ 服务，含 `ai-proxy/`、`mcp/`、`webview/`、`plugin-*`）、`electron/utils/`（json-store / user-agent）、`electron/composables/`（useAutoUpdater）、调试器窗口（`electron/debugger-*.html`、`electron/debugger-preload.ts`）。
- **渲染进程** 子域：`src/components/`（15 个业务子目录 + `ui/`）、`src/stores/`（21 Store）、`src/composables/`（5 个）、`src/lib/`（含 `agent/`）、`src/types/`、`src/styles/`。
