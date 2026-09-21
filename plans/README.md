# 动画改进计划（improve-animations 审计产出）

审计基准 commit：`ccf9e72`（2026-09-21）。审计范围以当前工作焦点「标签页 UI」为核心，覆盖全库动画基础设施。

## 执行顺序与状态

| # | 计划 | 严重度 | 状态 | 依赖 |
| --- | --- | --- | --- | --- |
| [001](001-animation-foundation.md) | 修复失效的动画工具类：tw-animate-css + 动效令牌 + reduced-motion | HIGH | DONE（2026-09-21 执行，未提交） | 无（其余计划的地基） |
| [002](002-tab-enter-leave.md) | 标签页进出场动画（新建展开 / 关闭收起） | HIGH | DONE（2026-09-21 执行，未提交） | 001 |
| [003](003-button-press-feedback.md) | 按钮按压反馈（active 缩放）+ 收敛 transition-all | HIGH | DONE（2026-09-21 执行，未提交） | 001（弱依赖，可独立） |
| [004](004-tabitem-transitions-icon-collapse.md) | TabItem 过渡收敛 + 只显示图标平滑折叠 | MEDIUM | DONE（2026-09-21 执行，未提交） | 001，建议在 002 后 |

**推荐顺序：001 → 003 → 002 → 004。** 理由：001 是一行引入却点亮全应用 15 个组件的既有动画意图，且建立后续计划引用的 `--ease-out` 令牌；003 是单行改动全应用生效；002 是本次「给标签 UI 加动画」的核心诉求，改动面稍大放在基础设施就绪后；004 与 002 同区域，最后做便于一次性 feel check。

每完成一份计划，把对应状态改为 DONE 并注明 commit。

## 审计结论摘要

- 全应用弹层动画意图存在但**全部失效**（tw-animate-css 未安装，编译产物无 `.animate-in` 规则）→ 001
- 标签新建/关闭为硬切，vuedraggable 的 `:animation` 只覆盖拖拽排序 → 002
- 按钮无按压反馈，基类 `transition-all` → 003
- 标签芯片 `transition-all`、「只显示图标」宽度跳变 → 004
- 已达标无需处理的：沉浸模式四向面板（App.vue:1022-1088，translate+opacity 300ms ease-out 配位正确）、分组箭头旋转（transition-transform）、favicon 加载脉动（animate-pulse）、Toaster（vue-sonner 自带动画）、加载进度条淡入淡出（App.vue:870/1119）。

## 遗留观察（未立计划，供后续参考）

- 分组折叠/展开时组内标签硬切（`v-show` + 内层 `v-if` 混用，vuedraggable 约束下改造风险高）
- 侧边栏 `WorkspaceBar`、`SidebarRail` 等仍有零星 `transition-all`（低频区域，收益低）
- 布局模式切换（水平 ↔ 垂直）时标签会整体重播进场动画——002 完成后可作为一次性的「布局迁移提示」观察用户观感
