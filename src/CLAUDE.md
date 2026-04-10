[根目录](../CLAUDE.md) > **src**

# src/ -- 渲染进程模块

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-04-09 02:12:31 | 初始化 | 首次生成模块文档 |

---

## 模块职责

Vue 3 渲染进程，负责：
- 应用 UI 界面渲染（侧边栏、标签栏、工具栏、对话框等）
- 用户交互处理
- 通过 IPC API 与主进程通信
- Pinia 状态管理（本地缓存 + IPC 同步）
- 主题切换（亮色/暗色）
- 布局管理（可调整大小的面板、标签栏方向）

---

## 入口与启动

**入口文件**：`src/main.ts`

启动流程：
1. 创建 Vue 应用实例
2. 安装 Pinia 状态管理
3. 挂载到 `#app`
4. `App.vue` 的 `onMounted` 中并行初始化 Store：`accountStore.init()`、`tabStore.init()`、`proxyStore.init()`、`bookmarkStore.init()`
5. 初始化 ResizeObserver 监听 WebView 容器尺寸变化

---

## 对外接口

### Pinia Stores（src/stores/）

| Store | 文件 | 职责 |
|-------|------|------|
| `useAccountStore` | `stores/account.ts` | 分组与账号 CRUD、排序、按组归类 |
| `useTabStore` | `stores/tab.ts` | 标签页 CRUD、导航（前进/后退/刷新）、布局（水平/垂直）、标签分组 |
| `useProxyStore` | `stores/proxy.ts` | 代理 CRUD、代理测试 |
| `useBookmarkStore` | `stores/bookmark.ts` | 书签 CRUD、文件夹管理、排序 |
| `useThemeStore` | `stores/theme.ts` | 主题切换（亮色/暗色），localStorage 持久化 |

### UI 组件结构

**核心业务组件**：
| 组件 | 文件 | 职责 |
|------|------|------|
| `App.vue` | `App.vue` | 根布局（ResizablePanelGroup 三面板） |
| `Sidebar` | `components/sidebar/Sidebar.vue` | 侧边栏（分组列表、操作按钮） |
| `GroupList` | `components/sidebar/GroupList.vue` | 分组列表（含账号项、拖拽排序） |
| `GroupItem` | `components/sidebar/GroupItem.vue` | 单个分组渲染 |
| `AccountItem` | `components/sidebar/AccountItem.vue` | 单个账号项渲染 |
| `GroupDialog` | `components/sidebar/GroupDialog.vue` | 分组编辑对话框 |
| `AccountDialog` | `components/sidebar/AccountDialog.vue` | 账号编辑对话框 |
| `TabBar` | `components/tabs/TabBar.vue` | 水平标签栏 |
| `TabBarVertical` | `components/tabs/TabBarVertical.vue` | 垂直标签栏 |
| `TabItem` | `components/tabs/TabItem.vue` | 单个标签项渲染 |
| `BrowserToolbar` | `components/toolbar/BrowserToolbar.vue` | 浏览器工具栏（地址栏、导航按钮） |
| `BookmarkBar` | `components/bookmarks/BookmarkBar.vue` | 书签栏（快捷访问） |
| `AddBookmarkDialog` | `components/bookmarks/AddBookmarkDialog.vue` | 添加/编辑书签对话框 |
| `ProxyDialog` | `components/proxy/ProxyDialog.vue` | 代理管理对话框 |
| `SettingsDialog` | `components/settings/SettingsDialog.vue` | 设置对话框（主题、常用网站管理、关于） |
| `AccountPickerDialog` | `components/AccountPickerDialog.vue` | 账号选择器对话框 |

**UI 基础组件**（`components/ui/`）：基于 shadcn-vue + Radix Vue 的标准组件集，包括：
alert-dialog, badge, button, collapsible, context-menu, dialog, dropdown-menu, input, resizable, scroll-area, select, separator, tooltip

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

---

## 数据模型

类型定义在 `src/types/index.ts`。

| 模型 | 说明 |
|------|------|
| `Proxy` | 代理配置（id, name, type, host, port, username?, password?） |
| `Group` | 分组（id, name, order, proxyId?, color?） |
| `Account` | 账号（id, groupId, name, icon, proxyId?, userAgent?, defaultUrl, order） |
| `Tab` | 标签页（id, accountId, title, url, order） |
| `Bookmark` | 书签（id, title, url, accountId?, favicon?, folderId, order） |
| `NavState` | 导航状态运行时数据（canGoBack, canGoForward, isLoading） |

---

## 测试与质量

当前无测试文件。无 lint 配置。

---

## 组合函数（src/composables/）

| 函数 | 文件 | 用途 |
|------|------|------|
| `useDragSort` | `composables/useDragSort.ts` | 封装 vuedraggable 拖拽排序逻辑 |
| `useIpcEvent` | `composables/useIpc.ts` | IPC 事件监听（组件卸载自动清理） |

---

## 工具函数（src/lib/）

| 函数 | 文件 | 用途 |
|------|------|------|
| `cn()` | `lib/utils.ts` | Tailwind class 合并工具（clsx + twMerge） |
| `webviewOverlayShow/Hide` | `lib/webview-overlay.ts` | WebView 覆盖层计数器（多 dialog 嵌套管理） |

---

## 相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `src/main.ts` | 渲染进程入口 |
| `src/App.vue` | 根组件（三面板布局） |
| `src/types/index.ts` | 类型定义 |
| `src/env.d.ts` | 环境类型声明 |
| `src/styles/globals.css` | 全局样式（Tailwind + CSS 变量主题） |
| `src/stores/*.ts` | Pinia 状态管理 |
| `src/components/**/*.vue` | UI 组件 |
| `src/composables/*.ts` | 组合函数 |
| `src/lib/*.ts` | 工具函数 |
