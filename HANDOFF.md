# SessionBox / electron-chrome-extensions 交接

## 当前目标

继续提高本地 `packages/electron-chrome-extensions` 的通用 MV3 兼容性，重点让 Tampermonkey Beta 的 `chrome.userScripts` 注入、popup、当前 Tab/Session 关联稳定工作。禁止按 Tampermonkey 扩展 ID、百度域名或 Tampermonkey 源码做特判。

仓库状态：`master`，HEAD `e62e0db`。工作区有未提交修改，先执行 `git status --short` 与 `git diff` 阅读现状，不要覆盖用户已有改动。

当前未提交修改包括：

- `test-assets/chrome-popup-demo/manifest.json`
- `test-assets/chrome-popup-demo/background.js`
- `test-assets/chrome-popup-demo/userscript.js`
- `test-assets/chrome-popup-demo/README.md`
- `packages/electron-chrome-extensions/spec/chrome-userScripts-alert-spec.ts`
- `packages/electron-chrome-extensions/spec/fixtures/chrome-userScripts-alert-mv3/`

## 本轮新增结论：最小 MV3 userscript 基线已通过

在继续分析真实 Tampermonkey 前，已先建立一个不依赖 Tampermonkey 黑盒的最小 MV3 扩展基线。测试扩展由 service worker 调用 `chrome.userScripts.register()`，使用 `matches: ['<all_urls>']`、`runAt: 'document_start'`、`world: 'USER_SCRIPT'`，注入页面脚本：

```js
document.documentElement.dataset.sessionBoxPopupDemoUserscript = 'before-alert'
alert(1)
document.documentElement.dataset.sessionBoxPopupDemoUserscript = 'after-alert'
```

对应文件：

- `test-assets/chrome-popup-demo/manifest.json`
- `test-assets/chrome-popup-demo/background.js`
- `test-assets/chrome-popup-demo/userscript.js`
- `test-assets/chrome-popup-demo/README.md`

新增独立 fixture 和测试：

- `packages/electron-chrome-extensions/spec/fixtures/chrome-userScripts-alert-mv3/`
- `packages/electron-chrome-extensions/spec/chrome-userScripts-alert-spec.ts`

测试通过 CDP `Page.javascriptDialogOpening` 捕获真实弹窗，确认 `type: 'alert'`、`message: '1'`，再自动关闭并确认 `Page.javascriptDialogClosed` 与 `after-alert` marker。BrowserWindow 与 WebContentsView 两种宿主均通过。

应用实际使用的 Electron `38.8.6` 已验证通过；扩展包自身测试解析到的 Electron `44.4.3` 也通过。此前“userscript 能执行但 alert 可能只是不可见”的假设已被最小 MV3 基线排除：当前宿主确实能触发并关闭原生 JavaScript dialog。后续才进入真实 Tampermonkey 差异分析。

## 已解决的核心兼容性问题

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

```sh
TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS"}' NODE_OPTIONS='--no-experimental-strip-types' pnpm -C "packages/electron-chrome-extensions" test -- --grep 'chrome.userScripts'
```

结果：`6 pass, 0 fail`，包括：

- 现有 3 项 MV3 userScripts 回归
- 新增 alert fixture 与 demo 文件一致性检查
- BrowserWindow 中由 MV3 userScript 触发 `alert(1)`
- WebContentsView 中由 MV3 userScript 触发 `alert(1)`

同一组 `chrome.userScripts` 测试也使用 SessionBox 应用实际的 Electron `38.8.6` 运行通过；扩展包默认测试解析到 Electron `44.4.3`，同样通过。静态验证包括 manifest JSON、demo/fixture JavaScript `node --check` 与 `git diff --check`。

`test-assets/chrome-popup-demo/README.md` 已记录人工验收：重新导入并启用扩展，打开普通 HTTP/HTTPS 页面，应看到内容为 `1` 的弹窗；关闭后页面 marker 应为 `after-alert`。

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

1. 先重跑 `chrome.userScripts` alert 基线和现有 MV3 回归，确认 `alert(1)` 与 `after-alert` marker 仍通过。
2. 用一个最小 MV3 测试扩展验证自定义 `USER_SCRIPT` world 内 `chrome.runtime.id` 和双向 messaging，不先用 Tampermonkey 调试。
3. 在 renderer 侧实现通用 USER_SCRIPT API bridge，并增加自动化回归；当前真实 Tampermonkey `content.js` 的首个已知失败是 `globalThis.chrome`/`chrome.runtime.id` 缺失。
4. 再用真实 Tampermonkey 验证 `content.js` 不报错、popup 能识别当前活动 Tab、用户脚本能执行；此时比较它与最小 MV3 基线的差异。
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
