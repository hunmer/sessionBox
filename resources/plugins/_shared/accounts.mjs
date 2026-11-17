/**
 * SessionBox AI 网关插件共享：账号管理骨架
 *
 * - gemini/jimeng/liblib 三家用 createCookieAccountManager（cookie 凭据型）
 * - dola/l0veyou 结构不同，各自实现 resolve/withClient，但复用
 *   SessionBoxAccountError / listSitePages / createPageExecutor / createAccountPicker
 *
 * 通用约定：
 * - SessionBox 中"账号"= Page；url 命中 hostRe 的页面视为该站点账号
 * - cookie/凭据读取要求该页面标签页当前打开（bridge 限制），未打开时自动经 bridge 打开后重试
 * - 缓存凭据；上游报凭据错误时失效重读一次（策略各家不同）
 */

export class SessionBoxAccountError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SessionBoxAccountError';
    this.code = code;
  }
}

/** 列出命中 hostRe 的账号页面（open 的排前面） */
export async function listSitePages(bridge, hostRe) {
  const pages = (await bridge.listPages()).filter(
    (page) => hostRe.test(page.url || '') || hostRe.test(page.currentUrl || ''),
  );
  return pages.sort((a, b) => Number(b.open) - Number(a.open));
}

/** 页面主世界执行器：标签页未打开时经 bridge 打开后轮询重试 */
export function createPageExecutor({ bridge, openUrl, retryErrRe = /没有打开的标签页/ } = {}) {
  return async function execute(page, code) {
    try {
      return await bridge.execute(page.id, code);
    } catch (err) {
      if (!retryErrRe.test(String(err.message))) throw err;
      await bridge.openPage(page.id, openUrl);
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 800));
        try { return await bridge.execute(page.id, code); } catch { /* 继续等 */ }
      }
      throw err;
    }
  };
}

/**
 * 解析请求指定的账号（五家通用）:
 *   显式 pageId → 校验存在并解析凭据（失败即报错）
 *   自动 → 按序（open 优先）尝试各页面，取第一个凭据可读的；全部失败时报汇总原因
 */
export function createAccountPicker({ listPages, resolve, siteName, siteUrlHint }) {
  return async function pick(pageId) {
    const pages = await listPages();
    if (pages.length === 0) {
      throw new SessionBoxAccountError(
        `SessionBox 中没有${siteName}页面，请先添加 url 为 ${siteUrlHint} 的页面并登录`,
        'NO_ACCOUNT',
      );
    }
    if (pageId) {
      const found = pages.find((p) => p.id === pageId);
      if (!found) {
        throw new SessionBoxAccountError(
          `指定的页面 ${pageId} 不存在或不是${siteName}页面。可用: ${pages.map((p) => `${p.id}(${p.name})`).join(', ')}`,
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
      `没有可用的${siteName}账号（${pages.length} 个页面均未打开或未登录）: ${errors.join('; ')}`,
      'NO_ACCOUNT',
    );
  };
}

/**
 * cookie 凭据型账号管理器（gemini/jimeng/liblib 共用）。
 * 差异点经参数注入：hostRe / siteName / siteUrlHint / openUrl / openRetryErrRe /
 * extractCreds / buildClient / sameCreds / isAuthError
 */
export function createCookieAccountManager({
  bridge,
  urls,
  onLog,
  hostRe,
  siteName,
  siteUrlHint,
  openUrl,
  openRetryErrRe = /没有打开的标签页/,
  extractCreds,
  buildClient,
  sameCreds,
  isAuthError,
} = {}) {
  // pageId -> { creds, client, fetchedAt }
  const cache = new Map();

  /** 列出站点账号页面（open 的排前面） */
  async function listPages() {
    return listSitePages(bridge, hostRe);
  }

  /** 读取某页面的凭据；标签页未打开时经 bridge 自动打开后重试 */
  async function fetchCreds(pageId) {
    const readCookies = () => bridge.getCookies(pageId);
    let cookies;
    try {
      cookies = await readCookies();
    } catch (err) {
      if (!openRetryErrRe.test(String(err.message))) throw err;
      await bridge.openPage(pageId, openUrl);
      // 打开标签页后 webContents 就绪需要时间，轮询重读
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 800));
        try { cookies = await readCookies(); break; } catch { /* 继续等 */ }
      }
      if (!cookies) throw err;
    }
    return extractCreds(pageId, cookies);
  }

  /** 获取绑定凭据的客户端（带缓存） */
  async function resolve(pageId) {
    const hit = cache.get(pageId);
    if (hit) return hit;
    const creds = await fetchCreds(pageId);
    const entry = { creds, client: buildClient(creds, { urls, onLog }), fetchedAt: Date.now() };
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
      if (sameCreds(second.creds, first.creds)) {
        throw err; // cookie 没变，重试无意义
      }
      return await fn(second.client);
    }
  }

  const pick = createAccountPicker({ listPages, resolve, siteName, siteUrlHint });
  return { listPages, resolve, invalidate, withClient, pick };
}
