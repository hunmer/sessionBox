[根目录](../CLAUDE.md) > **preload**

# preload/ -- 预加载模块

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-04-13 10:44:52 | 增量更新 | 更新 IPC API 完整列表：新增工作区、容器、页面、下载、扩展、快捷键、分屏、自动更新、书签健康检查等 |
| 2026-04-09 02:12:31 | 初始化 | 首次生成模块文档 |

---

## 模块职责

Electron 预加载脚本，运行在渲染进程的独立上下文中，通过 `contextBridge` 安全地将 IPC API 暴露给渲染进程。是主进程与渲染进程之间的通信桥梁。

---

## 入口与启动

**入口文件**：`preload/index.ts`

在 `BrowserWindow` 创建时通过 `webPreferences.preload` 加载。使用 `contextBridge.exposeInMainWorld('api', api)` 将 IPC API 挂载到 `window.api`。

---

## 对外接口

`window.api` 对象结构：

```
api.workspace       -- 工作区 CRUD
api.group           -- 分组 CRUD
api.container       -- 容器 CRUD（含图标上传、桌面快捷方式）
api.page            -- 页面 CRUD
api.proxy           -- 代理 CRUD（含测试）
api.tab             -- 标签页 CRUD + 导航 + bounds + 代理 + 截图 + 静音
api.bookmark        -- 书签 CRUD + 批量操作 + 导入/导出
api.bookmarkFolder  -- 书签文件夹 CRUD + 删除空文件夹
api.bookmarkCheck   -- 书签健康检查（开始/取消）
api.extension       -- 扩展管理（选择/加载/卸载/删除/BrowserAction弹窗）
api.window          -- 窗口控制（最小化/最大化/关闭/全屏）
api.settings        -- 应用设置（标签冻结/默认浏览器）
api.mutedSites      -- 静音网站管理
api.shortcut        -- 快捷键管理（列表/更新/清除/重置）
api.split           -- 分屏管理（状态存取/方案管理/多视图 bounds）
api.download        -- 下载管理（Aria2 完整控制）
api.updater         -- 自动更新（检查/下载/安装/事件监听）
api.openExternal(url) -- 打开外部链接
api.on(event, callback) -- 监听主进程事件，返回清理函数
```

### 导出类型

| 类型 | 说明 |
|------|------|
| `Proxy` | 代理配置 |
| `Workspace` | 工作区 |
| `Group` | 分组 |
| `Container` | 容器 |
| `Page` | 页面 |
| `Tab` | 标签页 |
| `NavState` | 导航状态 |
| `BookmarkFolder` | 书签文件夹 |
| `Bookmark` | 书签 |
| `Extension` | Chrome 扩展 |
| `ShortcutItem` | 快捷键条目 |
| `SplitPaneData` | 分屏面板数据 |
| `SplitNodeData` | 分屏节点数据 |
| `SplitLayoutData` | 分屏布局数据 |
| `SavedSplitSchemeData` | 保存的分屏方案 |
| `IpcAPI` | 完整 API 类型 |

---

## 关键依赖与配置

| 依赖 | 用途 |
|------|------|
| `@electron-toolkit/preload` | 提供 `electronAPI`（暴露给 `window.electron`） |

---

## 测试与质量

当前无测试文件。

---

## 相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `preload/index.ts` | 预加载脚本（IPC API 定义 + contextBridge + 15+ 类型导出） |
| `preload/index.d.ts` | TypeScript 类型声明（IpcAPI 接口） |
