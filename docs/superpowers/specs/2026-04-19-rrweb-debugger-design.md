# RRWeb 网页调试工具设计

## 概述

在 SessionBox 中集成基于 rrweb 的网页录制/回放调试工具。用户可以从右侧面板入口打开独立的调试窗口，选择目标标签页进行 DOM 操作录制，并在窗口内回放。

## 架构

### 方案选择：纯 BrowserWindow

独立 BrowserWindow 加载内联 HTML，不依赖 Vue 构建链。rrweb 通过 CDN 引入。

理由：
- 独立进程，不与主应用互相干扰
- rrweb-player CDN 引入最简单，无需改构建配置
- 回放时样式不会和主应用冲突

### 数据流

```
RightPanel.vue [Bug 按钮]
    ↓ debugger:create-window IPC
主进程 → 创建 BrowserWindow (独立 HTML)
调试窗口 (上下布局)
    ├── 上方：控制面板 (Select + 按钮)
    └── 下方：rrweb-player 回放区域

录制流：
  目标页面 rrweb.record() → console.debug('__RRWEB_EVENT__' + event)
  → 主进程 webContents.on('console-message') 拦截
  → 内存 Map<number, events[]> 存储

回放流：
  调试窗口 IPC 获取 events → rrwebPlayer({ events }) 播放
```

## IPC 通道

新增 `electron/ipc/debugger.ts`：

| 通道 | 方向 | 用途 |
|------|------|------|
| `debugger:create-window` | 渲染→主 | 创建调试窗口 |
| `debugger:get-tabs` | 渲染→主 | 获取当前标签页 webContentsId 列表 |
| `debugger:inject` | 渲染→主 | 注入 rrweb CDN 到目标 webContents |
| `debugger:start-record` | 渲染→主 | 启动录制 |
| `debugger:stop-record` | 渲染→主 | 停止录制 |
| `debugger:get-events` | 渲染→主 | 获取录制事件 |
| `debugger:export-events` | 渲染→主 | 导出 JSON 文件 |
| `debugger:load-url` | 渲染→主 | 内嵌 webview 模式加载 URL |

## 调试窗口布局

上下布局，自定义无标题栏窗口 (1000×700)：

```
┌─────────────────────────────────────────┐
│  ● 调试工具        ─ □ ×  (自定义标题栏)  │
├─────────────────────────────────────────┤
│  目标: [▼ 选择标签页 / 内嵌WebView]       │
│  [地址栏] (仅内嵌模式)                    │
│  [注入]  [● 开始]  [■ 停止]  [导出]       │
├─────────────────────────────────────────┤
│                                         │
│           rrweb-player 回放区域           │
│                                         │
│  ▶ ━━━━━━━●━━━━━━━━━━  1x  00:12/01:30 │
└─────────────────────────────────────────┘
```

### 内嵌 WebView 模式

选择"内嵌 WebView"时，控制面板下方插入 `<webview>` 标签（约 200px 高），提供地址栏加载 URL。注入/录制操作针对该 webview 的 webContents。

## 状态管理

`electron/services/debugger.ts`：

```typescript
const recording = new Map<number, {
  events: any[]
  listener: Function
  stopFn: (() => void) | null
}>()
```

## 录制/回放流程

### 注入

通过 `webContents.fromId(id).executeJavaScript` 在目标页面插入：

```javascript
const script = document.createElement('script')
script.src = 'https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb-all.min.js'
script.onload = () => { window.__rrwebReady = true }
document.head.appendChild(script)
```

### 开始录制

1. 在目标页面执行：

```javascript
window.__rrwebStopFn = rrweb.record({
  emit: event => console.debug('__RRWEB_EVENT__' + JSON.stringify(event))
})
```

2. 主进程对目标 webContents 注册 `console-message` 监听器
3. 拦截 `__RRWEB_EVENT__` 前缀消息，解析后 push 到 events 数组

### 停止录制

1. 移除 console-message 监听器
2. 在目标页面执行 `window.__rrwebStopFn?.()` 停止录制

### 回放

调试窗口通过 IPC 获取 events，初始化 rrweb-player：

```javascript
new rrwebPlayer({
  target: document.getElementById('replayer'),
  props: { events }
})
```

### 导出

`dialog.showSaveDialog` 选择路径，`fs.writeFile` 写入 JSON。

## 边界处理

- 目标页面导航/关闭 → 自动停止录制，清理监听器（`did-navigate`、`destroyed` 事件）
- webContents 销毁 → 从 Map 中移除
- 重复注入 → 检测 `window.__rrwebReady`，跳过重复加载
- 事件上限 → 默认最多 10000 条，超出自动停止并提示
- CDN 加载失败 → 提示网络错误
- 注入超时（5 秒）→ 提示失败
- 单条事件限制 1MB

## 文件结构

```
新增文件：
├── electron/ipc/debugger.ts           # IPC 处理器
├── electron/services/debugger.ts      # 录制状态管理
└── electron/debugger-window.html      # 调试窗口 HTML (内联 CSS/JS)

修改文件：
├── src/components/common/RightPanel.vue  # 新增按钮入口
├── electron/ipc/index.ts                 # 注册 debugger handlers
└── electron/main.ts                      # 引入注册
```

## 依赖

无新增 npm 依赖。rrweb 和 rrweb-player 通过 CDN 加载到目标页面和调试窗口。
