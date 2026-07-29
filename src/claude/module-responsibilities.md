[根目录](../../CLAUDE.md) > [src](../CLAUDE.md) > 详情

# src/ 模块职责

| 子目录 | 职责 |
|--------|------|
| `src/components/` | UI 组件（15 业务子目录 + `ui/` shadcn 基础组件） |
| `src/stores/` | Pinia 状态管理（21 Store） |
| `src/composables/` | 组合函数（5 个） |
| `src/lib/` | 工具函数（含 `agent/`） |
| `src/types/` | 类型定义（index/split/plugin/command） |
| `src/styles/` | 全局样式（`globals.css`，Tailwind + 主题变量） |

## components/ 业务子目录（15）

`sidebar/ tabs/ toolbar/ bookmarks/ settings/ chat/ download/ history/ passwords/ plugins/ command-palette/ common/ proxy/ containers/` + `ui/`（shadcn 基础集：alert-dialog, avatar, badge, breadcrumb, button, checkbox, collapsible, command, context-menu, dialog, dropdown-menu, input, input-group, kbd, menubar, popover, progress, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, sonner, switch, tabs, textarea, toggle, tooltip）。

> 注：无 `workflow/` 目录（工作流 UI 已移除）。
