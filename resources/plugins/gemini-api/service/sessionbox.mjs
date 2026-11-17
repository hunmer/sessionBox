/**
 * SessionBox HTTP bridge 客户端
 * 共享实现见 ../../_shared/sessionbox.mjs
 */

import { SessionBoxError, createCoreBridgeClient } from '../../_shared/sessionbox.mjs';

export { SessionBoxError };

export function createBridgeClient(options = {}) {
  return createCoreBridgeClient({ defaultCookieUrl: 'https://gemini.google.com', ...options });
}
