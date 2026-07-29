[根目录](../CLAUDE.md) > 详情

# 测试与质量

## 测试

**当前未配置任何测试框架**：无单元测试、集成测试、E2E 测试文件，`package.json` 无 `test` 脚本。

验证手段以 `pnpm dev` 手动验证为主；调试器/操作录制回放系统（`electron/services/debugger.ts`、`action-recorder.ts`、`action-player.ts`）本身可用于录制浏览器操作并回放，可充当手工回归手段，但并非自动化测试套件。

## Lint / 类型检查

- ESLint flat 配置：`eslint.config.js`（见 [conventions.md](conventions.md)）。
  - 全局忽略：`node_modules/ out/ dist/ resources/ scripts/ *.config.{js,ts} *.json`。
  - `max-lines: warn 1000`、`max-lines-per-function: warn 200`。
  - 多项 TypeScript / Vue 规则放宽（`no-explicit-any`、`no-unused-vars` off 等）。
- TypeScript：`tsc` 通过 `tsconfig.node.json` / `tsconfig.web.json` 分别覆盖主进程与渲染进程；`pnpm build`（electron-vite build）会做编译检查。
- 仓库内存在历史产物 `eslint-report.json` / `eslint-report.md`（一次性 lint 报告，非持续流程）。

## 质量风险（观察）

- 无自动化测试网，回归依赖人工。
- 数据模型与 IPC 需三处手工同步（`src/types/index.ts` / `electron/services/store.ts` / `preload/index.ts`），易漂移。
- `@vue-flow/*` 仍在依赖中但工作流 UI 已移除，存在冗余依赖。
- 部分大文件可能接近 `max-lines` 警告阈值。
