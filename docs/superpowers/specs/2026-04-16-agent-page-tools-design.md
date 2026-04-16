# Agent 页面感知工具设计

**日期**：2026-04-16
**状态**：已批准

---

## 概述

为 SessionBox 的 AI Agent 新增 3 个「页面感知」工具，让 Agent 能够获取结构化的页面摘要、Markdown 正文和交互节点列表，替代当前粗糙的 `get_page_content`（仅 `document.body.innerText`）。

## 动机

当前 Agent 的页面信息获取能力有限：
- `get_page_content` — 仅返回纯文本，无结构
- `get_dom` — 返回原始 HTML，token 消耗大且噪声多

参照 `new_tools.txt` 的分析，Agent 需要三个层次的页面感知能力：
1. **结构化摘要** — 标题、URL、heading、链接
2. **Markdown 正文** — 干净的文章内容
3. **交互节点** — 可操作的 UI 元素及其属性

## 工具定义

### 1. `get_page_summary`

获取页面结构化摘要。

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tabId | string | 否 | 目标标签页 ID，默认当前活动标签 |

**返回**：
```json
{
  "title": "页面标题",
  "url": "https://example.com/page",
  "description": "meta description 内容",
  "headings": [
    { "level": 1, "text": "主标题" },
    { "level": 2, "text": "副标题" }
  ],
  "links": [
    { "text": "链接文字", "href": "https://..." }
  ],
  "meta": {
    "author": "作者",
    "keywords": "关键词",
    "ogTitle": "OG 标题",
    "ogDescription": "OG 描述"
  }
}
```

**实现**：注入 JS 脚本提取 `document` 中的 title、meta、headings、links。

**限制**：`links` 数组最多返回 50 条（按文档顺序截取），避免 token 消耗过大。

### 2. `get_page_markdown`

获取页面正文内容的 Markdown 表示。

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tabId | string | 否 | 目标标签页 ID，默认当前活动标签 |
| maxLength | number | 否 | Markdown 内容最大字符数，默认 10000，超过则截断并添加 `[truncated]` 标记 |

**返回**：
```json
{
  "title": "文章标题",
  "byline": "作者",
  "excerpt": "摘要",
  "markdown": "# 标题\n\n正文内容...",
  "contentLength": 15234,
  "truncated": false
}
```

**实现**：
1. 将 Readability + Turndown 的打包代码注入到目标页面的浏览器上下文中执行
2. 利用浏览器自身的 DOM 环境（无需 jsdom），Readability 直接接收 `document` 作为输入
3. 在浏览器上下文中完成 HTML → Markdown 转换，主进程只接收结果字符串

**优势**：无需引入 `jsdom`（体积大、与 Electron 打包可能有兼容问题），直接利用页面已有的 DOM 环境。

### 3. `get_interactive_nodes`

获取页面中可见的交互节点列表。

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tabId | string | 否 | 目标标签页 ID，默认当前活动标签 |
| viewportOnly | boolean | 否 | 是否仅返回视口内元素，默认 true |

**返回**：
```json
{
  "nodes": [
    {
      "id": 1,
      "tag": "button",
      "role": "button",
      "name": "登录",
      "text": "登录",
      "selector": "#login-btn",
      "rect": { "x": 100, "y": 200, "width": 80, "height": 32 },
      "visible": true,
      "clickable": true
    }
  ],
  "viewport": { "width": 1920, "height": 1080, "scrollX": 0, "scrollY": 0 }
}
```

**实现**：注入 JS 遍历 DOM，筛选规则：
- **交互元素**：button、a[href]、input、textarea、select、summary、details、[role]、[tabindex]
- **语义属性**：aria-label、aria-labelledby、title、placeholder、alt
- **可见性过滤**：display !== none、visibility !== hidden、opacity > 0、rect 合理
- **selector 生成**：优先 id → 唯一 class → tag + nth-child
- **shadow DOM**：不穿透 shadow DOM，仅处理顶层 DOM 节点
- **selector 稳定性**：`tag:nth-child(N)` 选择器在 DOM 变化后可能失效，这是已知限制

## 架构

### 新增文件

```
electron/services/page-extractor.ts   — 页面信息提取模块
```

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/lib/agent/tools.ts` | `BROWSER_TOOL_LIST` 新增 3 项，`createBrowserTools` 新增 3 个工具定义 |
| `electron/services/ai-proxy.ts` | `executeTool` 新增 3 个 case，导入 `page-extractor` |
| `src/lib/agent/system-prompt.ts` | 更新 `BROWSER_AGENT_SYSTEM_PROMPT` |

### 依赖

```bash
pnpm add @mozilla/readability turndown
pnpm add -D @types/turndown
```

> 不引入 `jsdom`。Readability 和 Turndown 均支持浏览器环境，通过 `executeJavaScript` 在页面上下文中直接执行。

### TypeScript 类型定义

在 `page-extractor.ts` 中定义以下 interface：

```typescript
interface PageSummary {
  title: string
  url: string
  description: string
  headings: Array<{ level: number; text: string }>
  links: Array<{ text: string; href: string }>
  meta: {
    author?: string
    keywords?: string
    ogTitle?: string
    ogDescription?: string
  }
}

interface PageMarkdown {
  title: string
  byline: string
  excerpt: string
  markdown: string
  contentLength: number
  truncated: boolean
}

interface InteractiveNode {
  id: number
  tag: string
  role: string
  name: string
  text: string
  selector: string
  rect: { x: number; y: number; width: number; height: number }
  visible: boolean
  clickable: boolean
}

interface InteractiveNodesResult {
  nodes: InteractiveNode[]
  viewport: { width: number; height: number; scrollX: number; scrollY: number }
}
```

### 模块职责

- **`page-extractor.ts`** — 单一职责：从 WebContents 提取页面信息
  - `extractPageSummary(wc: Electron.WebContents): Promise<PageSummary>` → 注入 JS 提取摘要
  - `extractPageMarkdown(wc: Electron.WebContents, maxLength?: number): Promise<PageMarkdown>` → 浏览器上下文 Readability + Turndown
  - `extractInteractiveNodes(wc: Electron.WebContents, viewportOnly?: boolean): Promise<InteractiveNodesResult>` → 注入 JS 遍历 DOM

  注意：函数签名接受 `Electron.WebContents`（而非 tabId），由 `ai-proxy.ts` 负责解析 tabId → WebContents 的映射。page-extractor 不依赖 webview-manager。

- **`ai-proxy.ts`** — 不变：管理通信协议和工具路由，tabId → WebContents 解析

- **`tools.ts`** — 不变：定义工具 schema

### system-prompt.ts 更新内容

在 `BROWSER_AGENT_SYSTEM_PROMPT` 的能力列表中新增：

```
- 页面感知：获取页面结构化摘要（标题、heading、链接）、Markdown 正文、交互节点列表
```

在规则中新增：

```
- 需要了解页面结构时，优先用 get_page_summary 快速概览
- 需要阅读文章内容时，用 get_page_markdown 获取干净正文
- 需要定位可操作元素时，用 get_interactive_nodes 查找按钮/输入框/链接
```

## 错误处理

- 标签页不存在或已冻结 → 返回 `{ error: 'Tab not found' }`
- 页面未加载完成 → 返回 `{ error: 'Page is still loading' }`
- 内部页面（`sessionbox://`、`about:blank`、`chrome-error://`） → 返回 `{ error: 'Cannot extract content from internal pages' }`
- Readability 无法解析（非文章页面） → 返回 `{ error: 'Unable to extract article content', markdown: '', contentLength: 0, truncated: false }`
- 交互节点为空 → 返回 `{ nodes: [], viewport: {...} }`
- 并发调用：Electron 的 `executeJavaScript` 是序列化的，同一标签页上的多个工具调用会依次执行，无需额外并发控制

## 不做的事

- 不修改现有的 `get_page_content` 工具（保持向后兼容）
- 不添加 Accessibility Tree 工具（后续可扩展）
- 不添加 OCR / 视觉分析能力
- 不穿透 shadow DOM 提取节点
