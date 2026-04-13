# SessionBox 插件系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 SessionBox 添加基于 EventEmitter2 的插件系统，支持事件订阅/广播、插件加载/卸载、独立存储、设置视图和插件管理页面。

**Architecture:** 主进程运行 PluginManager（单例），通过 EventEmitter2 事件总线广播四类事件（IPC 调用、数据模型、标签页、渲染推送）。插件从文件系统动态加载，通过 PluginContext API 访问事件/存储/日志。渲染进程通过 `sessionbox://plugins` 内部页展示卡片式插件列表，view.js 使用 Vue runtime compiler 动态编译。

**Tech Stack:** EventEmitter2, Electron ipcMain/ipcRenderer, Vue 3 runtime compiler, Pinia, shadcn-vue/Tailwind CSS

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `electron/services/plugin-event-bus.ts` | EventEmitter2 全局事件总线单例 + broadcastToRenderer 辅助函数 |
| `electron/services/plugin-storage.ts` | 插件独立 JSON 键值存储 |
| `electron/services/plugin-context.ts` | 构建 PluginContext 对象（events/storage/logger） |
| `electron/services/plugin-manager.ts` | 插件管理器（加载/卸载/启用/禁用/列表） |
| `electron/ipc/plugin.ts` | 插件 IPC 处理器（plugin:list/enable/disable/get-view/get-icon） |
| `src/types/plugin.ts` | 插件相关类型定义（PluginInfo, PluginMeta） |
| `src/stores/plugin.ts` | 插件 Pinia Store |
| `src/components/plugins/PluginsPage.vue` | 插件管理页面 |
| `src/components/plugins/PluginCard.vue` | 插件卡片组件 |
| `src/components/plugins/PluginSettings.vue` | 插件设置面板（动态编译 view.js） |
| `resources/plugins/test-plugin/info.json` | 测试插件元信息 |
| `resources/plugins/test-plugin/icon.png` | 测试插件图标 |
| `resources/plugins/test-plugin/main.js` | 测试插件入口 |
| `resources/plugins/test-plugin/view.js` | 测试插件视图 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `electron/ipc/index.ts` | IPC Proxy 包装 + 注册 plugin IPC |
| `electron/main.ts` | 初始化 PluginManager |
| `electron/services/store.ts` | CRUD 方法中添加事件发射埋点 |
| `electron/services/webview-manager.ts` | 标签页生命周期事件发射 |
| `preload/index.ts` | 新增 api.plugin.* 命名空间 + 类型导出 |
| `src/App.vue` | INTERNAL_PAGES 注册 plugins 页面 |
| `src/types/index.ts` | 导出插件类型 |
| `electron.vite.config.ts` | Vue runtime compiler 配置 |
| `electron-builder.json` | resources/plugins/ 打包配置 |

---

## Task 1: 事件总线 + 插件存储 + PluginContext

**Files:**
- Create: `electron/services/plugin-event-bus.ts`
- Create: `electron/services/plugin-storage.ts`
- Create: `electron/services/plugin-context.ts`
- Create: `src/types/plugin.ts`

- [ ] **Step 1: 创建插件类型定义**

```typescript
// src/types/plugin.ts

/** 插件元信息（info.json 内容） */
export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: {
    name: string
    email?: string
    url?: string
  }
  tags?: string[]
  minAppVersion?: string
  hasView?: boolean
}

/** 插件展示信息（传递给渲染进程） */
export interface PluginMeta {
  id: string
  name: string
  version: string
  description: string
  author: { name: string; email?: string; url?: string }
  tags: string[]
  hasView: boolean
  enabled: boolean
  iconPath: string
}

/** 插件运行时实例 */
export interface PluginInstance {
  id: string
  dir: string
  info: PluginInfo
  enabled: boolean
  module: any
  context: PluginContext
  storage: import('./plugin-storage').PluginStorage
}

/** 插件上下文 API */
export interface PluginContext {
  events: {
    on(event: string, handler: (...args: any[]) => void): void
    once(event: string, handler: (...args: any[]) => void): void
    off(event: string, handler: (...args: any[]) => void): void
    emit(event: string, ...args: any[]): void
  }
  storage: {
    get(key: string): Promise<any>
    set(key: string, value: any): Promise<void>
    delete(key: string): Promise<void>
    clear(): Promise<void>
    keys(): Promise<string[]>
  }
  plugin: PluginInfo
  logger: {
    info(msg: string, ...args: any[]): void
    warn(msg: string, ...args: any[]): void
    error(msg: string, ...args: any[]): void
  }
}
```

- [ ] **Step 2: 创建全局事件总线**

```typescript
// electron/services/plugin-event-bus.ts
import { EventEmitter2 } from 'eventemitter2'

export const pluginEventBus = new EventEmitter2({
  wildcard: true,
  delimiter: ':',
  maxListeners: 50,
  newListener: false,
  removeListenerOnEmpty: true
})

/**
 * 广播渲染进程推送事件
 * 在各 webContents.send 调用点前调用此函数
 */
export function broadcastToRenderer(channel: string, ...args: any[]): void {
  pluginEventBus.emit(`render:${channel}`, { channel, args })
}
```

- [ ] **Step 3: 创建插件存储**

```typescript
// electron/services/plugin-storage.ts
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

export class PluginStorage {
  private filePath: string
  private data: Record<string, any>

  constructor(pluginId: string, userDataPath: string) {
    const dir = join(userDataPath, 'plugin-data', pluginId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'storage.json')
    try {
      this.data = existsSync(this.filePath) ? JSON.parse(readFileSync(this.filePath, 'utf-8')) : {}
    } catch {
      this.data = {}
    }
  }

  async get(key: string): Promise<any> {
    return this.data[key]
  }

  async set(key: string, value: any): Promise<void> {
    this.data[key] = value
    this.save()
  }

  async delete(key: string): Promise<void> {
    delete this.data[key]
    this.save()
  }

  async clear(): Promise<void> {
    this.data = {}
    this.save()
  }

  async keys(): Promise<string[]> {
    return Object.keys(this.data)
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }
}
```

- [ ] **Step 4: 创建 PluginContext 构造器**

```typescript
// electron/services/plugin-context.ts
import { pluginEventBus } from './plugin-event-bus'
import { PluginStorage } from './plugin-storage'
import type { PluginContext, PluginInfo } from '../../src/types/plugin'

export function createPluginContext(
  pluginInfo: PluginInfo,
  storage: PluginStorage,
  eventBus: typeof pluginEventBus
): PluginContext {
  const prefix = `plugin:${pluginInfo.id}:`

  return {
    events: {
      on(event: string, handler: (...args: any[]) => void): void {
        eventBus.on(event, handler)
      },
      once(event: string, handler: (...args: any[]) => void): void {
        eventBus.once(event, handler)
      },
      off(event: string, handler: (...args: any[]) => void): void {
        eventBus.off(event, handler)
      },
      emit(event: string, ...args: any[]): void {
        // 插件间通信：其他插件通过 plugin:{pluginId}:{event} 监听
        eventBus.emit(prefix + event, ...args)
      }
    },

    storage: {
      get: (key: string) => storage.get(key),
      set: (key: string, value: any) => storage.set(key, value),
      delete: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      keys: () => storage.keys()
    },

    plugin: pluginInfo,

    logger: {
      info(msg: string, ...args: any[]): void {
        console.log(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      },
      warn(msg: string, ...args: any[]): void {
        console.warn(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      },
      error(msg: string, ...args: any[]): void {
        console.error(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      }
    }
  }
}
```

- [ ] **Step 5: 在 src/types/index.ts 末尾导出插件类型**

在 `src/types/index.ts` 文件末尾添加：

```typescript
export type { PluginInfo, PluginMeta, PluginContext, PluginInstance } from './plugin'
```

- [ ] **Step 6: Commit**

```bash
git add src/types/plugin.ts src/types/index.ts electron/services/plugin-event-bus.ts electron/services/plugin-storage.ts electron/services/plugin-context.ts
git commit -m "feat(plugin): add event bus, storage, context and type definitions"
```

---

## Task 2: PluginManager 核心实现

**Files:**
- Create: `electron/services/plugin-manager.ts`

- [ ] **Step 1: 实现 PluginManager**

```typescript
// electron/services/plugin-manager.ts
import { join } from 'path'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { app } from 'electron'
import { pluginEventBus } from './plugin-event-bus'
import { PluginStorage } from './plugin-storage'
import { createPluginContext } from './plugin-context'
import type { PluginInfo, PluginMeta, PluginInstance } from '../../src/types/plugin'

class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map()
  private disabledIds: Set<string> = new Set()
  private userDataPath: string
  private pluginsDir: string

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.pluginsDir = join(this.userDataPath, 'plugins')
    this.loadDisabledList()
  }

  /** 加载禁用列表 */
  private loadDisabledList(): void {
    const filePath = join(this.userDataPath, 'plugin-data', 'disabled.json')
    try {
      if (existsSync(filePath)) {
        const ids: string[] = JSON.parse(readFileSync(filePath, 'utf-8'))
        this.disabledIds = new Set(ids)
      }
    } catch {
      this.disabledIds = new Set()
    }
  }

  /** 保存禁用列表 */
  private saveDisabledList(): void {
    const dir = join(this.userDataPath, 'plugin-data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const filePath = join(dir, 'disabled.json')
    writeFileSync(filePath, JSON.stringify([...this.disabledIds], null, 2), 'utf-8')
  }

  /** 扫描并加载所有插件 */
  loadAll(): void {
    if (!existsSync(this.pluginsDir)) return

    const entries = readdirSync(this.pluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const pluginDir = join(this.pluginsDir, entry.name)
      try {
        this.load(pluginDir)
      } catch (err) {
        console.error(`[PluginManager] 加载插件失败: ${pluginDir}`, err)
      }
    }
  }

  /** 加载单个插件目录 */
  load(pluginDir: string): void {
    const infoPath = join(pluginDir, 'info.json')
    const mainPath = join(pluginDir, 'main.js')

    if (!existsSync(infoPath) || !existsSync(mainPath)) return

    const raw = readFileSync(infoPath, 'utf-8')
    const info: PluginInfo = JSON.parse(raw)

    // 验证必需字段
    if (!info.id || !info.name || !info.version || !info.description || !info.author?.name) {
      throw new Error(`插件 ${pluginDir} 的 info.json 缺少必需字段`)
    }

    // 检查是否已加载
    if (this.plugins.has(info.id)) {
      console.warn(`[PluginManager] 插件 ${info.id} 已加载，跳过`)
      return
    }

    // 检查版本兼容性
    if (info.minAppVersion) {
      const appVersion = app.getVersion()
      if (appVersion < info.minAppVersion) {
        console.warn(`[PluginManager] 插件 ${info.name} 要求最低版本 ${info.minAppVersion}，当前 ${appVersion}`)
        return
      }
    }

    // 创建存储和上下文
    const storage = new PluginStorage(info.id, this.userDataPath)
    const context = createPluginContext(info, storage, pluginEventBus)
    const isDisabled = this.disabledIds.has(info.id)

    // 加载模块
    const pluginModule = require(mainPath)

    const instance: PluginInstance = {
      id: info.id,
      dir: pluginDir,
      info,
      enabled: !isDisabled,
      module: pluginModule,
      context
    }

    this.plugins.set(info.id, instance)

    // 非禁用时激活
    if (!isDisabled && typeof pluginModule.activate === 'function') {
      try {
        pluginModule.activate(context)
        console.log(`[PluginManager] 插件已激活: ${info.name} v${info.version}`)
      } catch (err) {
        console.error(`[PluginManager] 插件激活失败: ${info.name}`, err)
      }
    }
  }

  /** 卸载插件 */
  unload(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance) return

    if (instance.enabled && typeof instance.module.deactivate === 'function') {
      try {
        instance.module.deactivate()
      } catch (err) {
        console.error(`[PluginManager] 插件停用失败: ${instance.info.name}`, err)
      }
    }

    // 清理该插件注册的事件监听器（EventEmitter2 通配符模式）
    pluginEventBus.removeAllListeners(`plugin:${pluginId}:**`)

    this.plugins.delete(pluginId)
    console.log(`[PluginManager] 插件已卸载: ${instance.info.name}`)
  }

  /** 启用插件 */
  enable(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance || instance.enabled) return

    if (typeof instance.module.activate === 'function') {
      try {
        instance.module.activate(instance.context)
      } catch (err) {
        console.error(`[PluginManager] 插件激活失败: ${instance.info.name}`, err)
        return
      }
    }

    instance.enabled = true
    this.disabledIds.delete(pluginId)
    this.saveDisabledList()
  }

  /** 禁用插件 */
  disable(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance || !instance.enabled) return

    if (typeof instance.module.deactivate === 'function') {
      try {
        instance.module.deactivate()
      } catch (err) {
        console.error(`[PluginManager] 插件停用失败: ${instance.info.name}`, err)
      }
    }

    // 清理该插件的事件监听器（EventEmitter2 通配符模式）
    pluginEventBus.removeAllListeners(`plugin:${pluginId}:**`)

    instance.enabled = false
    this.disabledIds.add(pluginId)
    this.saveDisabledList()
  }

  /** 获取所有插件元信息 */
  list(): PluginMeta[] {
    return Array.from(this.plugins.values()).map((instance) => ({
      id: instance.info.id,
      name: instance.info.name,
      version: instance.info.version,
      description: instance.info.description,
      author: instance.info.author,
      tags: instance.info.tags || [],
      hasView: instance.info.hasView || false,
      enabled: instance.enabled,
      iconPath: this.getIconPath(instance)
    }))
  }

  /** 获取插件图标路径 */
  private getIconPath(instance: PluginInstance): string {
    const iconPath = join(instance.dir, 'icon.png')
    return existsSync(iconPath) ? iconPath : ''
  }

  /** 获取 view.js 内容 */
  getViewContent(pluginId: string): string | null {
    const instance = this.plugins.get(pluginId)
    if (!instance || !instance.info.hasView) return null

    const viewPath = join(instance.dir, 'view.js')
    if (!existsSync(viewPath)) return null

    try {
      return readFileSync(viewPath, 'utf-8')
    } catch {
      return null
    }
  }

  /** 获取插件图标 base64 */
  getIconBase64(pluginId: string): string | null {
    const instance = this.plugins.get(pluginId)
    if (!instance) return null

    const iconPath = join(instance.dir, 'icon.png')
    if (!existsSync(iconPath)) return null

    try {
      const buffer = readFileSync(iconPath)
      return `data:image/png;base64,${buffer.toString('base64')}`
    } catch {
      return null
    }
  }

  /** 关闭所有插件 */
  shutdown(): void {
    for (const [id] of this.plugins) {
      this.unload(id)
    }
  }
}

// 单例导出
export const pluginManager = new PluginManager()
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/plugin-manager.ts
git commit -m "feat(plugin): implement PluginManager with load/unload/enable/disable"
```

---

## Task 3: IPC 事件广播 + 插件 IPC 处理器

**Files:**
- Modify: `electron/ipc/index.ts`
- Create: `electron/ipc/plugin.ts`

- [ ] **Step 1: 创建插件 IPC 处理器**

```typescript
// electron/ipc/plugin.ts
import { ipcMain } from 'electron'
import { pluginManager } from '../services/plugin-manager'

export function registerPluginIpcHandlers(): void {
  ipcMain.handle('plugin:list', () => {
    return pluginManager.list()
  })

  ipcMain.handle('plugin:enable', (_e, pluginId: string) => {
    pluginManager.enable(pluginId)
  })

  ipcMain.handle('plugin:disable', (_e, pluginId: string) => {
    pluginManager.disable(pluginId)
  })

  ipcMain.handle('plugin:get-view', (_e, pluginId: string) => {
    return pluginManager.getViewContent(pluginId)
  })

  ipcMain.handle('plugin:get-icon', (_e, pluginId: string) => {
    return pluginManager.getIconBase64(pluginId)
  })
}
```

- [ ] **Step 2: 修改 electron/ipc/index.ts — 添加 IPC Proxy + 注册插件 IPC**

在文件顶部 import 区域添加：

```typescript
import { pluginEventBus } from '../services/plugin-event-bus'
import { registerPluginIpcHandlers } from './plugin'
```

在 `registerIpcHandlers()` 函数体开头（第 77 行 `migrateContainersToPages()` 之前）添加 IPC Proxy：

```typescript
export function registerIpcHandlers(): void {
  // ====== IPC 调用广播代理 ======
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = function(channel: string, handler: (...args: any[]) => any) {
    const wrappedHandler = async (event: Electron.IpcMainInvokeEvent, ...args: any[]) => {
      const result = await handler(event, ...args)
      try {
        pluginEventBus.emit(`ipc:${channel}`, { channel, args, result })
      } catch { /* 忽略事件广播错误 */ }
      return result
    }
    return originalHandle(channel, wrappedHandler)
  } as typeof ipcMain.handle

  // ====== Page 数据迁移 ======
  // ...（现有代码不变）
```

在函数体末尾（`mutedSites:remove` 之后，函数结束 `}` 之前）添加：

```typescript
  // ====== 插件管理 ======
  registerPluginIpcHandlers()
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/plugin.ts electron/ipc/index.ts
git commit -m "feat(plugin): add IPC proxy broadcast and plugin IPC handlers"
```

---

## Task 4: 数据模型事件埋点

**Files:**
- Modify: `electron/services/store.ts`

- [ ] **Step 1: 在 store.ts 顶部添加 import**

```typescript
import { pluginEventBus } from './plugin-event-bus'
```

- [ ] **Step 2: 为每个 CRUD 方法添加事件发射**

在每个 `setCollection()` 调用之后（return 之前）添加 `pluginEventBus.emit()` 调用。以下是需要修改的方法和具体插入位置：

**Groups (约 line 289):**
```typescript
// createGroup 方法中，setCollection 之后、return 之前
setCollection('groups', groups)
pluginEventBus.emit('group:created', group)
return group
```

**Groups (约 line 298):**
```typescript
// updateGroup 方法中，setCollection 之后
setCollection('groups', groups)
pluginEventBus.emit('group:updated', { id, ...data })
```

**Groups (约 line 303):**
```typescript
// deleteGroup 方法中，找到被删除的 group 后再过滤
const group = groups.find((g) => g.id === id)
setCollection('groups', groups.filter((g) => g.id !== id))
pluginEventBus.emit('group:deleted', group)
```

**Groups (约 line 312):**
```typescript
// reorderGroups 方法中，setCollection 之后
setCollection('groups', groups)
pluginEventBus.emit('group:reordered', groupIds)
```

**Containers — 同样模式：**
- `createContainer` (line 325 后): `pluginEventBus.emit('container:created', container)`
- `updateContainer` (line 334 后): `pluginEventBus.emit('container:updated', { id, ...data })`
- `deleteContainer` (line 339 后): `pluginEventBus.emit('container:deleted', id)`
- `reorderContainers` (line 348 后): `pluginEventBus.emit('container:reordered', containerIds)`

**Workspaces:**
- `createWorkspace` (line 239 后): `pluginEventBus.emit('workspace:created', workspace)`
- `updateWorkspace` (line 248 后): `pluginEventBus.emit('workspace:updated', { id, ...data })`
- `deleteWorkspace` (line 259 后): `pluginEventBus.emit('workspace:deleted', id)`
- `reorderWorkspaces` (line 268 后): `pluginEventBus.emit('workspace:reordered', workspaceIds)`

**Pages:**
- `createPage` (line 361 后): `pluginEventBus.emit('page:created', page)`
- `updatePage` (line 370 后): `pluginEventBus.emit('page:updated', { id, ...data })`
- `deletePage` (line 376 后): `pluginEventBus.emit('page:deleted', id)`
- `reorderPages` (line 385 后): `pluginEventBus.emit('page:reordered', pageIds)`

**Proxies:**
- `createProxy` (line 493 后): `pluginEventBus.emit('proxy:created', proxy)`
- `updateProxy` (line 502 后): `pluginEventBus.emit('proxy:updated', { id, ...data })`
- `deleteProxy` (line 518 后): `pluginEventBus.emit('proxy:deleted', id)`

**Bookmarks:**
- `createBookmark` (line 587 后): `pluginEventBus.emit('bookmark:created', site)`
- `updateBookmark` (line 596 后): `pluginEventBus.emit('bookmark:updated', { id, ...data })`
- `deleteBookmark` (line 601 后): `pluginEventBus.emit('bookmark:deleted', id)`
- `batchDeleteBookmarks` (line 607 后): `pluginEventBus.emit('bookmark:batch-deleted', ids)`

**BookmarkFolders:**
- `createBookmarkFolder` (line 629 后): `pluginEventBus.emit('bookmark-folder:created', folder)`
- `updateBookmarkFolder` (line 638 后): `pluginEventBus.emit('bookmark-folder:updated', { id, ...data })`
- `deleteBookmarkFolder` (line 649 后): `pluginEventBus.emit('bookmark-folder:deleted', id)`

所有 emit 调用都用 `try { ... } catch { }` 包裹，防止事件广播影响核心逻辑。

- [ ] **Step 3: Commit**

```bash
git add electron/services/store.ts
git commit -m "feat(plugin): add data model event emission in store CRUD methods"
```

---

## Task 5: 标签页生命周期事件 + 渲染推送事件

**Files:**
- Modify: `electron/services/webview-manager.ts`

- [ ] **Step 1: 在文件顶部添加 import**

```typescript
import { broadcastToRenderer } from './plugin-event-bus'
```

- [ ] **Step 2: 在关键生命周期位置添加事件发射**

**标签页激活 (约 line 694):**
在 `this.mainWindow.webContents.send('on:tab:activated', tabId)` 之前添加：
```typescript
broadcastToRenderer('on:tab:activated', tabId)
pluginEventBus.emit('tab:activated', { tabId })
```

**标签页冻结 (约 line 1094):**
在 `this.mainWindow!.webContents.send('on:tab:frozen', tabId, true)` 之前添加：
```typescript
broadcastToRenderer('on:tab:frozen', tabId, true)
pluginEventBus.emit('tab:frozen', { tabId, frozen: true })
```

**标签页解冻 (约 line 372):**
在 `this.mainWindow?.webContents.send('on:tab:frozen', tabId, false)` 之前添加：
```typescript
broadcastToRenderer('on:tab:frozen', tabId, false)
pluginEventBus.emit('tab:unfrozen', { tabId })
```

**标签页销毁 — `destroyView` 方法开头 (约 line 626):**
```typescript
pluginEventBus.emit('tab:closed', { tabId })
```

**标签页导航 — `did-navigate` 回调 (约 line 432):**
在 `this.mainWindow...send('on:tab:url-updated'...)` 之前添加：
```typescript
pluginEventBus.emit('tab:navigated', { tabId, url })
```

**标签页创建 — 需要在 `createView` 方法的 WebContentsView 创建之后添加：**
```typescript
pluginEventBus.emit('tab:created', { tabId, pageId, url })
```

注意：webview-manager.ts 中需要同时 import `pluginEventBus`：
```typescript
import { broadcastToRenderer, pluginEventBus } from './plugin-event-bus'
```

- [ ] **Step 3: Commit**

```bash
git add electron/services/webview-manager.ts
git commit -m "feat(plugin): add tab lifecycle and render push event emissions"
```

---

## Task 6: 主进程初始化 + Preload 桥接

**Files:**
- Modify: `electron/main.ts`
- Modify: `preload/index.ts`

- [ ] **Step 1: 修改 main.ts — 初始化 PluginManager**

在 `electron/main.ts` 的 import 区域添加：

```typescript
import { pluginManager } from './services/plugin-manager'
```

在 `app.whenReady().then(() => {` 回调内，`registerIpcHandlers()` 之后添加：

```typescript
    // 初始化插件系统
    pluginManager.loadAll()
```

在 `app.on('before-quit', ()` 回调内，`isQuitting = true` 之后添加：

```typescript
    pluginManager.shutdown()
```

- [ ] **Step 2: 修改 preload/index.ts — 新增 api.plugin 命名空间**

在类型定义区域（`ShortcutItem` 接口之后）添加：

```typescript
// 插件相关类型
export interface PluginMeta {
  id: string
  name: string
  version: string
  description: string
  author: { name: string; email?: string; url?: string }
  tags: string[]
  hasView: boolean
  enabled: boolean
  iconPath: string
}
```

在 `api` 对象中（`download` 之后、`updater` 之前）添加：

```typescript
  plugin: {
    list: (): Promise<PluginMeta[]> => ipcRenderer.invoke('plugin:list'),
    enable: (pluginId: string): Promise<void> => ipcRenderer.invoke('plugin:enable', pluginId),
    disable: (pluginId: string): Promise<void> => ipcRenderer.invoke('plugin:disable', pluginId),
    getView: (pluginId: string): Promise<string | null> => ipcRenderer.invoke('plugin:get-view', pluginId),
    getIcon: (pluginId: string): Promise<string | null> => ipcRenderer.invoke('plugin:get-icon', pluginId)
  },
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts preload/index.ts
git commit -m "feat(plugin): init PluginManager in main process and add preload bridge"
```

---

## Task 7: Vue Runtime Compiler 配置

**Files:**
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: 启用 Vue runtime compiler**

修改 `electron.vite.config.ts` 中 renderer.plugins 的 `vue()` 调用：

将：
```typescript
vue(),
```

改为：
```typescript
vue({
  isProduction: false // 启用 runtime compiler（插件 view.js 动态编译需要）
}),
```

同时在 renderer 区域添加 alias：

```typescript
renderer: {
    root: '.',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        'vue': 'vue/dist/vue.esm-bundler.js' // runtime compiler
      }
    },
```

- [ ] **Step 2: Commit**

```bash
git add electron.vite.config.ts
git commit -m "feat(plugin): enable Vue runtime compiler for plugin view.js"
```

---

## Task 8: 插件 Pinia Store

**Files:**
- Create: `src/stores/plugin.ts`

- [ ] **Step 1: 创建插件 Store**

```typescript
// src/stores/plugin.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PluginMeta } from '@/types'

export const usePluginStore = defineStore('plugin', () => {
  const plugins = ref<PluginMeta[]>([])
  const isLoading = ref(false)
  const activeViewPluginId = ref<string | null>(null)
  const viewContents = ref<Record<string, string>>({})

  const enabledPlugins = computed(() => plugins.value.filter((p) => p.enabled))
  const disabledPlugins = computed(() => plugins.value.filter((p) => !p.enabled))

  async function init(): Promise<void> {
    isLoading.value = true
    try {
      plugins.value = await window.api.plugin.list()
    } finally {
      isLoading.value = false
    }
  }

  async function enablePlugin(pluginId: string): Promise<void> {
    await window.api.plugin.enable(pluginId)
    const plugin = plugins.value.find((p) => p.id === pluginId)
    if (plugin) plugin.enabled = true
  }

  async function disablePlugin(pluginId: string): Promise<void> {
    await window.api.plugin.disable(pluginId)
    const plugin = plugins.value.find((p) => p.id === pluginId)
    if (plugin) plugin.enabled = false
    if (activeViewPluginId.value === pluginId) {
      activeViewPluginId.value = null
    }
  }

  async function loadViewContent(pluginId: string): Promise<string | null> {
    if (viewContents.value[pluginId]) return viewContents.value[pluginId]
    const content = await window.api.plugin.getView(pluginId)
    if (content) {
      viewContents.value[pluginId] = content
    }
    return content
  }

  async function loadIcon(pluginId: string): Promise<string | null> {
    return window.api.plugin.getIcon(pluginId)
  }

  function openView(pluginId: string): void {
    activeViewPluginId.value = pluginId
  }

  function closeView(): void {
    activeViewPluginId.value = null
  }

  return {
    plugins,
    isLoading,
    activeViewPluginId,
    viewContents,
    enabledPlugins,
    disabledPlugins,
    init,
    enablePlugin,
    disablePlugin,
    loadViewContent,
    loadIcon,
    openView,
    closeView
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/plugin.ts
git commit -m "feat(plugin): add plugin Pinia store"
```

---

## Task 9: 插件管理 UI 组件

**Files:**
- Create: `src/components/plugins/PluginCard.vue`
- Create: `src/components/plugins/PluginSettings.vue`
- Create: `src/components/plugins/PluginsPage.vue`
- Modify: `src/App.vue`

- [ ] **Step 1: 创建 PluginCard.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Settings, Power, PowerOff } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import type { PluginMeta } from '@/types'

const props = defineProps<{
  plugin: PluginMeta
}>()

const emit = defineEmits<{
  (e: 'toggle', pluginId: string): void
  (e: 'open-settings', pluginId: string): void
}>()

const iconDataUrl = ref<string | null>(null)

onMounted(async () => {
  try {
    iconDataUrl.value = await window.api.plugin.getIcon(props.plugin.id)
  } catch {
    iconDataUrl.value = null
  }
})
</script>

<template>
  <div
    class="rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30"
    :class="{ 'opacity-60': !plugin.enabled }"
  >
    <div class="flex gap-4">
      <!-- 图标 -->
      <div class="shrink-0">
        <div class="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
          <img v-if="iconDataUrl" :src="iconDataUrl" class="w-10 h-10 object-contain" alt="" />
          <span v-else class="text-xl">🧩</span>
        </div>
      </div>

      <!-- 信息 -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold truncate">{{ plugin.name }}</h3>
          <span class="text-xs text-muted-foreground">v{{ plugin.version }}</span>
        </div>
        <p class="text-xs text-muted-foreground mt-1 line-clamp-2">{{ plugin.description }}</p>
        <div class="text-xs text-muted-foreground mt-1">{{ plugin.author.name }}</div>

        <!-- 标签 -->
        <div v-if="plugin.tags.length" class="flex flex-wrap gap-1 mt-2">
          <Badge v-for="tag in plugin.tags" :key="tag" variant="secondary" class="text-[10px] px-1.5 py-0">
            {{ tag }}
          </Badge>
        </div>
      </div>

      <!-- 操作 -->
      <div class="flex flex-col items-end gap-2 shrink-0">
        <Switch
          :checked="plugin.enabled"
          @update:checked="emit('toggle', plugin.id)"
        />
        <Button
          v-if="plugin.hasView"
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          title="设置"
          @click="emit('open-settings', plugin.id)"
        >
          <Settings class="w-4 h-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 创建 PluginSettings.vue**

```vue
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue'
import { X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePluginStore } from '@/stores/plugin'
import { createApp, defineComponent, h, type Component } from 'vue'
import { ref as vueRef, computed as vueComputed } from 'vue'

const pluginStore = usePluginStore()

const plugin = ref(
  pluginStore.plugins.find((p) => p.id === pluginStore.activeViewPluginId)
)

const containerRef = ref<HTMLElement | null>(null)
let dynamicApp: any = null

onMounted(async () => {
  if (!plugin.value) return

  const viewContent = await pluginStore.loadViewContent(plugin.value.id)
  if (!viewContent || !containerRef.value) return

  try {
    // 解析 view.js 导出的组件选项对象
    // view.js 是 CommonJS: module.exports = { template, setup, props }
    // 在渲染进程中，我们通过 Function 构造器安全解析
    const moduleExports = new Function('module', 'exports', 'require', `
      const module = { exports: {} };
      const exports = module.exports;
      ${viewContent}
      return module.exports;
    `)()

    if (!moduleExports || !moduleExports.template) return

    const componentDef = {
      ...moduleExports,
      props: {
        ...(moduleExports.props || {}),
        pluginInfo: { type: Object, default: () => plugin.value }
      }
    }

    // 创建动态组件
    const DynamicComponent = defineComponent(componentDef)
    dynamicApp = createApp(DynamicComponent, {
      pluginInfo: {
        id: plugin.value.id,
        name: plugin.value.name,
        version: plugin.value.version,
        description: plugin.value.description
      }
    })

    // 注入常用 Vue API 到全局
    dynamicApp.config.globalProperties.$ref = vueRef
    dynamicApp.config.globalProperties.$computed = vueComputed

    dynamicApp.mount(containerRef.value)
  } catch (err) {
    console.error('[PluginSettings] 动态组件编译失败:', err)
  }
})

onBeforeUnmount(() => {
  if (dynamicApp) {
    dynamicApp.unmount()
    dynamicApp = null
  }
})
</script>

<template>
  <div v-if="plugin" class="border-t border-border bg-muted/30">
    <div class="flex items-center justify-between px-4 py-2 border-b border-border">
      <h3 class="text-sm font-medium">{{ plugin.name }} - 设置</h3>
      <Button variant="ghost" size="icon" class="h-7 w-7" @click="pluginStore.closeView()">
        <X class="w-4 h-4" />
      </Button>
    </div>
    <ScrollArea class="max-h-80">
      <div ref="containerRef" class="p-4" />
    </ScrollArea>
  </div>
</template>
```

- [ ] **Step 3: 创建 PluginsPage.vue**

```vue
<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import PluginCard from './PluginCard.vue'
import PluginSettings from './PluginSettings.vue'
import { usePluginStore } from '@/stores/plugin'
import { useNotification } from '@/composables/useNotification'

const pluginStore = usePluginStore()
const notify = useNotification()

const hasPlugins = computed(() => pluginStore.plugins.length > 0)
const showSettings = computed(() => pluginStore.activeViewPluginId !== null)

onMounted(async () => {
  await pluginStore.init()
})

async function handleRefresh() {
  await pluginStore.init()
  notify.success('插件列表已刷新')
}

async function handleToggle(pluginId: string) {
  const plugin = pluginStore.plugins.find((p) => p.id === pluginId)
  if (!plugin) return

  try {
    if (plugin.enabled) {
      await pluginStore.disablePlugin(pluginId)
      notify.success(`已禁用: ${plugin.name}`)
    } else {
      await pluginStore.enablePlugin(pluginId)
      notify.success(`已启用: ${plugin.name}`)
    }
  } catch (err) {
    notify.error(`操作失败: ${err}`)
  }
}

function handleOpenSettings(pluginId: string) {
  pluginStore.openView(pluginId)
}
</script>

<template>
  <div class="h-full flex flex-col bg-background text-foreground">
    <!-- 顶部工具栏 -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
      <h2 class="text-sm font-semibold flex-shrink-0">插件管理</h2>
      <div class="flex-1" />
      <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="handleRefresh">
        <RefreshCw class="w-3.5 h-3.5" />
        刷新
      </Button>
    </div>

    <!-- 主内容区 -->
    <div class="flex-1 min-h-0 overflow-auto">
      <div class="max-w-3xl mx-auto p-6">
        <div v-if="hasPlugins" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PluginCard
            v-for="plugin in pluginStore.plugins"
            :key="plugin.id"
            :plugin="plugin"
            @toggle="handleToggle"
            @open-settings="handleOpenSettings"
          />
        </div>

        <div v-else class="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p class="text-sm">暂无插件</p>
          <p class="text-xs mt-1">将插件放置在用户数据目录的 plugins 文件夹中</p>
        </div>
      </div>
    </div>

    <!-- 插件设置面板 -->
    <PluginSettings v-if="showSettings" />
  </div>
</template>
```

- [ ] **Step 4: 修改 App.vue — 注册 plugins 内部页面**

在 `src/App.vue` 的 import 区域添加：

```typescript
import PluginsPage from './components/plugins/PluginsPage.vue'
```

在 `INTERNAL_PAGES` 对象中添加 `plugins` 条目：

```typescript
const INTERNAL_PAGES: Record<string, Component> = {
  bookmarks: markRaw(BookmarksPage),
  history: markRaw(HistoryPage),
  downloads: markRaw(DownloadsPage),
  containers: markRaw(ContainersPage),
  plugins: markRaw(PluginsPage)
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/plugins/ src/App.vue
git commit -m "feat(plugin): add PluginsPage, PluginCard, PluginSettings UI components"
```

---

## Task 10: 测试插件

**Files:**
- Create: `resources/plugins/test-plugin/info.json`
- Create: `resources/plugins/test-plugin/main.js`
- Create: `resources/plugins/test-plugin/view.js`

- [ ] **Step 1: 创建 info.json**

```json
{
  "id": "sessionbox.test-plugin",
  "name": "Test Plugin",
  "version": "1.0.0",
  "description": "SessionBox 插件系统测试插件，监听并输出所有事件到控制台",
  "author": {
    "name": "SessionBox"
  },
  "tags": ["测试", "开发"],
  "hasView": true
}
```

- [ ] **Step 2: 创建 main.js**

```javascript
module.exports = {
  activate(context) {
    context.logger.info('Test Plugin 已激活！')

    // 监听所有 IPC 调用
    context.events.on('ipc:**', function(data) {
      context.logger.info(`[IPC] ${this.event} → ${data.channel}`)
    })

    // 监听数据模型事件
    context.events.on('group:*', function(data) {
      context.logger.info(`[Group] ${this.event}`)
    })

    context.events.on('container:*', function(data) {
      context.logger.info(`[Container] ${this.event}`)
    })

    context.events.on('workspace:*', function(data) {
      context.logger.info(`[Workspace] ${this.event}`)
    })

    context.events.on('page:*', function(data) {
      context.logger.info(`[Page] ${this.event}`)
    })

    context.events.on('tab:*', function(data) {
      context.logger.info(`[Tab] ${this.event}`)
    })

    // 写入存储测试
    await context.storage.set('activatedAt', new Date().toISOString())
    await context.storage.set('eventCount', 0)
    context.logger.info('存储测试数据已写入')
  },

  deactivate() {
    console.log('[TestPlugin] 已停用')
  }
}
```

- [ ] **Step 3: 创建 view.js**

```javascript
module.exports = {
  template: `
    <div class="p-4 space-y-4">
      <h3 class="text-lg font-semibold">{{ pluginInfo.name }}</h3>
      <p class="text-sm text-muted-foreground">{{ pluginInfo.description }}</p>

      <div class="text-sm space-y-1">
        <div>
          <span class="text-muted-foreground">版本：</span>
          {{ pluginInfo.version }}
        </div>
        <div>
          <span class="text-muted-foreground">作者：</span>
          {{ pluginInfo.author.name }}
        </div>
      </div>

      <div class="text-xs text-muted-foreground bg-muted p-3 rounded-md">
        此插件为测试用，所有事件输出到主进程控制台。请打开 DevTools 查看日志。
      </div>
    </div>
  `,

  props: {
    pluginInfo: { type: Object, default: () => ({}) }
  },

  setup(props) {
    return { pluginInfo: props.pluginInfo }
  }
}
```

- [ ] **Step 4: 创建一个简单的 128x128 插件图标**

```bash
# 使用 Python 生成一个简单的橙色齿轮图标
python3 -c "
import struct, zlib, math
width, height = 128, 128
raw = b''
for y in range(height):
    raw += b'\x00'
    for x in range(width):
        cx, cy = 64, 64
        dx, dy = abs(x - cx), abs(y - cy)
        dist = (dx*dx + dy*dy) ** 0.5
        angle = math.atan2(y - cy, x - cx)
        tooth = math.cos(angle * 8) > 0
        if dist < 20 or (20 < dist < 50 and tooth):
            raw += bytes([0xF9, 0x7A, 0x1C, 0xFF])
        elif 20 < dist < 50:
            raw += bytes([0xF9, 0x7A, 0x1C, 0x80])
        else:
            raw += bytes([0, 0, 0, 0])
def chunk(ctype, data):
    c = ctype + data
    return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
sig = b'\x89PNG\r\n\x1a\n'
ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
idat = chunk(b'IDAT', zlib.compress(raw))
iend = chunk(b'IEND', b'')
with open('resources/plugins/test-plugin/icon.png', 'wb') as f:
    f.write(sig + ihdr + idat + iend)
"
```

- [ ] **Step 5: Commit**

```bash
git add resources/plugins/test-plugin/
git commit -m "feat(plugin): add test plugin with event listener and settings view"
```

---

## Task 11: 构建配置 + 入口集成

**Files:**
- Modify: `electron-builder.json`

- [ ] **Step 1: 添加插件资源打包配置**

在 `electron-builder.json` 中添加 `extraResources` 配置，将测试插件打包进应用：

```json
{
  "extraResources": [
    {
      "from": "resources/plugins",
      "to": "plugins",
      "filter": ["**/*"]
    }
  ]
}
```

注意：如果 `electron-builder.json` 已有 `extraResources` 字段，则追加到数组中。

- [ ] **Step 2: 验证构建**

```bash
pnpm build
```

Expected: 构建成功，无 TypeScript 编译错误。

- [ ] **Step 3: 验证运行**

```bash
pnpm dev
```

Expected:
1. 应用启动后，在主进程控制台看到 `[PluginManager] 插件已激活: Test Plugin v1.0.0`
2. 在侧边栏或地址栏输入 `sessionbox://plugins` 可打开插件管理页面
3. 看到 Test Plugin 卡片，显示名称、版本、描述、标签
4. 开关可切换启用/禁用状态
5. 点击设置按钮可展开设置面板
6. 操作分组/容器时，主进程控制台输出 `[Plugin:Test Plugin] [Group] group:created` 等日志

- [ ] **Step 4: Commit**

```bash
git add electron-builder.json
git commit -m "feat(plugin): add build config for plugin resources"
```

---

## Task 12: 最终集成提交

- [ ] **Step 1: 检查所有文件变更**

```bash
git status
```

确认所有新增和修改的文件都已提交。

- [ ] **Step 2: 验证完整流程**

1. `pnpm build` — 编译通过
2. `pnpm dev` — 应用正常启动
3. 插件管理页面可访问（`sessionbox://plugins`）
4. 测试插件日志正常输出
5. 插件启用/禁用功能正常
6. 插件设置面板可展开

- [ ] **Step 3: 最终提交（如有遗漏文件）**

```bash
git add -A
git commit -m "feat(plugin): complete plugin system integration"
```
