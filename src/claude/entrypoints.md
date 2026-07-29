[根目录](../../CLAUDE.md) > [src](../CLAUDE.md) > 详情

# src/ 入口与启动

- **入口**：`src/main.ts`（HTML 入口 `index.html`）。
- 启动：创建 Vue 应用 → `app.use(pinia)` → 挂载 `#app`。
- `src/App.vue`：根组件，三面板布局；`onMounted` 并行初始化各 Store。
- 别名：`@` → `src`（见 `electron.vite.config.ts`）。
