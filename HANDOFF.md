# SessionBox / electron-chrome-extensions 交接

## 当前目标

继续提高本地 `packages/electron-chrome-extensions` 的通用 MV3 兼容性，重点让 Tampermonkey Beta 的 `chrome.userScripts` 注入、popup、当前 Tab/Session 关联稳定工作。禁止按 Tampermonkey 扩展 ID、百度域名或 Tampermonkey 源码做特判。

仓库状态：`master`，HEAD `b3a8dee`。工作区有未提交修改，先执行 `git status --short` 与 `git diff` 阅读现状，不要覆盖用户已有改动。

## 本轮结论

网页黑屏和 renderer 崩溃已解决。根因不是 Tampermonkey 两段脚本并发，也不是 CSP 内容，而是 `createWorldId()` 生成了超过 Blink 合法范围的隔离 world ID。

- Blink 要求 embedder world ID 位于 `[1, 1 << 29)`。
- Tampermonkey `default` world 的旧 ID 是 `798557731`，超过上限 `536870912`。
- 调用 `webFrame.setIsolatedWorldInfo()` 后触发 Blink `DCHECK`，renderer 以 `exitCode: -36861` 崩溃。
- 新算法将该 world 稳定映射为 `47461347`。
- 本机真实 Tampermonkey + `https://www.baidu.com/` 隐藏窗口集成验证：页面不再崩溃，`page.js` 状态为 `started -> completed`。

实现与测试改动直接查看以下文件和 `git diff`：

- `packages/electron-chrome-extensions/src/browser/api/user-scripts.ts`
- `packages/electron-chrome-extensions/src/renderer/user-scripts.ts`
- `packages/electron-chrome-extensions/spec/chrome-userScripts-spec.ts`
- `packages/electron-chrome-extensions/spec/fixtures/chrome-userScripts-mv3/background.js`
- `packages/electron-chrome-extensions/spec/fixtures/chrome-userScripts-mv3/probe-world-limit.js`

除了 world ID 修复，当前未提交代码还包含此前为解决导航死锁做的两项改动：

- 页面 preload 通过异步 `ipcRenderer.invoke` 查询动态脚本，主进程改为 `ipcMain.handle`。
- 同一 isolated world 内脚本串行执行，每段最多等待 5 秒。

## 尚未解决

真实 Tampermonkey 的 `content.js` 仍失败，但不会再导致黑屏：

```text
Uncaught TypeError: Cannot read properties of undefined (reading 'id')
source: chrome-extension://.../3%7Ccontent....user-script.js
line: 31
```

对应本地扩展源码第 29-31 行：

```js
const Co = globalThis;
let ...;
({ chrome: ko, browser: Bo } = Co);
// 后续读取 ko.runtime.id
```

结论：通过 `webFrame.executeJavaScriptInIsolatedWorld()` 创建的 `USER_SCRIPT` world 没有 Chromium 原生扩展 API 绑定，`globalThis.chrome` 为 `undefined`。下一步应为任意 MV3 `USER_SCRIPT` world 提供通用、最小权限的 API/messaging bridge，至少覆盖 `runtime.id` 及 Tampermonkey content world 实际调用的 runtime messaging。不要把主页面 world 的对象直接暴露过去，也不要注入 Tampermonkey 专用 shim。

另一个结构性限制：目前为了避开 preload 同步 IPC 死锁，标为 `document_start` 的动态脚本实际在页面 `load` 后查询和执行。后续如要恢复真正的 `document_start` 时机，应先确保 Session 扩展初始化 barrier 完成，并采用不会在 frame preload 中同步等待主进程/worker 的数据下发机制。

## 已验证

以下命令通过：

```powershell
pnpm run build:extensions

$env:TS_NODE_COMPILER_OPTIONS = '{"module":"CommonJS"}'
pnpm -C "packages/electron-chrome-extensions" test -- --files "spec/chrome-userScripts-spec.ts"
```

结果：`3 pass, 0 fail`。新增 `limit-probe-0` world 在旧算法下会生成 `698117655`，回归测试现在能带 CSP 正常执行，确保不会再次越过 Blink 上限。

真实 Tampermonkey 集成测试是临时文件，已删除，避免把依赖本机 AppData 的测试提交进仓库。扩展当前位于：

```text
C:/Users/Administrator/AppData/Roaming/session-box/extensions/webstore/gcalenpjmijncebpfijmoaglllgpjagf
```

真实验证中可忽略 Electron 对 `webRequestBlocking` 和若干未知权限的加载警告；它们不是本次 `-36861` 崩溃原因。

## 运行与日志

项目持久化开发进程由 procm HTTP 管理：

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:7331/api/processes/YZFXVmY3/restart" `
  -ContentType "application/json" `
  -Body "{}"
```

日志：

```powershell
Invoke-RestMethod -Method Get `
  -Uri "http://127.0.0.1:7331/api/processes/YZFXVmY3/logs?count=200"
```

保留这些结构化链路日志：脚本解析、document query、每个脚本 `started/completed/failed`、WebView navigation、`render-process-gone`。不要恢复 service worker API bridge 的逐调用刷屏日志。

## 建议接手顺序

1. 先重跑构建和 `chrome-userScripts-spec.ts`，确认当前基线。
2. 用一个最小 MV3 测试扩展验证自定义 `USER_SCRIPT` world 内 `chrome.runtime.id` 和双向 messaging，不先用 Tampermonkey调试。
3. 在 renderer 侧实现通用 USER_SCRIPT API bridge，并增加自动化回归。
4. 再用真实 Tampermonkey 验证 `content.js` 不报错、popup 能识别当前活动 Tab、用户脚本能执行。
5. 最后检查 `git diff --check`，并通过 procm 重启开发进程。

## Suggested Skills

- `procm-http`：重启持久化 Electron 开发进程并读取 stdout/stderr。
- `zoom-out`：在修改 USER_SCRIPT bridge 前梳理现有 renderer API 注入、router、Session 与 extension host 的边界。

## 用户约束

- 始终简体中文。
- 最小改动优先；用户已多次反馈同一兼容性问题，新增关键诊断日志后再验证。
- 不做 Tampermonkey ID/域名/源码特判，目标是提高 `electron-chrome-extensions` 的通用兼容性。
- 除非用户明确要求，不使用可见真实浏览器测试。
- 修改后通过 procm 持久化进程重启。
