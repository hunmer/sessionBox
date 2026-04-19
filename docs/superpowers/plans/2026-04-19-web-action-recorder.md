# 网页操作录制与动作复原 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 SessionBox 中实现“网页操作录制 + 真实页面动作复原”能力，替代 rrweb replay 作为主要复原方案。用户可以录制网页上的点击、输入、滚动、导航等动作，并在真实 `webview` / 标签页中重新执行这些步骤。

**Architecture:** 主进程通过 `executeJavaScript` 向目标页面注入动作录制脚本，页面将高层动作通过 `console-message` 发回主进程。主进程维护 `ActionRun` 状态并提供导出能力。调试窗口内嵌真实 `webview`，由 `action-player` 顺序执行动作。

**Tech Stack:** Electron (`BrowserWindow`, `webContents`, `ipcMain`, `<webview>`), TypeScript, `executeJavaScript`

**Design Spec:** `docs/superpowers/specs/2026-04-19-web-action-recorder-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `electron/services/action-recorder.ts` | 新建 | 注入录制脚本、维护录制状态、存储 ActionRun |
| `electron/services/action-player.ts` | 新建 | 顺序执行动作、等待元素、上报执行状态 |
| `electron/ipc/debugger.ts` | 修改 | 将 rrweb 相关 IPC 迁移为 action recorder / player IPC |
| `electron/debugger-window.html` | 修改 | 调试窗口 UI 改为“动作列表 + 真实 webview 复原” |
| `electron/debugger-preload.ts` | 修改 | 暴露新的调试 API |
| `src/components/common/RightPanel.vue` | 可选修改 | 文案从“调试/回放”改为“动作录制/复原” |
| `docs/superpowers/specs/2026-04-19-web-action-recorder-design.md` | 新建 | 设计文档 |
| `docs/superpowers/plans/2026-04-19-web-action-recorder.md` | 新建 | 实施计划 |

---

## 批次一：动作数据模型与录制服务

### Task 1: 创建动作录制服务基础结构

**Files:**
- Create: `electron/services/action-recorder.ts`

- [ ] **Step 1: 定义类型**

在 `action-recorder.ts` 中定义：

- `ActionLocator`
- `ActionStep`
- `ActionRun`
- `RecorderState`

要求：

- `ActionStep.type` 首期仅支持 `navigate | click | input | change | scroll | keydown`
- `ActionLocator` 至少包含 `css / xpath / text / id / name / testId / tag / primary`
- `ActionRun` 至少包含 `id / startedAt / endedAt / initialUrl / partition / steps`

- [ ] **Step 2: 建立状态容器**

新增：

- `activeRuns = new Map<number, RecorderState>()`
- `finishedRuns = new Map<number, ActionRun>()`
- `MAX_STEPS`
- `MAX_STEP_SIZE`
- `ACTION_PREFIX = '__ACTION_RECORDER__'`

- [ ] **Step 3: 提供基础导出函数**

实现：

- `getActionRun(wcId: number): ActionRun | null`
- `getActiveActionRuns(): number[]`
- `clearActionRun(wcId: number): void`

Expected:

- 文件可以独立被主进程服务导入
- 不包含 UI 依赖

---

### Task 2: 实现页面注入与录制启动

**Files:**
- Modify: `electron/services/action-recorder.ts`

- [ ] **Step 1: 编写注入脚本生成函数**

新增 `buildRecorderScript()`，返回注入到页面执行的字符串脚本。

脚本职责：

- 监听 `click`
- 监听 `input`
- 监听 `change`
- 监听 `scroll`
- 监听 `keydown`
- 监听 `hashchange / popstate / beforeunload`

脚本内要求：

- 对每个 DOM 事件生成高层动作
- 为目标元素生成 `locator`
- 通过 `console.debug(ACTION_PREFIX + JSON.stringify(step))` 发回主进程
- 将 stop 函数挂到 `window.__actionRecorderStopFn`

- [ ] **Step 2: 实现 `injectActionRecorder(wcId)`**

逻辑：

- 获取 `webContents`
- 检查页面是否存在已有录制器
- 执行注入脚本
- 验证 `window.__actionRecorderReady === true`

- [ ] **Step 3: 实现 `startActionRecording(wcId, onStep?)`**

逻辑：

- 注册 `console-message` 监听器
- 拦截 `ACTION_PREFIX`
- JSON 解析后 push 到 `steps`
- 实时调用 `onStep?.(step)`
- 当步骤过多时自动停止

- [ ] **Step 4: 实现 `stopActionRecording(wcId)`**

逻辑：

- 移除 `console-message` 监听
- 调用页面中的 `window.__actionRecorderStopFn?.()`
- 将 run 转移到 `finishedRuns`

Expected:

- 录制服务可在无 UI 情况下单独工作
- 页面刷新或销毁时能自动清理

---

### Task 3: 录制脚本中的 locator 生成策略

**Files:**
- Modify: `electron/services/action-recorder.ts`

- [ ] **Step 1: 在注入脚本中实现 locator 生成函数**

优先采集：

- `data-testid`
- `id`
- `name`
- 稳定 CSS selector
- `textContent`
- XPath

- [ ] **Step 2: 规定 primary 选择规则**

优先级：

1. `testId`
2. `id`
3. `name`
4. `css`
5. `text`
6. `xpath`

- [ ] **Step 3: 对输入动作附加 value**

要求：

- `input` / `change` 动作必须保存值
- 敏感值先不脱敏，首版以功能为主
- 但结构上预留 `meta.sensitive` 字段

Expected:

- 录制数据不依赖 rrweb node id
- 同一步动作具备多套定位信息

---

## 批次二：动作执行器

### Task 4: 创建动作执行服务基础结构

**Files:**
- Create: `electron/services/action-player.ts`

- [ ] **Step 1: 定义执行状态类型**

定义：

- `ActionPlayState`
- `ActionStepResult`
- `ActionPlayOptions`

- [ ] **Step 2: 创建执行器入口**

实现：

- `playActionRun(targetWc: Electron.WebContents, run: ActionRun, options?: ActionPlayOptions)`
- `stopActionPlay(playId: string)`

Expected:

- 执行器不依赖调试窗口 HTML
- 可以被任意 IPC / 工具调用

---

### Task 5: 实现元素查找与等待机制

**Files:**
- Modify: `electron/services/action-player.ts`

- [ ] **Step 1: 实现 `findElementByLocator`**

在页面中通过 `executeJavaScript` 查找元素，按优先级尝试：

- testId
- id
- name
- css
- text + tag
- xpath

- [ ] **Step 2: 实现 `waitForElement`**

要求：

- 超时默认 5000ms
- 间隔轮询 100ms
- 找到元素后返回成功

- [ ] **Step 3: 实现 `waitForNavigationOrSettled`**

要求：

- 对可能导致跳转的动作等待 URL 或加载状态变化
- 无跳转时等待短暂 settle 时间，如 300ms

Expected:

- 执行器具备最基础的抗页面波动能力

---

### Task 6: 实现各动作类型执行

**Files:**
- Modify: `electron/services/action-player.ts`

- [ ] **Step 1: 实现 `navigate`**

行为：

- 调用 `loadURL`
- 等待页面完成加载

- [ ] **Step 2: 实现 `click`**

行为：

- 根据 locator 找元素
- 必要时 `scrollIntoView`
- 触发 `.click()`

- [ ] **Step 3: 实现 `input` / `change`**

行为：

- 找元素
- 聚焦
- 写入 value
- 派发 `input` / `change`

- [ ] **Step 4: 实现 `scroll`**

行为：

- 支持页面滚动
- 首期容器滚动可先降级为页面滚动

- [ ] **Step 5: 实现 `keydown`**

首期仅支持：

- `Enter`
- `Tab`
- `Escape`

Expected:

- 可以稳定跑通常见登录 / 表单填写流程

---

## 批次三：IPC 与调试窗口改造

### Task 7: 改造 debugger IPC

**Files:**
- Modify: `electron/ipc/debugger.ts`

- [ ] **Step 1: 引入新的服务**

导入：

- `injectActionRecorder`
- `startActionRecording`
- `stopActionRecording`
- `getActionRun`
- `playActionRun`
- `stopActionPlay`

- [ ] **Step 2: 新增 IPC 通道**

实现：

- `debugger:inject-action-recorder`
- `debugger:start-action-record`
- `debugger:stop-action-record`
- `debugger:get-action-run`
- `debugger:export-action-run`
- `debugger:play-action-run`
- `debugger:stop-action-play`

- [ ] **Step 3: 保留兼容层或移除 rrweb IPC**

策略二选一：

- 保留旧 IPC 但不再作为主路径
- 或在本批次彻底替换

建议首期：

- 保留 `debugger:create-window`
- 替换 rrweb record/replay 相关 IPC

Expected:

- 调试窗口 API 与新服务对齐

---

### Task 8: 更新 debugger preload

**Files:**
- Modify: `electron/debugger-preload.ts`

- [ ] **Step 1: 替换 rrweb 相关 API**

新增暴露：

- `injectActionRecorder`
- `startActionRecord`
- `stopActionRecord`
- `getActionRun`
- `playActionRun`
- `stopActionPlay`

- [ ] **Step 2: 保留窗口控制与 tab 获取 API**

确保：

- `getTabs`
- `loadUrl`
- `setEmbeddedWcId`
- `minimize/maximize/close`

继续可用

Expected:

- `window.debuggerApi` 与新 UI 匹配

---

### Task 9: 改造调试窗口 UI

**Files:**
- Modify: `electron/debugger-window.html`

- [ ] **Step 1: 移除 rrweb replay 视图逻辑**

删除：

- rrweb replay 相关页面
- replay command 双通道逻辑
- 事件时间轴逻辑

- [ ] **Step 2: 改为动作列表展示**

右侧改为：

- 动作序号
- 类型
- 定位摘要
- 值摘要
- URL
- 执行状态

- [ ] **Step 3: 左侧改为真实执行 webview**

左侧保留一个真实 `webview`，用于：

- 加载复原目标 URL
- 执行 ActionRun

- [ ] **Step 4: 新增按钮**

至少增加：

- `注入并录制`
- `停止录制`
- `导出动作`
- `开始复原`
- `停止复原`

- [ ] **Step 5: 实时状态同步**

调试窗口应接收：

- `debugger:action-step`
- `debugger:action-play-state`

用于展示录制进度与执行结果

Expected:

- UI 语义从“回放”变成“复原”
- rrweb 依赖可从该页面移除

---

## 批次四：导出、验证与收尾

### Task 10: 导出动作序列

**Files:**
- Modify: `electron/ipc/debugger.ts`
- Modify: `electron/debugger-window.html`

- [ ] **Step 1: 定义导出格式**

导出 JSON 包含：

- `version`
- `type`
- `initialUrl`
- `partition`
- `steps`

- [ ] **Step 2: 接入保存对话框**

延续现有 `showSaveDialog + writeFile` 方案

- [ ] **Step 3: 支持复制选中步骤**

可保留现有“导出选中”思路，但输出改为真实 ActionStep[]

Expected:

- 用户可拿到可读、可二次利用的动作 JSON

---

### Task 11: 验证场景

**Files:**
- 无代码改动，执行验证

- [ ] **Step 1: 基础场景**

验证：

1. 打开普通页面
2. 输入搜索词
3. 点击按钮
4. 滚动页面
5. 复原成功

- [ ] **Step 2: 登录表单场景**

验证：

1. 输入用户名
2. 输入密码
3. 点击登录按钮

要求：

- 至少在一个常见站点上比 rrweb replay 更稳定

- [ ] **Step 3: 导航场景**

验证：

1. 点击链接导致跳转
2. 复原时能正确等待导航完成

- [ ] **Step 4: 异常场景**

验证：

- 元素找不到
- 页面被刷新
- 执行中手动停止

Expected:

- 调试窗口能明确展示失败步骤与原因

---

### Task 12: 清理 rrweb 回放残留

**Files:**
- Modify: `electron/debugger-window.html`
- Modify: `electron/vite config` if needed
- Optional: `electron/debugger-replay.html`, `electron/debugger-replay-preload.ts`

- [ ] **Step 1: 判断是否保留 rrweb 作为旁路能力**

二选一：

- 保留 rrweb 录制/回放作为实验功能
- 或完全删除 replay 页面与相关打包逻辑

建议：

- 如果本批次目标明确是动作复原，先移除 replay 页面，降低维护成本

- [ ] **Step 2: 清理无用资源引用**

包括：

- `debugger-replay.html`
- `debugger-replay-preload.ts`
- 打包复制逻辑

Expected:

- 调试器主路径只剩动作录制/复原

---

## 验收标准

- [ ] 用户可以录制真实网页上的点击、输入、滚动、导航动作
- [ ] 用户可以在真实 `webview` 中重新执行这些动作
- [ ] 复原过程不依赖 rrweb replay / iframe sandbox
- [ ] 录制结果可以导出为结构化 JSON
- [ ] 至少一个真实站点上的成功率优于 rrweb replay

---

## 备注

### 实施顺序建议

建议按以下顺序推进：

1. `action-recorder.ts`
2. `action-player.ts`
3. `debugger.ts / debugger-preload.ts`
4. `debugger-window.html`
5. 导出与验证

### 技术风险

1. locator 稳定性不足
   需要多套 fallback，而不是单一 selector

2. 执行副作用
   动作复原是“真实执行”，会触发真实请求

3. 页面差异
   如果站点 DOM 变化太大，动作复原仍会失败

但这些风险仍然比 rrweb replay 的资源/CSP问题更可控。

