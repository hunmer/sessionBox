# Tray 菜单功能设计

## 概述

为 SessionBox 添加系统托盘（Tray）功能，用户可以通过托盘图标快速访问分组和页面，支持三种打开模式：软件内打开、新窗口打开、任务栏打开（桌面版/手机版）。

## 菜单结构

右键点击 Tray 图标弹出菜单：

```
📂 打开页面
  ├── 📁 分组A
  │     ├── 🌐 页面1
  │     │     ├── 软件内打开
  │     │     ├── 新窗口打开
  │     │     ├── 任务栏打开（桌面版）
  │     │     └── 任务栏打开（手机版）
  │     └── 🌐 页面2
  │           └── ...
  ├── 📁 分组B
  │     └── ...
├── ─────────────
├── 🏠 打开主窗口
└── ❌ 退出
```

**交互规则：**
- 左键点击 Tray 图标 = 显示/隐藏主窗口
- 菜单数据从 `electron-store` 读取 groups + pages，按 `order` 排序
- 页面没有 containerId 时使用默认 session，有 containerId 时用 `persist:container-{id}`
- 所有分组和页面全部显示，不做数量限制

## 技术方案

采用 Electron 原生 `Tray` + `Menu` API。

### 新增文件

| 文件 | 职责 |
|------|------|
| `electron/services/tray.ts` | Tray 管理器：创建 Tray、构建 Menu、监听数据变化刷新菜单、分发点击事件 |
| `electron/services/tray-window.ts` | 独立窗口工厂：创建新窗口和任务栏窗口，管理窗口生命周期 |
| `resources/trayIconTemplate@2x.png` | macOS Tray 模板图标（32×32，单色） |
| `resources/trayIcon.png` | Windows Tray 图标（16×16，彩色） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `electron/main.ts` | 在初始化末尾调用 `trayManager.init()`；关闭主窗口改为隐藏到托盘；`before-quit` 时销毁独立窗口 |

## 三种打开模式

### 1. 软件内打开

- 主进程发送 IPC 事件 `tray:openInApp` 给渲染进程，携带 `{ pageId }`
- 渲染进程收到后：
  1. 确保主窗口 visible 且 focused
  2. 切换到该 Page 所属的分组
  3. 如果该 Page 已有打开的标签页，直接激活；否则创建新标签页加载 defaultUrl

### 2. 新窗口打开

`tray-window.ts → openInNewWindow(page)`

- 创建无边框 `BrowserWindow`，默认尺寸 1280×800
- 创建 `WebContentsView`，使用该 Page 对应的 partition
- 加载 Page 的 defaultUrl
- 窗口引用存入 `Set<BrowserWindow>`，统一管理生命周期

### 3. 任务栏打开

`tray-window.ts → openAtTaskbar(page, mode: 'desktop' | 'mobile')`

- 获取 Tray 图标位置：`tray.getBounds()`
- 窗口紧贴 Tray 图标定位（macOS 上方，Windows 上方或侧方）
- 窗口尺寸：
  - 桌面版：480×270（16:9）
  - 手机版：270×480（9:16）
- 纯内容窗口，无导航栏
- `alwaysOnTop: true`，失焦自动隐藏（`blur` 事件时 hide）
- 使用独立 BrowserWindow + WebContentsView + 对应 partition

## Tray 图标与生命周期

### 图标

- macOS：模板图标 `trayIconTemplate@2x.png`（32×32 单色），自动适配亮色/暗色菜单栏
- Windows：`trayIcon.png`（16×16 彩色）

### 主窗口关闭行为变更

- 关闭主窗口 → 隐藏到托盘（`mainWindow.hide()`），不再退出应用
- 只有点击 Tray 菜单"退出" → 真正退出
- `app.on('before-quit')` 中遍历关闭所有独立窗口

### 初始化时序

```
app.whenReady()
  → setupUserAgent()
  → 注册协议
  → 创建主窗口
  → 注册 IPC
  → 初始化 webviewManager
  → trayManager.init()       // 最后初始化 Tray
```

### 菜单刷新

监听 store 中 groups/pages 的变更事件，每次 group/page 增删改时重新构建 Menu 并设置到 Tray。

## IPC 新增通道

| 通道 | 方向 | 用途 |
|------|------|------|
| `tray:openInApp` | 主进程 → 渲染进程 | 通知渲染进程打开指定页面，携带 `{ pageId }` |

## 边界情况处理

| 场景 | 处理方式 |
|------|---------|
| 没有分组/页面 | "打开页面"子菜单显示"暂无页面"，灰色不可点击 |
| Page 没有 defaultUrl | 使用 `about:blank` |
| Tray 图标获取位置失败 | 新窗口居中显示 |
| 同一页面重复打开（软件内） | 激活已有标签页 |
| 同一页面重复打开（独立窗口） | 允许开多个 |
| 独立窗口内页面关闭 | 只关闭该窗口，不影响其他 |

## 不做的事

- 独立窗口不做标签页管理（单页面单窗口）
- 独立窗口不做代理切换（继承 Page 配置的代理）
- 不区分 Tray 左键与右键（左键=显示/隐藏主窗口，右键=菜单）
