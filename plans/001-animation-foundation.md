# 001 — 修复失效的动画工具类：接入 tw-animate-css + 动效令牌 + reduced-motion

- **Status**: DONE（2026-09-21 执行，未提交）
- **Commit**: ccf9e72
- **Severity**: HIGH
- **Category**: Cohesion & tokens（动画基础设施）
- **Estimated scope**: 3 个文件（package.json、globals.css、CommandDialog.vue），约 40 行

## Problem

整个应用的弹层动画**全部失效**。15 个 UI 基础组件写满了 `animate-in` / `fade-in-0` / `zoom-in-95` / `slide-in-from-*` 等动画工具类，但这些类来自 `tailwindcss-animate`（Tailwind 3 插件）或 `tw-animate-css`（Tailwind 4 的 CSS 版）——本项目是 **Tailwind CSS 4**（见 `package.json:62` 的 `tailwindcss: ^4.1.3`），且：

- `package.json` 依赖里没有任何 animate 插件
- `src/styles/globals.css:1` 只有 `@import "tailwindcss";`，没有 `@import "tw-animate-css";`
- 编译产物 `out/renderer/assets/index-BJo7zJZ4.css` 中**不存在**任何 `.animate-in` 规则（已验证）

结果是：所有 Popover / Dialog / DropdownMenu / ContextMenu / Tooltip / Select / Sheet / AlertDialog / Menubar 都以**零动画硬切**出现和消失，尽管代码明确表达了动画意图。受影响的 15 个文件：

```
src/components/ui/alert-dialog/AlertDialogContent.vue
src/components/ui/context-menu/ContextMenuContent.vue
src/components/ui/context-menu/ContextMenuSubContent.vue
src/components/ui/dialog/DialogContent.vue
src/components/ui/dialog/DialogOverlay.vue
src/components/ui/dialog/DialogScrollContent.vue
src/components/ui/dropdown-menu/DropdownMenuContent.vue
src/components/ui/dropdown-menu/DropdownMenuSubContent.vue
src/components/ui/menubar/MenubarContent.vue
src/components/ui/menubar/MenubarSubContent.vue
src/components/ui/popover/PopoverContent.vue
src/components/ui/select/SelectContent.vue
src/components/ui/sheet/SheetContent.vue
src/components/ui/sheet/SheetOverlay.vue
src/components/ui/tooltip/TooltipContent.vue
```

代表现状（`src/components/ui/popover/PopoverContent.vue:37`，其余 14 个文件同模式）：

```html
<!-- src/components/ui/popover/PopoverContent.vue:37 — current -->
:class="
  cn(
    'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 ... origin-(--reka-popover-content-transform-origin) outline-hidden',
    props.class,
  )
"
```

注意：`origin-(--reka-popover-content-transform-origin)` 已经正确接线（从触发点缩放），一旦工具类生效，物理性就自动正确。**不要改动这 15 个组件文件。**

同时，代码库没有任何动效令牌（缓动/时长）和 `prefers-reduced-motion` 处理（全库 grep 无结果），后续 002/003/004 号计划都依赖本计划建立的 `--ease-out` 令牌。

## Target

1. 安装并引入 `tw-animate-css`，让全部 15 个组件的现有动画类立即生效（弹出约 150ms、缩放 0.95→1、从触发点变换原点——这正是这些类写死的值，无需再调）。
2. 在 `@theme` 中建立强缓动令牌（覆盖 Tailwind 内置弱曲线）：
   - `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`（UI 进出场强 ease-out）
   - `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`（屏幕内移动强 ease-in-out）
   - 覆盖内置 `ease-out` 意味着 App.vue 沉浸面板等既有 `ease-out` 用法自动获得更强曲线——这是有意的统一性收益。
3. 全局 `prefers-reduced-motion`：弹层的 keyframe 动画缩短到近零（运动消失），但 hover 颜色等 `transition` 反馈保留。
4. 命令面板是键盘高频触发（Ctrl+K，按频率守则应接近无动画）：把 CommandDialog 的动画时长压到 100ms。

## Repo conventions to follow

- 全局样式只存在于 `src/styles/globals.css`（main.ts 唯一引入的 CSS）；令牌放在 `@theme` 块，与现有 `--radius-*`、`--shadow-*` 同层。
- 主题变量模式参考 `globals.css:35-40`（`--radius-xs: 4px;` 等）。
- 组件动画一律通过 reka-ui 的 `data-[state=open/closed]` + tw 工具类表达，不在组件里写 `<style>` 块。

## Steps

1. **安装依赖**（这是本组计划唯一允许的新依赖，纯 CSS 无 JS）：

   ```bash
   pnpm add -D tw-animate-css
   ```

2. **`src/styles/globals.css`**：在第 1 行 `@import "tailwindcss";` 之后紧接一行新增：

   ```css
   @import "tailwindcss";
   @import "tw-animate-css";
   ```

3. **`src/styles/globals.css`**：在现有 `@theme inline { ... }` 块（第 3-44 行）之后、`@layer base` 之前，新增一个**普通 `@theme` 块**（注意：不能放进 `@theme inline`，因为这些是字面量值而非变量引用）：

   ```css
   @theme {
     /* 强 ease-out：进出场 UI；覆盖内置弱曲线，全库 ease-out 工具类同步受益 */
     --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
     /* 强 ease-in-out：屏幕内移动/变形 */
     --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
   }
   ```

4. **`src/styles/globals.css`**：文件末尾新增 reduced-motion 处理（只关掉 keyframe 运动，保留 transition 颜色/透明度反馈）：

   ```css
   /* 减弱动态效果：弹层的缩放/位移动画近零时长，hover 颜色等 transition 反馈保留 */
   @media (prefers-reduced-motion: reduce) {
     .animate-in,
     .animate-out {
       animation-duration: 1ms !important;
       animation-delay: 0ms !important;
     }
   }
   ```

5. **`src/components/ui/command/CommandDialog.vue`**：命令面板由键盘快捷键高频触发，把内容动画压到近瞬发。找到 `<DialogContent>` 上的 `class="overflow-hidden p-0"`，改为：

   ```html
   <DialogContent
     class="overflow-hidden p-0 duration-100"
     :show-close-button="false"
     @open-auto-focus="emits('openAutoFocus', $event)"
   >
   ```

   （`duration-100` 同时作用于 open/close 两态的 animate-in/out。）

## Boundaries

- **不要改动**上列 15 个使用 animate-in 类的组件文件——它们的设计是正确的，问题只在缺失的 CSS 引入。
- 不要新增任何其他依赖。
- 不要在本计划中处理标签页动画、按钮按压反馈（分别是 002、003 号计划）。
- 不要修改 `@theme inline` 块内既有内容。
- 如果发现 `pnpm add` 后 globals.css 的 `@import` 顺序与上述不符（构建报警/动画仍不生效），STOP 并报告，不要自行调整其他文件。

## Verification

- **Mechanical**:
  - `pnpm build` 成功退出（exit 0）。
  - `grep -l "animate-in" out/renderer/assets/*.css` 至少命中 1 个文件（修复前为 0）——证明工具类已进入产物。
- **Feel check**（`pnpm dev` 启动应用）：
  - 打开标签栏右上「···」菜单（TabLayoutMenu）：菜单应在约 150ms 内从触发按钮方向淡入+轻微放大（0.95→1），关闭时反向。**从中心缩放 = 错误**（说明 origin 变量失效）。
  - 打开「新标签页」对话框：内容居中缩放淡入（模态居中、origin center 是正确的），遮罩淡入。
  - 按 Ctrl+K 打开命令面板：明显比普通对话框快（约 100ms），接近瞬开但有淡入。
  - DevTools → Animations 面板把速度调到 10%，重复打开 DropdownMenu，确认缩放起点在触发按钮一侧。
  - DevTools → Rendering 面板勾选 `prefers-reduced-motion: reduce`，再开菜单：应几乎瞬开（运动消失）；hover 按钮仍有颜色过渡。
- **Done when**: 菜单/弹窗/对话框全部有 150ms 量级的从触发点缩放动画，命令面板 ≈100ms，reduced-motion 下运动消失但颜色反馈保留。
