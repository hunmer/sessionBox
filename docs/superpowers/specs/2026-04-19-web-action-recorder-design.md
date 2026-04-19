# 网页操作录制与动作复原设计

**日期**：2026-04-19
**状态**：提案

---

## 概述

为 SessionBox 新增一套“网页操作录制 + 动作复原”能力。

目标不是还原历史 DOM 画面，而是：

1. 在目标网页中录制用户的高层交互动作
2. 将动作序列保存为结构化步骤
3. 在新的真实 `webview` / 标签页中按顺序执行这些步骤

这套方案替代 rrweb replay 作为主要复原方式。

## 动机

当前 rrweb 方案更偏向“视觉级回放”，依赖快照重建 DOM。

在真实网站上存在几个根本问题：

- 跨站资源、CSP、iframe sandbox 导致资源加载不完整
- 登录态、Cookie、storage、service worker 很难和原始页面严格一致
- rrweb 事件流适合重建页面，不适合真实执行操作
- 用户真实需要的是“把刚才做过的操作重新走一遍”，不是“看一段网页录像”

因此，新的目标应改为：

- 记录动作
- 复原动作
- 尽可能复用原站点真实加载链路和 session

## 非目标

以下能力不在本方案首期范围内：

- 不做像 rrweb 那样的逐帧视觉回放
- 不保证 100% 还原页面视觉状态
- 不支持 canvas / video / animation / DOM 细粒度变化重放
- 不尝试跨页面完整恢复 JS 内存状态

## 核心思路

### 方案选择：Action Recorder + WebView Player

录制阶段不保存 rrweb 快照，而是保存高层动作。

回放阶段不创建 replay iframe，而是在真实页面里执行动作。

```
用户操作真实页面
  ↓
注入录制脚本，捕获 click/input/scroll/navigation
  ↓
主进程接收并存储 ActionStep[]
  ↓
调试窗口展示动作列表
  ↓
选择“复原”
  ↓
在目标 partition 的真实 webview 中加载 URL
  ↓
按顺序执行 action steps
```

## 为什么不继续使用 rrweb 事件流

现有 rrweb 录制代码位于：

- `electron/services/debugger.ts`

它记录的是：

- FullSnapshot
- IncrementalSnapshot
- MouseInteraction
- Input
- Scroll

这些数据的问题是：

1. 事件语义不稳定
   `rrweb` 的 `mutation`、`snapshot`、`meta` 对真实执行没有意义。

2. 定位信息不够稳定
   rrweb 里的 node id 是录制时的内部镜像 id，不可直接用于新页面。

3. 动作是“推断”出来的
   当前 `debugger-window.html` 的导出动作逻辑只是从 rrweb 事件里事后猜测，精度不足。

因此应在录制阶段直接采集动作，而不是事后从 rrweb 事件反推。

## 动作模型

### ActionRun

一次录制对应一个 ActionRun：

```json
{
  "id": "run_xxx",
  "tabId": "tab_xxx",
  "pageId": "page_xxx",
  "partition": "persist:container-abc",
  "startedAt": 1710000000000,
  "endedAt": 1710000012345,
  "initialUrl": "https://example.com/login",
  "steps": []
}
```

### ActionStep

首期仅支持高价值、可稳定复原的动作。

```json
{
  "id": "step_xxx",
  "type": "click",
  "timestamp": 1710000000123,
  "url": "https://example.com/login",
  "locator": {
    "primary": "css",
    "css": "button[type=submit]",
    "xpath": "/html/body/...",
    "text": "登录",
    "id": "submit-btn",
    "name": "",
    "testId": "",
    "tag": "button"
  },
  "payload": {
    "button": 0
  }
}
```

### 首期支持的动作类型

1. `navigate`
   页面跳转或 `location.href` 变化

2. `click`
   左键点击、按钮点击、链接点击

3. `input`
   文本框、textarea、contenteditable 输入

4. `change`
   select / checkbox / radio / 文件以外的表单变更

5. `scroll`
   页面滚动或可滚动容器滚动

6. `keydown`
   仅保留高价值按键：
   `Enter`、`Tab`、`Escape`

### 暂不支持的动作

- 文件上传
- 拖拽排序
- canvas 绘图
- 复杂手势
- 浏览器原生弹窗交互
- 多 iframe 深层穿透

## 定位策略

动作复原的核心不是事件本身，而是“如何重新找到目标元素”。

### Locator 结构

每个动作保存多套定位信息：

```json
{
  "primary": "testId",
  "css": "button.submit",
  "xpath": "/html/body/div[1]/form/button",
  "text": "提交",
  "id": "submit-btn",
  "name": "submit",
  "testId": "submit",
  "tag": "button"
}
```

### 优先级

回放时按优先级尝试：

1. `data-testid`
2. `id`
3. `name`
4. 稳定 CSS 选择器
5. 文本 + tag
6. XPath

### 稳定性原则

- 避免使用纯 class 串作为唯一定位
- 避免使用 rrweb node id
- 避免使用完整绝对 XPath 作为首选
- 对文本匹配仅作为兜底

## 录制架构

### 注入录制脚本

主进程通过 `webContents.executeJavaScript()` 向目标页面注入录制脚本。

录制脚本职责：

- 监听 `click`
- 监听 `input`
- 监听 `change`
- 监听 `keydown`
- 监听 `scroll`
- 监听 `beforeunload` / `popstate` / `hashchange`
- 为事件生成 ActionStep
- 通过 `console.debug('__ACTION_RECORDER__' + JSON.stringify(step))` 发回主进程

### 主进程存储

主进程负责：

- 维护 `activeRuns: Map<number, ActionRun>`
- 维护 `finishedRuns: Map<number, ActionRun>`
- 监听 `console-message`
- 限制动作总数与 payload 大小

建议不落盘自动存储，仍以内存为主，导出 JSON 为辅。

## 动作复原架构

### 回放容器

不再使用 rrweb replay iframe。

改为两种真实执行模式：

1. 在调试窗口内嵌 `<webview>` 中执行
2. 在新的标签页 / 新 BrowserWindow 中执行

首期推荐：调试窗口内嵌 `webview`

### session / partition 复用

复原必须尽量使用原录制页面对应的 partition：

- 原 tab 有容器时：复用 `persist:container-xxx`
- 内嵌模式：使用固定 `persist:debugger-embedded`

这样可以共享：

- Cookie
- localStorage
- IndexedDB
- 登录态

### 执行器

新增 Action Player 执行器，顺序执行动作：

1. 打开初始 URL
2. 等待页面加载
3. 对每个步骤：
   - 查找目标元素
   - 必要时滚动到视口
   - 执行动作
   - 等待页面稳定
4. 记录执行日志

### 等待策略

每步执行前后都要等待：

- `dom-ready`
- 元素出现
- 页面导航完成
- 短暂 idle 时间

建议默认策略：

- `find element timeout`: 5000ms
- `post action settle`: 300ms
- `navigation timeout`: 10000ms

## 执行动作的实现方式

仓库已有大量真实页面执行能力，可直接复用：

- `electron/ipc/chat.ts`
- `electron/services/ai-proxy-tools.ts`

现有能力包括：

- `click`
- `input`
- `scroll`
- `select`
- `hover`

新方案不需要重造全部执行底座，而是应抽出统一的 `action-player.ts` 供调试器复用。

## UI 设计

### 调试窗口

调试窗口保留，但回放区改为“动作复原”：

```
┌─────────────────────────────────────────┐
│ 调试工具                                 │
├─────────────────────────────────────────┤
│ 目标页面 [选择]                          │
│ [开始录制] [停止录制] [导出动作]         │
│ [在当前 WebView 复原] [新标签页复原]     │
├─────────────────────────────────────────┤
│ 左侧：复原用 WebView                     │
│ 右侧：动作列表                           │
│   1 navigate /login                     │
│   2 input username                      │
│   3 input password                      │
│   4 click submit                        │
└─────────────────────────────────────────┘
```

### 动作列表

每步展示：

- 步骤序号
- 动作类型
- 目标摘要
- URL
- 时间
- 执行状态

执行状态：

- `pending`
- `running`
- `success`
- `failed`
- `skipped`

## IPC 设计

新增或替换以下调试器 IPC：

| 通道 | 方向 | 用途 |
|------|------|------|
| `debugger:create-window` | 渲染→主 | 打开调试窗口 |
| `debugger:get-tabs` | 渲染→主 | 获取可录制 tab |
| `debugger:inject-action-recorder` | 渲染→主 | 注入动作录制脚本 |
| `debugger:start-action-record` | 渲染→主 | 开始动作录制 |
| `debugger:stop-action-record` | 渲染→主 | 停止动作录制 |
| `debugger:get-action-run` | 渲染→主 | 获取动作序列 |
| `debugger:export-action-run` | 渲染→主 | 导出 JSON |
| `debugger:play-action-run` | 渲染→主 | 开始动作复原 |
| `debugger:stop-action-play` | 渲染→主 | 停止动作复原 |
| `debugger:action-step` | 主→渲染 | 实时推送步骤 |
| `debugger:action-play-state` | 主→渲染 | 推送执行进度 |

## 模块划分

### 新增文件

| 文件 | 职责 |
|------|------|
| `electron/services/action-recorder.ts` | 录制状态管理、脚本注入、动作存储 |
| `electron/services/action-player.ts` | 动作执行器：定位、等待、执行、日志 |
| `electron/debugger-action-recorder.js` 或内联脚本 | 页面侧录制逻辑 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `electron/ipc/debugger.ts` | 从 rrweb IPC 迁移为 action recorder/player IPC |
| `electron/debugger-window.html` | UI 从 rrweb replay 改为动作列表 + 真实 webview |
| `electron/debugger-preload.ts` | 暴露新的 debugger API |
| `src/components/common/RightPanel.vue` | 入口不变或仅改文案 |

## 数据导出格式

导出 JSON 应直接以动作序列为主：

```json
{
  "version": 1,
  "type": "sessionbox-action-run",
  "initialUrl": "https://example.com/login",
  "partition": "persist:container-demo",
  "steps": []
}
```

这比 rrweb 事件 JSON 更适合：

- 人工检查
- 后续自动化执行
- 喂给 Agent 做流程分析

## 边界与失败处理

### 页面变化

页面 DOM 变了，元素找不到时：

- 重试其他 locator
- 失败后停止或跳过，取决于策略

### 导航

如果 click 导致导航：

- 等待 `did-navigate` / URL 变化
- 更新当前执行上下文

### 副作用

真实复原会触发真实提交和真实请求。

因此 UI 必须明确提示：

- 这是“真实执行”
- 不是“纯回放”

### 安全开关

建议首期提供一个执行选项：

- `只执行到点击前`
- `允许真实提交`

首版也可以先不做，但设计上应预留。

## 与 rrweb 的关系

本方案并不要求彻底删除 rrweb 代码，但产品重心应转移：

- rrweb：可选的历史调试工具
- action recorder/player：主要的操作复原工具

如果维护成本过高，后续可完全移除 rrweb replay。

## MVP 范围

首期 MVP 只做：

1. 录制
   - `navigate`
   - `click`
   - `input`
   - `change`
   - `scroll`

2. 复原
   - 在真实 `webview` 中顺序执行
   - 支持停止
   - 支持导出 JSON
   - 支持执行状态高亮

不做：

- 文件上传
- 拖拽
- iframe 深层穿透
- 复杂键盘组合
- 录制时截图

## 成功标准

满足以下条件即认为方案成功：

1. 用户能录制一个登录或表单填写流程
2. 用户能在真实页面里重新执行这个流程
3. 复原时不依赖 rrweb iframe / sandbox replay
4. 常见站点上成功率显著高于 rrweb replay

