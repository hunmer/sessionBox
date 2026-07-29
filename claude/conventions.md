[根目录](../CLAUDE.md) > 详情

# 开发约定

## 常用命令

```bash
pnpm install          # 安装依赖（包管理器固定为 pnpm@10.17.1）
pnpm dev              # 开发模式（热重载，electron-vite dev）
pnpm build            # 构建（main + preload + renderer）
pnpm preview          # 预览构建结果
pnpm pack             # 生产打包（scripts/build-production.js local）
pnpm pack:release     # 发布打包
pnpm pack:dir         # 仅打包目录（不生成安装包）
```

> 无测试命令、无 lint 脚本入口（见 [testing-and-quality.md](testing-and-quality.md)）。

## 高优先级约定（对 Agent 最重要）

- **语言全栈 TypeScript**：主进程 / 预加载 / 渲染进程均用 TS；Vue 组件用 `<script setup lang="ts">`。
- **数据模型三处同步**：改领域模型时必须同步 `src/types/index.ts`、`electron/services/store.ts`、`preload/index.ts`。
- **IPC 三处同步**：改 IPC 通道时必须同步 `preload/index.ts`（暴露）、`electron/ipc/*`（handler）、`src/types/index.ts`（类型）。
- **窗口为无边框**（`frame:false, transparent:true`）：拖拽靠 CSS `-webkit-app-region: drag`；关闭行为由 `minimizeOnClose` 配置。
- **WebView = WebContentsView**：由主进程 `webviewManager` 管理，不要用 `<webview>` 标签；逻辑拆在 `electron/services/webview/` 子模块。
- **Partition 隔离**：每个容器 `persist:container-{id}`；扩展按 partition 隔离加载。
- **AI API Key 仅在主进程**：渲染进程永远不直接持有 Key。
- **不主动执行 git**：本仓库由人工提交。

## 代码风格

- 样式：Tailwind CSS 4 + CSS 变量主题（6 种预设：默认 / Apple / Google / Tesla / Spotify / NVIDIA）。
- 组件库：基于 Radix Vue / reka-ui 的 shadcn-vue 组件（`src/components/ui/`）。
- 图标：`lucide-vue-next`，动态解析器在 `src/lib/lucide-resolver.ts`。
- 状态管理：Pinia Composition API 风格，21 个 Store。
- 拖拽排序：`vuedraggable`（分组/标签页）+ 自定义拖拽协议（书签）。
- 持久化分层：electron-store（核心）/ JsonStore（书签·密码·插件）/ Dexie（历史·聊天）/ 文件目录（图标·截图·技能）。
- 下载：Aria2 RPC，内置 aria2c 二进制（Windows）。
- 扩展：`electron-chrome-extensions`。
- AI 代理：主进程 `ai-proxy` SSE 流 + tool_use 多轮循环；`@langchain/anthropic` + `langchain`。
- MCP Server：`@modelcontextprotocol/sdk`，SSE 传输，默认端口 **9527**。
- 调试器：rrweb（CDN 注入录制/回放）+ 操作录制/回放（`action-recorder`/`action-player`）。

## ESLint 规则要点（`eslint.config.js`）

- 忽略：`node_modules/ out/ dist/ resources/ scripts/ *.config.{js,ts} *.json`。
- `max-lines: warn 1000`（跳空行/注释）。
- `max-lines-per-function: warn 200`（跳空行/注释，非 IIFE）。
- 放宽：`@typescript-eslint/no-explicit-any` off、`no-unused-vars` off、`no-empty` 允许空 catch 等。

## 设计规范参考

- `DESIGN.md`：MiniMax 风格设计系统灵感（配色、字体、圆角、阴影、间距）。
- `README.md`：项目结构与快速开始。
- `docs/`：功能规划与设计文档（`docs/superpowers/specs/*`、`docs/superpowers/plans/*`）。
