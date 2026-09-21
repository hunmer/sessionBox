# 006 — TabItem 芯片尺寸变化动画（图标进出 / 固定切换 / 间隙残留）

- **Status**: DONE（2026-09-21 执行，未提交）
- **Commit**: ccf9e72
- **Severity**: MEDIUM
- **Category**: Missed opportunities + Physicality（004 的补全：芯片内所有状态驱动的尺寸变化）
- **Estimated scope**: 2 个文件（TabItem.vue、globals.css），约 45 行
- **依赖**: 001（`--ease-out` 令牌）、004（`tab-label` 既有动画，本计划修补其间隙残留）

## Problem

004 动画了 iconOnly 的文字折叠，但 TabItem 芯片（`src/components/tabs/TabItem.vue`）仍有五处状态驱动的尺寸瞬变：

1. **静音图标** `v-if` 进出（`:325-328`，±20px 含 gap）；
2. **固定图标** `v-if` 进出（`:329-332`，±20px）；
3. **关闭按钮** 固定标签时 `v-if="!isPinned"` 卸载（`:333-345`，±24px）——固定/取消固定是最高频的一处；
4. **标题 max-width 瞬切**：`isPinned` 切换 `max-w-[100px]` ↔ `max-w-[120px]`（`:316`）；
5. **004 间隙残留**：`tab-label` 收起时元素宽度已到 0，但 flex `gap-2`（8px）在卸载前残留，卸载瞬间轻跳一次。

**不可动画项（明确出界）**：页面标题文本到达（'新标签页' → 真实标题）导致的内容驱动宽度变化。CSS transition 只在指定值变化时触发，内容变化不改指定值；Chrome/Safari 标签栏对此同样瞬切，遵循惯例。

当前代码摘录见上列行号，结构与 004 执行后一致（文字 span 已包 `tab-label` Transition）。

## Target

- 新增 `tab-icon` Transition（小元素 150ms 预算）：`max-width 0↔上限 + opacity + margin-left` 三属性过渡，`margin-left: -0.5rem` 在收起态抵消 flex `gap-2`，净宽收放到 0，无残留跳变；
- 静音图标、固定图标、关闭按钮三处套用；
- `tab-label` 过渡补上同样的 `margin-left` 抵消（修 5）；
- 标题 span 加静态 `transition-[max-width] duration-200 ease-out`，固定切换的 20px 变化平滑（进入/离开动画期间由 Vue 过渡类的 `transition` 声明覆盖，不冲突）；
- reduced-motion 下全部退化为纯淡入淡出。

已知可接受的小瑕疵：垂直布局关闭按钮带 `ml-auto`，进场动画结束回弹 `auto` 不可插值会有 8px 瞬移——该按钮非悬停时 `opacity-0` 不可见，实际不可感知。

## Repo conventions to follow

- Vue 命名 Transition + globals.css 集中定义，与 004 的 `tab-label` 完全同构；
- 图标/按钮宽度上限取实际宽度 + 余量（12px 图标 → 16px；16px 按钮 → 20px）。

## Steps

1. **`src/components/tabs/TabItem.vue`** — 静音图标（`:325-328`）：

   ```html
   <Transition name="tab-icon">
     <VolumeX
       v-if="!iconOnly && isMuted"
       class="w-3 h-3 flex-shrink-0 text-muted-foreground"
     />
   </Transition>
   ```

2. 同文件 — 固定图标（`:329-332`）：

   ```html
   <Transition name="tab-icon">
     <Pin
       v-if="!iconOnly && isPinned"
       class="w-3 h-3 flex-shrink-0 text-muted-foreground"
     />
   </Transition>
   ```

3. 同文件 — 关闭按钮（`:333-345`）包 `tab-icon` Transition（`v-if` 与其余属性一字不动）：

   ```html
   <Transition name="tab-icon">
     <button
       v-if="!isPinned"
       class="flex-shrink-0 p-0.5 rounded-full hover:bg-secondary transition-opacity"
       :class="[
         vertical ? 'ml-auto' : '',
         iconOnly
           ? 'hidden group-hover:inline-flex'
           : 'opacity-0 group-hover:opacity-100'
       ]"
       @click="handleClose"
     >
       <X class="w-3 h-3" />
     </button>
   </Transition>
   ```

4. 同文件 — 标题 span（`:313-317`）静态类加 `transition-[max-width] duration-200 ease-out`：

   ```html
   <span
     v-if="!iconOnly"
     class="truncate text-xs transition-[max-width] duration-200 ease-out"
     :class="vertical ? 'flex-1 min-w-0' : isPinned ? 'max-w-[100px]' : 'max-w-[120px]'"
   >{{ pageTitle || pageLabel || '新标签页' }}</span>
   ```

5. **`src/styles/globals.css`** — 004 的 `tab-label` 区块改为（补 margin-left）：

   ```css
   .tab-label-enter-active,
   .tab-label-leave-active {
     transition: max-width 200ms var(--ease-out), opacity 150ms var(--ease-out), margin-left 200ms var(--ease-out);
   }
   .tab-label-enter-from,
   .tab-label-leave-to {
     max-width: 0;
     opacity: 0;
     margin-left: -0.5rem; /* 抵消 flex gap-2，净宽收放到 0 */
   }
   ```

   紧随其后新增 `tab-icon` 区块：

   ```css
   /* ====== 标签内部图标/按钮尺寸过渡（plans/006）====== */
   .tab-icon-enter-active,
   .tab-icon-leave-active {
     transition: max-width 150ms var(--ease-out), opacity 150ms var(--ease-out), margin-left 150ms var(--ease-out);
   }
   .tab-icon-enter-from,
   .tab-icon-leave-to {
     max-width: 0;
     opacity: 0;
     margin-left: -0.5rem;
   }

   @media (prefers-reduced-motion: reduce) {
     .tab-icon-enter-active,
     .tab-icon-leave-active {
       transition: opacity 150ms var(--ease-out);
     }
   }
   ```

## Boundaries

- 不动画 favicon/加载图标/Globe 的互换（同尺寸，无尺寸变化）。
- 不处理标题文本到达的宽度变化（CSS 机制限制 + 浏览器惯例，见 Problem）。
- 不改 `iconOnly` 计算逻辑、悬停预览、拖放逻辑。
- 若模板结构与摘录漂移，按代码特征定位；找不到对应结构 STOP 并报告。

## Verification

- **Mechanical**: `pnpm build` 成功；产物 CSS 含 `.tab-icon-enter-active` 规则与 `margin-left:-.5rem`；eslint 无新增报错。
- **Feel check**（`pnpm dev`）：
  - 右键「固定标签」：Pin 图标淡入 + 关闭按钮收起消失 + 标题宽度微调，整个芯片一次平滑变窄，无任何瞬跳；取消固定反向。
  - 右键「静音标签」：静音图标平滑进出（含间隙收放，无 8px 残留跳）。
  - 「只显示图标」下切换激活标签：图标与文字用各自时长（150/200ms）和谐收放。
  - 垂直布局重复固定/取消固定：按钮不可见时无异常；悬停状态下的微小位移属已知可接受项。
  - DevTools → Rendering 勾选 `prefers-reduced-motion: reduce`：图标只淡入淡出。
- **Done when**: 固定/取消固定、静音/取消静音两组操作下芯片宽度完全平滑，肉眼无任何跳变；标题文本到达仍瞬切（预期）。
