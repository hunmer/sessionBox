/**
 * Gemini 账号管理：从 SessionBox bridge 发现 gemini.google.com 页面并提取 cookie
 *
 * - SessionBox 中"账号"= Page；url 含 gemini.google.com 的页面视为 Gemini 账号
 * - 凭据 = 页面 partition 的全部 cookie（至少需要 __Secure-1PSID；带上 NID/AEC 等更接近真实浏览器）
 * - cookie 读取要求该页面标签页当前打开（bridge 限制），未打开时自动经 bridge 打开后重试
 * - 缓存凭据与客户端；上游报凭据错误时 invalidate 后重读一次重试（cookie 有变化才重试）
 *   （__Secure-1PSIDTS 由 SessionBox 浏览器自动轮换，服务端不做 RotateCookies）
 */
import { createGeminiClient, GeminiWebError } from '../api-client.mjs';

const DEFAULT_HOST_RE = /gemini\.google\.com|bard\.google\.com/i;
const GEMINI_HOME = 'https://gemini.google.com/app';

export function createAccountManager({ bridge, geminiHostRe = DEFAULT_HOST_RE, onLog, urls } = {}) {
  // pageId -> { creds, client, fetchedAt }
  const cache = new Map();

  function isGeminiPage(page) {
    return geminiHostRe.test(page.url || '') || geminiHostRe.test(page.currentUrl || '');
  }

  /** 列出 Gemini 账号页面（open 的排前面） */
  async function listGeminiPages() {
    const pages = (await bridge.listPages()).filter(isGeminiPage);
    return pages.sort((a, b) => Number(b.open) - Number(a.open));
  }

  /** 读取某页面的 Gemini 凭据；标签页未打开时经 bridge 自动打开后重试 */
  async function fetchCreds(pageId) {
    const readCookies = () => bridge.getCookies(pageId);
    let cookies;
    try {
      cookies = await readCookies();
    } catch (err) {
      if (!/没有打开的标签页|打开的标签页/.test(String(err.message))) throw err;
      await bridge.openPage(pageId, GEMINI_HOME);
      // 打开标签页后 webContents 就绪需要时间，轮询重读
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 800));
        try { cookies = await readCookies(); break; } catch { /* 继续等 */ }
      }
      if (!cookies) throw err;
    }
    const has1psid = cookies.some((c) => c.name === '__Secure-1PSID');
    if (!has1psid) {
      throw new SessionBoxAccountError(
        `页面 ${pageId} 未登录 Gemini（cookie 缺少 __Secure-1PSID），请先在该页面完成 Google 登录`,
        'NOT_LOGGED_IN',
      );
    }
    return { cookies };
  }

  /** 获取绑定凭据的客户端（带缓存，惰性 init） */
  async function resolve(pageId) {
    const hit = cache.get(pageId);
    if (hit) return hit;
    const creds = await fetchCreds(pageId);
    const entry = {
      creds,
      client: createGeminiClient({ cookies: creds.cookies, onLog, urls }),
      fetchedAt: Date.now(),
    };
    cache.set(pageId, entry);
    return entry;
  }

  function invalidate(pageId) {
    cache.delete(pageId);
  }

  /**
   * 用指定账号执行 fn(client)。
   * fn 抛出凭据类错误时，重读 cookie：cookie 变化则重建客户端重试一次，否则原样抛出。
   */
  async function withClient(pageId, fn) {
    const first = await resolve(pageId);
    try {
      return await fn(first.client);
    } catch (err) {
      if (!isAuthError(err)) throw err;
      invalidate(pageId);
      const second = await resolve(pageId);
      if (second.creds.cookies.find((c) => c.name === '__Secure-1PSID')?.value ===
          first.creds.cookies.find((c) => c.name === '__Secure-1PSID')?.value) {
        throw err; // cookie 没变，重试无意义
      }
      return await fn(second.client);
    }
  }

  /**
   * 解析请求指定的账号:
   *   显式 pageId → 校验存在并解析凭据（失败即报错）
   *   自动 → 按序（open 优先）尝试各页面，取第一个凭据可读的；全部失败时报汇总原因
   */
  async function pick(pageId) {
    const pages = await listGeminiPages();
    if (pages.length === 0) {
      throw new SessionBoxAccountError(
        'SessionBox 中没有 Gemini 页面，请先添加 url 为 gemini.google.com 的页面并登录',
        'NO_ACCOUNT',
      );
    }
    if (pageId) {
      const found = pages.find((p) => p.id === pageId);
      if (!found) {
        throw new SessionBoxAccountError(
          `指定的页面 ${pageId} 不存在或不是 Gemini 页面。可用: ${pages.map((p) => `${p.id}(${p.name})`).join(', ')}`,
          'PAGE_NOT_FOUND',
        );
      }
      return { page: found, entry: await resolve(found.id) };
    }
    const errors = [];
    for (const p of pages) {
      try {
        return { page: p, entry: await resolve(p.id) };
      } catch (err) {
        errors.push(`${p.name}(${p.id.slice(0, 8)}): ${String(err.message).slice(0, 150)}`);
      }
    }
    throw new SessionBoxAccountError(
      `没有可用的 Gemini 账号（${pages.length} 个页面均未打开或未登录）: ${errors.join('; ')}`,
      'NO_ACCOUNT',
    );
  }

  return { listGeminiPages, resolve, invalidate, withClient, pick };
}

export class SessionBoxAccountError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SessionBoxAccountError';
    this.code = code;
  }
}

/** Gemini 上游登录失效的特征码 */
function isAuthError(err) {
  if (!err) return false;
  if (err instanceof GeminiWebError && ['NOT_LOGGED_IN', 'INIT_FAILED'].includes(err.code)) return true;
  const msg = String(err.message || '');
  return /未登录|登录|cookie|401|403|unauthenticated|权限/i.test(msg);
}
