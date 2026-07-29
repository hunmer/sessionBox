[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 测试与质量

- **无测试框架、无测试文件**。
- 类型检查依赖 `pnpm build`（electron-vite + tsc via `tsconfig.node.json`）。
- 调试器/操作录制回放（`debugger.ts` / `action-recorder.ts` / `action-player.ts`）可作为浏览器操作的录制-回放回归手段，但非自动化测试套件。
- 风险：webview-manager、ai-proxy、store.ts 等为核心大文件；IPC 与数据模型需三处手工同步易漂移。
