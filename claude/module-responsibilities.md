[根目录](../CLAUDE.md) > 详情

# 模块职责（根级视角）

仓库为单包（monorepo 无），主代码分布在 4 个核心目录 + 辅助目录。

## 核心模块

| 模块 | 目录 | 语言 | 职责 | 入口 |
|------|------|------|------|------|
| 主进程 | `electron/` | TypeScript | 应用生命周期、多 Profile 启动、窗口、WebContentsView、IPC（20 模块）、持久化、代理、协议、扩展、Aria2、托盘、更新、快捷键、AI 代理、MCP、插件、密码/Favicon/技能存储、页面提取、操作录制回放、同步客户端 | `electron/main.ts` |
| 预加载 | `preload/` | TypeScript | `contextBridge` 暴露 `window.api`（36 命名空间）+ 类型导出 | `preload/index.ts` |
| 渲染进程 | `src/` | TypeScript + Vue | UI、Pinia（23 Store）、AI Agent、Dexie 历史/聊天 | `src/main.ts` |
| 同步后端 | `server/` | JavaScript | 免密 JSON 快照同步服务（node 原生 http） | `server/sync-server.mjs` |
| 扩展宿主子包 | `packages/electron-chrome-extensions/` | TypeScript | vendored Chrome 扩展支持库（GPL 魔改，workspace 引用） | 包内 `src/index.ts` |
| 构建脚本 | `scripts/` | JavaScript | 生产打包、mac 快速打包、插件构建、插件本地服务器 | `scripts/build-production.js` |

## 辅助资源

| 目录/文件 | 说明 |
|-----------|------|
| `resources/` | 应用/托盘图标 + `resources/plugins/`（7 个内置 AI 网关插件源码：doubao/qianwen/gemini/jimeng/liblib/dola/l0veyou-api） |
| `docs/` | 设计文档（3 篇）+ 功能依赖图谱 `feature_map.json/.html` |
| `plugins/` | 内置插件构建产物（zip + `plugins.json` manifest） |
| `plans/` | 动画体系实施规划（6 篇） |
| `win_packages/` `mac_packages/` | 平台附带二进制（aria2 等） |
| `test-assets/` | Chrome 扩展测试素材（chrome-popup-demo） |
| `electron-builder.json` | DMG(Mac) / NSIS(Win) 打包配置 |
| `electron.vite.config.ts` | main / preload（2 入口） / renderer 构建配置 |
| `tsconfig*.json` | 根 + node + web 三套 TS 配置 |
| `eslint.config.js` | ESLint flat 配置 |

## 子域划分

- **主进程** 子域：`electron/ipc/`（20 个 IPC 模块）、`electron/services/`（40+ 服务，含 `mcp/`、`webview/`、`plugin-*`、`external-auth-*`、`sync-*`）、`electron/utils/`（json-store / user-agent）、`electron/composables/`（useAutoUpdater）、`electron/floating-ball-preload.ts`（悬浮球第二预加载）。
- **渲染进程** 子域：`src/components/`（18 个业务子目录 + `ui/` 204 个基础组件）、`src/stores/`（23 Store）、`src/composables/`（7 个）、`src/lib/`（含 `agent/`）、`src/types/`、`src/styles/`。
