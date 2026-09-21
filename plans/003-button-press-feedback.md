# 003 — 按钮按压反馈：active 缩放 + 收敛 transition-all

- **Status**: DONE（2026-09-21 执行，未提交）
- **Commit**: ccf9e72
- **Severity**: HIGH（杠杆比最高：单行改动，全应用生效）
- **Category**: Physicality（按压反馈）+ Performance（transition: all）
- **Estimated scope**: 1 个文件，2 行改动
- **依赖**: 001（`ease-out` 令牌覆盖后曲线更强；本计划不直接引用令牌，可独立执行）

## Problem

全应用所有按钮（`Button` 组件被窗口控制、标签栏工具、对话框、设置页等处处使用）**没有任何按压反馈**——按下去和松手视觉上完全一样，只有 hover 变色。真实世界中按压的东西会轻微缩小，缺失这个反馈让整个 UI 显得"浮"。

同时基类用的是 `transition-all`，会动画化所有可过渡属性（包括不该动画的布局属性），脱离 GPU 合成路径。

`src/components/ui/button/index.ts:7` — current：

```ts
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
```

按压反馈规范（来自 AUDIT.md §3）：`:active` 时 `scale(0.97)`，`transform 160ms ease-out` 以内（此处取 150ms）。数值保持 0.95–0.98 区间内，禁止更夸张。

## Target

```ts
/* target */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
```

要点：
- `transition-all` → 显式属性清单（颜色类 + `box-shadow`（focus ring）+ `transform`（按压缩放）+ `opacity`（disabled））。
- 新增 `duration-150 ease-out`：默认 transition 时长 150ms 配强 ease-out（001 覆盖后的令牌曲线）。
- 新增 `active:scale-[0.97]`：按压时 3% 缩小，松手回弹。`disabled:pointer-events-none` 已保证禁用按钮不会触发。

## Repo conventions to follow

- 改动就在 `buttonVariants` 基类字符串内完成（该文件唯一的样式出口），与现有 `focus-visible:ring-*` 等写法同层，不新增文件、不加 `<style>`。

## Steps

1. **`src/components/ui/button/index.ts:7`**：把基类字符串中的 `transition-all` 替换为
   `transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-out active:scale-[0.97]`
   （即 Problem 中 current → target 的完整字符串，其余内容一字不动）。

## Boundaries

- 只改这一个文件的这一个字符串；不要动各 variant（default/ghost/outline/...）与 size 定义。
- 不要给 `Button.vue` 加任何 props 或事件。
- 若发现基类字符串与摘录不一致（已漂移），以 `transition-all` 所在位置为准做等价替换；找不到 `transition-all` 则 STOP 并报告。
- 已知豁免：`src/components/ui/sidebar/SidebarRail.vue:21` 也有一个 `transition-all ease-linear`（拖拽轨道），**不在本计划范围内**，不要顺手改。

## Verification

- **Mechanical**: `pnpm build` 成功。
- **Feel check**（`pnpm dev`）：
  - 按住标签栏任一图标按钮（如刷新）：按住瞬间轻微缩小（3%），松开 150ms 回弹；快速连点无"迟滞感"。
  - 窗口右上角最小化/最大化/关闭按钮同样有按压缩放；hover 红色关闭按钮的变色过渡仍平滑。
  - 对话框内主按钮（bg-primary）按压缩放，focus 时 ring 展开仍有过渡（box-shadow 在清单内）。
  - 拖拽侧边栏分隔条（ResizableHandle）等非 Button 元素不受影响。
  - DevTools → Animations 面板 10% 速度按一次按钮：确认是缩放而非位移，且无布局抖动（按钮周围文字不动）。
- **Done when**: 全应用任意按钮按住有 3% 缩放、松手回弹，hover/focus 过渡与之前一样平滑。
