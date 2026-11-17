/**
 * Gemini 账号管理：从 SessionBox bridge 发现 gemini.google.com 页面并提取 cookie
 * 共享实现见 ../../_shared/accounts.mjs
 *
 * - SessionBox 中"账号"= Page；url 含 gemini.google.com 的页面视为 Gemini 账号
 * - 凭据 = 页面 partition 的全部 cookie（至少需要 __Secure-1PSID；带上 NID/AEC 等更接近真实浏览器）
 * - 缓存凭据与客户端；上游报凭据错误时 invalidate 后重读一次重试（cookie 有变化才重试）
 *   （__Secure-1PSIDTS 由 SessionBox 浏览器自动轮换，服务端不做 RotateCookies）
 */
import { createGeminiClient, GeminiWebError } from '../api-client.mjs';
import { SessionBoxAccountError, createCookieAccountManager } from '../../_shared/accounts.mjs';

export { SessionBoxAccountError };

const DEFAULT_HOST_RE = /gemini\.google\.com|bard\.google\.com/i;
const GEMINI_HOME = 'https://gemini.google.com/app';

export function createAccountManager({ bridge, geminiHostRe = DEFAULT_HOST_RE, onLog, urls } = {}) {
  const { listPages, ...mgr } = createCookieAccountManager({
    bridge,
    urls,
    onLog,
    hostRe: geminiHostRe,
    siteName: ' Gemini ',
    siteUrlHint: 'gemini.google.com',
    openUrl: GEMINI_HOME,
    openRetryErrRe: /没有打开的标签页|打开的标签页/,
    extractCreds(pageId, cookies) {
      const has1psid = cookies.some((c) => c.name === '__Secure-1PSID');
      if (!has1psid) {
        throw new SessionBoxAccountError(
          `页面 ${pageId} 未登录 Gemini（cookie 缺少 __Secure-1PSID），请先在该页面完成 Google 登录`,
          'NOT_LOGGED_IN',
        );
      }
      return { cookies };
    },
    buildClient: (creds, { urls, onLog }) => createGeminiClient({ cookies: creds.cookies, onLog, urls }),
    sameCreds: (a, b) =>
      a.cookies.find((c) => c.name === '__Secure-1PSID')?.value ===
      b.cookies.find((c) => c.name === '__Secure-1PSID')?.value,
    isAuthError,
  });
  return { ...mgr, listGeminiPages: listPages };
}

/** Gemini 上游登录失效的特征码 */
function isAuthError(err) {
  if (!err) return false;
  if (err instanceof GeminiWebError && ['NOT_LOGGED_IN', 'INIT_FAILED'].includes(err.code)) return true;
  const msg = String(err.message || '');
  return /未登录|登录|cookie|401|403|unauthenticated|权限/i.test(msg);
}
