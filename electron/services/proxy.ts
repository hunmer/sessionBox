import { net } from 'electron'
import type { Proxy } from './store'

/**
 * 构建 session.setProxy 所需的 proxyRules 字符串
 */
export function buildProxyRules(proxy: Proxy): string {
  const auth = proxy.username ? `${proxy.username}:${proxy.password}@` : ''
  return `${proxy.type}://${auth}${proxy.host}:${proxy.port}`
}

/**
 * 测试代理连接
 * 创建临时请求通过代理访问 httpbin.org/ip，验证代理可用性
 */
export async function testProxy(proxy: Proxy): Promise<{ ok: boolean; ip?: string; error?: string }> {
  const proxyRules = buildProxyRules(proxy)
  try {
    // 使用 net.fetch 配合代理（Electron 28+ 支持 proxy 配置）
    // 通过 session 配合代理发起请求
    const { session } = await import('electron')
    const tempSession = session.fromPartition('persist:__proxy_test__')

    await tempSession.setProxy({ proxyRules })

    const response = await net.fetch('https://httpbin.org/ip', {
      session: tempSession
    } as Electron.RequestInit)

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` }
    }

    const data = await response.json() as { origin: string }
    return { ok: true, ip: data.origin }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
