# Split View Design - 分屏功能设计文档

**日期**: 2026-04-12
**状态**: Approved

---

## 概述

为 SessionBox 添加 BrowserView 分屏功能，支持在同一工作区内同时展示多个标签页。使用渲染进程驱动方案：Vue 层管理 ResizablePanelGroup 布局，主进程 WebviewManager 扩展为支持多个并存的激活 view。

---

## 数据模型

### SplitPane

```typescript
interface SplitPane {
  id: string                    // pane 唯一 ID
  activeTabId: string | null    // 该区域当前激活的 tab
  order: number                 // 排序
}
```

### SplitLayout（运行时状态）

```typescript
interface SplitLayout {
  type: '1' | '2h' | '2v' | '3' | '4' | 'custom'
  panes: SplitPane[]
  direction: 'horizontal' | 'vertical'  // 顶层方向
  sizes: number[]                        // 各 panel 初始大小（百分比）
}
```

### SavedSplitScheme（持久化的自定义方案）

```typescript
interface SavedSplitScheme {
  id: string
  name: string
  direction: 'horizontal' | 'vertical'
  paneCount: number
  sizes: number[]   // 各 panel 大小（百分比）
}
```

### 预设方案

| type | 方向 | 面板数 | sizes | 结构说明 |
|------|------|--------|-------|----------|
| `1` | - | 1 | [100] | 单 pane，等同现有行为 |
| `2h` | horizontal | 2 | [50, 50] | 水平二分 |
| `2v` | vertical | 2 | [50, 50] | 垂直二分 |
| `3` | 嵌套 | 3 | [50, 50, 50] | 左一右二：Horizontal( Panel1, Vertical(Panel2, Panel3) ) |
| `4` | 嵌套 | 4 | [50, 50, 50, 50] | 2x2 网格：Horizontal( Vertical(P1,P2), Vertical(P3,P4) ) |

### 存储

- 当前工作区分屏状态：`electron-store` key `split-{workspaceId}`，包含 pane 数量、各 pane activeTabId、resizable sizes
- 自定义保存方案：`electron-store` key `split-schemes`，数组形式
- 每个工作区对应独立的分屏方案

---

## 组件架构

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/stores/split.ts` | SplitStore - 分屏状态管理（preset 应用、tab 分配、方案保存/加载） |
| `src/components/tabs/SplitButton.vue` | 分屏按钮 + Dropdown（预设方案、保存、已保存列表） |
| `src/components/tabs/SplitView.vue` | 分屏布局容器（动态 ResizablePanelGroup，含嵌套结构） |
| `electron/ipc/split.ts` | 分屏相关 IPC（方案保存/加载/删除） |

### 修改文件

| 文件 | 改动 |
|------|------|
| `electron/services/webview-manager.ts` | 新增 `updateMultiBounds` 方法 |
| `src/App.vue` | 用 SplitView 替换 `#webview-container` div；改造 sendBounds |
| `src/components/tabs/TabBar.vue` | 添加 SplitButton 组件 |
| `src/stores/tab.ts` | switchTab 需感知分屏状态 |
| `preload/index.ts` | 新增 split 命名空间 API |
| `src/types/index.ts` | 新增 SplitPane、SplitLayout、SavedSplitScheme 类型 |
| `electron/services/store.ts` | 新增分屏方案持久化 |

---

## 组件设计

### SplitStore（src/stores/split.ts）

**职责**：
- 管理当前工作区的 SplitLayout（pane 数量、每个 pane 的 activeTabId）
- `applyPreset(type)`：应用预设分屏方案，将当前工作区 tab 轮流分配到各 pane
- `saveScheme(name)` / `loadScheme(id)` / `deleteScheme(id)`：自定义方案 CRUD
- `setPaneActiveTab(paneId, tabId)`：设置某 pane 的激活 tab
- `focusedPaneId`：最后获得焦点的 pane ID
- 工作区切换时自动保存/恢复分屏状态

**Tab 分配算法**：
```
applyPreset(type):
  1. 根据 type 创建 pane 数组和 resizable 配置
  2. 获取当前工作区的 workspaceTabs
  3. 轮流分配：tabs[0] → pane[0].activeTabId, tabs[1] → pane[1].activeTabId, ...
  4. 如果 tab 数 < pane 数，多余 pane 的 activeTabId 为 null
```

### SplitView.vue

**替换** App.vue 中 `<div id="webview-container">`。

**单 pane 模式**：
```html
<div id="webview-container" class="absolute inset-0" />
```

**多 pane 模式**（以 2h 为例）：
```html
<ResizablePanelGroup direction="horizontal">
  <ResizablePanel :default-size="50">
    <div :id="`webview-pane-${pane0.id}`" class="absolute inset-0" @click="focusPane(pane0.id)" />
  </ResizablePanel>
  <ResizableHandle />
  <ResizablePanel :default-size="50">
    <div :id="`webview-pane-${pane1.id}`" class="absolute inset-0" @click="focusPane(pane1.id)" />
  </ResizablePanel>
</ResizablePanelGroup>
```

**三分屏（左一右二）嵌套结构**：
```html
<ResizablePanelGroup direction="horizontal">
  <ResizablePanel :default-size="50">
    <div :id="`webview-pane-${pane0.id}`" class="absolute inset-0" />
  </ResizablePanel>
  <ResizableHandle />
  <ResizablePanel :default-size="50">
    <ResizablePanelGroup direction="vertical">
      <ResizablePanel :default-size="50">
        <div :id="`webview-pane-${pane1.id}`" class="absolute inset-0" />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel :default-size="50">
        <div :id="`webview-pane-${pane2.id}`" class="absolute inset-0" />
      </ResizablePanel>
    </ResizablePanelGroup>
  </ResizablePanel>
</ResizablePanelGroup>
```

**四分屏（2x2 网格）嵌套结构**：
```html
<ResizablePanelGroup direction="horizontal">
  <ResizablePanel :default-size="50">
    <ResizablePanelGroup direction="vertical">
      <ResizablePanel :default-size="50">
        <div :id="`webview-pane-${pane0.id}`" class="absolute inset-0" />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel :default-size="50">
        <div :id="`webview-pane-${pane1.id}`" class="absolute inset-0" />
      </ResizablePanel>
    </ResizablePanelGroup>
  </ResizablePanel>
  <ResizableHandle />
  <ResizablePanel :default-size="50">
    <ResizablePanelGroup direction="vertical">
      <ResizablePanel :default-size="50">
        <div :id="`webview-pane-${pane2.id}`" class="absolute inset-0" />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel :default-size="50">
        <div :id="`webview-pane-${pane3.id}`" class="absolute inset-0" />
      </ResizablePanel>
    </ResizablePanelGroup>
  </ResizablePanel>
</ResizablePanelGroup>
```

**渲染方式**：由于嵌套结构多样，使用组件递归或条件渲染（v-if/v-else-if 按 layout type 分支）。

### SplitButton.vue

位于 TabBar 中（新建按钮旁），使用 DropdownMenu：

```
┌──────────────────────────────────┐
│  □  一个                         │
│  □  两个水平                      │
│  □  两个垂直                      │
│  □  三个                         │
│  □  四个                         │
│  ─────────────────────────────── │
│  💾 保存当前方案                   │
│  ─────────────────────────────── │
│  📁 我的工作布局                   │  ← 用户保存的方案
│  📁 电商四屏                      │
│  📁 ...                          │
└──────────────────────────────────┘
```

---

## WebviewManager 扩展

### updateMultiBounds（新方法）

```typescript
updateMultiBounds(paneBounds: Array<{
  tabId: string
  rect: { x: number; y: number; width: number; height: number }
}>): void {
  const visibleTabIds = new Set(paneBounds.map(p => p.tabId))

  // 设置所有可见 view 的 bounds
  for (const { tabId, rect } of paneBounds) {
    const entry = this.views.get(tabId)
    if (entry) {
      entry.view.setBounds(rect)
      entry.view.setVisible(true)
    }
  }

  // 隐藏不属于任何 pane 的 view
  for (const [id, entry] of this.views) {
    if (!visibleTabIds.has(id)) {
      entry.view.setVisible(false)
      entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  }
}
```

### switchView 改造

- 不再隐藏前一个 view（分屏模式下多个 view 同时可见）
- 仅更新 `activeTabId` 和 `lastActiveAt`

---

## 交互逻辑

### 点击分屏方案
1. 创建 N 个 pane
2. 将当前工作区 tab 轮流分配（tab[0] → pane[0], tab[1] → pane[1], ...）
3. tab 数 < pane 数时，多余 pane 保持空白
4. 每个 pane 记住自己的 activeTabId

### 点击标签页
- 分屏存在（paneCount > 1）→ tab 显示在 focusedPane 中
- 无分屏（paneCount === 1）→ 和现有行为一致

### Pane 焦点
- 用户点击 pane 区域或 pane 内 WebContentsView 获得焦点时，该 pane 成为 focusedPane
- focusedPaneId 决定新 tab 显示在哪个 pane
- 主进程通过 `on:focus-pane` IPC 事件通知渲染进程 view 获得焦点

### 工作区切换
- 保存当前工作区分屏状态（pane 数、activeTabIds、sizes）
- 切换到新工作区，恢复该工作区之前的分屏方案
- 新工作区无保存方案时默认单 pane

### 新建/关闭 Tab
- 新建 → 分配到 focusedPane
- 关闭 → 如果该 tab 是某 pane 的 activeTab，pane 切换到同工作区下一个可用 tab；如果没有可用 tab，pane 变空

### sendBounds 改造（App.vue）
- 单 pane：读取 `#webview-container` bounds，调用 `tab.updateBounds`
- 多 pane：遍历各 pane 的 `#webview-pane-{id}` 元素，收集 bounds 数组，调用 `split.updateMultiBounds`

---

## IPC 接口

### 新增通道

| 通道 | 方向 | 参数 | 说明 |
|------|------|------|------|
| `split:update-multi-bounds` | 渲染→主 | `Array<{tabId, rect}>` | 同时更新多个 view bounds |
| `split:save-scheme` | 渲染→主 | `SavedSplitScheme` | 保存自定义方案 |
| `split:list-schemes` | 渲染→主 | - | 列出所有保存的方案 |
| `split:delete-scheme` | 渲染→主 | `id` | 删除方案 |
| `split:save-state` | 渲染→主 | `{workspaceId, layout}` | 保存工作区分屏状态 |
| `split:load-state` | 渲染→主 | `workspaceId` | 加载工作区分屏状态 |
| `on:focus-pane` | 主→渲染 | `tabId` | 通知 pane 获得焦点 |

---

## 错误处理

- view 创建失败时 pane 显示空白占位，不影响其他 pane
- tab 被关闭时自动清理对应 pane 的 activeTabId
- 工作区切换失败时回退到单 pane 模式
- 分屏方案保存失败时显示错误提示（toast）
