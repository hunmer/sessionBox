import { app, net, session } from 'electron'
import type { Proxy } from './store'

/**
 * 构建 session.setProxy 所需的 proxyRules 字符串（不含认证信息）
 * Chromium 的 proxyRules 不支持在 URL 中嵌入 username:password@，认证需通过 login 事件处理
 */
export function buildProxyRules(proxy: Proxy): string {
  return `${proxy.type}://${proxy.host}:${proxy.port}`
}

/**
 * 为 session 注册代理认证回调（适用于 webContents 关联的 session）
 */
export function registerProxyAuth(ses: Electron.Session, proxy: Proxy): void {
  if (!proxy.username) return
  ses.on('login', (event, authInfo, callback) => {
    if (authInfo.isProxy) {
      event.preventDefault()
      callback(proxy.username!, proxy.password || '')
    }
  })
}

/**
 * 测试代理连接
 * 创建临时 session 配置代理后，通过该 session 发起请求验证代理可用性
 */
export async function testProxy(proxy: Proxy): Promise<{ ok: boolean; ip?: string; error?: string }> {
  const proxyRules = buildProxyRules(proxy)
  try {
    const tempSession = session.fromPartition(`__proxy_test_${Date.now()}__`)
    await tempSession.setProxy({ mode: 'fixed_servers', proxyRules })

    // net.request 使用独立 session，session 级 login 事件不会触发
    // 改用 app 级 login 事件，通过代理地址过滤避免影响其他请求
    let loginHandler: ((...args: unknown[]) => void) | null = null
    if (proxy.username) {
      loginHandler = (event: Electron.Event, _wc: unknown, authInfo: Electron.AuthInfo, callback: (u?: string, p?: string) => void) => {
        if (authInfo.isProxy && authInfo.host === proxy.host && authInfo.port === Number(proxy.port)) {
          event.preventDefault()
          callback(proxy.username!, proxy.password || '')
        }
      }
      app.on('login', loginHandler as (...args: unknown[]) => void)
    }

    try {
      return await new Promise<{ ok: boolean; ip?: string; error?: string }>((resolve) => {
        const request = net.request({
          url: 'https://httpbin.org/ip',
          session: tempSession
        })

        let body = ''
        request.on('response', (response) => {
          if (response.statusCode !== 200) {
            resolve({ ok: false, error: `HTTP ${response.statusCode}` })
            return
          }
          response.on('data', (chunk: Buffer) => {
            body += chunk.toString()
          })
          response.on('end', () => {
            try {
              const data = JSON.parse(body) as { origin: string }
              resolve({ ok: true, ip: data.origin })
            } catch {
              resolve({ ok: false, error: '解析响应失败' })
            }
          })
        })
        request.on('error', (error) => {
          resolve({ ok: false, error: error.message })
        })
        request.end()
      })
    } finally {
      if (loginHandler) {
        app.off('login', loginHandler as (...args: unknown[]) => void)
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
