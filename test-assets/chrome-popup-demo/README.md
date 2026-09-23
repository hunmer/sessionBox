# Chrome Popup Demo

这是一个最小可用的测试扩展目录，用于验证：

- 扩展目录选择是否正常
- 扩展是否能被导入
- 工具栏扩展按钮是否出现
- popup 是否能打开并执行基础脚本
- MV3 `chrome.userScripts.register()` 是否能在任意网页注入脚本
- 注入的 userscript 是否能正常调用 `alert(1)`
- MV3 service worker 是否能调用 `chrome.sidePanel`、`storage`、`tabs`、`action` 和 `runtime.sendMessage`
- popup 是否能手动创建并移除 cat-catch 风格的 video recording popup 窗口

导入目录：

`/Users/Zhuanz/Documents/sessionBox/test-assets/chrome-popup-demo`

导入并启用扩展后，打开任意 `http://` 或 `https://` 网页。页面加载时应出现内容为 `1` 的原生弹窗。

关闭弹窗后，在网页开发者工具控制台执行：

```js
document.documentElement.dataset.sessionBoxPopupDemoUserscript
```

预期返回：

```text
after-alert
```

这表示 userscript 已经完成了“进入脚本 → 弹出 alert → 关闭弹窗后继续执行”的完整流程。控制台还会输出：

```text
[SessionBox Popup Demo] userscript { time: <时间>, phase: 'before-alert' }
[SessionBox Popup Demo] userscript { time: <时间>, phase: 'after-alert' }
```

如果只看到 `before-alert`，说明脚本已经注入，但弹窗尚未关闭或脚本没有从弹窗继续执行。

在 SessionBox 开发模式中设置 `SESSIONBOX_TEST_EXTENSION_PATH` 为本目录路径时，SessionBox 会自动启用此扩展。service worker 启动后会自动执行 API smoke test，并在 SessionBox 日志中输出：

```text
[SessionBox Popup Demo] API_SMOKE_SUCCESS
```

popup 中的“创建测试窗口”只在手动点击后调用 `chrome.windows.create({ type: 'popup', width: 640, height: 420 })`，打开 `recording.html`；“移除测试窗口”调用 `chrome.windows.remove`。自动 API smoke 不再创建窗口。

已导入过旧版 demo 时，先禁用再启用扩展，然后刷新网页；若导入的是复制目录，请重新导入上面的源码目录。浏览器内部页面不属于普通 HTTP/HTTPS 网页。

自动回归命令（在仓库根目录运行）：

```sh
TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS"}' NODE_OPTIONS='--no-experimental-strip-types' pnpm -C "packages/electron-chrome-extensions" test -- --grep 'chrome.userScripts'
```

独立 alert fixture 与本目录的 `background.js`、`userscript.js` 保持一致，测试会检查两份代码相同。测试分别覆盖 BrowserWindow 和 WebContentsView，通过 CDP 检查真实 dialog 的类型、消息 `1`、关闭事件及 `after-alert` 标记；自动关闭弹窗的行为仅存在于测试中。自动化事件验证不代替上面的 SessionBox 可见弹窗验收。
