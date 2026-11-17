/**
 * liblib 账号管理：从 SessionBox bridge 发现 liblib 页面并提取凭据（cookie）
 * 共享实现见 ../../_shared/accounts.mjs
 *
 * - SessionBox 中"账号"= Page；url 含 liblib 的页面视为 liblib 账号
 * - 凭据 = 页面 partition cookie 中的 usertoken / webid / useruuid
 * - cookie 读取要求该页面标签页当前打开（bridge 限制）
 */
import { createClient } from '../api-client.mjs';
import { SessionBoxAccountError, createCookieAccountManager } from '../../_shared/accounts.mjs';

export { SessionBoxAccountError };

// 仅匹配 liblib.tv（liblib.art 是素材站，另一套体系，cookie 域不同）
const DEFAULT_HOST_RE = /liblib\.tv/i;

export function createAccountManager({ bridge, urls, liblibHostRe = DEFAULT_HOST_RE, onLog } = {}) {
  const { listPages, ...mgr } = createCookieAccountManager({
    bridge,
    urls,
    onLog,
    hostRe: liblibHostRe,
    siteName: ' liblib ',
    siteUrlHint: 'liblib.tv',
    openUrl: 'https://www.liblib.tv/',
    extractCreds(pageId, cookies) {
      const byName = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
      if (!byName.usertoken || !byName.webid) {
        throw new SessionBoxAccountError(
          `页面 ${pageId} 未登录 liblib（cookie 缺少 usertoken/webid），请先在该页面完成登录`,
          'NOT_LOGGED_IN',
        );
      }
      return { token: byName.usertoken, webid: byName.webid, useruuid: byName.useruuid };
    },
    buildClient: (creds, { urls, onLog }) => createClient({ ...creds, urls, onLog }),
    sameCreds: (a, b) => a.token === b.token && a.webid === b.webid,
    isAuthError,
  });
  return { ...mgr, listLiblibPages: listPages };
}

/** liblib 上游登录失效的特征码（按实测日志补充；未记录到具体 code 前采用保守匹配） */
function isAuthError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return /登录|未登录|token|Token|401|鉴权/.test(msg);
}
