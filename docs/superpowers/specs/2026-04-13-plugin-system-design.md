# SessionBox 插件系统设计文档

> 日期：2026-04-13
> 状态：已批准
> 作者：AI + 用户协作

---

## 1. 目标

为 SessionBox 添加基于 EventEmitter2 的插件系统，允许第三方通过标准化 API 扩展应用行为。插件运行在主进程，可监听应用事件、访问存储、提供设置界面。

### 核心需求

- 基于 EventEmitter2 封装事件系统（订阅、取消订阅、广播）
- 自动广播 IPC 调用事件（通过 Proxy 拦截 ipcMain.handle）
- 广播数据模型事件（分组/容器增删改）
- 广播标签页生命周期事件
- 广播渲染进程推送事件
- 插件从文件系统加载（后期扩展在线商店）
- 插件管理界面 `sessionbox://plugins`
- 内置测试插件验证系统功能

---

## 2. 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                       主进程 (Main Process)                  │
│                                                              │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────┐ │
│  │ PluginManager│───▶│ PluginEventBus   │◀───│ IPC Proxy   │ │
│  │             │    │ (EventEmitter2)  │    │ (拦截)      │ │
│  └──────┬──────┘    └────────┬─────────┘    └─────────────┘ │
│         │                    │                               │
│  ┌──────▼──────┐    ┌───────▼──────────┐    ┌─────────────┐ │
│  │ PluginLoader│    │ 事件发射埋点      │    │ PluginStorage│ │
│  │ (文件系统)  │    │ store.ts / tab.ts │    │ (独立JSON)  │ │
│  └─────────────┘    └──────────────────┘    └─────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 插件实例                                                ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                ││
│  │  │Plugin A │  │Plugin B │  │TestPlugn│                ││
│  │  │main.js  │  │main.js  │  │main.js  │                ││
│  │  │view.js  │  │         │  │view.js  │                ││
│  │  └─────────┘  └─────────┘  └─────────┘                ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                   IPC (plugin:* channels)
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                    渲染进程 (Renderer Process)                │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ sessionbox://plugins (PluginsPage)                      ││
│  │  ┌────────┐  ┌────────┐  ┌────────┐                    ││
│  │  │ Card A │  │ Card B │  │ Card C │  ...               ││
│  │  └────────┘  └────────┘  └────────┘                    ││
│  │                                                        ││
│  │  [插件设置面板] ← Vue runtime compiler 编译 view.js    ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 插件文件结构

### 3.1 目录结构

```
my-plugin/
├── info.json     # 必需 - 插件元信息
├── icon.png      # 必需 - 插件图标（128x128 PNG）
├── main.js       # 必需 - 主进程入口
└── view.js       # 可选 - 设置页 Vue 组件定义
```

### 3.2 info.json 格式

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "插件功能的简短描述",
  "author": {
    "name": "作者名",
    "email": "email@example.com",
    "url": "https://example.com"
  },
  "tags": ["工具", "效率"],
  "minAppVersion": "1.0.0",
  "hasView": true
}
```

**字段说明**：

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| id | string | 是 | 唯一标识符，建议反向域名格式 |
| name | string | 是 | 插件显示名称 |
| version | string | 是 | 语义化版本号 |
| description | string | 是 | 功能描述 |
| author | object | 是 | 作者信息（name 必需） |
| tags | string[] | 否 | 分类标签 |
| minAppVersion | string | 否 | 最低应用版本要求 |
| hasView | boolean | 否 | 是否包含设置视图，默认 false |

### 3.3 main.js 接口

```javascript
module.exports = {
  /**
   * 插件激活时调用
   * @param {PluginContext} context - 插件运行上下文
   */
  activate(context) {
    // 注册事件监听
    context.events.on('group:created', (group) => {
      context.logger.info(`新分组创建: ${group.name}`)
    })

    // 使用通配符监听
    context.events.on('ipc:**', (data, event) => {
      context.logger.info(`IPC: ${event}`)
    })

    // 插件间通信
    context.events.on('plugin:my-plugin:some-event', (data) => {
      // 处理来自其他插件的事件
    })

    // 持久化存储
    await context.storage.set('key', 'value')
    const val = await context.storage.get('key')
  },

  /**
   * 插件停用时调用
   */
  deactivate() {
    // 清理资源、取消定时器等
  }
}
```

### 3.4 view.js 接口（可选）

导出 Vue 组件选项对象，在渲染进程通过 Vue runtime compiler 动态编译：

```javascript
// 可使用 Vue 响应式 API 和 shadcn-vue 组件
module.exports = {
  template: `
    <div class="p-4 space-y-4">
      <h3 class="text-lg font-semibold">{{ pluginInfo.name }}</h3>
      <p class="text-sm text-muted-foreground">{{ pluginInfo.description }}</p>

      <div class="flex items-center gap-2">
        <span>状态：</span>
        <span :class="enabled ? 'text-green-500' : 'text-red-500'">
          {{ enabled ? '已启用' : '已禁用' }}
        </span>
      </div>

      <Button @click="toggle" variant="outline">
        切换状态
      </Button>
    </div>
  `,

  props: ['pluginInfo'],

  setup(props) {
    const enabled = ref(true)
    const toggle = () => { enabled.value = !enabled.value }
    return { enabled, toggle, pluginInfo: props.pluginInfo }
  }
}
```

**可用 API**：Vue 3 响应式 API（ref, computed, watch 等）+ shadcn-vue 组件 + Tailwind CSS 类。

---

## 4. 事件系统

### 4.1 全局事件总线

基于 `eventemitter2`（已安装 v6.4.9）创建单例：

```typescript
import { EventEmitter2 } from 'eventemitter2'

export const pluginEventBus = new EventEmitter2({
  wildcard: true,
  delimiter: ':',
  maxListeners: 50,
  newListener: false,
  removeListenerOnEmpty: true
})
```

### 4.2 事件分类

#### 4.2.1 IPC 调用广播（自动拦截）

通过在 `registerIpcHandlers()` 入口处包装 `ipcMain.handle` 实现：

```typescript
// 在 electron/ipc/index.ts 中，registerIpcHandlers() 开头
const originalHandle = ipcMain.handle
ipcMain.handle = function(channel: string, handler: Function) {
  const wrappedHandler = async (event: IpcMainInvokeEvent, ...args: any[]) => {
    const result = await handler(event, ...args)
    pluginEventBus.emit(`ipc:${channel}`, { channel, args, result })
    return result
  }
  return originalHandle.call(ipcMain, channel, wrappedHandler)
}
// registerIpcHandlers() 结束后恢复原始方法
```

这种方式在 IPC 注册阶段拦截，运行时无额外开销。

**事件格式**：`ipc:{channel}`
**示例**：`ipc:group:create`、`ipc:container:delete`、`ipc:workspace:list`

#### 4.2.2 数据模型事件（手动埋点）

在 `electron/services/store.ts` 的 CRUD 方法中添加 emit 调用：

```typescript
// 命名规范：{model}:{action}
// model: workspace, group, container, page, bookmark, bookmarkFolder, proxy
// action: created, updated, deleted, reordered
```

**埋点示例**：

```typescript
createGroup(name: string, color?: string, ...): Group {
  const group = { id: randomUUID(), name, ... }
  groups.push(group)
  setCollection('groups', groups)
  pluginEventBus.emit('group:created', group)  // 新增
  return group
}

deleteGroup(id: string): void {
  const group = groups.find(g => g.id === id)
  setCollection('groups', groups.filter(g => g.id !== id))
  pluginEventBus.emit('group:deleted', group)  // 新增
}
```

#### 4.2.3 标签页事件

在 `electron/services/webview-manager.ts` 中添加 emit：

```typescript
// 事件列表
// tab:created     - 标签页创建
// tab:activated   - 标签页激活
// tab:closed      - 标签页关闭
// tab:frozen      - 标签页冻结
// tab:unfrozen    - 标签页解冻
// tab:navigated   - 标签页导航
```

#### 4.2.4 渲染进程推送事件

在 `webContents.send` 的各调用点通过辅助函数包装。由于 `webContents.send` 调用散布在多个文件中，采用工具函数方式：

```typescript
// electron/services/plugin-event-bus.ts
export function broadcastToRenderer(channel: string, ...args: any[]) {
  pluginEventBus.emit(`render:${channel}`, { channel, args })
  // 原始发送仍由调用方完成
}
```

在各 `webContents.send` 调用点前插入 `broadcastToRenderer()` 调用。

**事件格式**：`render:{channel}`

### 4.3 插件间通信

插件可通过 `context.events.emit('plugin:{pluginId}:{event}', data)` 发送自定义事件，其他插件监听对应事件。

### 4.4 通配符支持

EventEmitter2 的通配符让插件可以灵活订阅：

```javascript
// 监听所有事件
context.events.on('**', handler)

// 监听所有 IPC 事件
context.events.on('ipc:**', handler)

// 监听所有 group 相关事件
context.events.on('group:*', handler)
```

---

## 5. PluginContext API

每个插件激活时接收一个 `PluginContext` 对象：

```typescript
interface PluginContext {
  /** 事件系统 - 订阅/广播事件 */
  events: {
    on(event: string, handler: Function): void
    once(event: string, handler: Function): void
    off(event: string, handler: Function): void
    emit(event: string, ...args: any[]): void
  }

  /** 独立存储 - 键值对持久化 */
  storage: {
    get(key: string): Promise<any>
    set(key: string, value: any): Promise<void>
    delete(key: string): Promise<void>
    clear(): Promise<void>
    keys(): Promise<string[]>
  }

  /** 当前插件元信息 */
  plugin: PluginInfo

  /** 日志工具 - 输出到主进程控制台 */
  logger: {
    info(msg: string, ...args: any[]): void
    warn(msg: string, ...args: any[]): void
    error(msg: string, ...args: any[]): void
  }
}
```

### 存储实现

每个插件的存储文件位于 `{userData}/plugin-data/{pluginId}/storage.json`。

```typescript
class PluginStorage {
  private filePath: string
  private data: Record<string, any>

  constructor(pluginId: string, userDataPath: string) {
    const dir = path.join(userDataPath, 'plugin-data', pluginId)
    fs.ensureDirSync(dir)
    this.filePath = path.join(dir, 'storage.json')
    this.data = fs.existsSync(this.filePath)
      ? fs.readJsonSync(this.filePath)
      : {}
  }

  async get(key: string): Promise<any> {
    return this.data[key]
  }

  async set(key: string, value: any): Promise<void> {
    this.data[key] = value
    await fs.writeJson(this.filePath, this.data, { spaces: 2 })
  }

  async delete(key: string): Promise<void> {
    delete this.data[key]
    await fs.writeJson(this.filePath, this.data, { spaces: 2 })
  }

  async clear(): Promise<void> {
    this.data = {}
    await fs.writeJson(this.filePath, this.data, { spaces: 2 })
  }

  async keys(): Promise<string[]> {
    return Object.keys(this.data)
  }
}
```

---

## 6. 插件管理器

### 6.1 PluginManager 类

```typescript
// electron/services/plugin-manager.ts
class PluginManager {
  private plugins: Map<string, PluginInstance>
  private eventBus: EventEmitter2

  constructor(userDataPath: string)

  /** 扫描并加载所有插件 */
  loadAll(): void

  /** 加载单个插件目录 */
  load(pluginDir: string): void

  /** 卸载插件 */
  unload(pluginId: string): void

  /** 启用插件 */
  enable(pluginId: string): void

  /** 禁用插件 */
  disable(pluginId: string): void

  /** 获取所有插件元信息 */
  list(): PluginMeta[]

  /** 获取插件 view.js 内容 */
  getViewContent(pluginId: string): string | null

  /** 关闭所有插件 */
  shutdown(): void
}
```

### 6.2 插件实例状态

```typescript
interface PluginInstance {
  id: string
  dir: string
  info: PluginInfo
  enabled: boolean
  module: any           // require() 加载的 main.js 模块
  context: PluginContext
  storage: PluginStorage
}

interface PluginMeta {
  id: string
  name: string
  version: string
  description: string
  author: { name: string; email?: string; url?: string }
  tags: string[]
  hasView: boolean
  enabled: boolean
  iconPath: string      // 图标文件绝对路径
}
```

### 6.3 插件加载流程

```
1. 扫描 {userData}/plugins/ 目录
2. 遍历每个子目录，查找 info.json
3. 验证 info.json 格式和必需字段
4. 验证 main.js 存在
5. 检查 minAppVersion 兼容性
6. 检查插件是否在禁用列表中
7. 创建 PluginStorage 实例
8. 创建 PluginContext 实例
9. require(main.js) 加载模块
10. 调用 module.activate(context)
11. 注册到 plugins Map
```

### 6.4 插件目录

- **用户插件**：`{userData}/plugins/` - 用户安装的插件
- **开发插件**：开发时可通过配置指向项目本地目录
- **内置测试插件**：`resources/plugins/test-plugin/` - 打包时复制到资源目录

---

## 7. IPC 接口

新增 `electron/ipc/plugin.ts`：

| Channel | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `plugin:list` | - | `PluginMeta[]` | 获取所有插件列表 |
| `plugin:enable` | `pluginId: string` | `void` | 启用插件 |
| `plugin:disable` | `pluginId: string` | `void` | 禁用插件 |
| `plugin:get-view` | `pluginId: string` | `string \| null` | 获取 view.js 内容 |
| `plugin:get-icon` | `pluginId: string` | `string \| null` | 获取图标 base64 |

preload 桥接中新增 `api.plugin.*` 命名空间，与现有模式一致。

---

## 8. 插件管理页面 UI

### 8.1 路由注册

在 `src/App.vue` 的 `INTERNAL_PAGES` 中新增：

```typescript
import PluginsPage from './components/plugins/PluginsPage.vue'

const INTERNAL_PAGES: Record<string, Component> = {
  bookmarks: markRaw(BookmarksPage),
  history: markRaw(HistoryPage),
  downloads: markRaw(DownloadsPage),
  containers: markRaw(ContainersPage),
  plugins: markRaw(PluginsPage)    // 新增
}
```

### 8.2 页面布局

```
┌──────────────────────────────────────────────────┐
│  插件管理                           [刷新] [设置] │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌─────────────┐  ┌─────────────┐               │
│  │ [icon]       │  │ [icon]       │               │
│  │ Test Plugin  │  │ Plugin B     │               │
│  │ v1.0.0      │  │ v2.0.0      │               │
│  │ 描述文字...  │  │ 描述文字...  │               │
│  │ 作者名       │  │ 作者名       │               │
│  │ [工具][效率] │  │ [网络]       │               │
│  │ [开关] [设置]│  │ [开关]       │               │
│  └─────────────┘  └─────────────┘               │
│                                                   │
│  ┌─────────────┐                                 │
│  │ [icon]       │                                 │
│  │ Plugin C     │                                 │
│  │ ...          │                                 │
│  └─────────────┘                                 │
│                                                   │
│  没有更多插件了                                    │
│                                                   │
└──────────────────────────────────────────────────┘
```

### 8.3 插件卡片组件

```typescript
// src/components/plugins/PluginCard.vue
// Props:
interface PluginCardProps {
  plugin: PluginMeta
}
```

卡片包含：
- 左上角：插件图标（128x128 缩放显示）
- 右侧上方：插件名称 + 版本号
- 右侧中部：描述文字
- 右侧下方：作者名
- 底部左侧：标签列表（Tag 样式）
- 底部右侧：启用/禁用 Switch + 设置按钮（仅 hasView=true 时显示）

### 8.4 插件设置面板

点击设置按钮时，在当前页面中展开设置面板：

```typescript
// 使用 Vue runtime compiler 动态编译 view.js 内容
import { createApp, defineComponent } from 'vue'

// 将 view.js 的导出对象作为组件定义
// 传入 pluginInfo 作为 props
// 注入 shadcn-vue 组件到全局
```

---

## 9. 测试插件

### 9.1 目录结构

```
resources/plugins/test-plugin/
├── info.json
├── icon.png       # 简单的齿轮图标
├── main.js
└── view.js
```

### 9.2 info.json

```json
{
  "id": "sessionbox.test-plugin",
  "name": "Test Plugin",
  "version": "1.0.0",
  "description": "SessionBox 插件系统测试插件，监听并输出所有事件",
  "author": {
    "name": "SessionBox"
  },
  "tags": ["测试", "开发"],
  "hasView": true
}
```

### 9.3 main.js

```javascript
module.exports = {
  activate(context) {
    context.logger.info('Test Plugin 已激活')

    // 监听所有事件（通配符）
    context.events.on('**', function(data, event) {
      // EventEmitter2 通配符回调中，event 是最后一个参数
      context.logger.info(`[Event] ${this.event}: ${JSON.stringify(data)}`)
    })

    // 监听特定事件
    context.events.on('group:created', (group) => {
      context.logger.info(`新分组: ${group.name} (${group.id})`)
    })

    context.events.on('group:deleted', (group) => {
      context.logger.info(`删除分组: ${group.name} (${group.id})`)
    })

    context.events.on('container:created', (container) => {
      context.logger.info(`新容器: ${container.name} (${container.id})`)
    })

    context.events.on('tab:created', (tab) => {
      context.logger.info(`新标签页: ${tab.id}`)
    })

    // 存储测试
    context.storage.set('activatedAt', new Date().toISOString())
    context.logger.info('存储测试数据已写入')
  },

  deactivate() {
    console.log('[TestPlugin] 已停用')
  }
}
```

### 9.4 view.js

```javascript
module.exports = {
  template: `
    <div class="p-4 space-y-4">
      <h3 class="text-lg font-semibold">{{ pluginInfo.name }}</h3>
      <p class="text-sm text-muted-foreground">{{ pluginInfo.description }}</p>

      <div class="space-y-2">
        <div class="text-sm">
          <span class="text-muted-foreground">激活时间：</span>
          {{ activatedAt || '未记录' }}
        </div>
        <div class="text-sm">
          <span class="text-muted-foreground">事件计数：</span>
          {{ eventCount }}
        </div>
      </div>

      <div class="flex gap-2">
        <Button @click="resetCount" variant="outline" size="sm">
          重置计数
        </Button>
      </div>

      <div v-if="recentEvents.length" class="space-y-1">
        <h4 class="text-sm font-medium">最近事件：</h4>
        <div v-for="(evt, i) in recentEvents" :key="i"
             class="text-xs font-mono bg-muted p-2 rounded">
          {{ evt }}
        </div>
      </div>
    </div>
  `,

  props: ['pluginInfo'],

  setup(props) {
    const activatedAt = ref('')
    const eventCount = ref(0)
    const recentEvents = ref([])

    const addEvent = (name) => {
      eventCount.value++
      recentEvents.value.unshift(name)
      if (recentEvents.value.length > 20) {
        recentEvents.value.pop()
      }
    }

    const resetCount = () => {
      eventCount.value = 0
      recentEvents.value = []
    }

    return { activatedAt, eventCount, recentEvents, addEvent, resetCount, pluginInfo: props.pluginInfo }
  }
}
```

---

## 10. 文件变更清单

### 新增文件

| 文件路径 | 说明 |
|----------|------|
| `electron/services/plugin-manager.ts` | 插件管理器核心 |
| `electron/services/plugin-event-bus.ts` | 全局事件总线（EventEmitter2 封装） |
| `electron/services/plugin-storage.ts` | 插件存储实现 |
| `electron/services/plugin-context.ts` | PluginContext 构造 |
| `electron/ipc/plugin.ts` | 插件 IPC 处理器 |
| `src/components/plugins/PluginsPage.vue` | 插件管理页面 |
| `src/components/plugins/PluginCard.vue` | 插件卡片组件 |
| `src/components/plugins/PluginSettings.vue` | 插件设置面板 |
| `src/stores/plugin.ts` | 插件 Pinia Store |
| `resources/plugins/test-plugin/info.json` | 测试插件信息 |
| `resources/plugins/test-plugin/icon.png` | 测试插件图标 |
| `resources/plugins/test-plugin/main.js` | 测试插件入口 |
| `resources/plugins/test-plugin/view.js` | 测试插件视图 |

### 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `electron/main.ts` | 初始化 PluginManager，注册 IPC Proxy |
| `electron/ipc/index.ts` | 注册 plugin IPC 处理器 |
| `electron/services/store.ts` | 在 CRUD 方法中添加事件发射埋点 |
| `electron/services/webview-manager.ts` | 在标签页生命周期中添加事件发射 |
| `preload/index.ts` | 新增 `api.plugin.*` 命名空间 |
| `src/App.vue` | 在 `INTERNAL_PAGES` 中注册 plugins 页面 |
| `src/types/index.ts` | 新增 PluginMeta、PluginInfo 类型定义 |
| `electron-builder.json` | 将 resources/plugins/ 打包配置 |
| `electron.vite.config.ts` | 渲染进程 Vue runtime compiler 配置（`vue()` → `vue({ isProduction: false })` 或使用 `vue/dist/vue.esm-bundler.js` alias） |

---

## 11. 安全考虑

1. **代码执行风险**：插件通过 `require()` 加载，具有完整的 Node.js 能力。一期不实现沙箱，通过文档提示用户仅安装可信插件
2. **事件风暴**：通配符监听 `**` 可能导致性能问题。EventEmitter2 的 `maxListeners` 设置为 50 限制监听数量
3. **存储隔离**：每个插件的存储目录独立，无法访问其他插件数据
4. **插件停用**：调用 `deactivate()` 后，清理该插件注册的所有事件监听器（通过 EventEmitter2 的 namespace 机制）
5. **错误隔离**：插件 `activate()` 和事件处理函数使用 try-catch 包裹，防止插件异常影响主应用

---

## 12. 后期扩展（不在本期实现）

- 在线插件商店（上传、下载、评分）
- 插件权限系统（声明需要的 API 权限）
- 插件热重载（开发模式）
- 插件间依赖管理
- 插件沙箱隔离（VM2 或 worker_thread）
- 插件配置导入导出
