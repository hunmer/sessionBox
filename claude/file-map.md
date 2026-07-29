[根目录](../CLAUDE.md) > 详情

# 根目录文件地图

## 关键配置与文档

| 路径 | 说明 |
|------|------|
| `package.json` | 依赖与脚本（pnpm@10.17.1） |
| `pnpm-lock.yaml` / `package-lock.json` | 锁文件 |
| `electron.vite.config.ts` | 构建配置（main / preload 3 入口 / renderer） |
| `electron-builder.json` / `electron-builder-local.json` | 打包配置 |
| `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json` | TS 配置 |
| `eslint.config.js` | ESLint flat 配置 |
| `components.json` | shadcn-vue 配置 |
| `index.html` | 渲染进程 HTML 入口 |
| `.gitignore` | 忽略规则 |
| `README.md` | 项目说明 + 快速开始 |
| `DESIGN.md` | MiniMax 风格设计系统 |
| `CLAUDE.md` | 本 AI 上下文索引 |
| `claude/` | 本详情目录 |

## 顶层目录

| 目录 | 说明 | 子文档 |
|------|------|--------|
| `electron/` | 主进程 | [electron/CLAUDE.md](../electron/CLAUDE.md) |
| `preload/` | 预加载 | [preload/CLAUDE.md](../preload/CLAUDE.md) |
| `src/` | 渲染进程 | [src/CLAUDE.md](../src/CLAUDE.md) |
| `scripts/` | 构建脚本（build-production.js / plugins-build.js / plugins-server.js） | — |
| `resources/` | 图标、示例插件 | — |
| `plugins/` | 示例插件源（group-tab-filter、test-plugin） | — |
| `docs/` | 设计文档与规划（含 `docs/superpowers/`） | — |
| `build/` | 构建辅助 | — |
| `win_packages/` `mac_packages/` | 平台附带二进制（aria2） | — |
| `test-assets/` | 测试素材（chrome-popup-demo） | — |
| `out/` `dist-app/` | 构建产物（git 忽略类） | — |

## 历史规划文档（docs/）

`docs/` 含若干功能设计文档，例如：
- `docs/page-container-model.md`、`docs/switch-binding.md`、`docs/chat-store-scoped-redesign.md`
- `docs/superpowers/specs/*`（设计稿）、`docs/superpowers/plans/*`（实施计划）

## 历史任务文件（仓库根，非文档约定产物）

`findings.md`、`progress.md`、`task_plan.md`、`eslint-report.{json,md}` 为过往流程的临时产物，非项目正式文档。
