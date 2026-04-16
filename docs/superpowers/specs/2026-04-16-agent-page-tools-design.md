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

### 2. `get_page_markdown`

获取页面正文内容的 Markdown 表示。

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tabId | string | 否 | 目标标签页 ID，默认当前活动标签 |

**返回**：
```json
{
  "title": "文章标题",
  "byline": "作者",
  "excerpt": "摘要",
  "markdown": "# 标题\n\n正文内容..."
}
```

**实现**：
1. `wc.executeJavaScript('document.documentElement.outerHTML')` 获取页面 HTML
2. 主进程中用 `jsdom` + `@mozilla/readability` 提取正文
3. 主进程中用 `turndown` 将 HTML 转 Markdown

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
pnpm add @mozilla/readability turndown jsdom
pnpm add -D @types/turndown
```

### 模块职责

- **`page-extractor.ts`** — 单一职责：从 WebContents 提取页面信息
  - `extractPageSummary(wc)` → 注入 JS 提取摘要
  - `extractPageMarkdown(wc)` → 提取 HTML → 主进程 Readability + Turndown
  - `extractInteractiveNodes(wc, viewportOnly?)` → 注入 JS 遍历 DOM

- **`ai-proxy.ts`** — 不变：管理通信协议和工具路由

- **`tools.ts`** — 不变：定义工具 schema

## 错误处理

- 标签页不存在或已冻结 → 返回 `{ error: 'Tab not found' }`
- 页面未加载完成 → 返回 `{ error: 'Page is still loading' }`
- Readability 无法解析（非文章页面） → 返回 `{ error: 'Unable to extract article content', markdown: '' }`
- 交互节点为空 → 返回 `{ nodes: [], viewport: {...} }`

## 不做的事

- 不修改现有的 `get_page_content` 工具（保持向后兼容）
- 不添加 Accessibility Tree 工具（后续可扩展）
- 不添加 OCR / 视觉分析能力
- 不在注入脚本中引入第三方库（Markdown 转换在主进程完成）
