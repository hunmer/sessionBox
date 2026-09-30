/**
 * l0veyou 账号管理：从 SessionBox bridge 发现页面并提取凭据（localStorage）
 *
 * 与 liblib-api 的关键差异：l0veyou 的凭据不在 cookie，而在页面 localStorage
 *   auth_token / refresh_token / token_expires_at（同源全局键）
 * 因此通过 bridge 的 /execute 端点（页面主世界 executeJavaScript）读取，
 * token 过期后用 refresh_token 换新并写回页面 localStorage（保持页面会话与服务同步）。
 */
import { createClient } from '../api-client.mjs';

const DEFAULT_HOST_RE = /l0veyou\.com/i;
const SITE_URL = 'https://l0veyou.com/chat';

/** 读取 localStorage 三个键的页面内脚本（返回 JSON 字符串或 null） */
const READ_CREDS_CODE = `(function(){try{return JSON.stringify({token:localStorage.getItem('auth_token'),refresh_token:localStorage.getItem('refresh_token'),expires_at:localStorage.getItem('token_expires_at')})}catch(e){return null}})()`;

/** 写回凭据的页面内脚本（值经 JSON.stringify 转义后内插） */
const writeCredsCode = ({ token, refreshToken, expiresAt }) =>
  `(function(){try{localStorage.setItem('auth_token',${JSON.stringify(token)});localStorage.setItem('refresh_token',${JSON.stringify(refreshToken)});localStorage.setItem('token_expires_at',${JSON.stringify(String(expiresAt))});return true}catch(e){return String(e)}})()`;

export function createAccountManager({ bridge, baseUrl, l0veyouHostRe = DEFAULT_HOST_RE, onLog = () => {} } = {}) {
  // pageId -> { creds, client, fetchedAt }
  const cache = new Map();

  function isL0veyouPage(page) {
    return l0veyouHostRe.test(page.url || '') || l0veyouHostRe.test(page.currentUrl || '');
  }

  /** 列出 l0veyou 账号页面（open 的排前面） */
  async function listL0veyouPages() {
    const pages = (await bridge.listPages()).filter(isL0veyouPage);
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

  /** 读取某页面的 l0veyou 凭据 */
  async function fetchCreds(page) {
    const raw = await execute(page, READ_CREDS_CODE);
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* execute 未返回 JSON */ }
    if (!parsed?.token) {
      throw new SessionBoxAccountError(
        `页面 ${page.id}(${page.name}) 未登录 l0veyou（localStorage 缺少 auth_token），请先在该页面完成登录`,
        'NOT_LOGGED_IN',
      );
    }
    return { token: parsed.token, refreshToken: parsed.refresh_token || '', expiresAt: Number(parsed.expires_at) || 0 };
  }

  /** 获取绑定凭据的客户端（带缓存）；token 临期时先刷新 */
  async function resolve(pageId) {
    const hit = cache.get(pageId);
    if (hit) return hit;
    const page = (await listL0veyouPages()).find((p) => p.id === pageId);
    if (!page) throw new SessionBoxAccountError(`页面 ${pageId} 不存在或不是 l0veyou 页面`, 'PAGE_NOT_FOUND');
    const creds = await fetchCreds(page);
    const entry = { creds, page, client: buildClient(page, creds), fetchedAt: Date.now() };
    cache.set(pageId, entry);
    if (entry.client.needsRefresh) await tryRefresh(pageId, entry);
    return entry;
  }

  function buildClient(page, creds) {
    return createClient({
      baseUrl,
      token: creds.token,
      refreshToken: creds.refreshToken,
      expiresAt: creds.expiresAt,
      onTokensRotated: async (rotated) => {
        // 写回页面 localStorage，保持浏览器会话与服务凭据一致（页面拦截器每次请求都从 localStorage 读 token）
        const out = await execute(page, writeCredsCode(rotated));
        if (out !== true) onLog(`page=${page.id} token 写回 localStorage 失败: ${out}`);
        else onLog(`page=${page.id} token 已刷新并写回页面`);
      },
    });
  }

  /** 用 refresh_token 刷新；失败（refresh_token 也失效）时重读 localStorage（用户可能重新登录，不再递归刷新） */
  async function tryRefresh(pageId, entry) {
    try {
      await entry.client.refreshTokens();
      entry.creds = { token: entry.client.token, refreshToken: entry.client.refreshToken, expiresAt: entry.client.expiresAt };
    } catch (err) {
      onLog(`page=${pageId} token 刷新失败: ${err.message}，重读 localStorage`);
      const creds = await fetchCreds(entry.page);
      if (creds.token === entry.creds.token) throw err; // localStorage 没变，重试无意义
      entry.creds = creds;
      entry.client = buildClient(entry.page, creds);
      entry.fetchedAt = Date.now();
    }
  }

  function invalidate(pageId) {
    cache.delete(pageId);
  }

  /**
   * 用指定账号执行 fn(client)。
   * fn 抛出凭据类错误时刷新 token 重试一次；刷新失败重读 localStorage 后再试一次。
   */
  async function withClient(pageId, fn) {
    const first = await resolve(pageId);
    try {
      return await fn(first.client);
    } catch (err) {
      if (!err?.isAuth) throw err;
      onLog(`page=${pageId} 凭据失效（${err.code || ''} ${String(err.message).slice(0, 120)}），尝试刷新 token`);
      await tryRefresh(pageId, first);
      return await fn(first.client);
    }
  }

  /**
   * 解析请求指定的账号:
   *   显式 pageId → 校验存在并解析凭据（失败即报错）
   *   自动 → 按序（open 优先）尝试各页面，取第一个凭据可读的；全部失败时报汇总原因
   */
  async function pick(pageId) {
    const pages = await listL0veyouPages();
    if (pages.length === 0) {
      throw new SessionBoxAccountError(
        'SessionBox 中没有 l0veyou 页面，请先添加 url 为 l0veyou.com 的页面并登录',
        'NO_ACCOUNT',
      );
    }
    if (pageId) {
      const found = pages.find((p) => p.id === pageId);
      if (!found) {
        throw new SessionBoxAccountError(
          `指定的页面 ${pageId} 不存在或不是 l0veyou 页面。可用: ${pages.map((p) => `${p.id}(${p.name})`).join(', ')}`,
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
      `没有可用的 l0veyou 账号（${pages.length} 个页面均未打开或未登录）: ${errors.join('; ')}`,
      'NO_ACCOUNT',
    );
  }

  return { listL0veyouPages, resolve, invalidate, withClient, pick };
}

export class SessionBoxAccountError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SessionBoxAccountError';
    this.code = code;
  }
}
