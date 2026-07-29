[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 对外接口（IPC）

> 调用方为渲染进程 `window.api.*`（见 [preload/claude/public-interfaces.md](../../preload/claude/public-interfaces.md)）。所有 handle 调用经包装层广播 `ipc:{channel}` 到 `pluginEventBus`。

## IPC 通道（按域）

**工作区/分组/容器/页面/书签/书签文件夹/密码/搜索引擎/技能/窗口/设置/静音站点** — `electron/ipc/index.ts`
- workspace: `list create update delete reorder`
- group: `list create update delete reorder`
- container: `list create update delete reorder` + `uploadIcon uploadIconFromUrl createDesktopShortcut`
- page: `list create update delete reorder`
- bookmark: `list create update delete reorder batchDelete batchCreate importOpenFile exportSaveFile`
- bookmarkFolder: `list create update delete deleteEmpty reorder`
- password: `list listBySite create update delete clearAll`
- searchEngine: `list set getDefault setDefault`
- skill: `list search read write delete`
- window: `minimize maximize close isMaximized toggleFullscreen`
- settings: 标签冻结/默认浏览器/默认容器/默认工作区/最小化关闭/打开询问容器 等 get/set
- mutedSites: `list set add remove`

**标签页** — `electron/ipc/tab.ts`
- CRUD/排序：`list create close switch update reorder`
- 导航：`navigate goBack goForward reload forceReload`
- 缩放：`zoomIn zoomOut zoomReset getZoomLevel`
- 其他：`openDevTools open-in-new-window open-in-browser restore-all save-all update-bounds set-overlay-visible detect-proxy set-proxy-enabled apply-proxy set-muted capture`

**代理** — `electron/ipc/proxy.ts`：`list create update delete test test-config`
**书签健康检查** — `electron/ipc/bookmark-check.ts`：`checkStart checkCancel`
**分屏** — `electron/ipc/split.ts`：`get-state set-state clear-state list-schemes create-scheme delete-scheme update-multi-bounds`
**下载** — `electron/ipc/download.ts`：`checkConnection getConfig updateConfig start stop add pause resume remove listActive listWaiting listStopped globalStat purge showInFolder openFile startDrag pickDirectory`
**扩展** — `electron/ipc/extensions.ts`：`list select load unload delete update getLoaded openBrowserActionPopup`
**快捷键** — `electron/ipc/shortcut.ts`：`list update clear reset`
**自动更新** — `electron/ipc/updater.ts`：`check download install get-version get-info`
**网络嗅探** — `electron/ipc/sniffer.ts`：`toggle setDomainEnabled getDomainList clearResources getState`

**AI 聊天 / Agent / 浏览器交互** — `electron/ipc/chat.ts`
- `chat:completions`（流式，SSE 经 `webContents.send` 转发）、`chat:abort`
- `agent:execTool`
- `browser:click type scroll select hover`、`browser:get-content get-dom screenshot`

**AI 供应商** — `electron/ipc/ai-provider.ts`：`list create update delete test`

**MCP Server** — `electron/ipc/mcp.ts`：`start stop get-status`
**插件** — `electron/ipc/plugin.ts`：`list enable disable get-view get-icon import-zip open-folder install uninstall`

**调试器 / 操作录制回放** — `electron/ipc/debugger.ts`（`registerDebuggerIpcHandlers`，全 invoke）
- `debugger:create-window get-tabs get-target-info`
- `debugger:inject-action-recorder start-action-record stop-action-record get-action-run export-action-run`
- `debugger:play-action-run stop-action-play`
- `debugger:save-action-preset list-action-presets load-action-preset`
- `debugger:load-url window-minimize window-maximize window-close`
- `debugger:get-embedded-wcid set-embedded-wcid`

**外部链接**：`openExternal`（系统默认浏览器打开 URL）

## 主进程 → 渲染进程事件（`on:` 前缀）

- 标签：`on:tab:title-updated url-updated nav-state favicon-updated open-url request-bounds activated created frozen proxy-info auto-muted`
- 窗口：`on:window:maximized unmaximized`
- 路由：`on:open-container open-external-url tray:openInApp`
- 其他：`on:shortcut download:started`
- 聊天：`on:chat:chunk thinking error done` / `tool-call tool-call-args tool-call-args-delta tool-call-update tool-result` / `stop-reason usage retry`
- 更新：`update:checking available not-available download-progress downloaded error`
