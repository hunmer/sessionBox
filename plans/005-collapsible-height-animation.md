# 005 — Collapsible 展开/收起高度动画

- **Status**: DONE（2026-09-21 执行，未提交）
- **Commit**: ccf9e72
- **Severity**: MEDIUM
- **Category**: Missed opportunities（空间性状态切换无动画，内容弹入弹出）
- **Estimated scope**: 2 个文件（globals.css、CollapsibleContent.vue），约 25 行
- **依赖**: 001（`--ease-out` 令牌）

## Problem

`src/components/ui/collapsible/CollapsibleContent.vue` 是裸包装，展开/收起时内容瞬间出现/消失，没有高度动画解释"内容从这里展开"的空间关系。受影响的使用方共 7 处：侧边栏导航分组（NavWorkspaces）、书签文件夹树（FolderTreeItem）、聊天工具卡（ToolCallCard）、思考块（ThinkingBlock）、供应商管理（ProviderManager）、下载过滤面板（DownloadFilterPanel）、分组列表（GroupItem/GroupList）。

`src/components/ui/collapsible/CollapsibleContent.vue:8-15` — current：

```html
<template>
  <CollapsibleContent
    data-slot="collapsible-content"
    v-bind="props"
  >
    <slot />
  </CollapsibleContent>
</template>
```

## Target

reka-ui 的 `CollapsibleContent` 已为 CSS 动画铺好路（已验证 node_modules 源码）：

- 元素上注入实测高度 CSS 变量 `--reka-collapsible-content-height`；
- 内部用 Presence：`data-state=closed` 时保持挂载，等关闭动画播完再卸载；
- 初始即展开的 Collapsible 有 mount 动画抑制（首帧不播动画）。

因此只需给包装组件加动画类 + 全局定义 keyframes，**所有 7 处使用方零改动**：

- 展开 `collapsible-down`：`height: 0 → var(--reka-collapsible-content-height)`，200ms 强 ease-out；
- 收起 `collapsible-up`：反向，200ms 强 ease-out；
- 内容根 `overflow: hidden`（高度动画期间裁切，keyframes 的 height 之外内容不溢出）；
- reduced-motion：动画近零时长（内容仍出现，运动消失）。

## Repo conventions to follow

- Tailwind v4 在 `@theme` 中定义 `--animate-*` 令牌 + 内嵌 `@keyframes`，即生成 `animate-<name>` 工具类（与 001 的令牌同层）。
- 组件侧用 `data-[state=...]:` 变体挂动画，与 PopoverContent 等现有写法一致。

## Steps

1. **`src/styles/globals.css`** — `@theme` 块（001 添加的那个）内追加动画令牌与 keyframes：

   ```css
   @theme {
     /* …001 已有的 --ease-out / --ease-in-out… */

     /* Collapsible 展开/收起：高度 0 ↔ 实测高度（reka-ui 注入的变量） */
     --animate-collapsible-down: collapsible-down 200ms var(--ease-out);
     --animate-collapsible-up: collapsible-up 200ms var(--ease-out);
     @keyframes collapsible-down {
       from { height: 0; }
       to { height: var(--reka-collapsible-content-height); }
     }
     @keyframes collapsible-up {
       from { height: var(--reka-collapsible-content-height); }
       to { height: 0; }
     }
   }
   ```

2. **`src/components/ui/collapsible/CollapsibleContent.vue`** — 模板加类（静态 class 与使用方传入的 class 由 Vue 自动合并）：

   ```html
   <template>
     <CollapsibleContent
       data-slot="collapsible-content"
       class="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
       v-bind="props"
     >
       <slot />
     </CollapsibleContent>
   </template>
   ```

3. **`src/styles/globals.css`** — 001 的 reduced-motion 块把两个新动画类纳入近零时长清单。

## Boundaries

- 不改 Collapsible.vue / CollapsibleTrigger.vue / index.ts。
- 不改任何使用方组件（7 处零改动）。
- 不引入 `forceMount`、不写 JS 测高。
- 若 reka-ui 版本升级后变量名变化（`--reka-collapsible-content-height`），以 `node_modules/reka-ui/dist/Collapsible/` 内实测为准。

## Verification

- **Mechanical**: `pnpm build` 成功；产物 CSS 中存在 `collapsible-down` keyframes 与 `.animate-collapsible-down` 规则；eslint 通过。
- **Feel check**（`pnpm dev`）：
  - 侧边栏 NavWorkspaces 分组展开：内容从 0 高度向下展开约 200ms，下方元素被平滑推开；收起反向，收完才消失。
  - 书签文件夹树展开/收起子层级：同上，且嵌套层级（父含子）逐层独立动画无错乱。
  - 聊天消息的工具调用卡/思考块展开：从卡片边缘向下展开。
  - 快速连续点击触发器：动画可中断重定向，无内容闪烁或卡在半高。
  - DevTools → Rendering 勾选 `prefers-reduced-motion: reduce`：展开/收起接近瞬时，内容仍完整出现。
- **Done when**: 上述 7 处使用位置全部有 200ms 高度展开/收起动画，无一处需要改使用方代码。
