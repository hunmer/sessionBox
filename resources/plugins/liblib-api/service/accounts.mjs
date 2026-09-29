/**
 * liblib 账号管理：从 SessionBox bridge 发现 liblib 页面并提取凭据（cookie）
 *
 * - SessionBox 中"账号"= Page；url 含 liblib 的页面视为 liblib 账号
 * - 凭据 = 页面 partition cookie 中的 usertoken / webid / useruuid
 * - cookie 读取要求该页面标签页当前打开（bridge 限制）
 * - 缓存凭据；上游报凭据错误时 invalidate 后重读一次重试（cookie 有变化才重试）
 */
import { createClient } from '../api-client.mjs';

// 仅匹配 liblib.tv（liblib.art 是素材站，另一套体系，cookie 域不同）
const DEFAULT_HOST_RE = /liblib\.tv/i;

export function createAccountManager({ bridge, urls, liblibHostRe = DEFAULT_HOST_RE, onLog } = {}) {
  // pageId -> { creds, client, fetchedAt }
  const cache = new Map();

  function isLiblibPage(page) {
    return liblibHostRe.test(page.url || '') || liblibHostRe.test(page.currentUrl || '');
  }

  /** 列出 liblib 账号页面（open 的排前面） */
  async function listLiblibPages() {
    const pages = (await bridge.listPages()).filter(isLiblibPage);
    return pages.sort((a, b) => Number(b.open) - Number(a.open));
  }

  /** 读取某页面的 liblib 凭据；标签页未打开时经 bridge 自动打开后重试（同 doubao-api 行为） */
  async function fetchCreds(pageId) {
    const readCookies = () => bridge.getCookies(pageId);
    let cookies;
    try {
      cookies = await readCookies();
    } catch (err) {
      if (!/没有打开的标签页/.test(String(err.message))) throw err;
      await bridge.openPage(pageId, 'https://www.liblib.tv/');
      // 打开标签页后 webContents 就绪需要时间，轮询重读
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 800));
        try { cookies = await readCookies(); break; } catch { /* 继续等 */ }
      }
      if (!cookies) throw err;
    }
    const byName = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
    if (!byName.usertoken || !byName.webid) {
      throw new SessionBoxAccountError(
        `页面 ${pageId} 未登录 liblib（cookie 缺少 usertoken/webid），请先在该页面完成登录`,
        'NOT_LOGGED_IN',
      );
    }
    return { token: byName.usertoken, webid: byName.webid, useruuid: byName.useruuid };
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
      if (second.creds.token === first.creds.token && second.creds.webid === first.creds.webid) {
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
    const pages = await listLiblibPages();
    if (pages.length === 0) {
      throw new SessionBoxAccountError(
        'SessionBox 中没有 liblib 页面，请先添加 url 为 liblib.tv 的页面并登录',
        'NO_ACCOUNT',
      );
    }
    if (pageId) {
      const found = pages.find((p) => p.id === pageId);
      if (!found) {
        throw new SessionBoxAccountError(
          `指定的页面 ${pageId} 不存在或不是 liblib 页面。可用: ${pages.map((p) => `${p.id}(${p.name})`).join(', ')}`,
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
      `没有可用的 liblib 账号（${pages.length} 个页面均未打开或未登录）: ${errors.join('; ')}`,
      'NO_ACCOUNT',
    );
  }

  return { listLiblibPages, resolve, invalidate, withClient, pick };
}

export class SessionBoxAccountError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SessionBoxAccountError';
    this.code = code;
  }
}

/** liblib 上游登录失效的特征码（按实测日志补充；未记录到具体 code 前采用保守匹配） */
function isAuthError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return /登录|未登录|token|Token|401|鉴权/.test(msg);
}
