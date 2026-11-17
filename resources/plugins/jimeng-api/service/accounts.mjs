/**
 * 即梦账号管理：从 SessionBox bridge 发现即梦页面并提取凭据（cookie sessionid）
 * 共享实现见 ../../_shared/accounts.mjs
 *
 * - SessionBox 中"账号"= Page；url 含 jimeng.jianying.com / dreamina.capcut.com 的页面视为即梦账号
 * - 凭据 = 页面 partition cookie 中的 sessionid（即梦接口仅需该值，其余 cookie 由客户端伪装生成）
 */
import { createClient } from '../api-client.mjs';
import { SessionBoxAccountError, createCookieAccountManager } from '../../_shared/accounts.mjs';

export { SessionBoxAccountError };

// 国内站 jimeng.jianying.com；dreamina.capcut.com 为国际站（token 需带区域前缀，未实测）
const DEFAULT_HOST_RE = /jimeng\.jianying\.com|dreamina\.capcut\.com/i;

export function createAccountManager({ bridge, urls, jimengHostRe = DEFAULT_HOST_RE, onLog } = {}) {
  const { listPages, ...mgr } = createCookieAccountManager({
    bridge,
    urls,
    onLog,
    hostRe: jimengHostRe,
    siteName: '即梦',
    siteUrlHint: 'jimeng.jianying.com',
    openUrl: 'https://jimeng.jianying.com/ai-tool/home',
    extractCreds(pageId, cookies) {
      const byName = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
      if (!byName.sessionid) {
        throw new SessionBoxAccountError(
          `页面 ${pageId} 未登录即梦（cookie 缺少 sessionid），请先在该页面完成登录`,
          'NOT_LOGGED_IN',
        );
      }
      return { sessionid: byName.sessionid };
    },
    buildClient: (creds, { urls, onLog }) => createClient({ ...creds, urls, onLog }),
    sameCreds: (a, b) => a.sessionid === b.sessionid,
    isAuthError,
  });
  return { ...mgr, listJimengPages: listPages };
}

/** 即梦上游登录失效的特征码（按实测日志补充） */
function isAuthError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return /登录|未登录|session|token|401|鉴权|ret=1001|ret=1003|ret=4001/.test(msg);
}
