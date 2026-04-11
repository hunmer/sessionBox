# Page-Container 数据模型重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Account 模型重构为 Page + Container 两层模型，解耦「网站」和「浏览器会话身份」。

**Architecture:** 三阶段渐进实施。阶段一纯重命名 Account→Container，阶段二新增 Page 模型并迁移数据，阶段三 UI 重构。

**Tech Stack:** TypeScript, Vue 3, Pinia, Electron, electron-store

**Spec:** `docs/superpowers/specs/2026-04-11-page-container-model-design.md`

---

## 阶段一：纯重命名 Account → Container

> 只改名字和标识符，不改功能逻辑。完成后应用功能与之前完全一致。

### Task 1: 类型定义重命名（三处同步）

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/services/store.ts`
- Modify: `preload/index.ts`

- [ ] **Step 1: 修改 `src/types/index.ts`**
  - `Account` → `Container`
  - `Tab.accountId` → `Tab.containerId`
  - `Bookmark.accountId` → `Bookmark.containerId`

- [ ] **Step 2: 修改 `electron/services/store.ts` 类型部分**
  - `Account` interface → `Container`
  - `Tab.accountId` → `Tab.containerId`
  - `Bookmark.accountId` → `Bookmark.containerId`
  - `StoreSchema.accounts` → `StoreSchema.containers`
  - `StoreSchema.accountExtensions` → `StoreSchema.containerExtensions`
  - 默认值中 `accounts: []` → `containers: []`
  - 默认值中 `accountExtensions: {}` → `containerExtensions: {}`

- [ ] **Step 3: 修改 `preload/index.ts` 类型部分**
  - `Account` interface → `Container`
  - `Tab.accountId` → `Tab.containerId`
  - `Bookmark.accountId` → `Bookmark.containerId`

- [ ] **Step 4: 运行构建验证**
  Run: `pnpm build`
  Expected: 编译失败（因为其他文件仍引用旧名称），确认类型定义已变更

- [ ] **Step 5: Commit**
  ```bash
  git add src/types/index.ts electron/services/store.ts preload/index.ts
  git commit -m "refactor(phase1): rename Account type to Container in type definitions"
  ```

---

### Task 2: store.ts 函数重命名

**Files:**
- Modify: `electron/services/store.ts`

- [ ] **Step 1: 重命名所有 Account CRUD 函数**
  - `listAccounts()` → `listContainers()`
  - `createAccount(data)` → `createContainer(data)`
  - `updateAccount(id, data)` → `updateContainer(id, data)`
  - `deleteAccount(id)` → `deleteContainer(id)`
  - `reorderAccounts(ids)` → `reorderContainers(ids)`
  - `getAccountById(id)` → `getContainerById(id)`

- [ ] **Step 2: 重命名扩展管理函数**
  - `getAccountExtensions(accountId)` → `getContainerExtensions(containerId)`
  - `setAccountExtensions(accountId, ids)` → `setContainerExtensions(containerId, ids)`
  - `addExtensionToAccount(accountId, extId)` → `addExtensionToContainer(containerId, extId)`
  - `removeExtensionFromAccount(accountId, extId)` → `removeExtensionFromContainer(containerId, extId)`

- [ ] **Step 3: 函数内部变量名**
  - 函数体内的 `account` 局部变量 → `container`
  - `accountId` 参数 → `containerId`

- [ ] **Step 4: Commit**
  ```bash
  git add electron/services/store.ts
  git commit -m "refactor(phase1): rename Account CRUD functions to Container in store"
  ```

---

### Task 3: IPC 注册重命名

**Files:**
- Modify: `electron/ipc/index.ts`

- [ ] **Step 1: 更新导入**
  - `reorderAccounts` → `reorderContainers`
  - `listAccounts` → `listContainers`
  - `createAccount` → `createContainer`
  - `updateAccount` → `updateContainer`
  - `deleteAccount` → `deleteContainer`
  - `getAccountById` → `getContainerById`
  - `import type { Account }` → `import type { Container }`

- [ ] **Step 2: 重命名 IPC 通道名**
  - `'account:list'` → `'container:list'`
  - `'account:create'` → `'container:create'`
  - `'account:update'` → `'container:update'`
  - `'account:delete'` → `'container:delete'`
  - `'account:reorder'` → `'container:reorder'`
  - `'account:uploadIcon'` → `'container:uploadIcon'`
  - `'account:createDesktopShortcut'` → `'container:createDesktopShortcut'`

- [ ] **Step 3: 更新 handler 内部代码**
  - `account` 变量 → `container`
  - `accountId` → `containerId`
  - `accountIds` → `containerIds`
  - `partitionPath`: `persist:account-${id}` → `persist:container-${id}`
  - `iconDir`: `'account-icons'` → `'container-icons'`
  - `protocolUrl`: `sessionbox://openAccount?id=` → `sessionbox://openContainer?id=`
  - 错误消息中「账号」→「容器」
  - dialog title: 「选择账号图标」→「选择容器图标」

- [ ] **Step 4: Commit**
  ```bash
  git add electron/ipc/index.ts
  git commit -m "refactor(phase1): rename Account IPC handlers to Container"
  ```

---

### Task 4: Tab IPC 处理器重命名

**Files:**
- Modify: `electron/ipc/tab.ts`

- [ ] **Step 1: 更新导入和函数参数**
  - `getAccountById` → `getContainerById`
  - `tab:create` handler 的 `accountId` 参数 → `containerId`

- [ ] **Step 2: 函数体内部重命名**
  - `tab:create` 中: `account` → `container`, `accountId` → `containerId`
  - `tab:open-in-new-window` 中: `account` → `container`, `info.accountId` → `info.containerId`, partition 路径
  - `tab:restore-all` 中: `tab.accountId` → `tab.containerId`, `account` → `container`

- [ ] **Step 3: Commit**
  ```bash
  git add electron/ipc/tab.ts
  git commit -m "refactor(phase1): rename Account references in Tab IPC handlers"
  ```

---

### Task 5: Proxy IPC 处理器重命名

**Files:**
- Modify: `electron/ipc/proxy.ts`

- [ ] **Step 1: 更新导入和函数体**
  - `listAccounts` → `listContainers`
  - `accounts` 变量 → `containers`
  - 循环中 `account` → `container`
  - `account.proxyId` → `container.proxyId`
  - `account.groupId` → `container.groupId`
  - `account.autoProxyEnabled` → `container.autoProxyEnabled`
  - partition 路径: `persist:account-` → `persist:container-`
  - 日志中 `accountId` → `containerId`

- [ ] **Step 2: Commit**
  ```bash
  git add electron/ipc/proxy.ts
  git commit -m "refactor(phase1): rename Account references in Proxy IPC handlers"
  ```

---

### Task 6: WebView 管理器重命名

**Files:**
- Modify: `electron/services/webview-manager.ts`

- [ ] **Step 1: 更新导入和接口**
  - `getAccountById` → `getContainerById`
  - `ViewEntry.accountId` → `ViewEntry.containerId`

- [ ] **Step 2: `createView` 方法重命名**
  - 参数 `accountId` → `containerId`
  - `account` 变量 → `container`
  - `getAccountById(accountId)` → `getContainerById(containerId)`
  - partition 路径: `persist:account-${accountId}` → `persist:container-${containerId}`
  - `account?.userAgent` → `container?.userAgent`
  - `account?.proxyId` → `container?.proxyId`
  - `account?.autoProxyEnabled` → `container?.autoProxyEnabled`
  - `account.groupId` → `container.groupId`
  - ViewEntry 构造: `accountId` → `containerId`
  - `getExtensionsForAccount(accountId)` → `getExtensionsForAccount(containerId)` (函数名阶段一暂不改)

- [ ] **Step 3: 其余方法重命名**
  - `registerPendingView(accountId)` → `registerPendingView(containerId)`
  - `pendingViews` 中 `accountId` 字段 → `containerId`
  - `getEffectiveProxy(accountId)` → `getEffectiveProxy(containerId)`
  - `refreshProxyInfo` 中 `entry.accountId` → `entry.containerId`
  - `detectProxyInfo` 中 `entry.accountId` → `entry.containerId`
  - `destroyView` 中 `entry.accountId` → `entry.containerId`
  - `switchView` 中 `frozen.accountId` → `frozen.containerId`, `pending.accountId` → `pending.containerId`
  - `setProxyEnabledForTab` 中 `entry.accountId` → `entry.containerId`
  - `getTabIdsByAccount(accountId)` → `getTabIdsByContainer(containerId)`
  - `getViewInfo` 返回值 `accountId` → `containerId`
  - `getActiveTabIdByAccount(accountId)` → `getActiveTabIdByContainer(containerId)`
  - `checkFreeze` 中 `entry.accountId` → `entry.containerId`

- [ ] **Step 4: Commit**
  ```bash
  git add electron/services/webview-manager.ts
  git commit -m "refactor(phase1): rename Account references in WebViewManager"
  ```

---

### Task 7: Preload IPC API 重命名

**Files:**
- Modify: `preload/index.ts`

- [ ] **Step 1: 重命名 API 命名空间**
  - `account: { ... }` → `container: { ... }`
  - 通道名: `'account:*'` → `'container:*'`
  - 类型: `Omit<Account, 'id'>` → `Omit<Container, 'id'>`
  - `accountIds` 参数 → `containerIds`
  - `accountId` 参数 → `containerId`

- [ ] **Step 2: 更新 Tab 和 Extension API**
  - `tab.create(accountId, url)` → `tab.create(containerId, url)`
  - `extension.openBrowserActionPopup(accountId, ...)` → `extension.openBrowserActionPopup(containerId, ...)`

- [ ] **Step 3: Commit**
  ```bash
  git add preload/index.ts
  git commit -m "refactor(phase1): rename Account IPC API to Container in preload"
  ```

---

### Task 8: 渲染进程 Store 重命名

**Files:**
- Rename: `src/stores/account.ts` → `src/stores/container.ts`
- Modify: `src/stores/container.ts`
- Modify: `src/stores/tab.ts`

- [ ] **Step 1: 重命名 account.ts → container.ts 并更新内容**
  - `import type { Account }` → `import type { Container }`
  - `useAccountStore()` → `useContainerStore()`
  - `accounts` ref → `containers` ref
  - `accountsByGroup` → `containersByGroup`
  - `getAccount()` → `getContainer()`
  - `loadAccounts()` → `loadContainers()`
  - `createAccount()` → `createContainer()`
  - `updateAccount()` → `updateContainer()`
  - `deleteAccount()` → `deleteContainer()`
  - `reorderAccounts()` → `reorderContainers()`
  - `api.account.*` → `api.container.*`
  - 所有局部变量 `account` → `container`

- [ ] **Step 2: 更新 `src/stores/tab.ts`**
  - `import { useAccountStore }` → `import { useContainerStore }`
  - `accountStore` → `containerStore`
  - `accountStore.getAccount()` → `containerStore.getContainer()`
  - `accountStore.accounts` → `containerStore.containers`
  - `accountStore.getGroup()` → `containerStore.getGroup()`（Group 方法不变）
  - 所有 `accountId` → `containerId`
  - `accountTabs` → `containerTabs`
  - `accountIds` → `containerIds`
  - `'open-account'` 事件 → `'open-container'`
  - `createTab(accountId)` → `createTab(containerId)`
  - `createTabForSite(url, accountId)` → `createTabForSite(url, containerId)`
  - `createTabWithUrl(accountId, url)` → `createTabWithUrl(containerId, url)`

- [ ] **Step 3: Commit**
  ```bash
  git add src/stores/container.ts src/stores/tab.ts
  git rm src/stores/account.ts
  git commit -m "refactor(phase1): rename Account Store to Container Store"
  ```

---

### Task 9: Vue 组件重命名

**Files:**
- Rename: `src/components/sidebar/AccountDialog.vue` → `src/components/sidebar/ContainerDialog.vue`
- Rename: `src/components/sidebar/AccountItem.vue` → `src/components/sidebar/ContainerItem.vue`
- Modify: 所有引用 accountStore / Account 类型的组件

- [ ] **Step 1: 重命名组件文件**
  ```bash
  git mv src/components/sidebar/AccountDialog.vue src/components/sidebar/ContainerDialog.vue
  git mv src/components/sidebar/AccountItem.vue src/components/sidebar/ContainerItem.vue
  ```

- [ ] **Step 2: 更新 ContainerDialog.vue 内部**
  - `import { useAccountStore }` → `import { useContainerStore }`
  - `import type { Account }` → `import type { Container }`
  - Props: `account` → `container`
  - Emits: 事件数据类型 `Account` → `Container`
  - Store 调用: `accountStore.createAccount()` → `containerStore.createContainer()` 等
  - UI 文本: 「账号」→「容器」

- [ ] **Step 3: 更新 ContainerItem.vue 内部**
  - Props: `account` → `container`
  - Store 调用全部更新
  - UI 文本更新

- [ ] **Step 4: 更新 GroupItem.vue**
  - `import { useAccountStore }` → `import { useContainerStore }`
  - `accountStore` → `containerStore`
  - 循环中 `account` → `container`
  - 事件中 `accountId` → `containerId`

- [ ] **Step 5: 更新 GroupList.vue**
  - 导入路径更新
  - `accountStore` → `containerStore`

- [ ] **Step 6: 更新 Sidebar.vue**
  - `import { useAccountStore }` → `import { useContainerStore }`
  - 所有 `accountStore` → `containerStore`
  - 事件处理函数参数 `accountId` → `containerId`
  - `handleAccountSave` → `handleContainerSave`
  - `handleAccountDelete` → `handleContainerDelete`

- [ ] **Step 7: 更新 TabItem.vue 和 TabBar.vue**
  - `accountStore` → `containerStore`
  - `getAccount` → `getContainer`
  - `tab.accountId` → `tab.containerId`
  - `accountLabel` 计算属性中引用更新

- [ ] **Step 8: 更新书签组件**
  - `AddBookmarkDialog.vue`: `accountId` → `containerId`, account 下拉 → container 下拉
  - `BookmarksPage.vue`: 如有 account 引用则更新

- [ ] **Step 9: 更新其他组件**
  - 全局搜索 `useAccountStore`、`accountStore`、`accountId`、`getAccount` 确认无遗漏
  - 搜索中文「账号」确认 UI 文本全部更新

- [ ] **Step 10: 构建验证**
  Run: `pnpm build`
  Expected: 编译通过，无 TypeScript 错误

- [ ] **Step 11: Commit**
  ```bash
  git add -A
  git commit -m "refactor(phase1): rename Account components to Container"
  ```

---

### Task 10: 主进程协议处理更新

**Files:**
- Modify: `electron/main.ts`（如有 `openAccount` 协议处理）

- [ ] **Step 1: 搜索并更新协议处理**
  - `sessionbox://openAccount` → `sessionbox://openContainer`
  - 确保新旧协议都能触发打开容器的逻辑

- [ ] **Step 2: Commit**
  ```bash
  git add electron/main.ts
  git commit -m "refactor(phase1): update protocol handler openAccount→openContainer"
  ```

---

### Task 11: 阶段一构建与手动验证

- [ ] **Step 1: 完整构建**
  Run: `pnpm build`
  Expected: 无错误

- [ ] **Step 2: 启动开发模式**
  Run: `pnpm dev`

- [ ] **Step 3: 手动验证清单**
  - 创建新容器
  - 编辑容器名称和图标
  - 删除容器
  - 创建标签页并浏览网页
  - 切换标签页
  - 代理设置和热更新
  - 书签创建和打开
  - 工作区切换

- [ ] **Step 4: Commit 阶段一完成标记**
  ```bash
  git commit --allow-empty -m "milestone: phase 1 complete - Account fully renamed to Container"
  ```

---

## 阶段二：新增 Page 模型

> 引入 Page 层，Container 变为全局资源，Tab 关联改为 Tab→Page→Container。

### Task 12: 新增 Page 类型定义

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/services/store.ts`
- Modify: `preload/index.ts`

- [ ] **Step 1: 在三处同步添加 Page interface**
  ```typescript
  export interface Page {
    id: string
    groupId: string
    containerId?: string    // 空 = 走默认容器
    name: string
    icon: string
    url: string
    order: number
    proxyId?: string
    userAgent?: string
  }
  ```

- [ ] **Step 2: 修改 Container interface**
  移除字段: `groupId`, `defaultUrl`, `autoProxyEnabled`, `userAgent`
  保留: `id`, `name`, `icon`, `proxyId`, `order`

- [ ] **Step 3: 修改 Tab interface**
  `containerId` → `pageId`

- [ ] **Step 4: StoreSchema 新增 pages**
  ```typescript
  pages: Page[]
  ```
  默认值: `pages: []`

- [ ] **Step 5: 新增内置默认容器**
  ```typescript
  containers: [
    { id: 'default', name: '默认容器', icon: '📦', proxyId: undefined, order: 0 }
  ]
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add src/types/index.ts electron/services/store.ts preload/index.ts
  git commit -m "refactor(phase2): add Page type and update Container/Tab types"
  ```

---

### Task 13: 新增 Page CRUD 函数

**Files:**
- Modify: `electron/services/store.ts`

- [ ] **Step 1: 实现 Page CRUD**
  ```typescript
  export function listPages(): Page[]
  export function createPage(data: Omit<Page, 'id'>): Page
  export function updatePage(id: string, data: Partial<Omit<Page, 'id'>>): void
  export function deletePage(id: string): void
  export function reorderPages(pageIds: string[]): void
  export function getPageById(id: string): Page | undefined
  export function getPagesByGroup(groupId: string): Page[]
  export function getPagesByContainer(containerId: string): Page[]
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add electron/services/store.ts
  git commit -m "refactor(phase2): add Page CRUD functions in store"
  ```

---

### Task 14: Page IPC 注册

**Files:**
- Modify: `electron/ipc/index.ts`

- [ ] **Step 1: 注册 Page IPC handlers**
  ```typescript
  ipcMain.handle('page:list', () => listPages())
  ipcMain.handle('page:create', (_e, data) => createPage(data))
  ipcMain.handle('page:update', (_e, id, data) => updatePage(id, data))
  ipcMain.handle('page:delete', (_e, id) => deletePage(id))
  ipcMain.handle('page:reorder', (_e, ids) => reorderPages(ids))
  ```

- [ ] **Step 2: 更新 Container 删除逻辑**
  ```typescript
  // container:delete handler 中增加：
  // 1. 查找所有关联 Page
  // 2. 关闭这些 Page 的 Tab（调用 webviewManager）
  // 3. 将 Page 的 containerId 置空
  // 4. 检查是否为默认容器，是则拒绝删除
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add electron/ipc/index.ts
  git commit -m "refactor(phase2): add Page IPC handlers and update Container delete logic"
  ```

---

### Task 15: Preload 新增 Page API

**Files:**
- Modify: `preload/index.ts`

- [ ] **Step 1: 添加 page API 命名空间**
  ```typescript
  page: {
    list: (): Promise<Page[]> => ipcRenderer.invoke('page:list'),
    create: (data: Omit<Page, 'id'>): Promise<Page> =>
      ipcRenderer.invoke('page:create', data),
    update: (id: string, data: Partial<Omit<Page, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('page:update', id, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('page:delete', id),
    reorder: (pageIds: string[]): Promise<void> =>
      ipcRenderer.invoke('page:reorder', pageIds),
  }
  ```

- [ ] **Step 2: 更新 Tab API 参数**
  `tab.create(containerId)` → `tab.create(pageId)`

- [ ] **Step 3: Commit**
  ```bash
  git add preload/index.ts
  git commit -m "refactor(phase2): add Page IPC API in preload"
  ```

---

### Task 16: WebView 管理器更新 Page→Container 链路

**Files:**
- Modify: `electron/services/webview-manager.ts`
- Modify: `electron/ipc/tab.ts`

- [ ] **Step 1: 更新 `createView` 方法**
  - 参数改为 `(tabId, pageId, url)`
  - 通过 `getPageById(pageId)` 获取 page
  - 通过 `getContainerById(page.containerId || 'default')` 获取 container
  - partition 使用 `persist:container-${container.id}`

- [ ] **Step 2: 更新代理优先级**
  ```typescript
  // Page.proxyId → Container.proxyId → Group.proxyId
  const proxyId = page.proxyId ?? container.proxyId ?? getGroupById(page.groupId)?.proxyId
  ```

- [ ] **Step 3: 更新 Tab IPC handlers**
  - `tab:create` 参数 `containerId` → `pageId`
  - `tab:restore-all` 中遍历 tab 时通过 `pageId` 获取 partition

- [ ] **Step 4: 更新 ViewEntry 接口**
  ```typescript
  interface ViewEntry {
    view: WebContentsView
    tabId: string
    pageId: string        // 原 containerId
    containerId: string   // 缓存，避免频繁查找
    lastActiveAt: number
  }
  ```

- [ ] **Step 5: Commit**
  ```bash
  git add electron/services/webview-manager.ts electron/ipc/tab.ts
  git commit -m "refactor(phase2): update WebViewManager to use Page→Container chain"
  ```

---

### Task 17: 数据兼容迁移

**Files:**
- Modify: `electron/services/store.ts`

- [ ] **Step 1: 编写迁移函数**
  ```typescript
  /** 将旧 Container 数据（含 groupId/defaultUrl）自动生成 Page */
  export function migrateContainersToPages(): void {
    // 如果 pages 不存在但 containers 有数据，执行迁移
    if (store.has('pages')) return
    const containers = getCollection<Container>('containers')
    const pages: Page[] = []
    for (const c of containers) {
      if ((c as any).groupId && (c as any).defaultUrl) {
        pages.push({
          id: generateId(),
          groupId: (c as any).groupId,
          containerId: c.id,
          name: c.name,
          icon: c.icon,
          url: (c as any).defaultUrl || 'https://www.baidu.com',
          order: (c as any).order ?? 0,
          proxyId: (c as any).proxyId,
          userAgent: (c as any).userAgent,
        })
      }
    }
    if (pages.length > 0) {
      setCollection('pages', pages)
    }
    // 移除 Container 上的旧字段
    const cleaned = containers.map(c => ({
      id: c.id, name: c.name, icon: c.icon, proxyId: c.proxyId, order: c.order
    }))
    setCollection('containers', cleaned)
  }

  /** 将 Tab.containerId 迁移为 Tab.pageId */
  export function migrateTabContainerToPageId(): void {
    const tabs = getCollection<Tab>('tabs')
    const pages = getCollection<Page>('pages')
    let updated = false
    const newTabs = tabs.map(tab => {
      if ('containerId' in tab && !('pageId' in tab)) {
        const page = pages.find(p => p.containerId === (tab as any).containerId)
        updated = true
        return { ...tab, pageId: page?.id ?? '' }
      }
      return tab
    })
    if (updated) setCollection('tabs', newTabs)
  }
  ```

- [ ] **Step 2: 在 registerIpcHandlers 中调用迁移**
  ```typescript
  export function registerIpcHandlers(): void {
    migrateContainersToPages()
    migrateTabContainerToPageId()
    // ... 原有注册
  }
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add electron/services/store.ts
  git commit -m "refactor(phase2): add data migration from Container to Page model"
  ```

---

### Task 18: 新增 Page Store

**Files:**
- Create: `src/stores/page.ts`

- [ ] **Step 1: 创建 Page Store**
  ```typescript
  import { ref, computed } from 'vue'
  import { defineStore } from 'pinia'
  import type { Page } from '../types'

  export const usePageStore = defineStore('page', () => {
    const pages = ref<Page[]>([])

    const pagesByGroup = computed(() => {
      const map = new Map<string, Page[]>()
      for (const page of pages.value) {
        const list = map.get(page.groupId) || []
        list.push(page)
        map.set(page.groupId, list)
      }
      return map
    })

    function getPage(id: string): Page | undefined {
      return pages.value.find(p => p.id === id)
    }

    async function loadPages() {
      pages.value = await api.page.list()
    }

    async function createPage(data: Omit<Page, 'id'>) {
      const page = await api.page.create(data)
      pages.value.push(page)
      return page
    }

    async function updatePage(id: string, data: Partial<Omit<Page, 'id'>>) {
      await api.page.update(id, data)
      const idx = pages.value.findIndex(p => p.id === id)
      if (idx !== -1) pages.value[idx] = { ...pages.value[idx], ...data }
    }

    async function deletePage(id: string) {
      await api.page.delete(id)
      pages.value = pages.value.filter(p => p.id !== id)
    }

    async function reorderPages(pageIds: string[]) {
      await api.page.reorder(pageIds)
      pageIds.forEach((id, order) => {
        const p = pages.value.find(p => p.id === id)
        if (p) p.order = order
      })
    }

    return {
      pages, pagesByGroup,
      getPage, loadPages, createPage, updatePage, deletePage, reorderPages
    }
  })
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/stores/page.ts
  git commit -m "refactor(phase2): add Page Store"
  ```

---

### Task 19: 阶段二构建与验证

- [ ] **Step 1: 完整构建**
  Run: `pnpm build`
  Expected: 无错误

- [ ] **Step 2: 启动并验证数据迁移**
  Run: `pnpm dev`
  - 首次启动时旧 Container 数据应自动生成 Page
  - Tab 应正确关联到 Page
  - 标签页能正常打开和切换
  - Partition 正确使用 `persist:container-{id}`

- [ ] **Step 3: Commit 阶段二完成标记**
  ```bash
  git commit --allow-empty -m "milestone: phase 2 complete - Page model added with data migration"
  ```

---

## 阶段三：UI 重构

> 更新侧边栏、新建 PageDialog、重构 ContainerDialog 为独立管理面板。

### Task 20: ContainerDialog 改造为独立管理面板

**Files:**
- Modify: `src/components/sidebar/ContainerDialog.vue`

- [ ] **Step 1: 改造为管理面板模式**
  - 列表展示所有 Container（含默认容器）
  - 每个 Container 有编辑和删除按钮
  - 默认容器只显示编辑，不显示删除
  - 顶部有「新建容器」按钮
  - 编辑时展开内联表单（名称、图标、代理）
  - 删除时提示关联 Page 数量

- [ ] **Step 2: Commit**
  ```bash
  git add src/components/sidebar/ContainerDialog.vue
  git commit -m "feat(phase3): refactor ContainerDialog to standalone management panel"
  ```

---

### Task 21: 新建 PageDialog

**Files:**
- Create: `src/components/sidebar/PageDialog.vue`

- [ ] **Step 1: 创建 PageDialog 组件**
  字段:
  - 名称（必填）
  - 图标选择（IconPickerDialog）
  - URL 输入（可选常用网站列表）
  - Container 下拉选择 + 「管理」按钮（打开 ContainerDialog）
  - 代理设置（下拉：不设置/继承分组/自定义选择）
  - UA 设置（可选）

  Props:
  ```typescript
  defineProps<{
    page?: Page | null
    groupId: string
  }>()
  ```

  Emits:
  ```typescript
  defineEmits<{
    save: [data: Omit<Page, 'id'>]
    delete: [id: string]
  }>()
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/components/sidebar/PageDialog.vue
  git commit -m "feat(phase3): create PageDialog component"
  ```

---

### Task 22: 侧边栏更新

**Files:**
- Modify: `src/components/sidebar/GroupItem.vue`
- Modify: `src/components/sidebar/GroupList.vue`
- Modify: `src/components/sidebar/Sidebar.vue`

- [ ] **Step 1: GroupItem 展示 Page 列表**
  - 原 Container 列表改为 Page 列表
  - 使用 `pageStore.pagesByGroup` 获取分组下的 Page
  - Page 项显示: 图标 + 名称 + tab 数量
  - 右键菜单: 打开、编辑（PageDialog）、删除、创建桌面快捷方式
  - 「新建」按钮触发 PageDialog（传入 groupId）

- [ ] **Step 2: Sidebar 集成 PageDialog 和 ContainerDialog**
  - 新增 PageDialog 状态管理
  - ContainerDialog 作为独立弹窗管理
  - 事件处理从 container CRUD 改为 page CRUD

- [ ] **Step 3: 更新 ContainerItem → PageItem**
  - 显示 Page 信息（名称、图标）
  - 关联 tab 数量显示
  - 点击行为：打开/切换 tab

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/sidebar/
  git commit -m "feat(phase3): update sidebar to display Pages under Groups"
  ```

---

### Task 23: Tab Store 更新 Page 关联

**Files:**
- Modify: `src/stores/tab.ts`

- [ ] **Step 1: 更新 Tab 创建和查询**
  - `createTab(containerId)` → `createTab(pageId)`
  - 计算属性中通过 `pageStore.getPage(tab.pageId)` 获取 page 信息
  - 分组归类通过 `page.groupId` 而非直接查 container
  - 工作区过滤通过 page→group→workspace 链路

- [ ] **Step 2: Commit**
  ```bash
  git add src/stores/tab.ts
  git commit -m "refactor(phase3): update Tab Store to use Page references"
  ```

---

### Task 24: TabBar 和 TabItem 更新

**Files:**
- Modify: `src/components/tabs/TabBar.vue`
- Modify: `src/components/tabs/TabItem.vue`

- [ ] **Step 1: 更新 TabItem 标签显示**
  - `tab.containerId` → `tab.pageId`
  - 通过 `pageStore.getPage()` 获取 page 名称
  - 标签的 title tooltip 显示 page 信息

- [ ] **Step 2: Commit**
  ```bash
  git add src/components/tabs/
  git commit -m "refactor(phase3): update Tab components to use Page references"
  ```

---

### Task 25: 书签更新

**Files:**
- Modify: `src/components/bookmarks/AddBookmarkDialog.vue`
- Modify: `electron/ipc/index.ts`（书签相关 handler）

- [ ] **Step 1: 更新书签关联**
  - `Bookmark.containerId` → `Bookmark.pageId`
  - 书签对话框中可选关联的 Page（而非 Container）
  - IPC handler 更新

- [ ] **Step 2: Commit**
  ```bash
  git add src/components/bookmarks/ electron/ipc/index.ts
  git commit -m "refactor(phase3): update bookmarks to use Page references"
  ```

---

### Task 26: 全局搜索验证

- [ ] **Step 1: 搜索残留引用**
  ```bash
  grep -ri "accountId" src/ electron/ preload/ --include="*.ts" --include="*.vue"
  grep -ri "accountStore" src/ --include="*.ts" --include="*.vue"
  grep -ri "useAccountStore" src/ --include="*.ts" --include="*.vue"
  grep -ri "getAccountById" electron/ --include="*.ts"
  grep -ri "persist:account" electron/ --include="*.ts"
  grep -ri "账号" src/ --include="*.vue" --include="*.ts"
  ```
  Expected: 无结果（全部已替换）

- [ ] **Step 2: 修复任何残留引用**

- [ ] **Step 3: Commit**
  ```bash
  git add -A
  git commit -m "refactor(phase3): clean up remaining Account references"
  ```

---

### Task 27: 最终构建与完整验证

- [ ] **Step 1: 完整构建**
  Run: `pnpm build`
  Expected: 无错误

- [ ] **Step 2: 启动开发模式**
  Run: `pnpm dev`

- [ ] **Step 3: 完整功能验证**
  - 新建 Page（选择 Container）
  - 编辑 Page（修改 Container、代理等）
  - 删除 Page
  - 新建/编辑/删除 Container
  - 强制删除 Container（验证关联 Page 的 Tab 关闭）
  - 默认 Container 不可删除
  - 代理优先级验证（Page > Container > Group）
  - 多个 Page 共享同一个 Container 验证
  - 标签页创建、切换、关闭
  - 书签关联 Page
  - 工作区切换
  - 拖拽排序

- [ ] **Step 4: Commit 最终标记**
  ```bash
  git commit --allow-empty -m "milestone: phase 3 complete - Page-Container model fully implemented"
  ```
