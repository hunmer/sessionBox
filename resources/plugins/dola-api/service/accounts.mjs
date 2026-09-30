/**
 * dola 账号管理：从 SessionBox bridge 发现页面并绑定登录态
 *
 * dola 的凭据是字节 passport cookie（sessionid/sid_tt，HttpOnly），
 * 登录与否用「cookie sessionid + localStorage flow_web_has_login」双信号判断。
 * 与 l0veyou 不同：无 token 刷新概念（cookie 由浏览器会话自管，过期需用户重新登录）。
 * 上游请求一律经页面内 fetch（Node 直连会被 TLS 风控拦截，见 api-client.mjs 头注释）。
 */
import { createClient } from '../api-client.mjs';
import { SITE_URL } from '../api-client.mjs';

const DEFAULT_HOST_RE = /dola\.com/i;

export function createAccountManager({ bridge, dolaHostRe = DEFAULT_HOST_RE, onLog = () => {} } = {}) {
  // pageId -> { page, client, fetchedAt }
  const cache = new Map();

  function isDolaPage(page) {
    return dolaHostRe.test(page.url || '') || dolaHostRe.test(page.currentUrl || '');
  }

  /** 列出 dola 账号页面（open 的排前面） */
  async function listDolaPages() {
    const pages = (await bridge.listPages()).filter(isDolaPage);
    return pages.sort((a, b) => Number(b.open) - Number(a.open));
  }

  /** 在页面主世界执行；标签页未打开时经 bridge 打开后重试 */
  async function execute(page, code) {
    try {
      return await bridge.execute(page.id, code);
    } catch (err) {
      if (!/没有打开的标签页/.test(String(err.message))) throw err;
      await bridge.openPage(page.id, SITE_URL);
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 800));
        try { return await bridge.execute(page.id, code); } catch { /* 继续等 */ }
      }
      throw err;
    }
  }

  /** 解析页面并构建客户端（带缓存）；未登录时报错 */
  async function resolve(pageId) {
    const hit = cache.get(pageId);
    if (hit) return hit;
    const page = (await listDolaPages()).find((p) => p.id === pageId);
    if (!page) throw new SessionBoxAccountError(`页面 ${pageId} 不存在或不是 dola 页面`, 'PAGE_NOT_FOUND');
    const client = createClient({ bridge: { ...bridge, execute: (id, code) => execute(page, code) }, pageId });
    // 登录检查分两步：页面脚本查 localStorage（flow_web_has_login），
    // 再经 bridge getCookies 查 HttpOnly 的 sessionid/sid_tt（document.cookie 读不到）
    let login = null;
    let lastErr = null;
    for (let i = 0; i < 3; i++) {
      try { login = await client.checkLogin(); break; }
      catch (err) {
        lastErr = err;
        if (err.code === 'NOT_ON_SITE') {
          try { await bridge.openPage(page.id, SITE_URL); } catch { /* 主窗口不可用时忽略，继续重试 */ }
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!login) throw lastErr;
    const cookieNames = new Set((await bridge.getCookies(page.id)).map((c) => c.name));
    const hasSession = cookieNames.has('sessionid') || cookieNames.has('sid_tt');
    if (!login.hasLogin || !hasSession) {
      throw new SessionBoxAccountError(
        `页面 ${page.name}(${page.id.slice(0, 8)}) 未登录 dola（${login.hasLogin ? 'cookie 缺少 sessionid' : 'flow_web_has_login≠true'}），请先在该页面完成登录`,
        'NOT_LOGGED_IN',
      );
    }
    const entry = { page, client, fetchedAt: Date.now() };
    cache.set(pageId, entry);
    return entry;
  }

  /** 用指定账号执行 fn(client)；凭据失效时清缓存重试一次 */
  async function withClient(pageId, fn) {
    const first = await resolve(pageId);
    try {
      return await fn(first.client);
    } catch (err) {
      if (!err?.isAuth) throw err;
      onLog(`page=${pageId} 凭据疑似失效（${err.code || ''} ${String(err.message).slice(0, 120)}），清缓存重试`);
      cache.delete(pageId);
      const second = await resolve(pageId);
      return await fn(second.client);
    }
  }

  /**
   * 解析请求指定的账号:
   *   显式 pageId → 校验存在并解析（失败即报错）
   *   自动 → 按序（open 优先）尝试各页面，取第一个登录可用的；全部失败时报汇总原因
   */
  async function pick(pageId) {
    const pages = await listDolaPages();
    if (pages.length === 0) {
      throw new SessionBoxAccountError(
        'SessionBox 中没有 dola 页面，请先添加 url 为 dola.com 的页面并登录',
        'NO_ACCOUNT',
      );
    }
    if (pageId) {
      const found = pages.find((p) => p.id === pageId);
      if (!found) {
        throw new SessionBoxAccountError(
          `指定的页面 ${pageId} 不存在或不是 dola 页面。可用: ${pages.map((p) => `${p.id}(${p.name})`).join(', ')}`,
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
      `没有可用的 dola 账号（${pages.length} 个页面均未打开或未登录）: ${errors.join('; ')}`,
      'NO_ACCOUNT',
    );
  }

  function invalidate(pageId) {
    cache.delete(pageId);
  }

  return { listDolaPages, resolve, invalidate, withClient, pick };
}

export class SessionBoxAccountError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SessionBoxAccountError';
    this.code = code;
  }
}
