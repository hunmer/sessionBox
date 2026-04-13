# 网络资源嗅探器 (Network Resource Sniffer) 设计文档

## 变更记录

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-04-13 | 初始化 | 首次编写设计文档 |

---

## 概述

在右侧栏增加网络资源嗅探入口，用户可通过 MiniPopover 界面查看当前标签页中捕获的网络资源（视频、音频、图片），支持按域名自动启用、类型过滤、复制链接、新窗口打开和 Aria2 下载。

---

## 数据模型

### SniffedResource（内存，不持久化）

```typescript
interface SniffedResource {
  id: string           // nanoid
  url: string          // 资源 URL
  type: 'video' | 'audio' | 'image'  // 资源类型
  mimeType: string     // 原始 MIME type (如 video/mp4)
  size?: number        // Content-Length (如有)
  timestamp: number    // 捕获时间
}
```

### SnifferDomainRule（持久化到 electron-store）

```typescript
// electron-store 新增字段
snifferDomains: string[]  // 自动启用嗅探的域名列表，如 ["youtube.com", "bilibili.com"]
```

---

## 架构设计

### 数据流

```
WebContentsView (主进程)
  └─ session.webRequest.onCompleted()
      └─ MIME 过滤 (video/*, audio/*, image/*)
          └─ mainWindow.webContents.send('on:sniffer:resource', tabId, resource)
              └─ Pinia Store (渲染进程, 内存)
                  └─ SnifferMiniPopover.vue (响应式渲染)
```

### MIME 类型过滤规则

```typescript
const SNIFFER_MIME_PATTERNS = {
  video: /^video\//,
  audio: /^audio\//,
  image: /^image\//,
}
```

只记录响应头 Content-Type 匹配上述模式的请求，避免捕获 HTML/CSS/JS 等页面资源。

---

## 主进程改动

### electron/services/webview-manager.ts

在 `setupEventForwarding()` 方法中新增：

1. **注册 webRequest 监听器**：对每个 WebContentsView 的 session 注册 `onCompleted` 回调
2. **域名自动启用**：根据 `snifferDomains` 配置，当标签页导航到匹配域名时自动开始监听
3. **资源推送**：捕获到符合条件的资源后，通过 IPC 事件推送到渲染进程
4. **清理**：标签关闭时移除监听器，标签冻结时暂停监听

### 新增 IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `sniffer:toggle` | 渲染→主 | 开关当前标签页嗅探 |
| `sniffer:setDomainEnabled` | 渲染→主 | 添加/移除自动启用域名 |
| `sniffer:getDomainList` | 渲染→主 | 获取自动启用域名列表 |
| `sniffer:clearResources` | 渲染→主 | 清空指定标签页的捕获资源 |
| `on:sniffer:resource` | 主→渲染 | 推送捕获到的资源 |

### electron/services/store.ts

新增 `snifferDomains` 字段到 electron-store schema，默认空数组。

---

## 渲染进程改动

### src/stores/sniffer.ts（新建）

Pinia store，纯内存数据：

```typescript
useSnifferStore = defineStore('sniffer', () => {
  // 每个标签页的资源列表
  resources: Map<string, SniffedResource[]>
  // 每个标签页的嗅探启用状态
  enabled: Map<string, boolean>
  // 过滤器：显示哪些类型
  filterTypes: Set<'video' | 'audio' | 'image'>
  // 自动启用域名列表
  domains: string[]

  // 监听 IPC 推送事件
  setupListeners()
  // 获取当前标签页的过滤后资源列表
  getFilteredResources(tabId): ComputedRef<SniffedResource[]>
  // 切换嗅探
  toggle(tabId, enabled)
  // 切换域名规则
  toggleDomain(domain, enabled)
  // 清空资源
  clearResources(tabId)
  // 标签关闭时清理
  onTabClosed(tabId)
})
```

### UI 组件

**RightPanel.vue** 新增嗅探器入口：

- 在 Section 1（与书签、历史、下载同级）新增按钮
- 使用 `Radar` 或 `Search` 图标（lucide-vue-next）
- 点击打开 Popover，`side="left"`

**SnifferMiniPopover.vue**（新建）：

```
┌─────────────────────────────────────┐
│ 🔍 网络嗅探          [3] │
├─────────────────────────────────────┤
│ 嗅探开关            [Switch]        │
│ 自动启用当前站点    [Switch]        │
├─────────────────────────────────────┤
│ [视频] [音频] [图片]  ← 过滤器 chips│
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 🎬 video/mp4  12.5MB           │ │
│ │ https://example.com/video.mp4   │ │
│ │                [复制][新窗口][↓] │ │
│ ├─────────────────────────────────┤ │
│ │ 🎵 audio/mpeg  3.2MB           │ │
│ │ https://example.com/audio.mp3   │ │
│ │                [复制][新窗口][↓] │ │
│ └─────────────────────────────────┘ │
│          (ScrollArea, max 360px)     │
├─────────────────────────────────────┤
│ 共 15 个资源        [清空]          │
└─────────────────────────────────────┘
```

操作说明：
- **复制链接**：使用 `navigator.clipboard.writeText(url)`
- **新窗口打开**：调用 `api.tab.create({ url })` 在新标签页打开
- **下载**：调用 `api.download.add({ url })` 通过 Aria2 下载

### preload/index.ts

新增 sniffer API 命名空间：

```typescript
sniffer: {
  toggle: (tabId: string, enabled: boolean) => ipcRenderer.invoke('sniffer:toggle', tabId, enabled),
  setDomainEnabled: (domain: string, enabled: boolean) => ipcRenderer.invoke('sniffer:setDomainEnabled', domain, enabled),
  getDomainList: () => ipcRenderer.invoke('sniffer:getDomainList'),
  clearResources: (tabId: string) => ipcRenderer.invoke('sniffer:clearResources', tabId),
}
```

---

## 文件清单

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 修改 | `electron/services/webview-manager.ts` | 新增 webRequest 监听和资源嗅探逻辑 |
| 修改 | `electron/services/store.ts` | 新增 snifferDomains 字段 |
| 修改 | `electron/ipc/index.ts` | 注册 sniffer IPC 处理器 |
| 修改 | `preload/index.ts` | 新增 sniffer API 命名空间 |
| 新建 | `src/stores/sniffer.ts` | 嗅探器 Pinia store |
| 新建 | `src/components/common/SnifferMiniPopover.vue` | 嗅探器 MiniPopover 组件 |
| 修改 | `src/components/common/RightPanel.vue` | 新增嗅探器入口按钮 |
| 修改 | `src/types/index.ts` | 新增 SniffedResource 类型 |

---

## 性能考量

1. **webRequest.onCompleted 只读取响应头**，不缓存响应体，内存开销极小
2. **每个标签页最多保留 500 条资源**，超出后 FIFO 淘汰
3. **MIME 过滤在主进程中完成**，只有匹配的资源才推送，减少 IPC 通信量
4. **标签关闭时清理** Map 中对应的数据，防止内存泄漏
5. **域名规则持久化**，但资源数据仅内存存储
