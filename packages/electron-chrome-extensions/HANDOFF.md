# electron-chrome-extensions MV3 兼容性交接

## 目标

继续把本包完善为通用的 Chrome MV3 扩展兼容层。Tampermonkey Beta 是当前最完整的验收样本，但实现不得依赖扩展 ID、站点域名或 Tampermonkey 源码特征。

基本原则：

- 以 `Session` 为隔离边界；相同扩展在不同 Session 中的脚本、消息、Port 和 service worker 不得串线。
- 优先复用 Electron/Chromium 已提供的扩展能力，只补齐缺失或行为不兼容的部分。
- MV3 扩展页使用自定义 runtime bridge；MV2 保留 Chromium 原生消息闭环，避免兼容层回归。
- `src/` 是源码真相，`dist/` 是构建产物。修改源码后使用包内 `build` 同步产物。
- 先建立最小扩展回归测试，再修改实现；不要直接依赖 Tampermonkey 黑盒调试。

## 当前基线

当前真实验收链路已经可用：

- Tampermonkey 注册的用户脚本能够匹配并执行于普通网页。
- action popup 能正常加载，并能完成 `ping`、`loadTree`、`imageUrlToTransferable` 等消息往返。
- USER_SCRIPT world 与 service worker 之间的 `runtime.sendMessage` 能收到响应。
- `runtime.connect` 建立的 Port 支持 frame 与 worker 双向消息，worker 收到的 sender 含当前页面的 `tab.id` 和 URL。
- `chrome.userScripts` 的注册、更新、注销、持久化、恢复和初始化等待已有实现。
- `chrome.userScripts` 回归最后一次结果为 `11 pass, 0 fail`；BrowserWindow 与 WebContentsView 中的真实 `alert(1)` 均通过。
- `tabs.sendMessage` 在 USER_SCRIPT world 中支持异步 `sendResponse` (`return true`) 及 Promise listener；空 world 不会抢先回复 `undefined`。
- tabs 响应只由单一全局 IPC dispatcher 接收，再按来源 Session 分发。`tabs.query` 已支持带端口的完整 URL 及 URL glob 查询。
- 来源 tab 销毁或扩展卸载时清理其 runtime Port；frame 无法发送或断开其他 frame 创建的 Port。
- DOM fallback 的入站 Port 消息不会再被同名出站监听器回送，实际百度页面重启验证无 `runtime.portPostMessage` 缺失扩展身份错误。
- MV3 扩展页首次 `runtime.sendMessage` 会等待 service worker 处于 `running` 且已注册 `runtime.onMessage`，避免启动期间丢消息。
- MV2 `tabs.executeScript` 包装层在 API 注入前绑定 Electron 原生方法，避免原地扩展 namespace 后递归调用自身。

这些能力是后续修改必须守住的回归基线，不需要继续排查旧的注入、popup 或无接收端故障。

## 架构理解

### Session 与路由

`src/browser/index.ts` 为一个 `ExtensionContext` 创建各 API 实例。`src/browser/router.ts` 根据 IPC 调用方解析所属 Session，并维护 frame/service worker 的事件监听者。

事件发送给 service worker 时，router 使用 `startWorkerForScope()` 唤醒对应扩展 worker；发送给扩展页时，直接投递到对应 `WebContents`。因此后续状态表应优先放在每个 `ExtensionContext`/API 实例内，不能只用全局 `extensionId` 作为键。

### chrome.userScripts

`src/browser/api/user-scripts.ts` 负责：

- `register`、`update`、`unregister`、`getScripts`、`configureWorld`。
- 按 Session 持久化到 `electron-chrome-extensions/user-scripts.json`。
- 扩展加载后的恢复，以及首次导航前等待 MV3 worker 完成初始注册。
- URL 匹配、frame 过滤、脚本排序和脚本源码读取。
- 将扩展 world 标识稳定映射到 Blink 接受的 `[1, 1 << 29)` 数值范围。
- 通过全局 IPC handler 和 `WeakMap<Session, UserScriptsAPI>` 找回正确 Session 的脚本注册表。

`src/renderer/user-scripts.ts` 运行在页面 frame preload 中，负责：

- 异步向主进程查询当前文档需要执行的动态脚本。
- 创建 MAIN 或 USER_SCRIPT world，并在同一 world 内串行执行脚本。
- 为 USER_SCRIPT world 注入最小 `chrome.runtime`/`chrome.extension` prelude。
- 通过 `contextBridge.exposeInIsolatedWorld` 或 DOM carrier fallback，把消息和 Port 转到 preload IPC。
- 把每段脚本的 `started`、`completed`、`failed` 和超时写入主进程日志。

USER_SCRIPT world 不是 Chromium 原生扩展上下文，不能假设它天然拥有完整 `chrome.*`。新增 API 时必须明确其权限、暴露上下文和数据边界，不能把主页面对象直接透传到 isolated world。

### runtime 消息与 Port

`src/renderer/index.ts` 向扩展页注入 API。对 MV3，它把 `runtime.sendMessage`、`runtime.onMessage`、`runtime.connect` 及旧 `chrome.extension` 别名接到自定义 router；对 MV2，不替换原生消息实现。注入时优先原地扩展 Chromium 已有 namespace，必要时才替换只读方法所在的对象。

`src/browser/api/runtime.ts` 负责 USER_SCRIPT/扩展页与 service worker 之间的路由：

- 每次 `sendMessage` 使用 request ID 保存响应 resolver，并通过 `runtime.onMessage` 投递给 worker。
- 首次 MV3 消息使用 router 的 listener 注册信号及 worker `running` 状态共同判断可投递时机；Electron 在 worker 已经 `starting` 时再次 `startWorkerForScope()` 可能拒绝，因此不依赖该调用单独判断 ready。
- sender 当前包含 `id`、`url`、`frameId` 和简化的 `tab`。
- Port 由 `portId` 关联扩展、来源 frame 和 worker，支持双向消息与断开通知。
- worker 启动时注册用户脚本响应 IPC。

当前实现中的 `5s` 消息超时和 Port 建连后的 `25ms` 等待只是兼容措施，不是 Chrome 语义，后续应由确定的 listener/worker 生命周期协议替代。

### tabs.sendMessage

`src/browser/api/tabs.ts` 根据 `tabId` 找到目标 `WebContents`，向页面 preload 发送 `crx-user-scripts:tabs-message`。`src/renderer/user-scripts.ts` 再把消息送入 USER_SCRIPT world 的 `runtime.onMessage`，响应经 `crx-tabs-message-response` 返回。

该链路已支持主 frame 中同步 callback、`return true` 后异步 callback 及 Promise listener；USER_SCRIPT world 按目标扩展 ID 过滤消息，全局响应 dispatcher 按来源 Session 分发。仍未完整实现多 frame、Chrome 的无接收端错误和超时语义。

## 与 Chrome MV3 的剩余差距

按以下顺序推进，每项都应先添加独立 fixture 和失败测试。

1. **真正的 `document_start`**
   当前 preload 会异步查询脚本，而标记为 `document_start` 的脚本实际安排在页面 `load`。需要设计由 Session 注册表提前下发、且不会同步阻塞导航的机制，并测试脚本早于页面首段 inline script 执行。

2. **service worker 生命周期与保活**
   worker 空闲后会停止。长连接 Port、待响应消息和进行中的 API 调用需要持有明确任务，并在完成、断开或超时后释放。实现前核对当前 Electron 版本的 `ServiceWorkerMain.startTask()`/结束任务接口，不要用固定延时模拟 ready 或 keepalive。

3. **完整 runtime 消息语义**
   补齐 callback 与 Promise 两种调用方式、`runtime.lastError`、无接收端错误、listener 返回 Promise、`return true` 后异步 `sendResponse`、多个 listener 的首个有效响应，以及超时/worker 重启后的确定清理。

4. **准确的 MessageSender**
   当前 `frameId` 和 tab `index` 固定为 `0`，且不同调用上下文共用简化 sender。需要区分扩展页、主 frame、subframe 和 USER_SCRIPT，并补齐 `documentId`、`origin`、准确 URL/tab/frame 信息。

5. **Port 生命周期**
   来源 tab 销毁和扩展卸载时的 Port map 清理已有回归；DOM fallback 入站 Port 事件被反向当作出站请求的问题已有失败回归并已修复。下一步处理 frame 内导航、worker 停止/重启、Port listener 和保活任务清理。移除建连 `25ms` 假等待并增加显式连接确认，保证 `onDisconnect` 只触发一次。

6. **完整 tabs.sendMessage**
   已修复 USER_SCRIPT 的异步 callback/Promise 响应和空 world 抢答，仍需支持 `frameId`/`documentId` 选项、多 frame 选择、无接收端、Promise/callback 错误、首响应规则和 `lastError`。当前无接收端仍在主进程等待 1 秒后返回 `undefined`。

7. **router 与全局 IPC 清理**
   `TabsAPI` 已改为一次性全局 IPC dispatcher，使用来源 Session 的 `WeakMap` 定位 API 实例。service worker listener 当前主要以扩展 ID 表示，还需验证停止和重启后的重新注册、去重与清理。

8. **API inventory 与权限模型**
   按 Chrome MV3 官方 API 逐项记录：支持程度、可用上下文、权限检查、返回值/错误语义和测试 fixture。优先覆盖 runtime、tabs、scripting、storage、webNavigation、permissions、offscreen 和 action，不要用空成功响应掩盖未实现行为。

## 测试基线

先运行直接相关测试：

```powershell
$env:TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS"}'
$env:NODE_OPTIONS='--no-experimental-strip-types'
pnpm -C "packages/electron-chrome-extensions" test -- --grep "chrome.userScripts"
```

再运行构建和静态检查：

```powershell
pnpm -C "packages/electron-chrome-extensions" build
git diff --check
```

后续至少补充以下回归矩阵：

- 两个 Session 加载同一扩展，消息、脚本注册和 Port 不串线。
- `document_start` 相对页面 inline script 的执行顺序。
- service worker 停止和重启后的 message/Port 行为。
- `sendResponse` 同步、`return true` 异步、Promise listener、无接收端和多 listener。
- 主 frame、subframe、跨导航的 sender 字段与 `tabs.sendMessage` 定址。
- frame/worker/扩展卸载时 Port 和 listener 无残留。

全量 tabs 测试本轮为 `25 pass / 0 fail`，另有一个原有 skip。带端口 URL 查询和两个 `executeScript` 超时均已修复：后者的根因是扩展 API 注入时 `Object.assign` 可能覆盖 `base.executeScript`，包装函数再从 `base` 读取会递归调用自身。

## 日志与验收

关键链路保留结构化日志，至少包含时间、Session storage path、extension ID、WebContents/tab/frame、request/port ID 和状态；不得记录脚本正文、令牌或用户数据。高频 API 调用不要长期逐条刷屏。

当前仓库根目录的 procm 开发进程 ID 最后记录为 `YZFXVmY3`。接手时先查询进程状态，代码变更后通过 procm 单实例重启并读取持久日志；纯文档变更不需要重启。

验收不能只看测试绿灯。最小真实验收应同时确认：

1. 普通页面中的用户脚本确实执行。
2. action popup 能读取当前标签页数据。
3. popup、USER_SCRIPT world 与 service worker 的消息及 Port 双向可达。
4. 日志中没有未清理的超时、重复 listener 或跨 Session 路由。

## 当前工作区注意事项

本轮接手时仓库位于 `master@cde778a`，接手后先执行 `git status --short` 和 `git diff`：

- `src/browser/api/runtime.ts`、`src/browser/api/tabs.ts`、`src/browser/router.ts`、`src/renderer/index.ts`、`src/renderer/user-scripts.ts`、MV3 fixture 和 `chrome-userScripts-spec.ts` 包含本轮兼容性改动。
- 对应 `dist/` 产物已由包内 `build` 同步。
- `vendor/tampermonkey` 是未跟踪的上游源码副本。

不要覆盖这些已有改动，也不要提交 `vendor/tampermonkey`，除非用户明确要求。
