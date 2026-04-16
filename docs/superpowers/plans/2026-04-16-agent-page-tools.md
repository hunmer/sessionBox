# Agent 页面感知工具 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI Agent 新增 3 个页面感知工具（get_page_summary、get_page_markdown、get_interactive_nodes），让 Agent 能获取结构化摘要、Markdown 正文和交互节点。

**Architecture:** 新增 `electron/services/page-extractor.ts` 模块封装页面信息提取逻辑（JS 注入 + 浏览器上下文 Readability/Turndown），`tools.ts` 定义 schema，`ai-proxy.ts` 的 `executeTool` 路由到提取模块。

**Tech Stack:** TypeScript, Electron WebContents.executeJavaScript, @mozilla/readability, turndown

**Design Spec:** `docs/superpowers/specs/2026-04-16-agent-page-tools-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `electron/services/page-extractor.ts` | **新建** | 页面信息提取模块（3 个导出函数 + TS 类型） |
| `src/lib/agent/tools.ts` | 修改 | 新增 3 个工具 schema + 3 条元数据 |
| `electron/services/ai-proxy.ts` | 修改 | 导入 page-extractor，executeTool 新增 3 个 case |
| `src/lib/agent/system-prompt.ts` | 修改 | 更新系统提示词 |

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 @mozilla/readability 和 turndown**

Run:
```bash
cd G:/programming/nodejs/sessionBox
pnpm add @mozilla/readability turndown
pnpm add -D @types/turndown
```

Expected: `package.json` 更新，`pnpm-lock.yaml` 更新

- [ ] **Step 2: 验证安装成功**

Run:
```bash
cd G:/programming/nodejs/sessionBox
node -e "require('@mozilla/readability'); require('turndown'); console.log('OK')"
```

Expected: 输出 `OK`

- [ ] **Step 3: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @mozilla/readability and turndown dependencies"
```

---

### Task 2: 创建 page-extractor.ts — 类型定义 + extractPageSummary

**Files:**
- Create: `electron/services/page-extractor.ts`

- [ ] **Step 1: 创建文件，写入类型定义和 extractPageSummary 函数**

```typescript
/**
 * 页面信息提取模块
 * 通过 WebContents.executeJavaScript 注入 JS 脚本提取页面信息。
 * 函数签名接受 WebContents（而非 tabId），由调用方负责 tabId → WebContents 的映射。
 */

// ===== 类型定义 =====

export interface PageSummary {
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

export interface PageMarkdown {
  title: string
  byline: string
  excerpt: string
  markdown: string
  contentLength: number
  truncated: boolean
}

export interface InteractiveNode {
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

export interface InteractiveNodesResult {
  nodes: InteractiveNode[]
  viewport: { width: number; height: number; scrollX: number; scrollY: number }
}

// ===== 提取函数 =====

/**
 * 提取页面结构化摘要（标题、heading、链接、meta 信息）
 * links 数组最多返回 50 条
 */
export async function extractPageSummary(wc: Electron.WebContents): Promise<PageSummary> {
  const result = await wc.executeJavaScript(`(function() {
    const getMeta = (name) => {
      const el = document.querySelector('meta[name="' + name + '"]') ||
                 document.querySelector('meta[property="' + name + '"]');
      return el ? el.getAttribute('content') || '' : '';
    };

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({
      level: parseInt(h.tagName[1]),
      text: (h.textContent || '').trim()
    }));

    const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map(a => ({
      text: (a.textContent || '').trim(),
      href: a.href
    }));

    return {
      title: document.title || '',
      url: location.href,
      description: getMeta('description'),
      headings,
      links,
      meta: {
        author: getMeta('author'),
        keywords: getMeta('keywords'),
        ogTitle: getMeta('og:title'),
        ogDescription: getMeta('og:description'),
      }
    };
  })()`)

  return result
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run:
```bash
cd G:/programming/nodejs/sessionBox
npx tsc --noEmit electron/services/page-extractor.ts 2>&1 | head -20
```

Expected: 无错误（或仅有全局 `Electron` 类型相关的预期警告）

- [ ] **Step 3: 提交**

```bash
git add electron/services/page-extractor.ts
git commit -m "feat(page-extractor): add type definitions and extractPageSummary"
```

---

### Task 3: 添加 extractPageMarkdown 到 page-extractor.ts

**Files:**
- Modify: `electron/services/page-extractor.ts`

- [ ] **Step 1: 在文件顶部添加 import（readFileSync、join）和库加载缓存**

在 `electron/services/page-extractor.ts` 文件顶部（类型定义之前）添加：

```typescript
import { readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// 缓存库代码字符串，避免每次调用都读磁盘
let _readabilityCode: string | null = null
let _turndownCode: string | null = null

function getReadabilityCode(): string {
  if (!_readabilityCode) {
    const filePath = join(app.getAppPath(), 'node_modules', '@mozilla', 'readability', 'Readability.js')
    _readabilityCode = readFileSync(filePath, 'utf-8')
  }
  return _readabilityCode
}

function getTurndownCode(): string {
  if (!_turndownCode) {
    const filePath = join(app.getAppPath(), 'node_modules', 'turndown', 'dist', 'turndown.js')
    _turndownCode = readFileSync(filePath, 'utf-8')
  }
  return _turndownCode
}
```

- [ ] **Step 2: 在文件末尾追加 extractPageMarkdown 函数**

```typescript
/**
 * 提取页面正文并转为 Markdown
 * 使用 Readability + Turndown 在浏览器上下文中执行（利用页面 DOM，无需 jsdom）
 * 库代码从本地 node_modules 读取后注入，不依赖 CDN，无 CSP 问题
 * maxLength 默认 10000 字符，超出截断并标记 truncated
 */
export async function extractPageMarkdown(
  wc: Electron.WebContents,
  maxLength: number = 10000,
): Promise<PageMarkdown> {
  // 从本地 node_modules 读取库代码（带缓存）
  const readabilityCode = getReadabilityCode()
  const turndownCode = getTurndownCode()

  // 将库代码 + 提取逻辑一起注入到浏览器上下文
  const result = await wc.executeJavaScript(`(function() {
    ${readabilityCode}
    ${turndownCode}

    try {
      // document.cloneNode(true) 克隆整个文档供 Readability 使用
      // 注意：template 内容和某些动态元素可能不会被完整克隆
      const doc = document.cloneNode(true);
      const reader = new Readability(doc);
      const article = reader.parse();

      if (!article) {
        return { title: document.title, byline: '', excerpt: '', markdown: '', contentLength: 0, truncated: false, error: 'Unable to extract article content' };
      }

      const turndown = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });
      const md = turndown.turndown(article.content || '');

      return {
        title: article.title || '',
        byline: article.byline || '',
        excerpt: article.excerpt || '',
        markdown: md,
        contentLength: md.length,
        truncated: false,
      };
    } catch(e) {
      return { title: document.title, byline: '', excerpt: '', markdown: '', contentLength: 0, truncated: false, error: e.message };
    }
  })()`)

  // 处理截断
  if (result.markdown && result.markdown.length > maxLength) {
    result.markdown = result.markdown.slice(0, maxLength) + '\n\n[truncated]'
    result.truncated = true
  }

  return result
}
```

> **设计决策**：将库代码从本地 `node_modules` 读取后直接拼入注入脚本字符串。这样：
> 1. 不依赖 CDN / 外部网络
> 2. 不受目标页面 CSP 限制
> 3. 版本完全由 package.json 控制
> 4. 通过缓存变量避免重复读磁盘

- [ ] **Step 3: 验证 TypeScript 编译**

Run:
```bash
cd G:/programming/nodejs/sessionBox
npx tsc --noEmit electron/services/page-extractor.ts 2>&1 | head -20
```

Expected: 无严重错误

- [ ] **Step 4: 提交**

```bash
git add electron/services/page-extractor.ts
git commit -m "feat(page-extractor): add extractPageMarkdown with local library injection"
```

---

### Task 4: 添加 extractInteractiveNodes 到 page-extractor.ts

**Files:**
- Modify: `electron/services/page-extractor.ts`

- [ ] **Step 1: 在文件末尾追加 extractInteractiveNodes 函数**

```typescript
/**
 * 提取页面中可见的交互节点
 * 筛选规则：button、a[href]、input、textarea、select、[role]、[tabindex]
 * 可见性过滤：display !== none、visibility !== hidden、opacity > 0、rect 合理
 * 不穿透 shadow DOM
 */
export async function extractInteractiveNodes(
  wc: Electron.WebContents,
  viewportOnly: boolean = true,
): Promise<InteractiveNodesResult> {
  const result = await wc.executeJavaScript(`(function() {
    const INTERACTIVE_TAGS = new Set([
      'BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT',
      'SUMMARY', 'DETAILS', 'OPTION', 'LABEL'
    ]);
    const INTERACTIVE_ROLES = new Set([
      'button', 'link', 'textbox', 'checkbox', 'radio',
      'combobox', 'menuitem', 'tab', 'switch', 'slider',
      'searchbox', 'menu', 'menubar', 'toolbar', 'dialog',
      'treeitem', 'option', 'gridcell'
    ]);

    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };

    function isVisible(el) {
      const style = getComputedStyle(el);
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity) <= 0) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return true;
    }

    function isInViewport(el) {
      const rect = el.getBoundingClientRect();
      return (
        rect.top < viewport.height &&
        rect.bottom > 0 &&
        rect.left < viewport.width &&
        rect.right > 0
      );
    }

    function isInteractive(el) {
      // input type=hidden 排除（必须在 INTERACTIVE_TAGS 检查之前，否则会被提前返回 true）
      if (el.tagName === 'INPUT' && el.type === 'hidden') return false;
      if (INTERACTIVE_TAGS.has(el.tagName)) return true;
      if (el.tagName === 'A' && el.hasAttribute('href')) return true;
      const role = el.getAttribute('role');
      if (role && INTERACTIVE_ROLES.has(role)) return true;
      if (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') return true;
      return false;
    }

    function generateSelector(el) {
      // 优先 id
      if (el.id) return '#' + CSS.escape(el.id);
      // 唯一 class
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\\s+/).filter(c => c && !c.startsWith('__'));
        for (const cls of classes) {
          const matches = document.querySelectorAll('.' + CSS.escape(cls));
          if (matches.length === 1) return '.' + CSS.escape(cls);
        }
      }
      // tag + nth-child
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(el) + 1;
        return el.tagName.toLowerCase() + ':nth-child(' + index + ')';
      }
      return el.tagName.toLowerCase();
    }

    function getAccessibleName(el) {
      // aria-labelledby 需要查找引用元素，单独处理以避免三元运算符优先级问题
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl && labelEl.textContent) return labelEl.textContent.trim().slice(0, 100);
      }
      return (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('alt') ||
        (el.textContent || '').trim().slice(0, 100) ||
        ''
      );
    }

    const nodes = [];
    let id = 0;
    const allElements = document.querySelectorAll('*');

    for (const el of allElements) {
      if (!isInteractive(el)) continue;
      if (!isVisible(el)) continue;
      if (${viewportOnly} && !isInViewport(el)) continue;

      const rect = el.getBoundingClientRect();
      const role = el.getAttribute('role') || el.tagName.toLowerCase();

      id++;
      nodes.push({
        id,
        tag: el.tagName.toLowerCase(),
        role,
        name: getAccessibleName(el),
        text: (el.textContent || '').trim().slice(0, 200),
        selector: generateSelector(el),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        visible: true,
        clickable: el.tagName === 'BUTTON' || el.tagName === 'A' ||
                   role === 'button' || role === 'link' ||
                   el.hasAttribute('onclick') ||
                   getComputedStyle(el).cursor === 'pointer',
      });
    }

    return { nodes, viewport };
  })()`)

  return result
}
```

> **注意**：注入脚本中的 `${viewportOnly}` 是模板字符串插值，由 TypeScript 在 `executeJavaScript` 调用时替换为 `true` 或 `false`。确保使用反引号包裹整个注入脚本。

- [ ] **Step 2: 验证 TypeScript 编译**

Run:
```bash
cd G:/programming/nodejs/sessionBox
npx tsc --noEmit electron/services/page-extractor.ts 2>&1 | head -20
```

Expected: 无严重错误

- [ ] **Step 3: 提交**

```bash
git add electron/services/page-extractor.ts
git commit -m "feat(page-extractor): add extractInteractiveNodes with visibility filtering"
```

---

### Task 5: 更新 tools.ts — 新增 3 个工具定义

**Files:**
- Modify: `src/lib/agent/tools.ts`

- [ ] **Step 1: 在 `BROWSER_TOOL_LIST` 数组末尾（第 39 行 `list_pages` 之后）追加 3 项**

在 `src/lib/agent/tools.ts:39` 之后（`list_pages` 条目之后）追加：

```typescript
  { name: 'get_page_summary', description: '获取页面结构化摘要（标题、heading、链接、meta）', category: '页面信息' },
  { name: 'get_page_markdown', description: '获取页面正文内容的 Markdown 表示', category: '页面信息' },
  { name: 'get_interactive_nodes', description: '获取页面中可见的交互节点列表', category: '页面信息' },
```

- [ ] **Step 2: 在 `createBrowserTools` 返回的数组末尾（`list_pages` 工具定义之后，约第 231 行）追加 3 个工具定义**

```typescript
    {
      name: 'get_page_summary',
      description: '获取页面结构化摘要，包括标题、URL、description、headings、links（最多 50 条）和 meta 信息。',
      input_schema: {
        type: 'object',
        properties: {
          tabId: tabIdField,
        },
      },
    },

    {
      name: 'get_page_markdown',
      description: '获取页面正文内容的 Markdown 表示。使用 Readability 提取正文，再转为 Markdown。适合阅读文章、博客、文档类页面。',
      input_schema: {
        type: 'object',
        properties: {
          tabId: tabIdField,
          maxLength: { type: 'number', description: 'Markdown 内容最大字符数，默认 10000', default: 10000 },
        },
      },
    },

    {
      name: 'get_interactive_nodes',
      description: '获取页面中可见的交互节点列表（按钮、链接、输入框等），返回每个节点的 tag、role、name、text、selector、rect、visible、clickable 属性。默认仅返回视口内元素。',
      input_schema: {
        type: 'object',
        properties: {
          tabId: tabIdField,
          viewportOnly: { type: 'boolean', description: '是否仅返回视口内元素，默认 true', default: true },
        },
      },
    },
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run:
```bash
cd G:/programming/nodejs/sessionBox
pnpm build 2>&1 | tail -5
```

Expected: 构建成功，无类型错误

- [ ] **Step 4: 提交**

```bash
git add src/lib/agent/tools.ts
git commit -m "feat(agent-tools): add get_page_summary, get_page_markdown, get_interactive_nodes schemas"
```

---

### Task 6: 更新 ai-proxy.ts — 新增 3 个工具执行 case

**Files:**
- Modify: `electron/services/ai-proxy.ts`

- [ ] **Step 1: 在文件顶部（第 4 行之后）添加 import**

在 `electron/services/ai-proxy.ts:4` 之后添加：

```typescript
import { extractPageSummary, extractPageMarkdown, extractInteractiveNodes } from './page-extractor'
```

- [ ] **Step 2: 在 `executeTool` 的 switch 中，`case 'hover_element'` 之后、`default:` 之前（约第 533 行之后）添加 3 个新 case**

在 `hover_element` case 结束（`return { success: true }` 之后）和 `default:` 之间插入：

```typescript
      // ===== 页面感知工具 =====
      case 'get_page_summary': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        const pageCheck = checkPageAvailable(wc)
        if (pageCheck) return pageCheck
        try {
          return await extractPageSummary(wc)
        } catch (err) {
          return { error: `Failed to get page summary: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      case 'get_page_markdown': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        const pageCheck = checkPageAvailable(wc)
        if (pageCheck) return pageCheck
        try {
          const maxLength = (args.maxLength as number) || 10000
          return await extractPageMarkdown(wc, maxLength)
        } catch (err) {
          return { error: `Failed to get page markdown: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      case 'get_interactive_nodes': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        const pageCheck = checkPageAvailable(wc)
        if (pageCheck) return pageCheck
        try {
          const viewportOnly = args.viewportOnly !== false
          return await extractInteractiveNodes(wc, viewportOnly)
        } catch (err) {
          return { error: `Failed to get interactive nodes: ${err instanceof Error ? err.message : String(err)}` }
        }
      }
```

- [ ] **Step 2b: 在 `getWebContentsFromManager` 函数之前添加页面可用性检查函数**

在 `ai-proxy.ts` 的 `getWebContentsFromManager` 函数之前（约第 545 行之前）添加：

```typescript
/** 检查页面是否可用于内容提取（内部页面、未加载完成） */
function checkPageAvailable(wc: Electron.WebContents): { error: string } | null {
  const url = wc.getURL()
  if (
    url.startsWith('sessionbox://') ||
    url === 'about:blank' ||
    url.startsWith('chrome-error://') ||
    url === ''
  ) {
    return { error: 'Cannot extract content from internal pages' }
  }
  if (wc.isLoading()) {
    return { error: 'Page is still loading' }
  }
  return null
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run:
```bash
cd G:/programming/nodejs/sessionBox
pnpm build 2>&1 | tail -5
```

Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add electron/services/ai-proxy.ts
git commit -m "feat(ai-proxy): wire up page summary, markdown, and interactive nodes tools"
```

---

### Task 7: 更新 system-prompt.ts

**Files:**
- Modify: `src/lib/agent/system-prompt.ts`

- [ ] **Step 1: 更新 BROWSER_AGENT_SYSTEM_PROMPT 内容**

将 `src/lib/agent/system-prompt.ts` 的内容替换为：

```typescript
export const BROWSER_AGENT_SYSTEM_PROMPT = `你是 SessionBox 浏览器的 AI 助手。你可以帮助用户操控浏览器标签页和页面内容。

能力：
- 管理标签页：创建、关闭、切换、导航
- 页面交互：点击元素、输入文字、滚动页面、选择下拉选项、悬停
- 信息获取：获取页面内容、DOM 结构、截图、查询标签详情
- 页面感知：获取页面结构化摘要（标题、heading、链接）、Markdown 正文、交互节点列表
- 工作区管理：列出工作区、分组、容器、页面

规则：
- 操作前先确认目标标签页（用户可能指定 tabId，否则使用当前标签）
- 执行操作后报告结果
- 无法完成的操作要明确说明原因
- 对于破坏性操作（如关闭标签）要谨慎确认
- 页面交互时，优先使用 CSS 选择器定位元素
- 需要了解页面结构时，优先用 get_page_summary 快速概览
- 需要阅读文章内容时，用 get_page_markdown 获取干净正文
- 需要定位可操作元素时，用 get_interactive_nodes 查找按钮/输入框/链接
- 回复使用中文`
```

- [ ] **Step 2: 验证构建**

Run:
```bash
cd G:/programming/nodejs/sessionBox
pnpm build 2>&1 | tail -5
```

Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add src/lib/agent/system-prompt.ts
git commit -m "feat(agent-prompt): update system prompt with page-aware tool descriptions"
```

---

### Task 8: 完整构建验证

**Files:** 无修改

- [ ] **Step 1: 执行完整构建**

Run:
```bash
cd G:/programming/nodejs/sessionBox
pnpm build
```

Expected: 三个进程（main、preload、renderer）全部构建成功，无错误

- [ ] **Step 2: 启动开发模式进行冒烟测试**

Run:
```bash
cd G:/programming/nodejs/sessionBox
pnpm dev
```

Expected: 应用正常启动，无运行时崩溃

- [ ] **Step 3: 确认最终状态**

Run:
```bash
cd G:/programming/nodejs/sessionBox
git log --oneline -8
```

Expected: 看到所有 7 个 commit 按顺序排列
