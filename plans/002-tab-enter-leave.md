# 002 — 标签页进出场动画：新建标签展开、关闭标签收起

- **Status**: DONE（2026-09-21 执行，未提交）
- **Commit**: ccf9e72
- **Severity**: HIGH
- **Category**: Missed opportunities（应该动而没动的高频状态切换）
- **Estimated scope**: 3 个文件（globals.css、TabBar.vue、TabBarVertical.vue）+ 1 个文件改造（stores/tab.ts），约 90 行
- **依赖**: 001（使用其建立的 `--ease-out` 令牌）

## Problem

标签页的新建和关闭目前是**瞬间出现/消失**（DOM 直接插入/移除），相邻标签会瞬间跳位——这是浏览器 UI 中最高频、最显眼的"该动而没动"的缝隙。vuedraggable 的 `:animation="150"` 只管**拖拽排序**时的位移补间，不管增删。

三个渲染位置的列表项容器（每个 tab 的直接外层 `div`）：

`src/components/tabs/TabBar.vue:198-204`（水平·分组模式，`#item` 插槽内）：

```html
<template #item="{ element: tab }">
  <div
    v-show="tab.isGroupStart || !isGroupCollapsed(tab)"
    class="flex items-center gap-0.5 flex-shrink-0"
    :class="{ 'tab-pinned': tab.pinned }"
    :data-tab-id="tab.id"
  >
```

`src/components/tabs/TabBar.vue:249-253`（水平·扁平模式）：

```html
<template #item="{ element: tab }">
  <div
    class="flex-shrink-0"
    :class="{ 'tab-pinned': tab.pinned }"
    :data-tab-id="tab.id"
  >
```

`src/components/tabs/TabBarVertical.vue:85-89`（垂直·分组）与 `:138-141`（垂直·扁平）：

```html
<div
  v-show="tab.isGroupStart || !isGroupCollapsed(tab)"
  class="w-full"
  :class="{ 'tab-pinned': tab.pinned }"
>
```

关闭路径在 store 中立即移除元素，无法在 CSS 层做离场动画。`src/stores/tab.ts:280-311`：

```ts
async function closeTabAction(ctx: TabStoreContext, tabId: string) {
  const closingTab = ctx.tabs.value.find((t) => t.id === tabId)
  if (closingTab && closingTab.pageId && !closingTab.url?.startsWith('sessionbox://')) {
    ctx.recentlyClosedTabs.value.unshift({ /* ... */ })
    if (ctx.recentlyClosedTabs.value.length > MAX_RECENTLY_CLOSED) {
      ctx.recentlyClosedTabs.value.pop()
    }
  }

  const closingActive = ctx.activeTabId.value === tabId
  const currentWorkspaceTabs = ctx.workspaceTabs.value
  const currentIndex = currentWorkspaceTabs.findIndex((t) => t.id === tabId)
  const nextWorkspaceTabId = currentIndex === -1
    ? null
    : currentWorkspaceTabs[currentIndex + 1]?.id ?? currentWorkspaceTabs[currentIndex - 1]?.id ?? null

  await api.tab.close(tabId)
  cleanupTabState(tabId, ctx)

  const { useSplitStore } = await import('./split')
  const splitStore = useSplitStore()
  splitStore.handleTabClosed(tabId)

  if (closingActive) {
    await activateNextTabAfterClose(ctx, splitStore, nextWorkspaceTabId)
  }
}
```

`src/stores/tab.ts:314-321`（批量关闭的公共漏斗，关闭其他/左/右侧都经过这里）：

```ts
async function closeTabsSequentially(ctx: TabStoreContext, tabIds: string[]) {
  // 复制一份 id 列表，避免关闭过程中 reactive 数组变化影响迭代
  for (const id of [...tabIds]) {
    if (ctx.tabs.value.some((t) => t.id === id)) {
      await closeTabAction(ctx, id)
    }
  }
}
```

`src/stores/tab.ts:105-114`：

```ts
function cleanupTabState(
  tabId: string,
  ctx: TabStoreContext
) {
  ctx.tabs.value = ctx.tabs.value.filter((t) => t.id !== tabId)
  ctx.navStates.value.delete(tabId)
  ctx.favicons.value.delete(tabId)
  ctx.proxyInfos.value.delete(tabId)
  useSnifferStore().onTabClosed(tabId)
}
```

## Target

- **新建标签**：从宽度 0 + 透明展开到自然宽度（约 200ms，强 ease-out），相邻标签被平滑推开。用 CSS `@starting-style` 实现（Chromium 129+ / 本项目 Electron 38 = Chromium 140，支持），无需 JS 钩子；宽度过渡用 `interpolate-size: allow-keywords` 让 `width: 0 → auto` 可插值，**不需要猜测 max-width 上限**（分组徽标文字长度不可预测，固定上限会永久裁切长分组名）。
- **关闭标签**：store 先标记 `closingTabIds` 让 CSS 立即开始收起（宽度/高度 → 0 + 淡出，150ms），动画结束后才真正执行既有关闭逻辑。**既有关闭逻辑的顺序一行不改**（分屏状态、最近关闭记录等全部保持原顺序），只是在最前面插入"标记 + 等待"。
- **批量关闭**（关闭其他/左/右）：先一次性标记全部目标（所有标签同时开始收起，形成一整波收起动画），再逐个走既有关闭流程，无逐个 150ms 串行等待。
- **防重入**：快速双击关闭按钮时第二次点击直接忽略（模块级 in-flight Set）。
- **reduced-motion**：布局收放改为瞬时，仅保留 150ms 透明度淡入淡出。

## Repo conventions to follow

- 全局 CSS 追加在 `src/styles/globals.css` 末尾（001 号计划建立的 `--ease-out` = `cubic-bezier(0.23, 1, 0.32, 1)` 会被本计划引用）。
- Set 型响应式状态参考现有 `frozenTabIds`（定义 `src/stores/tab.ts:628`，ctx 接口 `:57`，ctx 对象 `:726-730`，store return `:820`，读取方 `TabItem.vue:75` 的 `tabStore.frozenTabIds.has(...)`）——`closingTabIds` 完全复制这条链路。
- 模板内的类绑定沿用现有 `:class` 对象语法。

## Steps

1. **`src/styles/globals.css`** — 文件末尾追加（若 001 已加 reduced-motion 块则放在它之前，保持 reduced-motion 块最后）：

   ```css
   /* ====== 标签页进出场动画（plans/002）====== */
   /* 让 width/height 在 0 与 auto 之间可插值，无需猜测 max-width 上限 */
   :root {
     interpolate-size: allow-keywords;
   }

   .tab-item-wrapper {
     overflow: hidden; /* 收起期间裁切内容（标签内部文字本身有 truncate） */
     transition: width 200ms var(--ease-out), opacity 150ms var(--ease-out);
   }

   .tab-item-wrapper--vertical {
     transition: height 200ms var(--ease-out), opacity 150ms var(--ease-out);
   }

   /* 新插入的列表项（新建标签）从 0 宽/高 + 透明展开 */
   @starting-style {
     .tab-item-wrapper { width: 0; opacity: 0; }
     .tab-item-wrapper--vertical { height: 0; opacity: 0; }
   }

   /* 关闭中：由 store 的 closingTabIds 驱动 */
   .tab-item-wrapper--closing {
     width: 0;
     height: 0;
     opacity: 0;
     pointer-events: none;
   }

   /* 减弱动态效果：布局收放瞬时，保留淡入淡出 */
   @media (prefers-reduced-motion: reduce) {
     .tab-item-wrapper,
     .tab-item-wrapper--vertical {
       transition: opacity 150ms var(--ease-out);
     }
   }
   ```

2. **`src/stores/tab.ts`** — 引入关闭动画的等待时长常量。放在文件顶部常量区（与 `MAX_RECENTLY_CLOSED` 相邻）：

   ```ts
   // 关闭动画时长（ms）：closingTabIds 标记后等待 CSS 收起完成再真正关闭
   const TAB_CLOSE_ANIM_MS = 150
   ```

3. **`src/stores/tab.ts`** — `TabStoreContext` 接口（`:55-67`）中，`frozenTabIds: Ref<Set<string>>` 一行之后新增：

   ```ts
   closingTabIds: Ref<Set<string>>
   ```

4. **`src/stores/tab.ts`** — `cleanupTabState`（`:105-114`）函数体末尾新增一行（保证所有清理路径都会解除标记）：

   ```ts
   function cleanupTabState(
     tabId: string,
     ctx: TabStoreContext
   ) {
     ctx.tabs.value = ctx.tabs.value.filter((t) => t.id !== tabId)
     ctx.navStates.value.delete(tabId)
     ctx.favicons.value.delete(tabId)
     ctx.proxyInfos.value.delete(tabId)
     useSnifferStore().onTabClosed(tabId)
     ctx.closingTabIds.value.delete(tabId)
   }
   ```

5. **`src/stores/tab.ts`** — 改造 `closeTabAction`（`:280-311`）。**只在函数最前面插入动画标记与等待，其余逻辑逐字保留**。同时在函数上方新增模块级防重入集合：

   ```ts
   // 防重入：同一标签的关闭流程不允许并发（快速双击关闭按钮）
   const closingInFlight = new Set<string>()

   async function closeTabAction(ctx: TabStoreContext, tabId: string) {
     if (closingInFlight.has(tabId)) return
     closingInFlight.add(tabId)
     try {
       // 未被批量预标记 → 单个关闭：先标记让 CSS 开始收起，等动画走完再执行真正的关闭
       if (!ctx.closingTabIds.value.has(tabId)) {
         ctx.closingTabIds.value.add(tabId)
         await new Promise((resolve) => setTimeout(resolve, TAB_CLOSE_ANIM_MS))
       }
       const closingTab = ctx.tabs.value.find((t) => t.id === tabId)
       // ……以下与现状逐字相同，一行不改……
       if (closingTab && closingTab.pageId && !closingTab.url?.startsWith('sessionbox://')) {
         ctx.recentlyClosedTabs.value.unshift({
           pageId: closingTab.pageId,
           title: closingTab.title,
           url: closingTab.url,
           order: closingTab.order
         })
         if (ctx.recentlyClosedTabs.value.length > MAX_RECENTLY_CLOSED) {
           ctx.recentlyClosedTabs.value.pop()
         }
       }

       const closingActive = ctx.activeTabId.value === tabId
       const currentWorkspaceTabs = ctx.workspaceTabs.value
       const currentIndex = currentWorkspaceTabs.findIndex((t) => t.id === tabId)
       const nextWorkspaceTabId = currentIndex === -1
         ? null
         : currentWorkspaceTabs[currentIndex + 1]?.id ?? currentWorkspaceTabs[currentIndex - 1]?.id ?? null

       await api.tab.close(tabId)
       cleanupTabState(tabId, ctx)

       const { useSplitStore } = await import('./split')
       const splitStore = useSplitStore()
       splitStore.handleTabClosed(tabId)

       if (closingActive) {
         await activateNextTabAfterClose(ctx, splitStore, nextWorkspaceTabId)
       }
     } finally {
       closingInFlight.delete(tabId)
     }
   }
   ```

   注意：`try/finally` 包住了插入点之后的**全部**既有函数体（缩进整体加一层）。

6. **`src/stores/tab.ts`** — 改造 `closeTabsSequentially`（`:314-321`），批量目标先全部标记（整波同时收起），再逐个关闭（此时 `closeTabAction` 见到已标记，跳过等待）：

   ```ts
   async function closeTabsSequentially(ctx: TabStoreContext, tabIds: string[]) {
     // 先标记全部目标：所有标签同时开始收起动画，避免逐个 150ms 串行
     for (const id of [...tabIds]) {
       if (ctx.tabs.value.some((t) => t.id === id)) {
         ctx.closingTabIds.value.add(id)
       }
     }
     await new Promise((resolve) => setTimeout(resolve, TAB_CLOSE_ANIM_MS))
     // 复制一份 id 列表，避免关闭过程中 reactive 数组变化影响迭代
     for (const id of [...tabIds]) {
       if (ctx.tabs.value.some((t) => t.id === id)) {
         await closeTabAction(ctx, id)
       }
     }
   }
   ```

7. **`src/stores/tab.ts`** — store 内接线（三处，全部仿照 `frozenTabIds`）：
   - 状态区（`:628` `const frozenTabIds = ...` 之后）：

     ```ts
     const closingTabIds = ref<Set<string>>(new Set())
     ```

   - ctx 对象（`:726-730`）中加入 `closingTabIds`：

     ```ts
     const ctx: TabStoreContext = {
       tabs, activeTabId, tabGroupFilterId, navStates, favicons, faviconVersions,
       frozenTabIds, closingTabIds, proxyInfos, mutedSites, zoomLevels, pendingExternalUrl,
       recentlyClosedTabs, sortedTabs, workspaceTabs, listenersReady, restoreReady
     }
     ```

   - store 的 return（`:820` 附近，`frozenTabIds` 已在列表中）加入 `closingTabIds`。

8. **`src/components/tabs/TabBar.vue`** — 两个 `#item` 容器加动画类。分组模式（`:199-204`）改为：

   ```html
   <div
     v-show="tab.isGroupStart || !isGroupCollapsed(tab)"
     class="flex items-center gap-0.5 flex-shrink-0 tab-item-wrapper"
     :class="{
       'tab-pinned': tab.pinned,
       'tab-item-wrapper--closing': tabStore.closingTabIds.has(tab.id)
     }"
     :data-tab-id="tab.id"
   >
   ```

   扁平模式（`:249-253`）改为：

   ```html
   <div
     class="flex-shrink-0 tab-item-wrapper"
     :class="{
       'tab-pinned': tab.pinned,
       'tab-item-wrapper--closing': tabStore.closingTabIds.has(tab.id)
     }"
     :data-tab-id="tab.id"
   >
   ```

9. **`src/components/tabs/TabBarVertical.vue`** — 两个 `#item` 容器同样处理（垂直用 `--vertical` 修饰类）。分组模式（`:85-89`）：

   ```html
   <div
     v-show="tab.isGroupStart || !isGroupCollapsed(tab)"
     class="w-full tab-item-wrapper tab-item-wrapper--vertical"
     :class="{
       'tab-pinned': tab.pinned,
       'tab-item-wrapper--closing': tabStore.closingTabIds.has(tab.id)
     }"
   >
   ```

   扁平模式（`:138-141`）：

   ```html
   <div
     class="w-full tab-item-wrapper tab-item-wrapper--vertical"
     :class="{
       'tab-pinned': tab.pinned,
       'tab-item-wrapper--closing': tabStore.closingTabIds.has(tab.id)
     }"
   >
   ```

   （两个文件都已引入 `useTabStore`，模板里 `tabStore` 直接可用。）

## Boundaries

- 不要改 `TabItem.vue`（其内部过渡由 004 号计划处理）。
- 不要改 `closeTabAction` 中既有的关闭顺序（api.tab.close → cleanupTabState → handleTabClosed → activateNextTabAfterClose）——分屏与最近关闭逻辑依赖此顺序。
- 不要用 `<TransitionGroup>` 方案：vuedraggable@4 不支持，硬套会与 Sortable 的 DOM 操作冲突。
- 不要给拖拽相关的 Sortable 参数做任何改动（`:animation="150"`、`filter` 保持原样）。
- 若 `tab.ts` 的行号与上述摘录对不上（代码已漂移），以函数名和代码摘录为准定位；若函数体逻辑本身不同，STOP 并报告。

## Verification

- **Mechanical**:
  - `pnpm build` 成功（exit 0），无 TypeScript 报错。
  - `npx eslint src/stores/tab.ts src/components/tabs/TabBar.vue src/components/tabs/TabBarVertical.vue` 无新增报错。
- **Feel check**（`pnpm dev`）：
  - 点「+」新建标签：新标签从 0 宽度展开推开邻居，约 200ms，快进快出无拖泥带水。
  - 点标签上的 X：标签横向收起消失，邻居平滑合拢，约 150ms；**内容区切换到下一个标签的时机在动画之后**（可感知但不应觉得卡）。
  - 右键「关闭其他标签页」：所有目标标签**同时**收起成一波，而非逐个 150ms 连锁。
  - 激活态标签带 `shadow-sm`：确认其阴影没有被 `overflow: hidden` 裁出难看边缘（shadow-sm 仅 1px，正常不可感知；若肉眼可见异常，报告而非自行改设计）。
  - **拖拽排序**一个标签横穿列表：拖拽预览与落位均无闪烁、无异常动画（Sortable 走原生 drag 快照，不应触发进场动画）。
  - 切换「水平/侧边栏布局」：标签重新挂载会整体播放一次进场动画——这是预期行为（一次性、约 200ms 的布局迁移提示）；若肉眼觉得突兀，报告观感。
  - 应用启动时已恢复的标签会播放一次进场动画（预期，会话恢复感）；确认无布局错乱。
  - DevTools → Rendering 勾选 `prefers-reduced-motion: reduce`：新建/关闭标签不再有宽度变化，只有快速淡入淡出。
  - 关闭标签瞬间连点两次 X：无报错、无重复关闭（控制台无 `api.tab.close` 异常）。
- **Done when**: 新建展开、单个关闭收起、批量关闭成波三个场景都平滑；拖拽排序行为与改动前完全一致。
