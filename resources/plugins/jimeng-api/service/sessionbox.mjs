/**
 * SessionBox HTTP bridge 客户端（与 liblib-api 的 sessionbox.mjs 同构）
 *
 * bridge 端点（Bearer 认证，默认 127.0.0.1:19100）:
 *   GET  /api/v1/pages                     列出全部页面（即账号）
 *   GET  /api/v1/pages/:id/cookies?url=    读取页面 partition 的 cookie（需标签页打开）
 *   POST /api/v1/pages/:id/open            在该页面标签页中导航
 */

export class SessionBoxError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'SessionBoxError';
    this.status = status;
  }
}

export function createBridgeClient({ baseUrl = 'http://127.0.0.1:19100', token = '' } = {}) {
  const root = baseUrl.replace(/\/$/, '');

  async function request(method, path, body) {
    const res = await fetch(`${root}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    let data = null;
    try { data = await res.json(); } catch { /* 非 JSON 响应 */ }
    if (!res.ok) {
      const detail = (data && data.error) || res.statusText;
      throw new SessionBoxError(`SessionBox bridge ${method} ${path} 失败 (${res.status}): ${detail}`, res.status);
    }
    return data;
  }

  return {
    listPages: async () => (await request('GET', '/api/v1/pages')).pages || [],
    getCookies: async (pageId, url = 'https://jimeng.jianying.com') =>
      (await request('GET', `/api/v1/pages/${encodeURIComponent(pageId)}/cookies?url=${encodeURIComponent(url)}`)).cookies || [],
    openPage: (pageId, url) => request('POST', `/api/v1/pages/${encodeURIComponent(pageId)}/open`, { url }),
  };
}
