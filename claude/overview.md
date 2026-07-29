[根目录](../CLAUDE.md) > 详情

# 架构总览

## 一句话定位

SessionBox 是一个基于 **Electron + Vue 3** 的**多账号浏览器管理桌面应用**：用 `partition` 隔离不同账号的 Cookie/Session，叠加分组管理、代理、分屏、Aria2 下载、Chrome 扩展、AI 智能助手（Agent/Chat）、MCP Server、插件系统、rrweb 调试器/操作录制回放等功能。

## 三进程架构

采用经典 Electron 三进程模型，构建工具链为 **electron-vite**。

| 进程 | 目录 | 运行时 | 职责摘要 |
|------|------|--------|----------|
| 主进程 | `electron/` | Node + Electron | 窗口、WebContentsView 生命周期、IPC（30+ 模块）、数据持久化、代理、自定义协议、扩展、Aria2、托盘、自动更新、快捷键、AI 代理网关、MCP Server、插件、密码/Favicon/技能存储、页面提取、rrweb 调试器与操作录制/回放 |
| 预加载 | `preload/` | 隔离上下文 | `contextBridge` 暴露类型安全的 `window.api`（32 个命名空间） |
| 渲染进程 | `src/` | Chromium | Vue 3 + Pinia（21 Store）+ Tailwind 4 + shadcn-vue + Dexie(IndexedDB) 历史/聊天 + AI Agent |

> 注：调试器有独立窗口与预加载脚本（`electron/debugger-window.html`、`electron/debugger-preload.ts`、`electron/debugger-replay.html`、`electron/debugger-replay-preload.ts`），由 `electron.vite.config.ts` 额外构建入口产出。

## 数据流向

1. **常规 IPC**：渲染进程 `window.api.*` → 预加载桥接 → 主进程 handler → `electron-store` / `JsonStore` 持久化。
2. **AI 聊天**：渲染进程构造请求 → `chat:completions` IPC → 主进程 `ai-proxy` 注入 API Key → SSE 流转发 → 渲染进程实时渲染（支持 tool_use 多轮循环）。
3. **插件事件**：IPC handle 包装层广播 `ipc:{channel}` 事件 → `pluginEventBus` → 插件监听。
4. **主进程推送**：`webContents.send('on:...')` → 渲染进程 Store/组件监听。

## 关键设计取舍

- **WebView 用 `WebContentsView`，不是 `<webview>` 标签**：由主进程 `webviewManager` 统一管理生命周期（创建/激活/冻结/销毁）、bounds、代理、下载拦截。
- **Partition 隔离**：每个容器使用独立 `persist:container-{id}` partition，扩展按 partition 独立加载。
- **四层持久化**：`electron-store`（核心结构化数据）+ `JsonStore`（书签/密码/插件存储等独立文件）+ `Dexie/IndexedDB`（历史、聊天）+ 纯文件目录（图标、截图、技能 Markdown）。详见 [data-model.md](data-model.md)。
- **API Key 安全中转**：AI API Key 仅在主进程 `ai-proxy` 中组装，不进入渲染进程。
- **窗口无边框**：`frame:false, transparent:true`，拖拽区由 CSS `-webkit-app-region: drag` 实现；关闭行为可配置（隐藏到托盘 / 直接退出）。
- **类型三处同步**：`src/types/index.ts`、`electron/services/store.ts`、`preload/index.ts` 的接口定义须保持一致。
