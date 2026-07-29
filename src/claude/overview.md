[根目录](../../CLAUDE.md) > [src](../CLAUDE.md) > 详情

# src/ 架构总览

Vue 3 **渲染进程**：UI 渲染、用户交互、通过 `window.api` 与主进程通信、Pinia 状态管理（21 Store）、主题切换、布局管理、本地历史与 AI 聊天记录（Dexie）、AI Agent 工具发现、命令面板。

## 运行时形态

- 入口 `src/main.ts`：创建 Vue 实例 → 装 Pinia → 挂载 `#app`；`App.vue` 三面板布局，`onMounted` 并行初始化 Store。
- WebView 由主进程 `WebContentsView` 承载；渲染进程负责覆盖层检测（`lib/webview-overlay.ts`）、bounds 请求、标签栏布局。
- 内部页面（`sessionbox://bookmarks|history|downloads|passwords|plugins` 等）在渲染进程渲染，不走 WebContentsView。
- 主题：亮/暗 + 6 种预设（`stores/theme.ts` + `styles/globals.css` CSS 变量）。

## 设计取舍

- Store 采用 Composition API 风格，本地缓存 + IPC 同步；标签 Store 监听 `on:tab:*` 事件。
- Chat Store 设计为可参数化的多作用域工厂（`scope`），见 `docs/chat-store-scoped-redesign.md`。
- Agent 工具：业务工具由主进程执行，模型侧默认仅暴露工具发现工具（`lib/agent/tools.ts` 四层披露）。
- **工作流编辑器已移除**：旧的 `lib/workflow/`、workflow store、workflow 组件目录均不存在。
