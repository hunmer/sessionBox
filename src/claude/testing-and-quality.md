[根目录](../../CLAUDE.md) > [src](../CLAUDE.md) > 详情

# src/ 测试与质量

- 无测试文件、无测试框架。
- ESLint：`eslint.config.js`（`max-lines 1000` / `max-lines-per-function 200` warn，TS/Vue 规则放宽）；覆盖 `**/*.{ts,vue}`。
- 类型检查：`pnpm build`（tsc via `tsconfig.web.json`）。
- 风险：250+ .vue 组件无测试覆盖；领域类型三处同步易漂移。
