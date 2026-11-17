[根目录](../CLAUDE.md) > 详情

# 根目录文件地图

## 关键配置与文档

| 路径 | 说明 |
|------|------|
| `package.json` | 依赖与脚本（pnpm@10.17.1） |
| `pnpm-lock.yaml` / `package-lock.json` | 锁文件 |
| `electron.vite.config.ts` | 构建配置（main / preload 2 入口 / renderer） |
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
| `scripts/` | 构建脚本（build-production.js / pack-mac-quick.js / plugins-build.js / plugins-server.js） | — |
| `resources/` | 图标 + `resources/plugins/`（7 个内置 AI 网关插件源码，mjs/py） | — |
| `packages/` | vendored workspace 子包 `electron-chrome-extensions`（GPL 魔改） | 上游 README |
| `server/` | 数据同步后端（sync-server.mjs + node:test + README） | [server/README.md](../server/README.md) |
| `plugins/` | 内置插件构建产物（zip + plugins.json，由 resources/plugins 构建） | — |
| `docs/` | 设计文档（3 篇）+ 功能依赖图谱（feature_map.json/.html） | — |
| `plans/` | 动画体系实施规划（6 篇） | — |
| `build/` | 构建辅助 | — |
| `win_packages/` `mac_packages/` | 平台附带二进制（aria2） | — |
| `test-assets/` | 测试素材（chrome-popup-demo） | — |
| `out/` `dist-app/` | 构建产物（git 忽略类） | — |

## 历史规划文档（docs/）

`docs/` 现存少量设计文档（`page-container-model.md`、`switch-binding.md` 等 3 篇）与功能依赖图谱 `feature_map.json/.html`；旧 `docs/superpowers/**` 已删除。

## 历史任务文件（仓库根，非文档约定产物）

`task_plan.md`、`eslint-report.md` 为过往流程的临时产物，非项目正式文档；`tmp-analysis/`、`tmp/` 为临时分析目录（未 tracked）。
