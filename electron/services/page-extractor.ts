/**
 * 页面信息提取模块
 * 通过 WebContents.executeJavaScript 注入 JS 脚本提取页面信息。
 * 函数签名接受 WebContents（而非 tabId），由调用方负责 tabId → WebContents 的映射。
 */
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

/** 交互节点简要信息（get_interactive_nodes 返回） */
export interface InteractiveNodeSimple {
  name: string
  text: string
  selector: string
}

/** 交互节点详细信息（get_interactive_node_detail 返回） */
export interface InteractiveNodeDetail {
  tag: string
  role: string
  name: string
  text: string
  selector: string
  rect: { x: number; y: number; width: number; height: number }
  visible: boolean
  clickable: boolean
  attributes: Record<string, string>
  styles: {
    display: string
    visibility: string
    opacity: string
    cursor: string
  }
  value?: string
  href?: string
}

export interface InteractiveNodesResult {
  nodes: InteractiveNodeSimple[]
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

/**
 * 提取页面中可见的交互节点（简要信息：name, text, selector）
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
      if (el.tagName === 'INPUT' && el.type === 'hidden') return false;
      if (INTERACTIVE_TAGS.has(el.tagName)) return true;
      if (el.tagName === 'A' && el.hasAttribute('href')) return true;
      const role = el.getAttribute('role');
      if (role && INTERACTIVE_ROLES.has(role)) return true;
      if (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') return true;
      return false;
    }

    function generateSelector(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\\s+/).filter(c => c && !c.startsWith('__'));
        for (const cls of classes) {
          const matches = document.querySelectorAll('.' + CSS.escape(cls));
          if (matches.length === 1) return '.' + CSS.escape(cls);
        }
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(el) + 1;
        return el.tagName.toLowerCase() + ':nth-child(' + index + ')';
      }
      return el.tagName.toLowerCase();
    }

    function getAccessibleName(el) {
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
    const allElements = document.querySelectorAll('*');

    for (const el of allElements) {
      if (!isInteractive(el)) continue;
      if (!isVisible(el)) continue;
      if (${viewportOnly} && !isInViewport(el)) continue;

      nodes.push({
        name: getAccessibleName(el),
        text: (el.textContent || '').trim().slice(0, 200),
        selector: generateSelector(el),
      });
    }

    return { nodes, viewport };
  })()`)

  return result
}

/**
 * 根据 CSS 选择器获取单个交互节点的详细信息
 * 返回 tag、role、name、text、selector、rect、visible、clickable、attributes、styles 等
 */
export async function extractInteractiveNodeDetail(
  wc: Electron.WebContents,
  selector: string,
): Promise<InteractiveNodeDetail | { error: string }> {
  const result = await wc.executeJavaScript(`(function() {
    const selector = ${JSON.stringify(selector)};
    const el = document.querySelector(selector);
    if (!el) return { error: 'Element not found for selector: ' + selector };

    function getAccessibleName(el) {
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

    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const role = el.getAttribute('role') || el.tagName.toLowerCase();

    // 收集有意义的属性（排除 class/style/事件等噪音）
    const skipAttrs = new Set(['class', 'style', 'id', 'tabindex']);
    const attributes = {};
    for (const attr of el.attributes) {
      if (!skipAttrs.has(attr.name) && !attr.name.startsWith('on')) {
        attributes[attr.name] = attr.value;
      }
    }

    const detail = {
      tag: el.tagName.toLowerCase(),
      role,
      name: getAccessibleName(el),
      text: (el.textContent || '').trim().slice(0, 500),
      selector: selector,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      visible: style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0,
      clickable: el.tagName === 'BUTTON' || el.tagName === 'A' ||
                 role === 'button' || role === 'link' ||
                 el.hasAttribute('onclick') ||
                 style.cursor === 'pointer',
      attributes,
      styles: {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        cursor: style.cursor,
      },
    };

    // 输入类元素附加 value
    if ('value' in el) {
      detail.value = el.value;
    }
    // 链接附加 href
    if (el.tagName === 'A' && el.hasAttribute('href')) {
      detail.href = el.href;
    }

    return detail;
  })()`)

  return result
}
