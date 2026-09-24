# Chrome Extensions MV3 API 兼容清单

基准文档：[Chrome Extensions API reference](https://developer.chrome.com/docs/extensions/reference/api)

本文记录 SessionBox 当前兼容层的实现边界。`已实现` 表示已有主进程路由和 renderer 注入；`部分实现` 表示只覆盖常用方法或返回值；`未实现` 表示仍使用原生 Electron、空实现或尚未注入。新增 API 时应同时补充权限、上下文、错误语义和回归 fixture。

## 当前重点

| API | 状态 | 说明 |
| --- | --- | --- |
| `action` / `browserAction` | 部分实现 | 图标、popup、标题、badge、点击事件；工具栏由宿主渲染 |
| `runtime` | 部分实现 | MV3 `sendMessage`、`connect`、service worker 路由和生命周期兼容 |
| `tabs` | 部分实现 | 查询、创建、更新、导航、消息、脚本注入包装；frame/document 定址仍有限 |
| `windows` | 部分实现 | 查询、创建、更新、删除和窗口事件 |
| `webNavigation` | 部分实现 | 常用导航事件和 frame 查询 |
| `webRequest` | 部分实现 | `onBeforeRequest`、`onBeforeRedirect`、`onSendHeaders`、`onResponseStarted`、`onCompleted`、`onErrorOccurred` 已桥接到 Electron Session |
| `scripting` | 部分实现 | `executeScript` 支持 `files`、`func`、`target.tabId`、`allFrames`、`MAIN`/默认执行；CSS 和注册脚本待补 |
| `contextMenus` | 部分实现 | 创建、删除、清空、点击和宿主菜单映射 |
| `cookies` | 部分实现 | 常用读写方法和变更事件 |
| `storage` | 部分实现 | 复用 Electron 原生扩展 storage；sync/managed 语义有限 |
| `permissions` | 部分实现 | 声明权限查询和宿主授权请求 |
| `userScripts` | 已实现 | 注册、更新、注销、持久化恢复、world 和执行时机 |
| `commands` | 部分实现 | 注册查询和宿主快捷键映射 |
| `notifications` | 部分实现 | 常用创建、更新、清除和事件 |
| `i18n` | 部分实现 | 常用语言和消息读取 |
| `privacy` | 占位 | ChromeSetting 结构存在，未提供持久化设置 |
| `downloads` | 主要能力已实现 | 支持 `download/search/pause/resume/cancel/erase/removeFile/open/show/showDefaultFolder/getFileIcon`、安全任务的 `acceptDanger` 及 `onCreated/onChanged/onErased`；`drag/setShelfEnabled/setUiOptions/onDeterminingFilename` 尚未实现 |
| `declarativeNetRequest` | 未实现 | 尚未建立规则存储和 Session 请求拦截 |
| `sidePanel` | 部分实现 | MV3 扩展 worker/page 支持 `setPanelBehavior` / `getPanelBehavior`，配置按当前扩展实例隔离；SessionBox 尚无扩展 side panel UI，点击 action 不会展示面板 |
| `offscreen` | 未实现 | 没有 offscreen document 生命周期管理 |

## MV3 API 全量目录

以下目录对应官方 API reference 的一级 namespace，作为后续实现和测试的完整范围：

`accessibilityFeatures`、`action`、`alarms`、`bookmarks`、`browsingData`、`commands`、`contentSettings`、`contextMenus`、`cookies`、`declarativeContent`、`declarativeNetRequest`、`desktopCapture`、`devtools`、`downloads`、`enterprise.deviceAttributes`、`enterprise.hardwarePlatform`、`enterprise.networkingAttributes`、`events`、`extension`、`extensionTypes`、`favicon`、`fileBrowserHandler`、`fileSystemProvider`、`fontSettings`、`gcm`、`history`、`i18n`、`identity`、`idle`、`input.ime`、`instanceID`、`management`、`notifications`、`offscreen`、`omnibox`、`pageCapture`、`permissions`、`platformKeys`、`privacy`、`proxy`、`runtime`、`scripting`、`search`、`sessions`、`sidePanel`、`storage`、`system.cpu`、`system.memory`、`system.storage`、`tabCapture`、`tabGroups`、`tabs`、`topSites`、`tts`、`ttsEngine`、`types`、`userScripts`、`vpnProvider`、`wallpaper`、`webAuthenticationProxy`、`webNavigation`、`webRequest`、`windows`。

## 实现规则

1. API 必须按 `Session` 隔离，不能只用扩展 ID 作为全局键。
2. service worker、扩展页、普通页面 USER_SCRIPT world 的可用 API 必须分别声明。
3. 事件 API 不能只在 renderer 创建空对象；必须有主进程事件源、监听注册和卸载清理。
4. `noop` 仅允许用于明确记录在本清单中的未实现 API，不得用空成功响应掩盖失败。
5. 每个新增 API 先添加最小 fixture，覆盖 Promise、callback、权限拒绝和扩展卸载后的清理。

## Cat Catch 验收映射

- 资源捕获：`webRequest.onSendHeaders` + `onResponseStarted` + `onErrorOccurred`，结果通过 `runtime.sendMessage` 写入扩展缓存。
- 视频录制：`scripting.executeScript` 读取扩展内 `catch-script/recorder.js`，注入目标 tab 的 MAIN world。
- 自动下载：依赖 `downloads.download`，当前仍需后续实现，不能把资源捕获成功误认为下载链路已完成。
