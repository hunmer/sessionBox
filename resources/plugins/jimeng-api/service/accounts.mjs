/**
 * 即梦账号管理：从 SessionBox bridge 发现即梦页面并提取凭据（cookie sessionid）
 *
 * - SessionBox 中"账号"= Page；url 含 jimeng.jianying.com / dreamina.capcut.com 的页面视为即梦账号
 * - 凭据 = 页面 partition cookie 中的 sessionid（即梦接口仅需该值，其余 cookie 由客户端伪装生成）
 * - cookie 读取要求该页面标签页当前打开（bridge 限制），未打开时自动经 bridge 打开后重试
 * - 缓存凭据；上游报凭据错误时 invalidate 后重读一次重试（cookie 有变化才重试）
 */
import { createClient } from '../api-client.mjs';

// 国内站 jimeng.jianying.com；dreamina.capcut.com 为国际站（token 需带区域前缀，未实测）
const DEFAULT_HOST_RE = /jimeng\.jianying\.com|dreamina\.capcut\.com/i;

export function createAccountManager({ bridge, urls, jimengHostRe = DEFAULT_HOST_RE, onLog } = {}) {
  // pageId -> { creds, client, fetchedAt }
  const cache = new Map();

  function isJimengPage(page) {
    return jimengHostRe.test(page.url || '') || jimengHostRe.test(page.currentUrl || '');
  }

  /** 列出即梦账号页面（open 的排前面） */
  async function listJimengPages() {
    const pages = (await bridge.listPages()).filter(isJimengPage);
    return pages.sort((a, b) => Number(b.open) - Number(a.open));
  }

  /** 读取某页面的即梦凭据；标签页未打开时经 bridge 自动打开后重试 */
  async function fetchCreds(pageId) {
    const readCookies = () => bridge.getCookies(pageId);
    let cookies;
    try {
      cookies = await readCookies();
    } catch (err) {
      if (!/没有打开的标签页/.test(String(err.message))) throw err;
      await bridge.openPage(pageId, 'https://jimeng.jianying.com/ai-tool/home');
      // 打开标签页后 webContents 就绪需要时间，轮询重读
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 800));
        try { cookies = await readCookies(); break; } catch { /* 继续等 */ }
      }
      if (!cookies) throw err;
    }
    const byName = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
    if (!byName.sessionid) {
      throw new SessionBoxAccountError(
        `页面 ${pageId} 未登录即梦（cookie 缺少 sessionid），请先在该页面完成登录`,
        'NOT_LOGGED_IN',
      );
    }
    return { sessionid: byName.sessionid };
  }

  /** 获取绑定凭据的客户端（带缓存） */
  async function resolve(pageId) {
    const hit = cache.get(pageId);
    if (hit) return hit;
    const creds = await fetchCreds(pageId);
    const entry = { creds, client: createClient({ ...creds, urls, onLog }), fetchedAt: Date.now() };
    cache.set(pageId, entry);
    return entry;
  }

  function invalidate(pageId) {
    cache.delete(pageId);
  }

  /**
   * 用指定账号执行 fn(client)。
   * fn 抛出凭据类错误（登录失效）时，重读 cookie：cookie 变化则重试一次，否则原样抛出。
   */
  async function withClient(pageId, fn) {
    const first = await resolve(pageId);
    try {
      return await fn(first.client);
    } catch (err) {
      if (!isAuthError(err)) throw err;
      invalidate(pageId);
      const second = await resolve(pageId);
      if (second.creds.sessionid === first.creds.sessionid) {
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
    const pages = await listJimengPages();
    if (pages.length === 0) {
      throw new SessionBoxAccountError(
        'SessionBox 中没有即梦页面，请先添加 url 为 jimeng.jianying.com 的页面并登录',
        'NO_ACCOUNT',
      );
    }
    if (pageId) {
      const found = pages.find((p) => p.id === pageId);
      if (!found) {
        throw new SessionBoxAccountError(
          `指定的页面 ${pageId} 不存在或不是即梦页面。可用: ${pages.map((p) => `${p.id}(${p.name})`).join(', ')}`,
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
      `没有可用的即梦账号（${pages.length} 个页面均未打开或未登录）: ${errors.join('; ')}`,
      'NO_ACCOUNT',
    );
  }

  return { listJimengPages, resolve, invalidate, withClient, pick };
}

export class SessionBoxAccountError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SessionBoxAccountError';
    this.code = code;
  }
}

/** 即梦上游登录失效的特征码（按实测日志补充） */
function isAuthError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return /登录|未登录|session|token|401|鉴权|ret=1001|ret=1003|ret=4001/.test(msg);
}
