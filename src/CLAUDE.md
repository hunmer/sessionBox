[根目录](../CLAUDE.md) > **src**

# src/ -- 渲染进程模块

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-04-13 10:44:52 | 增量更新 | 大幅更新：14 个 Pinia Store（含工作区、容器、页面、下载、分屏、快捷键、历史、主页、用户资料、扩展）、Dexie IndexedDB、分屏布局算法、书签导入导出、主题预设、WebView 覆盖层检测等 |
| 2026-04-09 02:12:31 | 初始化 | 首次生成模块文档 |

---

## 模块职责

Vue 3 渲染进程，负责：
- 应用 UI 界面渲染（侧边栏、标签栏、工具栏、对话框、分屏、下载面板、历史面板等）
- 用户交互处理
- 通过 IPC API 与主进程通信
- Pinia 状态管理（14 个 Store，本地缓存 + IPC 同步）
- 主题切换（亮色/暗色，6 种预设主题）
- 布局管理（可调整大小的面板、标签栏方向、分屏视图）
- 本地浏览历史记录（Dexie/IndexedDB）
- 书签导入导出（Chrome HTML 格式）

---

## 入口与启动

**入口文件**：`src/main.ts`

启动流程：
1. 创建 Vue 应用实例
2. 安装 Pinia 状态管理
3. 挂载到 `#app`
4. `App.vue` 的 `onMounted` 中并行初始化 Store

---

## 对外接口

### Pinia Stores（src/stores/）

| Store | 文件 | 职责 |
|-------|------|------|
| `useWorkspaceStore` | `stores/workspace.ts` | 工作区 CRUD、激活切换、历史栈、视图模式 |
| `useContainerStore` | `stores/container.ts` | 分组与容器 CRUD、排序、按工作区过滤 |
| `usePageStore` | `stores/page.ts` | 页面 CRUD、按分组归类 |
| `useTabStore` | `stores/tab.ts` | 标签页 CRUD、导航、代理信息、冻结状态、静音、标签栏布局、IPC 事件监听 |
| `useProxyStore` | `stores/proxy.ts` | 代理 CRUD、代理测试 |
| `useBookmarkStore` | `stores/bookmark.ts` | 书签/文件夹 CRUD、移动、导入/导出 Chrome HTML |
| `useThemeStore` | `stores/theme.ts` | 主题切换（亮/暗）+ 6 种预设主题（默认/Apple/Google/Tesla/Spotify/NVIDIA） |
| `useDownloadStore` | `stores/download.ts` | Aria2 下载管理（连接/配置/任务列表/暂停/恢复/重试） |
| `useSplitStore` | `stores/split.ts` | 分屏视图管理（预设/自定义/方案、面板操作、工作区联动、持久化） |
| `useShortcutStore` | `stores/shortcut.ts` | 快捷键管理（列表/更新/清除/重置） |
| `useExtensionStore` | `stores/extension.ts` | Chrome 扩展管理 |
| `useHistoryStore` | `stores/history.ts` | 浏览历史（Dexie/IndexedDB，增删查、按日期范围、搜索） |
| `useHomepageStore` | `stores/homepage.ts` | 主页设置（URL、打开方式、自动打开，localStorage） |
| `useUserProfileStore` | `stores/userProfile.ts` | 用户资料（名称、头像，localStorage） |

### UI 组件结构

**核心业务组件**：

| 组件 | 说明 |
|------|------|
| `App.vue` | 根布局（ResizablePanelGroup 三面板） |
| `sidebar/Sidebar.vue` | 侧边栏 |
| `sidebar/WorkspaceDialog.vue` | 工作区编辑对话框 |
| `tabs/TabBar.vue` / `TabBarVertical.vue` | 水平/垂直标签栏 |
| `toolbar/BrowserToolbar.vue` | 浏览器工具栏（地址栏、导航按钮） |
| `bookmarks/BookmarkBar.vue` | 书签栏 |
| `proxy/ProxyDialog.vue` | 代理管理对话框 |
| `settings/SettingsDialog.vue` | 设置对话框 |
| `settings/ExtensionManager.vue` | 扩展管理器 |
| `common/UpdateNotification.vue` | 更新通知 |
| 分屏组件 | 分屏面板与拖拽 |
| 下载组件 | 下载管理面板 |
| 历史组件 | 历史记录面板 |

**UI 基础组件**（`components/ui/`）：基于 shadcn-vue + Radix Vue/reka-ui 的标准组件集，包括：
alert-dialog, avatar, badge, breadcrumb, button, checkbox, collapsible, command, context-menu, dialog, dropdown-menu, input, kbd, popover, progress, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, sonner, switch, tooltip

---

## 关键依赖与配置

| 依赖 | 用途 |
|------|------|
| `vue` ^3.5 | UI 框架 |
| `pinia` ^2.3 | 状态管理 |
| `radix-vue` ^1.9 / `reka-ui` ^2.9 | 无障碍 UI 原语 |
| `lucide-vue-next` ^0.460 | 图标库 |
| `vuedraggable` ^4.1 | 拖拽排序 |
| `tailwind-merge` + `clsx` + `class-variance-authority` | 样式工具 |
| `@vueuse/core` | Vue 组合函数工具集 |
| `tailwindcss` ^4.1 | CSS 框架 |
| `dexie` ^4.4 | IndexedDB 封装（浏览历史） |
| `vue-sonner` ^2.0 | Toast 通知 |
| `vue3-emoji-picker` ^1.1 | Emoji 选择器 |

---

## 数据模型

类型定义在 `src/types/index.ts` 和 `src/types/split.ts`。

| 模型 | 说明 |
|------|------|
| `Workspace` | 工作区（id, title, color, order, isDefault?） |
| `Group` | 分组（id, name, order, icon?, proxyId?, color?, workspaceId?） |
| `Container` | 容器（id, name, icon, proxyId?, order） |
| `Page` | 页面（id, groupId, containerId?, name, icon, url, order, proxyId?, userAgent?） |
| `Proxy` | 代理配置（id, name, enabled?, proxyMode?, type?, host?, port?...） |
| `Tab` | 标签页（id, pageId, title, url, order, pinned?, muted?） |
| `Bookmark` | 书签（id, title, url, pageId?, favicon?, folderId, order） |
| `BookmarkFolder` | 书签文件夹（id, name, parentId?, order） |
| `Extension` | Chrome 扩展（id, name, path, enabled, icon?） |
| `NavState` | 导航状态运行时数据（canGoBack, canGoForward, isLoading） |
| `SplitLayout` | 分屏布局（presetType, panes, direction, sizes, root） |
| `SavedSplitScheme` | 保存的分屏方案 |
| `SplitNode` | 分屏树节点（leaf/branch 递归结构） |

---

## 测试与质量

当前无测试文件。无 lint 配置。

---

## 组合函数（src/composables/）

| 函数 | 文件 | 用途 |
|------|------|------|
| `useDragSort` | `composables/useDragSort.ts` | 封装 vuedraggable 拖拽排序逻辑 |
| `useIpcEvent` | `composables/useIpc.ts` | IPC 事件监听（组件卸载自动清理） |
| `useDragState` | `composables/useBookmarkDragDrop.ts` | 书签拖拽状态管理（全局单例、落点计算、数据协议） |
| `useNotification` | `composables/useNotification.ts` | 通知中心（基于 vue-sonner，支持 success/error/warning/info/loading/promise） |

---

## 工具函数（src/lib/）

| 函数 | 文件 | 用途 |
|------|------|------|
| `cn()` | `lib/utils.ts` | Tailwind class 合并工具（clsx + twMerge） |
| `startWebviewOverlayDetection` | `lib/webview-overlay.ts` | WebView 覆盖层检测（MutationObserver 监听 dialog/dropdown/popover） |
| `buildPresetTree` 等 | `lib/split-layout.ts` | 分屏布局树操作（构建/克隆/移动/删除/重排/归一化） |
| `db` | `lib/db.ts` | Dexie IndexedDB 数据库（浏览历史，最多 10000 条） |
| `resolveLucideIcon` | `lib/lucide-resolver.ts` | Lucide 图标动态解析（按名称缓存） |

---

## 相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `src/main.ts` | 渲染进程入口 |
| `src/App.vue` | 根组件（三面板布局） |
| `src/types/index.ts` | 类型定义 |
| `src/types/split.ts` | 分屏相关类型定义 |
| `src/env.d.ts` | 环境类型声明 |
| `src/styles/globals.css` | 全局样式（Tailwind + CSS 变量主题） |
| `src/stores/*.ts` | Pinia 状态管理（14 个 Store） |
| `src/components/**/*.vue` | UI 组件 |
| `src/components/ui/**/*.vue` | shadcn-vue 基础组件 |
| `src/composables/*.ts` | 组合函数（4 个） |
| `src/lib/*.ts` | 工具函数（5 个） |
