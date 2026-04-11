# Page-Container 数据模型

## 概念

| 概念 | 说明 |
|------|------|
| **Container（容器）** | 浏览器会话身份，一个容器 = 一个独立 partition（Cookie/Session/缓存隔离）。全局资源，不绑定分组。 |
| **Page（页面）** | 用户访问的网站入口，属于某个分组，关联某个容器。承载 URL、代理、UA 等页面级配置。 |
| **Tab（标签页）** | Page 的运行时实例，用户打开的浏览器标签。 |

## 关系图

```
Container (全局，含内置默认容器)
  │
  └──→ Page (关联 Container + 属于 Group)
         │
         └──→ Tab (运行时实例)
```

```
Workspace → Group → Page → Tab
                    ↕
                 Container (共享 partition)
```

## 核心规则

- 多个 Page 可以共享同一个 Container（共享 Cookie/Session）
- 未指定 Container 的 Page 走内置默认容器 `persist:container-default`
- 代理优先级：Page > Container > Group
- Partition 格式：`persist:container-{containerId}`

## 数据结构

```typescript
interface Container {
  id: string
  name: string
  icon: string
  proxyId?: string
  order: number
}

interface Page {
  id: string
  groupId: string
  containerId?: string    // 空 = 默认容器
  name: string
  icon: string
  url: string
  order: number
  proxyId?: string
  userAgent?: string
}

interface Tab {
  id: string
  pageId: string
  title: string
  url: string
  order: number
  pinned?: boolean
  muted?: boolean
}
```

## 文件索引

| 层 | 文件 | 职责 |
|----|------|------|
| 类型 | `src/types/index.ts` | Page / Container / Tab 类型定义 |
| 持久化 | `electron/services/store.ts` | Page + Container CRUD、数据迁移 |
| IPC | `electron/ipc/index.ts` | page:* / container:* handler 注册 |
| IPC | `electron/ipc/tab.ts` | Tab 通过 pageId 获取 partition |
| WebView | `electron/services/webview-manager.ts` | Page→Container→partition 链路 |
| 预加载 | `preload/index.ts` | api.page / api.container 暴露给渲染进程 |
| Store | `src/stores/page.ts` | Page 状态管理 |
| Store | `src/stores/container.ts` | Container 状态管理 |
| Store | `src/stores/tab.ts` | Tab 通过 pageId 关联 |
| 组件 | `src/components/sidebar/PageDialog.vue` | 新建/编辑页面 |
| 组件 | `src/components/sidebar/ContainerDialog.vue` | 容器管理面板 |
