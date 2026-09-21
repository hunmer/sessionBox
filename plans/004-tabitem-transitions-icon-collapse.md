# 004 — TabItem 过渡收敛 + 「只显示图标」模式平滑折叠

- **Status**: DONE（2026-09-21 执行，未提交）
- **Commit**: ccf9e72
- **Severity**: MEDIUM
- **Category**: Performance（transition: all）+ Missed opportunities（iconOnly 宽度跳变）
- **Estimated scope**: 2 个文件（TabItem.vue、globals.css），约 40 行
- **依赖**: 001（使用其 `--ease-out` 令牌）；建议在 002 之后执行（同为标签区，便于一起做 feel check）

## Problem

两个问题都在标签芯片本体 `src/components/tabs/TabItem.vue`：

**(a) `transition-all` 动画化了所有属性**。`:262`：

```html
<!-- src/components/tabs/TabItem.vue:262 — current -->
<div
  class="group flex items-center gap-2 h-[30px] cursor-pointer transition-all select-none border rounded-xl"
```

`(b) 「只显示图标」切换是硬切**。`iconOnly = tabIconOnly && !isActive`（`:68`）——意味着**每次切换激活标签**，失去激活的标签会瞬间把标题/页面标识折叠成纯图标，宽度跳变；开启设置里的「只显示图标」时全列表瞬间跳。文字节点是 `v-if` 直接卸载：

```html
<!-- src/components/tabs/TabItem.vue:305-313 — current -->
<span
  v-if="!iconOnly"
  class="truncate text-xs"
  :class="vertical ? 'flex-1 min-w-0' : isPinned ? 'max-w-[100px]' : 'max-w-[120px]'"
>{{ pageTitle || pageLabel || '新标签页' }}</span>
<span
  v-if="!iconOnly && pageTitle && pageLabel && tabStore.tabPageLabelVisible"
  class="truncate text-[10px] text-muted-foreground/60 max-w-[60px] flex-shrink-0"
>{{ pageLabel }}</span>
```

## Target

- `transition-all` → 显式属性清单（颜色/阴影/内边距/透明度；内边距进清单是为了 `iconOnly` 的 `px-2`/`px-3` 切换平滑）。
- 两个文字 `<span>` 各包一层 Vue `<Transition name="tab-label">`：出场时 `max-width → 0` + 淡出，进场反向（150/200ms，强 ease-out）。Vue 的 `<Transition>` 自带离场期保持 DOM，无需改 store。
- 垂直布局下文字 span 无 max-width（`flex-1`），max-width 插值不可用时自动退化为纯淡入淡出（可接受的降级）。
- reduced-motion 下只保留淡入淡出。

## Repo conventions to follow

- Vue 原生 `<Transition>` 用法参考 `src/App.vue:870-873`（`enter-active-class` 写法）；本计划改用命名 transition + globals.css 集中定义（标签动画类都收在 globals.css，见 002 号计划）。
- 类绑定沿用 TabItem 现有 `:class` 数组/对象语法。

## Steps

1. **`src/components/tabs/TabItem.vue:262`** — 根 div 的 `transition-all` 替换为显式清单：

   ```html
   <div
     class="group flex items-center gap-2 h-[30px] cursor-pointer transition-[color,background-color,border-color,box-shadow,opacity,padding] select-none border rounded-xl"
   ```

   （其余 class 与 :class/:style 绑定一字不动。）

2. **`src/components/tabs/TabItem.vue:305-309`** — 标题 span 包 `<Transition>`：

   ```html
   <Transition name="tab-label">
     <span
       v-if="!iconOnly"
       class="truncate text-xs"
       :class="vertical ? 'flex-1 min-w-0' : isPinned ? 'max-w-[100px]' : 'max-w-[120px]'"
     >{{ pageTitle || pageLabel || '新标签页' }}</span>
   </Transition>
   ```

3. **`src/components/tabs/TabItem.vue:310-313`** — 页面标识 span 同样处理：

   ```html
   <Transition name="tab-label">
     <span
       v-if="!iconOnly && pageTitle && pageLabel && tabStore.tabPageLabelVisible"
       class="truncate text-[10px] text-muted-foreground/60 max-w-[60px] flex-shrink-0"
     >{{ pageLabel }}</span>
   </Transition>
   ```

   （VolumeX/Pin 图标的 `v-if` 保持不动——图标过小，不值得为它们加过渡。）

4. **`src/styles/globals.css`** — 末尾（002 的标签区块之后、reduced-motion 总块之前）追加：

   ```css
   /* ====== 标签文字折叠动画（plans/004）====== */
   .tab-label-enter-active,
   .tab-label-leave-active {
     transition: max-width 200ms var(--ease-out), opacity 150ms var(--ease-out);
   }
   .tab-label-enter-from,
   .tab-label-leave-to {
     max-width: 0;
     opacity: 0;
   }

   @media (prefers-reduced-motion: reduce) {
     .tab-label-enter-active,
     .tab-label-leave-active {
       transition: opacity 150ms var(--ease-out);
     }
   }
   ```

## Boundaries

- 不要改 `iconOnly` 的计算逻辑、hover 预览、拖放逻辑。
- 不要动关闭按钮的显隐（`:322-334`，display 切换本来就不该动画）。
- 不要给分组徽标、Chevron 箭头加动画（Chevron 已有 `transition-transform`，是正确的）。
- 若模板行号漂移，按代码摘录定位；找不到对应结构则 STOP 并报告。

## Verification

- **Mechanical**: `pnpm build` 成功；`npx eslint src/components/tabs/TabItem.vue` 无新增报错。
- **Feel check**（`pnpm dev`）：
  - 水平布局，开启「只显示图标」：标签文字横向收起消失（约 150-200ms）而非瞬间跳变；关闭该设置反向展开。
  - 保持「只显示图标」开启，快速连续点击切换激活标签：失活标签平滑收起成图标，新激活标签平滑展开标题，无宽度跳变、无文字换行（`truncate` 生效）。
  - 垂直（侧边栏）布局重复上述操作：芯片高度不变（30px），文字淡入淡出即可（宽度插值在 flex-1 下不可用，属预期降级）。
  - 标签激活/失活的背景色、边框、阴影变化仍有平滑过渡（显式清单生效）。
  - DevTools → Rendering 勾选 `prefers-reduced-motion: reduce`：文字只做淡入淡出，无 max-width 运动。
- **Done when**: 两种布局下切换激活标签与切换「只显示图标」设置，标签芯片宽度全部平滑变化，无任何瞬间跳变。
