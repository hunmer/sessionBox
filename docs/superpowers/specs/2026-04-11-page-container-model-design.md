# Page-Container 数据模型重构设计

> 破坏性变更：partition 格式从 `persist:account-{id}` 变更为 `persist:container-{id}`，旧 partition 数据不会被迁移，用户需重新登录各站点。

## 背景

当前架构中，每个「账号(Account)」独占一个 partition（`persist:account-{id}`），导致：
- 每个站点都创建独立的数据目录，占用大量磁盘空间
- 同一身份访问多个网站时，无法共享 Cookie/Session
- 分组和账号是紧耦合的（账号必须属于某个分组）

## 目标

引入 **Page（页面）** 和 **Container（容器）** 两层模型，解耦「访问的网站」和「浏览器会话身份」：
- 多个 Page 共享同一个 Container（partition），减少磁盘占用
- Container 作为全局资源，不绑定分组
- Page 承载 URL、分组归属等页面级属性

## 数据模型

### Container（原 Account，全局资源）

```typescript
interface Container {
  id: string
  name: string
  icon: string
  proxyId?: string        // 容器级代理
  order: number
}
```

**与原 Account 的差异：**
- 移除 `groupId` — Container 是全局资源，不绑定分组
- 移除 `defaultUrl` — URL 归属到 Page
- 移除 `userAgent`、`autoProxyEnabled` — 移到 Page 层

**内置默认容器：** 应用启动时自动创建，partition 为 `persist:container-default`，不可删除。未指定容器的 Page 走此容器。

### Page（新增）

```typescript
interface Page {
  id: string
  groupId: string         // 所属分组
  containerId?: string    // 关联容器，空则走默认容器
  name: string
  icon: string
  url: string             // 默认启动 URL
  order: number
  proxyId?: string        // 页面级代理（覆盖容器代理）
  userAgent?: string
}
```

### Tab（修改）

```typescript
interface Tab {
  id: string
  pageId: string          // 原 accountId → pageId
  title: string
  url: string
  order: number
  pinned?: boolean
  muted?: boolean
}
```

### 数据关系

```
Container (全局，含内置默认容器)
  │
  └──→ Page (关联 Container + 属于 Group)
         │
         └──→ Tab (运行时实例)
```

```
Group (属于工作区)
  │
  └──→ Page (直接展示在分组下)
```

### Partition 映射

```
persist:container-{containerId}
persist:container-default  (内置默认)
```

多个 Page 共享同一个 containerId 时，共享同一个 partition。

### Bookmark（修改）

```typescript
interface Bookmark {
  // ...
  pageId?: string         // 原 accountId → pageId
  // ...
}
```

## 代理优先级

```
Page.proxyId → Container.proxyId → Group.proxyId → 无代理
```

第一个非空值生效。

## UI 交互

### 侧边栏结构

扁平结构，与现有外观基本一致：

```
├── 分组A
│   ├── 页面1 (3 tabs)
│   └── 页面2 (1 tab)
└── 分组B
    └── 页面3
```

页面的图标和名称独立于其关联的 Container。

### PageDialog（新建/编辑页面）

- 名称（必填）
- 图标
- URL
- Container 下拉选择 + 「管理」按钮（打开独立 ContainerDialog）
- 代理设置
- UA 设置

Container 为必选项（含默认容器选项）。

### ContainerDialog（独立管理面板）

- 列表展示所有 Container
- 新建 / 编辑 / 删除
- 删除确认：「该容器下有 N 个页面，删除将关闭所有关联标签页」
- 内置默认容器不可删除，但可编辑名称和代理

## 边界情况

### 删除 Container
- 允许强制删除
- 同时关闭所有关联 Page 的 Tab，销毁 WebContentsView
- Page 的 containerId 置空（回退到默认容器）
- 内置默认容器不可删除

### 删除 Page
- 关闭关联 Tab，销毁 WebContentsView
- Container 不受影响

### 删除 Group
- 将 Page 移到同工作区其他分组

### Page 未关联 Container
- containerId 为空时走内置默认容器 `persist:container-default`

## 实施策略：三阶段渐进

### 阶段一：纯重命名 Account → Container

只改名字，不改功能逻辑。

涉及位置：
- `src/types/index.ts` — `Account` → `Container`
- `electron/services/store.ts` — 所有 account 函数/变量
- `preload/index.ts` — IPC 接口命名
- `electron/ipc/index.ts` — handler 注册名 `account:*` → `container:*`
- `electron/ipc/tab.ts`、`proxy.ts` — 引用 account 的地方
- `electron/services/webview-manager.ts` — partition 格式
- `src/stores/account.ts` → 重命名为 `container.ts`
- `src/components/sidebar/AccountDialog.vue` → `ContainerDialog.vue`
- `src/components/sidebar/AccountItem.vue` → `ContainerItem.vue`
- 所有引用 accountStore、useAccountStore 的组件

**阶段一完成标志：** 功能与之前完全一致，只是内部全部叫 Container。

### 阶段二：新增 Page 模型

- store.ts 新增 Page 的 CRUD
- Container 模型移除 groupId、defaultUrl 等字段
- Tab 的 accountId → pageId
- 首次启动数据兼容：检测到旧格式数据时，自动将每个 Container 生成一个默认 Page（保留 groupId 和 URL）
- Partition 映射改为 `persist:container-{containerId}`
- webview-manager.ts 通过 Page → Container 链路获取 partition

**阶段二完成标志：** 数据库多了一层 Page，功能正常。

### 阶段三：UI 重构

- 侧边栏 AccountItem 改为显示 Page 信息
- 新建 PageDialog.vue
- ContainerDialog.vue 改为独立管理面板
- Page 对话框中增加代理选项
- 书签 accountId → pageId

**阶段三完成标志：** 完整的新交互流程可用。

## 关键决策记录

| 决策 | 结论 | 理由 |
|------|------|------|
| 侧边栏结构 | 分组 → 页面列表（扁平） | 减少层级复杂度 |
| Container 管理 | 页面对话框内嵌入口 + 独立 Dialog | 创建页面时无需离开上下文 |
| 命名策略 | 全面重命名 | 语义准确，不留歧义 |
| Tab 关联 | Tab → Page → Container | 清晰的引用链 |
| 代理优先级 | Page > Container > Group | 最细粒度优先 |
| Partition 格式 | `persist:container-{id}` | 语义匹配新模型 |
| 默认 Container | 内置，不可删除 | 无配置即可使用 |
| 强制删除 Container | 允许，关闭关联 Tabs | 操作灵活 |
| 实施策略 | 三阶段渐进 | 每阶段独立可测 |
| 旧数据迁移 | 无 partition 迁移脚本 | 简化实现，接受重新登录 |
