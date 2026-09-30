/**
 * 插件 API 统一网关：所有插件服务经同一入口按路径路由，替代"每插件一个对外端口"。
 *
 * 路由格式: /api/{pluginId}/{customRouter...}
 *   - pluginId 支持全名（sessionbox.jimeng-api）与短名（jimeng-api）
 *   - 例: /api/jimeng-api/v1/images/generations → http://127.0.0.1:19203/v1/images/generations
 *   - /api/v1/** 为 bridge 自身路由，不参与网关
 *
 * 端口由各插件在 activate 时经 context.gateway.register(port) 运行时注册，
 * 新增插件无需修改主进程代码。
 *
 * 信任模型：网关路由不做 Bearer 校验（与插件直连端口同等暴露面），仅绑定 127.0.0.1。
 * 转发支持流式响应（SSE）透传。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
])

export interface GatewayTarget {
  pluginId: string
  port: number
}

export function createPluginGateway() {
  // key（全名+短名）→ target
  const targets = new Map<string, GatewayTarget>()

  const shortId = (id: string) => id.replace(/^sessionbox\./, '')

  function register(pluginId: string, port: number) {
    if (!pluginId || !Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`非法的插件服务注册: ${pluginId} port=${port}`)
    }
    const target: GatewayTarget = { pluginId, port }
    targets.set(pluginId, target)
    targets.set(shortId(pluginId), target)
  }

  function unregister(pluginId: string) {
    targets.delete(pluginId)
    targets.delete(shortId(pluginId))
  }

  function list(): GatewayTarget[] {
    const seen = new Set<string>()
    const out: GatewayTarget[] = []
    for (const target of targets.values()) {
      if (seen.has(target.pluginId)) continue // 全名/短名两个 key 指向同一 target
      seen.add(target.pluginId)
      out.push(target)
    }
    return out
  }

  /** 解析 /api/{pluginId}/{rest...}；/api/v1 保留给 bridge */
  function match(pathname: string): { target: GatewayTarget; rest: string } | null {
    if (!pathname.startsWith('/api/')) return null
    const seg = pathname.slice('/api/'.length)
    const slash = seg.indexOf('/')
    const key = slash === -1 ? seg : seg.slice(0, slash)
    if (!key || key === 'v1') return null
    const target = targets.get(key)
    if (!target) return null
    return { target, rest: slash === -1 ? '' : seg.slice(slash + 1) }
  }

  /** 反向代理一次请求；返回是否已处理（命中已注册插件） */
  async function proxy(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const hit = match(url.pathname)
    if (!hit) return false
    const { target, rest } = hit
    const upstreamUrl = `http://127.0.0.1:${target.port}/${rest}${url.search}`

    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(req.headers)) {
      if (HOP_BY_HOP.has(name.toLowerCase()) || value === undefined) continue
      headers[name] = Array.isArray(value) ? value.join(', ') : String(value)
    }

    try {
      const method = req.method || 'GET'
      const hasBody = method !== 'GET' && method !== 'HEAD'
      const upstream = await fetch(upstreamUrl, {
        method,
        headers,
        ...(hasBody ? { body: req as any, duplex: 'half' } : {}),
        redirect: 'manual',
      })

      const outHeaders: Record<string, string | string[]> = {}
      upstream.headers.forEach((value, name) => {
        const lower = name.toLowerCase()
        // fetch 已按解码后内容返回，剔除压缩/长度头避免客户端解析错乱
        if (lower === 'content-encoding' || lower === 'content-length' || lower === 'transfer-encoding') return
        outHeaders[name] = value
      })
      res.writeHead(upstream.status, outHeaders)
      if (upstream.body) {
        for await (const chunk of upstream.body) res.write(Buffer.from(chunk))
      }
      res.end()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
      }
      res.end(JSON.stringify({
        error: `插件 ${target.pluginId} 服务不可达（port ${target.port}）: ${message}`,
        hint: '请确认该插件已启用且服务已启动',
      }))
    }
    return true
  }

  return { register, unregister, list, match, proxy }
}

/** 全局单例（bridge server 为单例，网关随之） */
export const pluginGateway = createPluginGateway()
