[根目录](../CLAUDE.md) > **preload**

# preload/ -- 预加载模块

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
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
api.group       -- 分组 CRUD
api.account     -- 账号 CRUD（含图标上传、桌面快捷方式）
api.proxy       -- 代理 CRUD（含测试）
api.tab         -- 标签页 CRUD + 导航 + bounds 管理
api.bookmark -- 书签 CRUD
api.window      -- 窗口控制（最小化/最大化/关闭）
api.openExternal(url) -- 打开外部链接
api.on(event, callback) -- 监听主进程事件，返回清理函数
```

---

## 关键依赖与配置

- `@electron-toolkit/preload` -- 提供 `electronAPI`（暴露给 `window.electron`）

---

## 测试与质量

当前无测试文件。

---

## 相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `preload/index.ts` | 预加载脚本（IPC API 定义 + contextBridge） |
| `preload/index.d.ts` | TypeScript 类型声明（IpcAPI 接口） |
