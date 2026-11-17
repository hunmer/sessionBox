[根目录](../../CLAUDE.md) > [preload](../CLAUDE.md) > 详情

# preload/ 对外接口（`window.api`）

`window.api` 暴露 **36 个命名空间**（2026-11-17 实测）：

```
workspace group container page proxy tab
bookmark bookmarkFolder bookmarkCheck extension window settings
mutedSites password theme wallpaper searchEngine siteData
sync data sniffer shortcut split download chat
aiProvider browser plugin updater system mcp
agent skill debugger profile
+ openExternal(url)   # 系统浏览器打开
+ on(event, callback) # 订阅主进程事件，返回清理函数
```

命名空间职责一览：
- `workspace/group/container/page`：工作区/分组/容器/页面 CRUD（container 含图标上传、桌面快捷方式）
- `proxy`：代理 CRUD + 测试
- `tab`：标签 CRUD + 导航 + bounds + 代理 + 截图 + 静音 + 缩放
- `bookmark/bookmarkFolder/bookmarkCheck`：书签 CRUD + 批量 + 导入导出 + 健康检查
- `extension`：扩展选择/加载/卸载/删除/BrowserAction 弹窗
- `window`：最小化/最大化/关闭/全屏
- `settings`：标签冻结/默认浏览器/默认容器/默认工作区/关闭行为 等
- `mutedSites`：静音网站管理
- `password`：密码/笔记 CRUD + 按站点查询 + 清空
- `theme`：主题控制
- `wallpaper`：壁纸导入（文件选择）/列表/删除/设置
- `searchEngine`：搜索引擎管理
- `siteData`：站点数据（getInfo / clear / importCookies / exportCookies）
- `sync`：同步配置读写、连接测试、容器 Cookie 导出
- `data`：同步数据应用（setContainerCookies / applyContainers / applyProxies / applyBookmarks / exportSaveFile）
- `sniffer`：网络嗅探开关/域名/状态
- `shortcut`：快捷键列表/更新/清除/重置
- `split`：分屏状态/方案/多视图 bounds
- `download`：Aria2 完整控制
- `chat`：AI 流式请求/中止
- `aiProvider`：AI 供应商 CRUD + 连接测试
- `browser`：浏览器交互工具（click/type/scroll/select/hover/content/dom/screenshot）
- `plugin`：插件列表/启用禁用/视图/图标/ZIP 导入/URL 安装/卸载/打开目录
- `updater`：自动更新检查/下载/安装/事件
- `system`：系统级接口
- `mcp`：MCP Server 启停/状态
- `agent`：Agent 工具执行（execTool）
- `skill`：技能列表/搜索/读写/删除
- `debugger`：操作录制/回放（getTabs/getActionRun/clearActionSteps/injectActionRecorder/startActionRecord/stopActionRecord/highlightActionStep/playActionRun/saveActionPreset/onActionStep 等；独立调试器窗口已移除）
- `profile`：多 Profile 管理（list/create/current/launch/createDesktopShortcut/openSelector）

> IPC 通道细节见 [electron/claude/public-interfaces.md](../../electron/claude/public-interfaces.md)。

## 导出类型

Proxy, Workspace, Group, Container, Page, Tab, NavState, BookmarkFolder, Bookmark, Extension, ShortcutItem/ShortcutGroup, SplitPaneData/SplitNodeData/SplitLayoutData/SavedSplitSchemeData, PluginMeta, SearchEngine, PasswordField/PasswordEntry, DefaultBrowserResult, ChatCompletionParams, IpcAPI。
