import type { Session } from 'electron'
import { BLOCKED_SCHEMES } from './types'

export { BLOCKED_SCHEMES }

export function registerBlockedProtocolHandlers(targetSession: Session): void {
  for (const scheme of BLOCKED_SCHEMES) {
    try {
      targetSession.protocol.handle(scheme, () => new Response(null, { status: 204 }))
    } catch {
      // 某些 scheme 可能已注册，忽略即可。
    }
  }
}
