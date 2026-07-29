[根目录](../../CLAUDE.md) > [src](../CLAUDE.md) > 详情

# src/ 依赖与配置

| 依赖 | 用途 |
|------|------|
| vue ^3.5 | UI 框架 |
| pinia ^2.3 | 状态管理 |
| radix-vue / reka-ui | 无障碍 UI 原语 |
| lucide-vue-next | 图标 |
| vuedraggable ^4.1 | 拖拽排序 |
| tailwind-merge + clsx + class-variance-authority | 样式工具 |
| @vueuse/core | 组合函数工具 |
| tailwindcss ^4.1 | CSS 框架 |
| dexie ^4.4 | IndexedDB（历史/聊天） |
| vue-sonner | Toast |
| vue-stream-markdown | Markdown 流式渲染（聊天） |
| zod ^4.3 | 运行时校验 |

> `@vue-flow/*` 仍在依赖中但工作流 UI 已移除（冗余）。`@langchain/*` 主用于主进程。

构建/别名见根 [dependencies-and-config.md](../../claude/dependencies-and-config.md)（`@` → `src`）。
