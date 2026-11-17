/**
 * SessionBox HTTP bridge 客户端（l0veyou 变体：增加 execute）
 * 共享实现见 ../../_shared/sessionbox.mjs
 */

import { SessionBoxError, createCoreBridgeClient } from '../../_shared/sessionbox.mjs';

export { SessionBoxError };

export function createBridgeClient(options = {}) {
  return createCoreBridgeClient({ defaultCookieUrl: 'https://l0veyou.com', withExecute: true, ...options });
}
