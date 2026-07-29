[根目录](../CLAUDE.md) > **src**

# src/ — 渲染进程

## 简介

Vue 3 渲染进程：UI 渲染、用户交互、Pinia 状态管理（21 Store）、主题（亮/暗 + 6 预设）、布局/分屏、本地历史与 AI 聊天记录（Dexie/IndexedDB）、AI Agent 工具发现、命令面板。通过 `window.api` 与主进程通信。

## 约定（高优先级）

- 组件 `<script setup lang="ts">`；样式 Tailwind 4 + CSS 变量；UI 原语用 `components/ui/`。
- 改模型同步 `types/index.ts` + `services/store.ts` + `preload/index.ts`。
- 订阅 IPC 事件用 `composables/useIpc.ts`（自动清理）。
- 历史/聊天用 Dexie（`lib/db.ts`、`lib/chat-db.ts`）。

> 详见 [claude/conventions.md](claude/conventions.md)。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|------|------|----------|
| [claude/overview.md](claude/overview.md) | 渲染进程形态与取舍 | 了解渲染层时 |
| [claude/conventions.md](claude/conventions.md) | 编码与同步约定 | 写组件前 |
| [claude/module-responsibilities.md](claude/module-responsibilities.md) | components/stores/composables/lib 子域 | 定位目录时 |
| [claude/entrypoints.md](claude/entrypoints.md) | main.ts/App.vue 启动 | 调启动时 |
| [claude/public-interfaces.md](claude/public-interfaces.md) | 内部页面 + 21 Stores + composables + lib | 查 Store/组件时 |
| [claude/dependencies-and-config.md](claude/dependencies-and-config.md) | 依赖、别名 | 升级时 |
| [claude/data-model.md](claude/data-model.md) | types + Dexie + Chat Store 作用域 | 改数据时 |
| [claude/testing-and-quality.md](claude/testing-and-quality.md) | 测试现状、ESLint | 评估质量时 |
| [claude/file-map.md](claude/file-map.md) | 文件清单 | 找文件时 |
| [claude/faq.md](claude/faq.md) | UI 导航与注意点 | 排错时 |
| [claude/changelog.md](claude/changelog.md) | 文档变更记录 | 查历史时 |

## 扫描状态

- 更新时间：2026-07-29 15:39
- 已扫描：`src/` 全部（main/App、types、stores 21、composables 5、lib + agent、components 子目录结构）。
- 纠正：移除工作流（lib/workflow、workflow store、workflow 组件）；stores 校正为 21（含 chat-ui）；components 补 containers/proxy。
- 建议下一步深挖：`components/**` 单个 .vue（250+）。
