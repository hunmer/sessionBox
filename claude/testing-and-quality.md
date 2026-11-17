[根目录](../CLAUDE.md) > 详情

# 测试与质量

## 测试现状（2026-11-17 实测）

**无统一测试运行器**（`package.json` 无 `test` 脚本），但已有零散的 `node:test` 测试文件，全部可用 Node 原生运行：

| 测试文件 | 覆盖点 | 运行方式 |
|----------|--------|----------|
| `server/sync-server.test.mjs` | 同步后端 HTTP 语义（快照读写删、并发原子写） | `pnpm sync-server:test` |
| `electron/services/plugin-log.test.ts` | 插件日志隔离/时间戳/凭据脱敏 | `node --test`（Node 22+ 类型剥离） |
| `electron/services/plugin-gateway.test.ts` | 插件网关暴露面 | 同上 |
| `electron/services/sync-cookies.test.ts` | Cookie 快照导出/恢复 | 同上 |
| `electron/services/external-auth-cdp.test.ts` | CDP 外部账号认证 | 同上 |
| `electron/ipc/extension-download.test.ts` | 扩展下载 IPC | 同上 |
| `src/stores/toolbar.test.ts` | 工具栏 store 行为 | 同上 |
| `src/lib/sync-merge.test.ts` | 同步三方合并策略 | 同上 |
| `src/components/common/PluginMiniPopover.test.mjs` | 插件迷你弹层组件 | `node --test` |
| `resources/plugins/*/service/tests/*` | 各 AI 网关插件（mjs/py） | 各插件目录内自跑 |

**测试资产是重要资产**：改到上述模块时优先跑对应局部测试（先局部后全局，缩短反馈）。

## Lint / 类型检查

- ESLint flat 配置：`eslint.config.js`（见 [conventions.md](conventions.md)）。
  - 全局忽略：`node_modules/ out/ dist/ resources/ scripts/ *.config.{js,ts} *.json`。
  - `max-lines: warn 1000`、`max-lines-per-function: warn 200`。
  - 多项 TypeScript / Vue 规则放宽（`no-explicit-any`、`no-unused-vars` off 等）。
- TypeScript：`pnpm type-check`（vue-tsc --noEmit -p tsconfig.web.json，渲染进程）；主进程靠 `pnpm build` 编译检查。
- 仓库内存在历史产物 `eslint-report.md`（一次性 lint 报告，非持续流程）。

## 质量风险（实测证据见 [report.md](report.md)）

- 测试覆盖仍稀疏：核心（tab/webview/store/ai-proxy）无测试，回归主要靠人工。
- 数据模型与 IPC 需三处手工同步（`src/types/index.ts` / `electron/services/store.ts` / `preload/index.ts`），易漂移。
- 冗余依赖：`@vue-flow/*` 5 个包与 `@dagrejs/dagre` 在 `src/`、`electron/` 已无引用（仅剩 `electron/dagre.d.ts`），可移除。
- 大文件：`src/App.vue` 1311 行、`electron/services/store.ts` 1112 行、`src/components/chat/ChatInput.vue` 1006 行、`electron/services/webview-manager.ts` 983 行、`src/stores/tab.ts` 974 行。
- 代码自检四组结论（结构/重复/可读性/可复用）见 [report.md](report.md)。
