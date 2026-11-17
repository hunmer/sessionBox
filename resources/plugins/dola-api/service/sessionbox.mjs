/**
 * SessionBox HTTP bridge 客户端（dola 变体：60s 超时 + execute）
 * 共享实现见 ../../_shared/sessionbox.mjs
 */

import { SessionBoxError, createCoreBridgeClient } from '../../_shared/sessionbox.mjs';

export { SessionBoxError };

export function createBridgeClient(options = {}) {
  return createCoreBridgeClient({ defaultCookieUrl: 'https://www.dola.com', timeoutMs: 60_000, withExecute: true, ...options });
}
