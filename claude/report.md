[根目录](../CLAUDE.md) > 详情

# 代码自检报告（2026-11-17，HEAD 9fb5213）

> 四组检查：结构 / 重复 / 可读性 / 可复用。数据为本次全仓扫描实测（wc/grep/md5），非猜测。

## 1. 结构

- **进程分层清晰**：electron（主）/ preload（桥）/ src（渲染）+ 外围 `server/`（同步后端）、`packages/electron-chrome-extensions`（vendored 子包）、`resources/plugins/`（内置插件源）。
- **preload/index.ts 885 行承载 36 个命名空间**：单文件桥接全部 IPC，是三处同步约定（types ↔ ipc ↔ preload）的中心枢纽，改动面最大、最易冲突。
- **electron/ipc/ 20 个模块**按领域拆分（index.ts 874 行内含多个 register*Ipc 函数）；**electron/services/ 50+ 文件**含 webview/、mcp/、plugin-*、sync-*、external-auth-* 等子域。
- **风险**：巨型文件集中在 `src/App.vue` 1311 行（含 137 行的 handleShortcutAction switch）、`electron/services/store.ts` 1112 行（单文件全部核心 CRUD）、`src/components/chat/ChatInput.vue` 1006 行。

## 2. 重复

- **内置 AI 网关插件五连复制**：`resources/plugins/{dola,gemini,jimeng,l0veyou,liblib}/service/{accounts,server,sessionbox}.mjs` 结构相同、md5 各异（accounts 140–173 行 / sessionbox 46–52 行 / server 319–594 行，每份小改）。新增网关 = 再复制一份；修 bug 需五处同步。可抽公共 npm 包或共享 lib 目录。
- IPC handler 的"取参 → 调 service → 返回"样板在 electron/ipc/ 20 个文件中反复出现，已有包装层广播 pluginEventBus，但无进一步去样板手段。
- `src/components/ui/` 204 个 shadcn 组件属第三方生成的重复风格，按约定不手改。

## 3. 可读性

- **长函数 Top**（实测行号）：
  - `src/components/sidebar/GroupList.vue:561` `renderMoreMenu(items: VNode[]): VNode` ≈183 行（h() 嵌套渲染巨型菜单）。
  - `src/App.vue:595` `handleShortcutAction(actionId: string)` ≈137 行（shortcut 巨型 switch，595→731）。
  - `electron/ipc/index.ts:290` `registerContainerIpc(): void` ≈112 行；同文件 `:419 registerBookmarkIpc` ≈93 行。
- 超过 ESLint `max-lines-per-function: warn 200` 的只有个别渲染函数；多数文件在阈值内。
- 命名一致性好：services 一律 kebab-case、ipc 与 store 对应命名对齐；preload 命名空间与 store 名一一对应率高。

## 4. 可复用

- **高复用**：`src/components/ui/button` 被 63 个 .vue 引用；`vue-sonner` toast 14 处；Dexie 封装（db/chat-db）贯通历史与聊天。
- **低复用/孤岛**：`useIpc` composable 仅 3 处使用；`src/composables/` 7 个中部分单点使用。
- **死代码/冗余依赖**：`@vue-flow/*` 5 包 + `@dagrejs/dagre` 在 src/electron 已无引用（仅剩 `electron/dagre.d.ts` 声明），可从 package.json 移除。
- AI Agent 工具（`src/lib/agent/tools.ts` 855 行）与 MCP Server 工具集（`electron/services/mcp/`）是两套平行工具描述体系，能力有重叠，新增工具需两处登记。

## 优先整改建议（按收益排序）

1. 移除 `@vue-flow/*` + `@dagrejs/dagre` 冗余依赖（零风险，减体积）。
2. 插件服务五连复制抽公共库（改一处生效五家）。
3. 拆 `src/App.vue` 的 handleShortcutAction（命令表化）与 `GroupList.vue` renderMoreMenu（子组件化）。
4. `preload/index.ts` 按命名空间拆模块再聚合导出，缓解三处同步冲突面。
