# Command Palette 设计文档

> 日期: 2026-04-14
> 状态: 已审核通过

## 概述

为 SessionBox 添加命令面板（Command Palette）功能，使用 `Cmd/Ctrl + K` 快捷键触发。采用插件式 Provider 注册表架构，支持按前缀分类搜索书签、页面、标签页和历史记录，无前缀时显示全局命令列表。

## 架构

### 插件式 CommandProvider 模式

每个数据源（bookmark/page/tab/history）实现 `CommandProvider` 接口，注册到中心注册表。命令面板组件不直接依赖任何 Store，只通过 Provider 接口获取数据。

```
CommandPaletteDialog.vue
  └── useCommandPalette (composable)
        ├── CommandRegistry (Provider 注册表)
        │     ├── GlobalCommandProvider  (无前缀)
        │     ├── BookmarkProvider       (prefix: bookmark / bm)
        │     ├── PageProvider           (prefix: page / p)
        │     ├── TabProvider            (prefix: tab / t)
        │     └── HistoryProvider        (prefix: history / h)
        ├── 前缀解析器 (parsePrefix)
        └── 搜索状态管理 (ref<CommandItem[]>)
```

## 接口定义

```typescript
// src/types/command.ts

import type { Component } from 'vue'

/** 命令面板中的单个可选项 */
export interface CommandItem {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  label: string
  /** 副标题（如 URL、描述） */
  description?: string
  /** lucide 图标组件 */
  icon?: Component
  /** 右侧显示的快捷键提示 */
  shortcut?: string
  /** 额外搜索关键词（提升匹配率） */
  keywords?: string[]
  /** 选中时执行的动作 */
  run: () => void | Promise<void>
}

/** 命令数据源提供者接口 */
export interface CommandProvider {
  /** 提供者唯一标识 */
  id: string
  /** 触发前缀（完整形式） */
  prefix: string
  /** 触发前缀（简写形式） */
  prefixShort?: string
  /** 分组标题 */
  label: string
  /** 分组图标 */
  icon: Component
  /** 根据关键词搜索并返回匹配项 */
  search(query: string): Promise<CommandItem[]>
}
```

## 前缀解析规则

| 用户输入 | 匹配 Provider | query 传值 | 说明 |
|----------|--------------|------------|------|
| (空字符串) | `GlobalCommandProvider` | `''` | 显示全局命令列表 |
| `bookmark xxx` | `BookmarkProvider` | `'xxx'` | 搜索书签 |
| `bm xxx` | `BookmarkProvider` | `'xxx'` | 简写 |
| `page xxx` | `PageProvider` | `'xxx'` | 搜索页面 |
| `p xxx` | `PageProvider` | `'xxx'` | 简写 |
| `tab xxx` | `TabProvider` | `'xxx'` | 搜索标签页 |
| `t xxx` | `TabProvider` | `'xxx'` | 简写 |
| `history xxx` | `HistoryProvider` | `'xxx'` | 搜索历史 |
| `h xxx` | `HistoryProvider` | `'xxx'` | 简写 |
| 其他文本 | 全部 Provider | 原始输入 | 跨数据源全局搜索 |

解析逻辑：取输入的第一个空格前的 token，与所有已注册 Provider 的 `prefix` 和 `prefixShort` 进行不区分大小写的匹配。匹配成功则将该 Provider 作为唯一搜索源，空格后的剩余文本作为 query；无匹配则对所有 Provider 执行搜索。

## 全局命令列表

无前缀且无输入时，显示以下常用命令：

| 命令 | 动作 | 图标 |
|------|------|------|
| 新建标签页 | `tabStore.createTab()` | Plus |
| 关闭当前标签页 | `tabStore.closeTab(activeTab.id)` | X |
| 切换侧边栏 | 已有 toggle-sidebar 逻辑 | PanelLeft |
| 打开设置 | 触发 SettingsDialog | Settings |
| 打开书签管理 | 导航到 `sessionbox://bookmarks` | Bookmark |
| 打开历史记录 | 导航到 `sessionbox://history` | History |
| 打开下载管理 | 导航到 `sessionbox://downloads` | Download |

## 选中行为

| 数据源 | 动作 | 实现 |
|--------|------|------|
| bookmark | 在当前标签页导航到书签 URL | `tabStore.navigate(tabId, url)` |
| page | 在当前标签页导航到页面 URL | `tabStore.navigate(tabId, url)` |
| tab | 切换到该标签页 | `tabStore.switchTab(tabId)` |
| history | 在当前标签页导航到历史 URL | `tabStore.navigate(tabId, url)` |
| 全局命令 | 执行对应动作 | 各命令独立实现 |

选中后自动关闭命令面板。

## 文件结构

```
src/types/command.ts                          # CommandItem, CommandProvider 接口
src/composables/useCommandPalette.ts           # 注册表、前缀解析、搜索状态管理
src/components/command-palette/
  ├── CommandPaletteDialog.vue                 # Dialog 组件 (使用 CommandDialog)
  └── providers/
        ├── index.ts                           # 注册所有 provider 并导出
        ├── bookmark.ts                        # BookmarkProvider
        ├── page.ts                            # PageProvider
        ├── tab.ts                             # TabProvider
        ├── history.ts                         # HistoryProvider
        └── global.ts                          # GlobalCommandProvider
```

## 集成点

### App.vue

在根组件中挂载 `<CommandPaletteDialog />`，与现有 Dialog（ProxyDialog、SettingsDialog、TabOverviewDialog）同级放置。

### 快捷键绑定

使用 `@vueuse/core` 的 `useMagicKeys` + `whenever` 在组件内监听 `Cmd/Ctrl + K`（macOS 为 `meta_k`，跨平台需同时监听 `ctrl_k`）。

不通过 IPC 快捷键系统（`shortcut-manager.ts`）注册，因为命令面板是纯渲染进程功能，不需要主进程参与。

### UI 组件

直接使用已有的 `src/components/ui/command/CommandDialog.vue`，它已封装了 Dialog + Command 的组合。图标使用 `lucide-vue-next`。

## Provider 实现要点

### BookmarkProvider

- 数据源：`useBookmarkStore().bookmarks`
- 搜索字段：`title`、`url`
- 图标：`Bookmark`
- run：调用 `tabStore.navigate(activeTabId, bookmark.url)`

### PageProvider

- 数据源：`usePageStore().pages`
- 搜索字段：`name`、`url`
- 图标：`LayoutGrid`
- run：调用 `tabStore.navigate(activeTabId, page.url)`

### TabProvider

- 数据源：`useTabStore().tabs`
- 搜索字段：`title`、`url`
- 图标：`AppWindow`
- run：调用 `tabStore.switchTab(tab.id)`

### HistoryProvider

- 数据源：`useHistoryStore().searchHistory(query)`
- 搜索字段：由 Store 的 `searchHistory` 方法处理（title + url 模糊匹配）
- 图标：`History`
- run：调用 `tabStore.navigate(activeTabId, entry.url)`

### GlobalCommandProvider

- 无搜索逻辑，直接返回预定义命令列表
- 当 query 为空字符串时返回全部命令
- 当 query 非空时按 label/keywords 过滤

## 设计约束

- 命令面板是**纯渲染进程功能**，不涉及 IPC 通信
- 搜索结果**无分页**，各 Provider 自行限制返回数量（建议 20 条）
- HistoryProvider 是**异步搜索**（IndexedDB），其他 Provider 可同步或异步
- Provider 的 `search` 方法统一返回 `Promise<CommandItem[]>` 以兼容异步场景
