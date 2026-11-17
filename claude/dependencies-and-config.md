[根目录](../CLAUDE.md) > 详情

# 关键依赖与配置

## 核心依赖（package.json）

| 依赖 | 用途 |
|------|------|
| `electron` ^44 | 应用框架 |
| `electron-store` ^8 | 核心结构化数据持久化（JSON 文件） |
| `electron-chrome-extensions` `workspace:*` | Chrome 扩展运行时（**vendored 子包** `packages/electron-chrome-extensions`，GPL，按 partition 隔离） |
| `electron-updater` ^6 | 自动更新（devDependency） |
| `@electron-toolkit/utils` / `@electron-toolkit/preload` | Electron 应用工具 |
| `@modelcontextprotocol/sdk` ^1.29 | MCP Server SDK |
| `@langchain/anthropic` + `langchain` + `zod` ^4 | LangChain / AI 框架 / 运行时校验（MCP 工具参数） |
| `@hunmer/procm-mcp-sdk` | 进程管理控制台（主进程 `services/procm.ts`） |
| `@mozilla/readability` + `turndown` | 页面正文提取 / HTML→Markdown |
| `eventemitter2` | 插件事件总线 |
| `adm-zip` | ZIP 解压（插件导入） |
| `queue` | 并发队列（书签健康检查） |
| `dexie` ^4.4 | IndexedDB 封装（历史 / 聊天） |
| `vue` ^3.5 | UI 框架 |
| `pinia` ^2.3 | 状态管理 |
| `radix-vue` / `reka-ui` | 无障碍 UI 原语 |
| `lucide-vue-next` | 图标 |
| `vuedraggable` ^4.1 | 拖拽排序 |
| `tailwind-merge` + `clsx` + `class-variance-authority` | 样式工具 |
| `@vueuse/core` | Vue 组合函数工具 |
| `tailwindcss` ^4.1 | CSS 框架 |
| `motion-v` | 动画（标签页进出场等，配套 `plans/` 动画规划） |
| `vue-sonner` | Toast 通知 |
| `vue-stream-markdown` | Markdown 流式渲染（AI 聊天） |
| `vue3-emoji-picker` / `vue-waterfall-plugin-next` | 聊天表情 / 瀑布流 |
| `@vue-flow/*`（5 包） + `@dagrejs/dagre` | ⚠ 已无代码引用（工作流 UI 移除后遗留），候选移除 |

> 构建侧 devDep：`electron-vite` ^3、`vite` ^6、`@vitejs/plugin-vue`、`@tailwindcss/vite`、`vite-plugin-static-copy`、`vite-plugin-vue-devtools`、`electron-builder` ^26、`typescript` ~5.7、`eslint` ^10 + `typescript-eslint` + `eslint-plugin-vue`。

## 配置文件

| 文件 | 作用 |
|------|------|
| `electron.vite.config.ts` | main / preload(2 入口) / renderer 构建配置 |
| `pnpm-workspace.yaml` | workspace：`packages/electron-chrome-extensions` |
| `electron-builder.json` | 打包配置（DMG / NSIS） |
| `electron-builder-local.json` | 本地打包变体 |
| `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json` | 三套 TS 配置 |
| `eslint.config.js` | ESLint flat 配置 |
| `components.json` | shadcn-vue 组件配置 |
| `index.html` | 渲染进程 HTML 入口 |
| `.gitignore` | 忽略 node_modules / dist / out 等 |

## 环境与兼容

- 包管理器：**pnpm@10.17.1**（`packageManager` 字段固定）。
- `pnpm.onlyBuiltDependencies`：`electron`、`esbuild`、`vue-demi`。
- Node：推荐 LTS（TS 测试文件依赖 Node 22+ 原生类型剥离运行 `node --test`）。
- 平台：Windows（主）、macOS；附带 `win_packages/aria2`、`mac_packages/aria2`。
