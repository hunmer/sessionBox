# SessionBox - 多账号浏览器工具设计文档

## 概述

基于 Electron + Vue 3 + shadcn-vue + Vite + TailwindCSS 构建的多账号（partition）浏览器工具。每个账号拥有独立的 session（cookie、localStorage 等），支持代理绑定，适合多账号运营场景。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Electron 33+ |
| 前端 | Vue 3 (Composition API) + TypeScript |
| UI 组件 | shadcn-vue |
| 样式 | TailwindCSS |
| 构建 | electron-vite |
| 拖拽 | vuedraggable (SortableJS) |
| 状态管理 | Pinia |
| 数据持久化 | electron-store (JSON) |
| 图标 | lucide-vue-next |

## 架构设计

### 方案选择：单窗口 + WebContentsView

使用 Electron 的 WebContentsView API 管理多个网页视图。主进程管理视图生命周期，渲染进程（Vue）负责 UI。

```
┌─────────────────────────────────────────────────┐
│                  主进程 (Main)                    │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ 窗口管理  │  │ WebContents  │  │ 数据存储   │  │
│  │ BrowserWin│  │ View 管理    │  │ electron- │  │
│  │ 创建/尺寸 │  │ 创建/销毁/   │  │ store     │  │
│  │           │  │ 切换/代理    │  │ JSON      │  │
│  └─────┬─────┘  └──────┬───────┘  └─────┬─────┘  │
│        └───────────┬────┘                │        │
│              IPC Bridge (preload)         │        │
├─────────────────────────────────────────────────┤
│                渲染进程 (Vue 3)                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ 侧边栏   │  │ 标签栏   │  │ 工具栏        │  │
│  │ 分组/账号 │  │ 拖拽排序 │  │ 后退/前进/URL │  │
│  │ 拖拽排序  │  │          │  │               │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│  ┌─────────────────────────────────────────────┐ │
│  │        WebContentsView 占位区域              │ │
│  │   （主进程在此位置叠加 WebContentsView）      │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 核心流程

- **渲染进程**：只负责 UI（侧边栏、标签栏、工具栏），不包含实际网页内容
- **主进程**：管理所有 WebContentsView 实例，通过坐标计算将视图叠加到渲染窗口的正确位置
- **IPC 通信**：渲染进程通过 preload 暴露的 API 向主进程发送指令
- **数据层**：主进程使用 electron-store 管理 JSON 数据，渲染进程通过 IPC 读写

## 目录结构

```
sessionBox/
├── electron/                    # 主进程代码
│   ├── main.ts                  # 入口，创建窗口
│   ├── ipc/                     # IPC 处理模块
│   │   ├── tab.ts               # tab 相关 IPC
│   │   ├── account.ts           # 账号/分组 CRUD
│   │   ├── proxy.ts             # 代理管理 + 测试
│   │   └── index.ts             # 统一注册
│   ├── services/
│   │   ├── store.ts             # electron-store 封装
│   │   ├── webview-manager.ts   # WebContentsView 生命周期管理
│   │   └── proxy.ts             # 代理设置应用
│   └── utils/
│       └── user-agent.ts        # UA 覆盖逻辑
├── src/                         # 渲染进程 (Vue 3)
│   ├── App.vue                  # 根布局
│   ├── main.ts                  # Vue 入口
│   ├── components/
│   │   ├── sidebar/             # 侧边栏相关组件
│   │   │   ├── Sidebar.vue      # 侧边栏容器（可折叠）
│   │   │   ├── GroupList.vue    # 分组列表（拖拽排序）
│   │   │   ├── GroupItem.vue    # 单个分组（可折叠）
│   │   │   └── AccountItem.vue  # 账号项
│   │   ├── tabs/                # 标签栏相关组件
│   │   │   ├── TabBar.vue       # 标签栏容器（拖拽排序）
│   │   │   └── TabItem.vue      # 单个标签
│   │   ├── toolbar/
│   │   │   └── BrowserToolbar.vue  # 后退/前进/刷新/地址栏
│   │   ├── proxy/
│   │   │   └── ProxyDialog.vue  # 代理管理弹窗
│   │   └── common/
│   │       └── ConfirmDialog.vue
│   ├── composables/
│   │   ├── useIpc.ts            # IPC 调用封装
│   │   └── useDragSort.ts       # 拖拽排序通用逻辑
│   ├── stores/
│   │   ├── account.ts           # 账号/分组状态
│   │   ├── tab.ts               # tab 状态
│   │   └── proxy.ts             # 代理状态
│   ├── types/
│   │   └── index.ts
│   └── styles/
│       └── globals.css
├── preload/
│   └── index.ts                 # preload 脚本
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── components.json              # shadcn-vue 配置
```

## 数据模型

```typescript
// 代理
interface Proxy {
  id: string
  name: string
  type: 'socks5' | 'http' | 'https'
  host: string
  port: number
  username?: string
  password?: string
}

// 分组
interface Group {
  id: string
  name: string
  order: number
  proxyId?: string    // 分组级代理绑定
}

// 账号
interface Account {
  id: string
  groupId: string
  name: string
  icon: string        // 预设图标名称
  proxyId?: string    // 账号级代理（优先于分组代理）
  defaultUrl: string  // 启动 URL，默认 about:blank
  order: number
}

// 标签页
interface Tab {
  id: string
  accountId: string
  title: string
  url: string
  order: number
  webContentId?: number  // WebContentsView 的 id
}
```

代理优先级：账号级代理 > 分组级代理 > 无代理

## UI 布局

```
┌──────────┬───────────────────────────────────────┐
│          │  [Tab1] [Tab2] [Tab3]    [+]          │
│  侧边栏   │───────────────────────────────────────│
│  (可折叠) │  [←] [→] [↻]  [_______URL栏________] │
│          │───────────────────────────────────────│
│  ┌─分组1─┐│                                       │
│  │ 账号A  ││                                       │
│  │ 账号B  ││      WebContentsView 区域             │
│  └──────┘│      （由主进程叠加渲染）               │
│  ┌─分组2─┐│                                       │
│  │ 账号C  ││                                       │
│  └──────┘│                                       │
│          │                                       │
│ [+分组]  │                                       │
└──────────┴───────────────────────────────────────┘
```

### 侧边栏

- 展开宽度 260px，折叠宽度 52px（仅图标）
- 分组标题点击展开/收起，使用 shadcn Collapsible
- 分组和账号列表均支持拖拽排序（vuedraggable）
- 账号悬浮时显示 `⋯` 按钮，点击弹出 DropdownMenu（编辑/删除）
- 点击账号：无 tab 则创建新 tab 加载 defaultUrl，有 tab 则切换到第一个
- 当前有激活 webview 的账号显示高亮样式
- 底部有「代理设置」入口和「+ 分组」按钮

### 标签栏

- 支持拖拽排序
- 标签点击 `×` 关闭
- `+` 按钮弹出 dropdown 选择账号开新 tab
- 切换 tab 时主进程切换 WebContentsView 可见性
- 标签信息变更（title/url/order）自动通过 IPC 保存

### 工具栏

- 后退/前进按钮根据导航历史动态禁用/启用
- 刷新按钮重新加载当前页面
- 地址栏显示当前 tab URL，回车导航，聚焦时全选

### 代理管理

- 侧边栏底部入口，点击弹出 Dialog
- 列出所有代理，支持添加/编辑/删除
- 测试功能：通过代理请求 httpbin.org/ip，显示结果
- 分组和账号编辑弹窗中有代理绑定下拉选择

## IPC 通道设计

### preload API

```typescript
interface IpcAPI {
  tab: {
    create(accountId: string): Promise<Tab>
    close(tabId: string): Promise<void>
    switch(tabId: string): Promise<void>
    update(tabId: string, data: Partial<Tab>): Promise<void>
    reorder(tabIds: string[]): Promise<void>
    navigate(tabId: string, url: string): Promise<void>
    goBack(tabId: string): Promise<void>
    goForward(tabId: string): Promise<void>
    reload(tabId: string): Promise<void>
  }

  account: {
    list(): Promise<Account[]>
    create(data: Omit<Account, 'id'>): Promise<Account>
    update(id: string, data: Partial<Account>): Promise<void>
    delete(id: string): Promise<void>
  }

  group: {
    list(): Promise<Group[]>
    create(name: string): Promise<Group>
    update(id: string, data: Partial<Group>): Promise<void>
    delete(id: string): Promise<void>
    reorder(groupIds: string[]): Promise<void>
  }

  proxy: {
    list(): Promise<Proxy[]>
    create(data: Omit<Proxy, 'id'>): Proxy>
    update(id: string, data: Partial<Proxy>): Promise<void>
    delete(id: string): Promise<void>
    test(proxyId: string): Promise<{ ok: boolean; ip?: string; error?: string }>
  }

  // 主进程 → 渲染进程事件
  on(event: 'tab:title-updated', callback: (tabId: string, title: string) => void): void
  on(event: 'tab:url-updated', callback: (tabId: string, url: string) => void): void
  on(event: 'tab:nav-state', callback: (tabId: string, state: NavState) => void): void
  on(event: 'tab:favicon-updated', callback: (tabId: string, url: string) => void): void
}
```

### 通道命名规范

- 渲染 → 主进程：`tab:create`、`account:list`、`proxy:test`
- 主进程 → 渲染：`on:tab:title-updated`、`on:tab:url-updated`

## WebContentsView 管理

### 创建 tab 流程

1. 渲染进程调用 `api.tab.create(accountId)`
2. 主进程查询 accountId 对应的 partition（格式：`persist:account-{id}`）
3. 创建 WebContentsView，设置 partition 实现 session 隔离
4. 查找代理优先级：账号级 > 分组级 > 无，如有则对 session 设置 proxy
5. 设置 User-Agent 为 Chrome 标准值
6. 将 WebContentsView 添加到 BrowserWindow
7. 计算视图位置并设置 bounds
8. 加载 defaultUrl
9. 监听导航事件转发给渲染进程
10. 返回 Tab 对象

### 位置同步

- 渲染进程中 webview 占位区域使用固定 div，通过 ResizeObserver 监听
- 尺寸变化时 IPC 发送 `{ x, y, width, height }` 给主进程
- 主进程更新当前活动 WebContentsView 的 bounds
- 侧边栏折叠/展开时自动调整

### Tab 切换

- 隐藏当前 WebContentsView（setVisible(false)）
- 显示目标 WebContentsView（setVisible(true)）
- 更新工具栏状态

### Tab 关闭

- 从 BrowserWindow 移除 WebContentsView
- 销毁 webContents
- 如关闭当前活动 tab，切换到相邻 tab

## User-Agent 覆盖

- 主进程启动时设置 `app.userAgentFallback` 为最新稳定版 Chrome UA
- 每个 WebContentsView 创建时单独设置 `webContents.setUserAgent(...)`

## 视觉风格

### 配色（深色主题 + emerald 点缀）

| 角色 | 色值 | 用途 |
|------|------|------|
| 背景-深 | `#0f1117` | 侧边栏背景 |
| 背景-中 | `#1a1d27` | 主区域背景 |
| 背景-浅 | `#252830` | 卡片、hover 状态 |
| 前景-主 | `#e4e4e7` | 主要文字 |
| 前景-次 | `#9ca3af` | 次要文字 |
| 强调色 | `#10b981` (emerald) | 激活态、高亮 |
| 边框 | `#2e3140` | 分割线、边框 |
| 危险 | `#ef4444` | 删除、错误 |

### 尺寸规范

- 侧边栏：展开 260px / 折叠 52px
- 标签栏高度：38px
- 工具栏高度：40px
- 圆角：4-6px
- 图标库：lucide-vue-next

### shadcn-vue 组件使用

| 组件 | 用途 |
|------|------|
| Button | 工具栏按钮、添加按钮 |
| Input | 地址栏、表单输入 |
| Dialog | 编辑弹窗 |
| DropdownMenu | 账号更多菜单 |
| Collapsible | 分组展开/收起 |
| ScrollArea | 侧边栏滚动 |
| Tooltip | 按钮悬浮提示 |
| Select | 代理绑定选择 |
| AlertDialog | 删除确认 |

标签栏因需拖拽排序和自定义样式，使用自定义组件实现。

## 数据持久化

使用 electron-store 存储为本地 JSON 文件。

### Tab 状态恢复

应用重启后恢复所有 tab 及其当前 URL（不恢复导航历史）。

### 多 tab 行为

同一账号可开多个 tab，共享同一 partition session（共享 cookie 等）。

## 开发原则

1. 不使用紫色配色
2. 模块化设计，单文件不超过 1000 行
3. 使用 shadcn-vue 组件，通过 shadcnVue MCP 工具查看可用组件
4. 配色方案使用 frontend-design 技能在实施阶段细化
