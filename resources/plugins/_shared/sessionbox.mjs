/**
 * SessionBox HTTP bridge 客户端（五家 AI 网关插件共享）
 *
 * 各插件 service/sessionbox.mjs 是本模块的薄壳：
 *   export function createBridgeClient(options) {
 *     return createCoreBridgeClient({ defaultCookieUrl: '...', withExecute: true|false, ...options });
 *   }
 *
 * bridge 端点（Bearer 认证，默认 127.0.0.1:19100）:
 *   GET  /api/v1/pages                     列出全部页面（即账号）
 *   GET  /api/v1/pages/:id/cookies?url=    读取页面 partition 的 cookie（需标签页打开）
 *   POST /api/v1/pages/:id/open            在该页面标签页中导航
 *   POST /api/v1/pages/:id/execute         页面主世界执行 JS（读/写 localStorage 用）
 */

export class SessionBoxError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'SessionBoxError';
    this.status = status;
  }
}

export function createCoreBridgeClient({
  baseUrl = 'http://127.0.0.1:19100',
  token = '',
  timeoutMs = 15000,
  defaultCookieUrl,
  withExecute = false,
} = {}) {
  const root = baseUrl.replace(/\/$/, '');

  async function request(method, path, body) {
    const res = await fetch(`${root}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    let data = null;
    try { data = await res.json(); } catch { /* 非 JSON 响应 */ }
    if (!res.ok) {
      const detail = (data && data.error) || res.statusText;
      throw new SessionBoxError(`SessionBox bridge ${method} ${path} 失败 (${res.status}): ${detail}`, res.status);
    }
    return data;
  }

  const client = {
    listPages: async () => (await request('GET', '/api/v1/pages')).pages || [],
    getCookies: async (pageId, url = defaultCookieUrl) =>
      (await request('GET', `/api/v1/pages/${encodeURIComponent(pageId)}/cookies?url=${encodeURIComponent(url)}`)).cookies || [],
    openPage: (pageId, url) => request('POST', `/api/v1/pages/${encodeURIComponent(pageId)}/open`, { url }),
  };
  if (withExecute) {
    /** 在页面主世界执行 JS（executeJavaScript），返回结果 */
    client.execute = async (pageId, code) => {
      const out = await request('POST', `/api/v1/pages/${encodeURIComponent(pageId)}/execute`, { code });
      return out?.result;
    };
  }
  return client;
}
