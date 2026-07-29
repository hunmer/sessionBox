[根目录](../../CLAUDE.md) > [preload](../CLAUDE.md) > 详情

# preload/ 测试与质量

- 无测试文件、无测试框架。
- 类型检查依赖 `pnpm build`（tsc via `tsconfig.node.json`）。
- 风险：API 与主进程 handler、`src/types/index.ts` 需三处手工同步，易漂移。
